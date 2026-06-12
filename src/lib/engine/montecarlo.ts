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
import {
  computePETimeline,
  buildStochasticEnsemble,
  type PETimelineEntry,
  type PEEnsemble,
} from "./privateEquity";
import { PE_STOCHASTIC_ENSEMBLE_SIZE } from "../defaults";

/**
 * Wendet die deterministischen PE-Cashflows eines Jahres auf die
 * Liquid-Buckets an: Capital Calls drainen Cash (Kaskade über
 * Anleihen → Aktien), Netto-Distributions fliessen in Cash.
 *
 * Mutation: bucketValues wird in-place verändert.
 * Rückgabe: aktualisiertes highWatermark.
 */
function applyPECashflowsToBuckets(
  bucketValues: number[],
  call: number,
  distNet: number,
  highWatermark: number,
): number {
  let hw = highWatermark;
  if (call > 0) {
    const cashAvail = bucketValues[0];
    if (cashAvail >= call) {
      bucketValues[0] -= call;
    } else {
      const remaining = call - cashAvail;
      bucketValues[0] = 0;
      const restTotal = bucketValues[1] + bucketValues[2];
      if (restTotal > 0) {
        const ratio = Math.min(1, remaining / restTotal);
        bucketValues[1] *= 1 - ratio;
        bucketValues[2] *= 1 - ratio;
      }
    }
    hw = Math.max(0, hw - call);
  }
  if (distNet > 0) {
    bucketValues[0] += distNet;
    // Netto-Distributions sind bereits versteuert → heben High-Watermark
    // analog zu einer Einzahlung an, damit kein Doppel-KESt entsteht.
    hw += distNet;
  }
  return hw;
}

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
  // Steuerung Entnahme- und Pensions-Inflation:
  //
  // FIX (2026-Q4): vorher war der Ausdruck
  //   inflateWithdrawals = useRealValues || inflateWithdrawalToRetirement
  // → da `useRealValues` standardmäßig true ist, hat der Schieber
  //   `inflateWithdrawalToRetirement` faktisch nie etwas geändert
  //   (vom OR überschattet).
  //
  // Korrekte Semantik (jetzt entkoppelt):
  //   - `useRealValues`                  → steuert NUR die Sparphase
  //                                         (Sparrate wächst mit Inflation)
  //   - `inflateWithdrawalToRetirement`  → steuert NUR Entnahme + Pension
  //                                         (heutige Kaufkraft → mit Infl.
  //                                         hochgerechnet, sodass an Tag 1
  //                                         der Pension der zukünftige
  //                                         Nominalbetrag entnommen wird).
  //
  // Default für die Entnahme-Inflation ist seit 2026-Q4 ON — die
  // realistische Annahme für Beratungsgespräche, weil Berater mit
  // heutigen Kaufkraft-Beträgen rechnen.
  const inflateWithdrawals = inputs.inflateWithdrawalToRetirement !== false;

  // PE-Timeline (Topf 4). Drei Modi:
  //  - 'simple'    : klassische Compound-Balance NAV.
  //  - 'realistic' : Compound + J-Curve-Overlay (Fee-Drag).
  //  - 'full'      : J-Curve + Stochastik. Pro MC-Pfad wird ein
  //                  Szenario aus dem Ensemble gewählt; das Ergebnis
  //                  liefert zusätzlich p25/p75-Bänder.
  // Calls werden aus Cash gedrainet (Kaskade), Netto-Distributions
  // fließen in Cash. NAV wird als zusätzliches Vermögen geführt.
  const peFunds = portfolio.peFunds ?? [];
  const peMode = portfolio.peModelingMode ?? "realistic";
  const peStochastic = peMode === "full" && peFunds.length > 0;
  const peEnsemble: PEEnsemble | null = peStochastic
    ? buildStochasticEnsemble(
        peFunds,
        client.currentAge,
        totalYears,
        kestRate,
        PE_STOCHASTIC_ENSEMBLE_SIZE,
        (settings.randomSeed ?? 42) ^ 0xa17b1e,
      )
    : null;
  const peTimelineDefault: PETimelineEntry[] =
    peFunds.length > 0
      ? peEnsemble
        ? peEnsemble.median
        : computePETimeline(peFunds, client.currentAge, totalYears, kestRate, peMode)
      : [];
  const hasPE = peTimelineDefault.length > 0;
  // Pro Sim wählen wir das anzuwendende Szenario:
  // - simple/realistic: ein einziges deterministisches Szenario.
  // - full           : `sim % ensembleSize`-tes Szenario aus dem Ensemble.
  const peTimelineForSim = (sim: number): PETimelineEntry[] => {
    if (!hasPE) return [];
    if (peEnsemble) {
      return peEnsemble.scenarios[sim % peEnsemble.scenarios.length];
    }
    return peTimelineDefault;
  };

  const allFinalValues: number[] = [];
  const allPaths: number[][] = [];
  // Best/Worst-Simulationsindex (niedrigstes/höchstes Endvermögen) —
  // wird genutzt, um im Reiter „Einzelpfad" gezielt den exakten Worst-/
  // Best-Case-Pfad reproduzieren zu können (gleicher Seed-Offset).
  let bestSimIndex = 0;
  let worstSimIndex = 0;
  let bestFinalValue = -Infinity;
  let worstFinalValue = Infinity;
  // FIX (2026-Q2): Reiner Markt-Drawdown.
  // Der bisherige MaxDD wurde auf dem Vermögenspfad inkl. Sparraten,
  // Entnahmen, KESt und Liquiditätsereignissen berechnet → der
  // monotone Vermögensabbau in der Entnahmephase wurde fälschlich
  // als "Drawdown" ausgewiesen (typisch +10–20 pp Inflation).
  // Wir tracken jetzt zusätzlich einen reinen Marktindex pro Pfad
  // (gewichtete Brutto-Renditen aller Töpfe, ohne Cash-Flows),
  // der die übliche Definition «größter Peak-to-Trough-Verlust»
  // erfüllt und den Tooltip-Versprechen «20–40 %» entspricht.
  const marketDrawdowns: number[] = [];
  let successCount = 0;
  const failureYears: number[] = [];

  // FIX (2026-Q3): Pro Sim eigene SeededRandom-Instanz mit Seed = base+sim.
  // Damit erzeugt MC für simIndex N exakt die gleiche Pfadhistorie wie der
  // Reiter „Einzelpfad" via runDetailedSingleSimulation(N) (gleiches Seeding,
  // gleicher Pseudo-Zufall). Dadurch zeigen die Buttons „Worst-/Best-Case-Pfad"
  // im Einzelpfad-Reiter die Cashflows der jeweiligen MC-Pfade reproduzierbar
  // an. Statistisch ändert sich gegenüber dem alten gemeinsamen RNG nichts:
  // 10 000 unabhängige Seeds liefern eine gleichwertige Stichprobenverteilung;
  // nur einzelne Pfadergebnisse verschieben sich. Reproduzierbarkeit ist hier
  // wichtiger als historische Bit-Identität der Stichprobe.
  const baseSeed = settings.randomSeed ?? 42;

  for (let sim = 0; sim < settings.numSimulations; sim++) {
    const rng = new SeededRandom(baseSeed + sim);
    const peTimeline = peTimelineForSim(sim);
    let bucketValues = weights.map((w) => w * inputs.initialCapital);
    // PE-NAV zu Beginn = 0 (Fonds starten zu definierten Altersstufen).
    let peNavCurrent = hasPE ? peTimeline[0].totalNav : 0;
    const path: number[] = [inputs.initialCapital + peNavCurrent];
    // Reiner Marktindex (startet bei 1) — nur Renditen, keine Cash-Flows.
    let marketIndex = 1;
    let marketPeak = 1;
    let marketMaxDD = 0;
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

      // Reine Marktrendite des Schritts = strategische Allokation × Topf-Renditen.
      // KESt wird hier NICHT abgezogen — der Marktindex misst Brutto-Marktrisiko.
      // (KESt ist eine deterministische Steuer auf Gewinne und keine Marktbewegung.)
      const marketStepReturn = weights.reduce((s, w, i) => s + w * returns[i], 0);
      marketIndex *= 1 + marketStepReturn;
      if (marketIndex > marketPeak) marketPeak = marketIndex;
      const ddNow = marketPeak > 0 ? (marketPeak - marketIndex) / marketPeak : 0;
      if (ddNow > marketMaxDD) marketMaxDD = ddNow;

      const isAccumulation = step < accumulationSteps;
      cumulativeInflation *= 1 + inflationPerStep;

      // PE-Cashflows: einmal pro Jahr am Jahresanfang anwenden.
      // (Calls bevor Sparrate/Entnahme, damit Drains konservativ verrechnet werden.)
      if (hasPE && step % stepsPerYear === 0) {
        const yIdx = Math.floor(step / stepsPerYear);
        const peEntry = peTimeline[yIdx];
        if (peEntry) {
          highWatermark = applyPECashflowsToBuckets(
            bucketValues,
            peEntry.totalCall,
            peEntry.totalDistNet,
            highWatermark,
          );
          peNavCurrent = peEntry.totalNav;
        }
      }

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
        const adjustedWithdrawal = inflateWithdrawals
          ? withdrawalPerStep * cumulativeInflation
          : withdrawalPerStep;

        const currentAge =
          client.currentAge + step / stepsPerYear;
        const hasPension = currentAge >= inputs.pensionStartAge;
        const adjustedPension = hasPension
          ? inflateWithdrawals
            ? pensionPerStep * cumulativeInflation
            : pensionPerStep
          : 0;

        const netWithdrawal = Math.max(0, adjustedWithdrawal - adjustedPension);
        const totalPortfolio = bucketValues.reduce((a, b) => a + b, 0);

        // Erfolgskriterium inkl. PE-NAV (Wunsch des Auftraggebers:
        // "PE immer in der Erfolgsquote ja"). PE-NAV ist illiquide,
        // wird hier aber zur Vermögensbestimmung zugerechnet.
        const totalWithPE = totalPortfolio + peNavCurrent;
        if (totalWithPE <= netWithdrawal && !failed) {
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
          const annualWithdrawalForTarget = inflateWithdrawals
            ? inputs.desiredMonthlyWithdrawal * 12 * cumulativeInflation
            : inputs.desiredMonthlyWithdrawal * 12;
          const pensionForTarget =
            (client.currentAge + step / stepsPerYear) >= inputs.pensionStartAge
              ? (inflateWithdrawals ? inputs.monthlyPension * 12 * cumulativeInflation : inputs.monthlyPension * 12)
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

      // Aktualisiere PE-NAV für aktuellen Schritt (innerhalb eines
      // Jahres bleibt NAV konstant; aktualisiert wird zu Beginn jedes
      // neuen Jahres oben). Pfadwert = liquide + PE-NAV.
      const totalLiquid = Math.max(0, bucketValues.reduce((a, b) => a + b, 0));
      path.push(totalLiquid + peNavCurrent);
    }

    const finalLiquid = Math.max(0, bucketValues.reduce((a, b) => a + b, 0));
    const finalValue = finalLiquid + peNavCurrent;
    allFinalValues.push(finalValue);
    allPaths.push(path);
    marketDrawdowns.push(marketMaxDD);

    // Best/Worst-Sim-Index nach Endvermögen tracken.
    if (finalValue > bestFinalValue) {
      bestFinalValue = finalValue;
      bestSimIndex = sim;
    }
    if (finalValue < worstFinalValue) {
      worstFinalValue = finalValue;
      worstSimIndex = sim;
    }

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

  // FIX (2026-Q2): Median des reinen Markt-Drawdowns (ohne Cash-Flow-Effekte).
  // Vorher: percentile(allPaths.map(computeMaxDrawdown), 50) — verzerrt durch
  // Sparraten, Entnahmen, KESt und Liquiditätsereignisse; Failure-Pfade
  // (Vermögen → 0) trugen zudem 100 % zum Median bei.
  const medianDrawdown = percentile(marketDrawdowns, 50);

  // PE-NAV-Pfad pro Jahr.
  // - simple/realistic: ein einziger NAV-Pfad (deterministisch).
  // - full            : Median + p25/p75 aus dem Ensemble.
  const pePath: number[] = hasPE
    ? Array.from({ length: totalSteps + 1 }, (_, step) => {
        const yIdx = Math.min(Math.floor(step / stepsPerYear), peTimelineDefault.length - 1);
        return peTimelineDefault[yIdx]?.totalNav ?? 0;
      })
    : [];
  const pePathP25: number[] | undefined = peEnsemble
    ? Array.from({ length: totalSteps + 1 }, (_, step) => {
        const yIdx = Math.min(Math.floor(step / stepsPerYear), peEnsemble.navP25.length - 1);
        return peEnsemble.navP25[yIdx] ?? 0;
      })
    : undefined;
  const pePathP75: number[] | undefined = peEnsemble
    ? Array.from({ length: totalSteps + 1 }, (_, step) => {
        const yIdx = Math.min(Math.floor(step / stepsPerYear), peEnsemble.navP75.length - 1);
        return peEnsemble.navP75[yIdx] ?? 0;
      })
    : undefined;

  const annualWithdrawals: number[] = [];
  const annualPortfolioValues: number[] = [];
  for (let y = 0; y <= totalYears; y++) {
    const stepIdx = Math.min(y * stepsPerYear, totalSteps);
    annualPortfolioValues.push(percentilePaths.p50[Math.round(stepIdx)]);
    if (y >= accumulationYears) {
      const inflation = Math.pow(1 + inputs.inflationRate / 100, y);
      annualWithdrawals.push(
        inflateWithdrawals
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
    pePath: hasPE ? pePath : undefined,
    pePathP25,
    pePathP75,
    peSuccessRate: peEnsemble ? peEnsemble.successRate : undefined,
    peMedianIRR: peEnsemble ? peEnsemble.medianIRRPct : undefined,
    peMedianTVPI: peEnsemble ? peEnsemble.medianTVPI : undefined,
    worstSimIndex,
    bestSimIndex,
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

  // PE-Timeline (analog runMonteCarloSimulation, aber für den ausgewählten
  // Detail-Pfad immer deterministisch — Bei stochastischem Modus zeigen wir
  // den Median-Pfad als Repräsentanten; alle Bänder bleiben in der MC-Engine).
  const peFunds = portfolio.peFunds ?? [];
  const peMode = portfolio.peModelingMode ?? "realistic";
  const peTimeline =
    peFunds.length > 0
      ? computePETimeline(peFunds, client.currentAge, totalYears, kestRate, peMode)
      : [];
  const hasPE = peTimeline.length > 0;

  let bucketValues = weights.map((w) => w * inputs.initialCapital);
  let cumulativeInflation = 1;
  let highWatermark = inputs.initialCapital;
  let failed = false;
  // Spiegelt die Semantik in `runMonteCarloSimulation` (siehe FIX 2026-Q4):
  // entkoppelt — `useRealValues` betrifft nur die Sparphase,
  // `inflateWithdrawalToRetirement` exklusiv die Entnahme + Pension.
  // Default seit 2026-Q4: Entnahme-Inflation ON.
  const inflateWithdrawalsTrace = inputs.inflateWithdrawalToRetirement !== false;

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

    // PE-Cashflows nach Renditen, vor Sparrate/Entnahme.
    let peCall = 0;
    let peDistGross = 0;
    let peDistNet = 0;
    let peNavThisYear = 0;
    if (hasPE && y < peTimeline.length) {
      const entry = peTimeline[y];
      peCall = entry.totalCall;
      peDistGross = entry.totalDistGross;
      peDistNet = entry.totalDistNet;
      peNavThisYear = entry.totalNav;
      highWatermark = applyPECashflowsToBuckets(
        bucketValues,
        peCall,
        peDistNet,
        highWatermark,
      );
    }

    let cashflow = 0;
    let cashflowLabel = "";
    // Tatsächliche Herkunft der Entnahme-Liquidität — wird je nach Topfbestand
    // zur Laufzeit befüllt (Cash zuerst, Rest proportional aus Anleihen+Aktien).
    let withdrawalFromCash = 0;
    let withdrawalFromBonds = 0;
    let withdrawalFromEquities = 0;

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
      const annualWithdrawal = inflateWithdrawalsTrace
        ? inputs.desiredMonthlyWithdrawal * 12 * cumulativeInflation
        : inputs.desiredMonthlyWithdrawal * 12;

      const ageForPension = age;
      const hasPension = ageForPension >= inputs.pensionStartAge;
      const annualPension = hasPension
        ? inflateWithdrawalsTrace
          ? inputs.monthlyPension * 12 * cumulativeInflation
          : inputs.monthlyPension * 12
        : 0;

      const netWithdrawal = Math.max(0, annualWithdrawal - annualPension);
      cashflow = -netWithdrawal;
      cashflowLabel = hasPension
        ? `Entnahme ${Math.round(annualWithdrawal)} − Pension ${Math.round(annualPension)}`
        : "Entnahme";

      const totalPortfolio = bucketValues.reduce((a, b) => a + b, 0);

      // Erfolgskriterium inkl. PE-NAV (siehe runMonteCarloSimulation).
      if (totalPortfolio + peNavThisYear <= netWithdrawal && !failed) {
        failed = true;
      }

      if (totalPortfolio > 0 && netWithdrawal > 0) {
        const cashAvailable = bucketValues[0];
        if (cashAvailable >= netWithdrawal) {
          bucketValues[0] -= netWithdrawal;
          withdrawalFromCash = netWithdrawal;
        } else {
          const remaining = netWithdrawal - cashAvailable;
          withdrawalFromCash = cashAvailable;
          bucketValues[0] = 0;
          const restTotal = bucketValues[1] + bucketValues[2];
          if (restTotal > 0) {
            const ratio = Math.min(1, remaining / restTotal);
            const soldBonds = bucketValues[1] * ratio;
            const soldEquities = bucketValues[2] * ratio;
            bucketValues[1] -= soldBonds;
            bucketValues[2] -= soldEquities;
            withdrawalFromBonds = soldBonds;
            withdrawalFromEquities = soldEquities;
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
          const soldCash = bucketValues[0] * withdrawRatio;
          const soldBonds = bucketValues[1] * withdrawRatio;
          const soldEquities = bucketValues[2] * withdrawRatio;
          bucketValues[0] -= soldCash;
          bucketValues[1] -= soldBonds;
          bucketValues[2] -= soldEquities;
          // Liquiditätsereignis-Auszahlung in dieselben Zähler buchen,
          // damit der Tooltip im Einzelpfad alle echten Quellen zeigt.
          withdrawalFromCash += soldCash;
          withdrawalFromBonds += soldBonds;
          withdrawalFromEquities += soldEquities;
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
        const annualWithdrawalForTarget = inflateWithdrawalsTrace
          ? inputs.desiredMonthlyWithdrawal * 12 * cumulativeInflation
          : inputs.desiredMonthlyWithdrawal * 12;
        const pensionForTarget = age >= inputs.pensionStartAge
          ? (inflateWithdrawalsTrace ? inputs.monthlyPension * 12 * cumulativeInflation : inputs.monthlyPension * 12)
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
      withdrawalFromCash,
      withdrawalFromBonds,
      withdrawalFromEquities,
      endCash,
      endBonds,
      endEquities,
      endTotal,
      cumulativeInflation,
      peCall: hasPE ? peCall : undefined,
      peDistGross: hasPE ? peDistGross : undefined,
      peDistNet: hasPE ? peDistNet : undefined,
      peNav: hasPE ? peNavThisYear : undefined,
    });
  }

  // PE-NAV am Ende: letzter Eintrag der Timeline (Index = totalYears,
  // sofern vorhanden, sonst der letzte erreichbare Eintrag).
  const peNavFinal = hasPE
    ? peTimeline[Math.min(totalYears, peTimeline.length - 1)]?.totalNav ?? 0
    : 0;
  const finalWealth = bucketValues.reduce((a, b) => a + b, 0) + peNavFinal;

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

// computeMaxDrawdown wurde 2026-Q2 entfernt — der Markt-Drawdown wird
// jetzt inkrementell pro Pfad als reiner Marktindex (ohne Cash-Flows)
// in der Hauptschleife geführt (siehe `marketDrawdowns`).