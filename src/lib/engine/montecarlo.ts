import type {
  FinancialInputs,
  PortfolioConfig,
  SimulationSettings,
  SimulationResult,
  ClientProfile,
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
} from "./portfolio";

export function runMonteCarloSimulation(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings
): SimulationResult {
  const accumulationYears = Math.max(0, client.retirementAge - client.currentAge);
  const withdrawalYears = Math.max(0, client.lifeExpectancy - client.retirementAge);
  const totalYears = accumulationYears + withdrawalYears;
  const stepsPerYear = 12 / settings.timeStepMonths;
  const totalSteps = Math.ceil(totalYears * stepsPerYear);

  const weights = portfolio.buckets.map((b) => b.allocation / 100);
  const means = portfolio.buckets.map(
    (b) => (b.netReturn / 100) / stepsPerYear
  );
  const vols = portfolio.buckets.map(
    (b) => (b.volatility / 100) / Math.sqrt(stepsPerYear)
  );

  const corrMatrix = portfolio.correlationMatrix;
  const cholesky = choleskyDecomposition(corrMatrix);

  const inflationPerStep = Math.pow(1 + inputs.inflationRate / 100, 1 / stepsPerYear) - 1;
  const savingsPerStep = inputs.monthlySavings * settings.timeStepMonths;
  const withdrawalPerStep = inputs.desiredMonthlyWithdrawal * settings.timeStepMonths;
  const pensionPerStep = inputs.monthlyPension * settings.timeStepMonths;
  const accumulationSteps = Math.ceil(accumulationYears * stepsPerYear);

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
          const withdrawRatio = Math.min(1, netWithdrawal / totalPortfolio);
          for (let i = 0; i < 3; i++) {
            bucketValues[i] *= 1 - withdrawRatio;
          }
        }
      }

      const shouldRebalance = checkRebalancing(
        step,
        stepsPerYear,
        portfolio.rebalancingFrequency
      );
      if (shouldRebalance) {
        bucketValues = rebalancePortfolio(
          bucketValues,
          weights,
          portfolio.rebalancingThreshold
        );
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
  targetSuccessRate: number = 95
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
      { ...settings, numSimulations: Math.min(settings.numSimulations, 2000) }
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
  targetSuccessRate: number = 95
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
      { ...settings, numSimulations: Math.min(settings.numSimulations, 2000) }
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
  targetSuccessRate: number = 95
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
      { ...settings, numSimulations: Math.min(settings.numSimulations, 2000) }
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
  settings: SimulationSettings
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
      { ...settings, numSimulations: Math.min(settings.numSimulations, 1000) }
    );
    results.push({ withdrawal, successRate: result.successRate });
  }
  return results;
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