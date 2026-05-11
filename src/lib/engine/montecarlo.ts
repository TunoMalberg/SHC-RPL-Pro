import type {
  FinancialInputs,
  PortfolioConfig,
  SimulationSettings,
  SimulationResult,
  ClientProfile,
  DetailedSimTrace,
  DetailedYearRow,
  LiquidityEvent,
} from "../types";
import {
  SeededRandom,
  choleskyDecomposition,
  generateCorrelatedReturns,
} from "./random";
import {
  computePortfolioReturn,
  computePortfolioVolatility,
  computeSharpeRatio,
  rebalancePortfolio,
  rebalanceThreeBuckets,
} from "./portfolio";

export function runMonteCarloSimulation(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  liquidityEvents: LiquidityEvent[] = []
): SimulationResult {
  const accumulationYears = Math.max(0, client.retirementAge - client.currentAge);
  const withdrawalYears = Math.max(0, client.lifeExpectancy - client.retirementAge);
  const totalYears = accumulationYears + withdrawalYears;
  const stepsPerYear = 12 / settings.timeStepMonths;
  const totalSteps = Math.ceil(totalYears * stepsPerYear);

  const weights = portfolio.buckets.map((b) => b.allocation / 100);
  // KORREKTUR (2025-11-11): Mittelwert = Brutto-Rendite abzüglich laufender Kosten.
  // KESt wird NICHT mehr als kontinuierlicher Drag in den Mittelwert gezogen,
  // sondern erst ausgelöst, wenn ein neuer Höchststand erreicht wird (siehe unten).
  const means = portfolio.buckets.map(
    (b) => ((b.expectedReturn - b.costs) / 100) / stepsPerYear
  );
  const vols = portfolio.buckets.map(
    (b) => (b.volatility / 100) / Math.sqrt(stepsPerYear)
  );
  const kestRate = (portfolio.kestRate ?? 27.5) / 100;

  const corrMatrix = portfolio.correlationMatrix;
  const cholesky = choleskyDecomposition(corrMatrix);

  const inflationPerStep = Math.pow(1 + inputs.inflationRate / 100, 1 / stepsPerYear) - 1;
  const savingsPerStep = inputs.monthlySavings * settings.timeStepMonths;
  const withdrawalPerStep = inputs.desiredMonthlyWithdrawal * settings.timeStepMonths;
  const pensionPerStep = inputs.monthlyPension * settings.timeStepMonths;
  const accumulationSteps = Math.ceil(accumulationYears * stepsPerYear);
  const cashYearsTarget = portfolio.cashYearsTarget ?? 2;

  const allFinalValues: number[] = [];
  const allPaths: number[][] = [];
  let successCount = 0;
  const failureYears: number[] = [];

  const rng = new SeededRandom(settings.randomSeed ?? 42);

  for (let sim = 0; sim < settings.numSimulations; sim++) {
    let bucketValues = weights.map((w) => w * inputs.initialCapital);
    const path: number[] = [inputs.initialCapital];
    let failed = false;
    let failureStep = -1;
    let cumulativeInflation = 1;
    // FIX B: Steuerlicher Höchststand (High-Watermark) — initial = Startkapital.
    // KESt fällt NUR an, wenn das Portfolio diesen Höchststand überschreitet.
    let highWatermark = inputs.initialCapital;

    for (let step = 0; step < totalSteps; step++) {
      const returns = generateCorrelatedReturns(rng, cholesky, means, vols);

      for (let i = 0; i < 3; i++) {
        bucketValues[i] *= 1 + returns[i];
      }

      const isAccumulation = step < accumulationSteps;
      cumulativeInflation *= 1 + inflationPerStep;

      if (isAccumulation) {
        const adjustedSavings = inputs.useRealValues
          ? savingsPerStep * cumulativeInflation
          : savingsPerStep *
            Math.pow(1 + inputs.annualSavingsIncrease / 100 / stepsPerYear, step);

        for (let i = 0; i < 3; i++) {
          bucketValues[i] += weights[i] * adjustedSavings;
        }
        // Einzahlung hebt den Höchststand 1:1 (kein Steuerereignis).
        highWatermark += adjustedSavings;
      } else {
        const adjustedWithdrawal = inputs.useRealValues
          ? withdrawalPerStep * cumulativeInflation
          : withdrawalPerStep;

        const currentAge =
          client.currentAge + step / stepsPerYear;
        const hasPension = currentAge >= inputs.pensionStartAge;
        const adjustedPension = hasPension
          ? inputs.useRealValues
            ? pensionPerStep * cumulativeInflation
            : pensionPerStep
          : 0;

        const netWithdrawal = Math.max(0, adjustedWithdrawal - adjustedPension);
        const totalPortfolio = bucketValues.reduce((a, b) => a + b, 0);

        if (totalPortfolio <= netWithdrawal && !failed) {
          failed = true;
          failureStep = step;
        }

        if (totalPortfolio > 0) {
          const cashAvailable = bucketValues[0];
          if (cashAvailable >= netWithdrawal) {
            bucketValues[0] -= netWithdrawal;
          } else {
            const remaining = netWithdrawal - cashAvailable;
            bucketValues[0] = 0;
            const restTotal = bucketValues[1] + bucketValues[2];
            if (restTotal > 0) {
              const ratio = Math.min(1, remaining / restTotal);
              bucketValues[1] *= 1 - ratio;
              bucketValues[2] *= 1 - ratio;
            }
          }
        }
        // Entnahme senkt den Höchststand 1:1 (vereinfachte Durchschnittsbetrachtung).
        highWatermark = Math.max(0, highWatermark - netWithdrawal);
      }

      const currentAgeAtStep = client.currentAge + step / stepsPerYear;
      for (const le of liquidityEvents) {
        const leStepAge = le.age;
        const prevAge = client.currentAge + (step - 1) / stepsPerYear;
        if (currentAgeAtStep >= leStepAge && prevAge < leStepAge) {
          const amount = le.amount;
          if (amount > 0) {
            for (let i = 0; i < 3; i++) {
              bucketValues[i] += weights[i] * amount;
            }
            highWatermark += amount;
          } else {
            const totalPortfolio = bucketValues.reduce((a, b) => a + b, 0);
            if (totalPortfolio > 0) {
              const withdrawRatio = Math.min(1, Math.abs(amount) / totalPortfolio);
              for (let i = 0; i < 3; i++) {
                bucketValues[i] *= 1 - withdrawRatio;
              }
            }
            highWatermark = Math.max(0, highWatermark - Math.abs(amount));
          }
        }
      }

      const shouldRebalance = checkRebalancing(
        step,
        stepsPerYear,
        portfolio.rebalancingFrequency
      );
      if (shouldRebalance) {
        if (step < accumulationSteps) {
          bucketValues = rebalancePortfolio(
            bucketValues,
            weights,
            portfolio.rebalancingThreshold
          );
        } else {
          const annualWithdrawalForTarget = inputs.useRealValues
            ? inputs.desiredMonthlyWithdrawal * 12 * cumulativeInflation
            : inputs.desiredMonthlyWithdrawal * 12;
          const pensionForTarget =
            (client.currentAge + step / stepsPerYear) >= inputs.pensionStartAge
              ? (inputs.useRealValues ? inputs.monthlyPension * 12 * cumulativeInflation : inputs.monthlyPension * 12)
              : 0;
          const netAnnualWithdrawal = Math.max(0, annualWithdrawalForTarget - pensionForTarget);

          const result = rebalanceThreeBuckets(
            bucketValues,
            netAnnualWithdrawal / stepsPerYear,
            cashYearsTarget,
            returns[2]
          );
          bucketValues = result.values;
        }
      }

      // FIX B: High-Watermark-KESt — Steuer nur bei neuem Höchststand fällig.
      // Verlustjahre und Erholungen bis zum letzten Hoch lösen keine Steuer aus.
      const beforeTaxTotal = bucketValues.reduce((a, b) => a + b, 0);
      if (beforeTaxTotal > highWatermark && beforeTaxTotal > 0) {
        const taxableGain = beforeTaxTotal - highWatermark;
        const tax = taxableGain * kestRate;
        const factor = (beforeTaxTotal - tax) / beforeTaxTotal;
        bucketValues = bucketValues.map((v) => v * factor);
        highWatermark = beforeTaxTotal - tax;
      }

      const totalValue = Math.max(0, bucketValues.reduce((a, b) => a + b, 0));
      path.push(totalValue);
    }

    const finalValue = Math.max(0, bucketValues.reduce((a, b) => a + b, 0));
    allFinalValues.push(finalValue);
    allPaths.push(path);

    if (!failed) {
      successCount++;
    } else {
      failureYears.push(
        client.currentAge + failureStep / stepsPerYear
      );
    }
  }

  const yearLabels: number[] = [];
  for (let i = 0; i <= totalSteps; i++) {
    yearLabels.push(
      Math.round((client.currentAge + i / stepsPerYear) * 10) / 10
    );
  }

  const portfolioReturn = computePortfolioReturn(portfolio);
  const portfolioVolatility = computePortfolioVolatility(portfolio);
  const riskFreeRate = portfolio.buckets[0].netReturn / 100;
  const sharpeRatio = computeSharpeRatio(
    portfolioReturn,
    portfolioVolatility,
    riskFreeRate
  );

  const percentilePaths = computePercentilePaths(allPaths, totalSteps + 1);
  const sortedFinal = [...allFinalValues].sort((a, b) => a - b);

  const maxDrawdowns = allPaths.map(computeMaxDrawdown);
  const medianDrawdown = percentile(maxDrawdowns, 50);

  const annualWithdrawals: number[] = [];
  const annualPortfolioValues: number[] = [];
  for (let y = 0; y <= totalYears; y++) {
    const stepIdx = Math.min(y * stepsPerYear, totalSteps);
    annualPortfolioValues.push(percentilePaths.p50[Math.round(stepIdx)]);
    if (y >= accumulationYears) {
      const inflation = Math.pow(1 + inputs.inflationRate / 100, y);
      annualWithdrawals.push(
        inputs.useRealValues
          ? inputs.desiredMonthlyWithdrawal * 12 * inflation
          : inputs.desiredMonthlyWithdrawal * 12
      );
    } else {
      annualWithdrawals.push(0);
    }
  }

  return {
    successRate: (successCount / settings.numSimulations) * 100,
    medianFinalWealth: percentile(sortedFinal, 50),
    meanFinalWealth:
      allFinalValues.reduce((a, b) => a + b, 0) / allFinalValues.length,
    percentiles: {
      p5: percentile(sortedFinal, 5),
      p10: percentile(sortedFinal, 10),
      p25: percentile(sortedFinal, 25),
      p50: percentile(sortedFinal, 50),
      p75: percentile(sortedFinal, 75),
      p90: percentile(sortedFinal, 90),
      p95: percentile(sortedFinal, 95),
    },
    medianPath: percentilePaths.p50,
    p10Path: percentilePaths.p10,
    p25Path: percentilePaths.p25,
    p75Path: percentilePaths.p75,
    p90Path: percentilePaths.p90,
    worstPath: percentilePaths.worst,
    bestPath: percentilePaths.best,
    failureYear:
      failureYears.length > 0 ? Math.min(...failureYears) : null,
    medianFailureYear:
      failureYears.length > 0
        ? percentile(
            [...failureYears].sort((a, b) => a - b),
            50
          )
        : null,
    portfolioReturn: portfolioReturn * 100,
    portfolioVolatility: portfolioVolatility * 100,
    maxDrawdown: medianDrawdown * 100,
    sharpeRatio,
    yearLabels,
    annualWithdrawals,
    annualPortfolioValues,
  };
}

export function findSustainableWithdrawal(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  targetSuccessRate: number = 95,
  liquidityEvents: LiquidityEvent[] = []
): number {
  let low = 0;
  let high = inputs.initialCapital * 0.1;
  let bestWithdrawal = 0;

  for (let iter = 0; iter < 20; iter++) {
    const mid = (low + high) / 2;
    const testInputs = { ...inputs, desiredMonthlyWithdrawal: mid };
    const result = runMonteCarloSimulation(
      client,
      testInputs,
      portfolio,
      { ...settings, numSimulations: Math.min(settings.numSimulations, 2000) },
      liquidityEvents
    );

    if (result.successRate >= targetSuccessRate) {
      bestWithdrawal = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  return Math.round(bestWithdrawal);
}

export function findRequiredCapital(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  targetSuccessRate: number = 95,
  liquidityEvents: LiquidityEvent[] = []
): number {
  let low = 0;
  let high = inputs.desiredMonthlyWithdrawal * 12 * 50;
  let bestCapital = high;

  for (let iter = 0; iter < 20; iter++) {
    const mid = (low + high) / 2;
    const testInputs = { ...inputs, initialCapital: mid };
    const result = runMonteCarloSimulation(
      client,
      testInputs,
      portfolio,
      { ...settings, numSimulations: Math.min(settings.numSimulations, 2000) },
      liquidityEvents
    );

    if (result.successRate >= targetSuccessRate) {
      bestCapital = mid;
      high = mid;
    } else {
      low = mid;
    }
  }
  return Math.round(bestCapital);
}

export function findRequiredSavingsRate(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  targetSuccessRate: number = 95,
  liquidityEvents: LiquidityEvent[] = []
): number {
  let low = 0;
  let high = 20000;
  let bestSavings = high;

  for (let iter = 0; iter < 20; iter++) {
    const mid = (low + high) / 2;
    const testInputs = { ...inputs, monthlySavings: mid };
    const result = runMonteCarloSimulation(
      client,
      testInputs,
      portfolio,
      { ...settings, numSimulations: Math.min(settings.numSimulations, 2000) },
      liquidityEvents
    );

    if (result.successRate >= targetSuccessRate) {
      bestSavings = mid;
      high = mid;
    } else {
      low = mid;
    }
  }
  return Math.round(bestSavings);
}

export function generateWithdrawalHeatmap(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  liquidityEvents: LiquidityEvent[] = []
): { withdrawal: number; successRate: number }[] {
  const results: { withdrawal: number; successRate: number }[] = [];
  const baseWithdrawal = inputs.desiredMonthlyWithdrawal;
  const steps = 20;

  for (let i = 0; i <= steps; i++) {
    const ratio = 0.5 + (i / steps) * 1.5;
    const withdrawal = Math.round(baseWithdrawal * ratio);
    const testInputs = { ...inputs, desiredMonthlyWithdrawal: withdrawal };
    const result = runMonteCarloSimulation(
      client,
      testInputs,
      portfolio,
      { ...settings, numSimulations: Math.min(settings.numSimulations, 1000) },
      liquidityEvents
    );
    results.push({ withdrawal, successRate: result.successRate });
  }
  return results;
}

export function runDetailedSingleSimulation(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  simIndex: number = 0,
  liquidityEvents: LiquidityEvent[] = []
): DetailedSimTrace {
  const accumulationYears = Math.max(0, client.retirementAge - client.currentAge);
  const withdrawalYears = Math.max(0, client.lifeExpectancy - client.retirementAge);
  const totalYears = accumulationYears + withdrawalYears;

  const weights = portfolio.buckets.map((b) => b.allocation / 100);
  // KORREKTUR (2025-11-11): Brutto minus Kosten — KESt läuft über Watermark.
  const annualMeans = portfolio.buckets.map(
    (b) => (b.expectedReturn - b.costs) / 100
  );
  const annualVols = portfolio.buckets.map((b) => b.volatility / 100);
  const cashYearsTarget = portfolio.cashYearsTarget ?? 2;
  const kestRate = (portfolio.kestRate ?? 27.5) / 100;

  const corrMatrix = portfolio.correlationMatrix;
  const cholesky = choleskyDecomposition(corrMatrix);

  const seed = (settings.randomSeed ?? 42) + simIndex;
  const rng = new SeededRandom(seed);

  let bucketValues = weights.map((w) => w * inputs.initialCapital);
  let cumulativeInflation = 1;
  let highWatermark = inputs.initialCapital;
  let failed = false;

  const rows: DetailedYearRow[] = [];

  for (let y = 0; y < totalYears; y++) {
    const age = client.currentAge + y;
    const isAccumulation = y < accumulationYears;
    const phase = isAccumulation ? "Anspar" : "Entnahme";

    const startCash = bucketValues[0];
    const startBonds = bucketValues[1];
    const startEquities = bucketValues[2];
    const startTotal = startCash + startBonds + startEquities;

    const returns = generateCorrelatedReturns(rng, cholesky, annualMeans, annualVols);

    const returnCash = startCash * returns[0];
    const returnBonds = startBonds * returns[1];
    const returnEquities = startEquities * returns[2];

    bucketValues[0] += returnCash;
    bucketValues[1] += returnBonds;
    bucketValues[2] += returnEquities;

    const inflationThisYear = inputs.inflationRate / 100;
    cumulativeInflation *= 1 + inflationThisYear;

    let cashflow = 0;
    let cashflowLabel = "";

    if (isAccumulation) {
      const annualSavings = inputs.monthlySavings * 12;
      const adjustedSavings = inputs.useRealValues
        ? annualSavings * cumulativeInflation
        : annualSavings * Math.pow(1 + inputs.annualSavingsIncrease / 100, y);

      cashflow = adjustedSavings;
      cashflowLabel = "Sparrate";

      for (let i = 0; i < 3; i++) {
        bucketValues[i] += weights[i] * adjustedSavings;
      }
      highWatermark += adjustedSavings;
    } else {
      const annualWithdrawal = inputs.useRealValues
        ? inputs.desiredMonthlyWithdrawal * 12 * cumulativeInflation
        : inputs.desiredMonthlyWithdrawal * 12;

      const ageForPension = age;
      const hasPension = ageForPension >= inputs.pensionStartAge;
      const annualPension = hasPension
        ? inputs.useRealValues
          ? inputs.monthlyPension * 12 * cumulativeInflation
          : inputs.monthlyPension * 12
        : 0;

      const netWithdrawal = Math.max(0, annualWithdrawal - annualPension);
      cashflow = -netWithdrawal;
      cashflowLabel = hasPension
        ? `Entnahme ${Math.round(annualWithdrawal)} − Pension ${Math.round(annualPension)}`
        : "Entnahme";

      const totalPortfolio = bucketValues.reduce((a, b) => a + b, 0);

      if (totalPortfolio <= netWithdrawal && !failed) {
        failed = true;
      }

      if (totalPortfolio > 0) {
        const cashAvailable = bucketValues[0];
        if (cashAvailable >= netWithdrawal) {
          bucketValues[0] -= netWithdrawal;
        } else {
          const remaining = netWithdrawal - cashAvailable;
          bucketValues[0] = 0;
          const restTotal = bucketValues[1] + bucketValues[2];
          if (restTotal > 0) {
            const ratio = Math.min(1, remaining / restTotal);
            bucketValues[1] *= 1 - ratio;
            bucketValues[2] *= 1 - ratio;
          }
        }
      }
      highWatermark = Math.max(0, highWatermark - netWithdrawal);
    }

    let liquidityEventAmount = 0;
    let liquidityEventLabel = "";
    const eventsThisYear = liquidityEvents.filter((le) => le.age === age);
    if (eventsThisYear.length > 0) {
      for (const le of eventsThisYear) {
        liquidityEventAmount += le.amount;
        liquidityEventLabel += (liquidityEventLabel ? "; " : "") + le.description;
      }
      if (liquidityEventAmount > 0) {
        for (let i = 0; i < 3; i++) {
          bucketValues[i] += weights[i] * liquidityEventAmount;
        }
        highWatermark += liquidityEventAmount;
      } else if (liquidityEventAmount < 0) {
        const totalPortfolio = bucketValues.reduce((a, b) => a + b, 0);
        if (totalPortfolio > 0) {
          const withdrawRatio = Math.min(1, Math.abs(liquidityEventAmount) / totalPortfolio);
          for (let i = 0; i < 3; i++) {
            bucketValues[i] *= 1 - withdrawRatio;
          }
        }
        highWatermark = Math.max(0, highWatermark - Math.abs(liquidityEventAmount));
      }
    }

    const beforeRebalCash = bucketValues[0];
    const beforeRebalBonds = bucketValues[1];
    const beforeRebalEquities = bucketValues[2];

    const shouldRebalance = checkRebalancingYearly(y, portfolio.rebalancingFrequency);
    let rebalanced = false;
    let rebalCashDelta = 0;
    let rebalBondsDelta = 0;
    let rebalEquitiesDelta = 0;
    let rebalSource = "";

    if (shouldRebalance) {
      if (isAccumulation) {
        const newValues = rebalancePortfolio(bucketValues, weights, portfolio.rebalancingThreshold);
        if (newValues[0] !== bucketValues[0] || newValues[1] !== bucketValues[1] || newValues[2] !== bucketValues[2]) {
          rebalanced = true;
          rebalCashDelta = newValues[0] - beforeRebalCash;
          rebalBondsDelta = newValues[1] - beforeRebalBonds;
          rebalEquitiesDelta = newValues[2] - beforeRebalEquities;
          rebalSource = "Zielallokation";
          bucketValues = newValues;
        }
      } else {
        const annualWithdrawalForTarget = inputs.useRealValues
          ? inputs.desiredMonthlyWithdrawal * 12 * cumulativeInflation
          : inputs.desiredMonthlyWithdrawal * 12;
        const pensionForTarget = age >= inputs.pensionStartAge
          ? (inputs.useRealValues ? inputs.monthlyPension * 12 * cumulativeInflation : inputs.monthlyPension * 12)
          : 0;
        const netAnnualForTarget = Math.max(0, annualWithdrawalForTarget - pensionForTarget);

        const result = rebalanceThreeBuckets(
          bucketValues,
          netAnnualForTarget,
          cashYearsTarget,
          returns[2]
        );
        if (result.rebalanced) {
          rebalanced = true;
          rebalCashDelta = result.cashDelta;
          rebalBondsDelta = result.bondsDelta;
          rebalEquitiesDelta = result.equitiesDelta;
          rebalSource = result.source;
          bucketValues = result.values;
        }
      }
    }

    // FIX B: High-Watermark-KESt — Steuer nur bei neuem Höchststand fällig.
    const preTaxTotal = bucketValues.reduce((a, b) => a + b, 0);
    if (preTaxTotal > highWatermark && preTaxTotal > 0) {
      const taxableGain = preTaxTotal - highWatermark;
      const tax = taxableGain * kestRate;
      const factor = (preTaxTotal - tax) / preTaxTotal;
      bucketValues = bucketValues.map((v) => v * factor);
      highWatermark = preTaxTotal - tax;
    }

    const endCash = Math.max(0, bucketValues[0]);
    const endBonds = Math.max(0, bucketValues[1]);
    const endEquities = Math.max(0, bucketValues[2]);
    const endTotal = endCash + endBonds + endEquities;

    bucketValues = [endCash, endBonds, endEquities];

    rows.push({
      year: client.birthYear + age,
      age,
      phase,
      startTotal,
      startCash,
      startBonds,
      startEquities,
      returnCash,
      returnBonds,
      returnEquities,
      returnCashPct: startCash > 0 ? returns[0] * 100 : 0,
      returnBondsPct: startBonds > 0 ? returns[1] * 100 : 0,
      returnEquitiesPct: startEquities > 0 ? returns[2] * 100 : 0,
      cashflow,
      cashflowLabel,
      liquidityEvent: liquidityEventAmount,
      liquidityEventLabel,
      rebalanced,
      rebalCashDelta,
      rebalBondsDelta,
      rebalEquitiesDelta,
      rebalSource,
      endCash,
      endBonds,
      endEquities,
      endTotal,
      cumulativeInflation,
    });
  }

  const finalWealth = bucketValues.reduce((a, b) => a + b, 0);

  return {
    rows,
    simulationIndex: simIndex,
    seed,
    finalWealth: Math.max(0, finalWealth),
    success: !failed,
  };
}

function checkRebalancingYearly(year: number, frequency: string): boolean {
  if (frequency === "none") return false;
  if (frequency === "monthly" || frequency === "annually") return true;
  if (frequency === "quarterly") return true;
  return false;
}

function checkRebalancing(
  step: number,
  stepsPerYear: number,
  frequency: string
): boolean {
  if (frequency === "none") return false;
  if (frequency === "monthly") return true;
  if (frequency === "quarterly") return step % Math.round(stepsPerYear / 4) === 0;
  if (frequency === "annually") return step % stepsPerYear === 0;
  return false;
}

function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const idx = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedArr[lower];
  const frac = idx - lower;
  return sortedArr[lower] * (1 - frac) + sortedArr[upper] * frac;
}

function computePercentilePaths(
  allPaths: number[][],
  length: number
): {
  p10: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p90: number[];
  worst: number[];
  best: number[];
} {
  const result = {
    p10: [] as number[],
    p25: [] as number[],
    p50: [] as number[],
    p75: [] as number[],
    p90: [] as number[],
    worst: [] as number[],
    best: [] as number[],
  };

  for (let step = 0; step < length; step++) {
    const values = allPaths
      .map((p) => (step < p.length ? p[step] : 0))
      .sort((a, b) => a - b);

    result.p10.push(percentile(values, 10));
    result.p25.push(percentile(values, 25));
    result.p50.push(percentile(values, 50));
    result.p75.push(percentile(values, 75));
    result.p90.push(percentile(values, 90));
    result.worst.push(values[0]);
    result.best.push(values[values.length - 1]);
  }

  return result;
}

function computeMaxDrawdown(path: number[]): number {
  let maxVal = path[0];
  let maxDD = 0;
  for (let i = 1; i < path.length; i++) {
    if (path[i] > maxVal) maxVal = path[i];
    const dd = maxVal > 0 ? (maxVal - path[i]) / maxVal : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}