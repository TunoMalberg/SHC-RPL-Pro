import type {
  FinancialInputs,
  PortfolioConfig,
  SimulationSettings,
  SimulationResult,
  ClientProfile,
  DetailedSimTrace,
  DetailedYearRow,
  LiquidityEvent,
  ResultValuation,
} from "../types";
import { buildDeflators } from "./valuation";
import {
  computePortfolioReturn,
  computePortfolioVolatility,
  computeSharpeRatio,
} from "./portfolio";
import { buildPathContext, simulatePath, type StepDetail } from "./pathCore";

// Rechenregeln je Pfad stehen im gemeinsamen Kern (pathCore.ts). Diese
// Datei sammelt nur noch die Ergebnisse (Statistik, Perzentile, Tabelle).
export { switchToWithdrawalAllocation } from "./pathCore";

export function runMonteCarloSimulation(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  liquidityEvents: LiquidityEvent[] = []
): SimulationResult {
  const ctx = buildPathContext(client, inputs, portfolio, settings, liquidityEvents);
  const { stepsPerYear, totalSteps, totalYears, peEnsemble, peTimelineDefault, peRuntime } = ctx;
  const accumulationYears = Math.max(0, client.retirementAge - client.currentAge);
  const hasPE = ctx.hasPE;
  const desiredMonthly = ctx.desiredMonthly;
  const inflateWithdrawals = ctx.inflateWithdrawals;

  // Programm-NAV bzw. Produktwert je [Pfad][Jahr] für Cross-Path-Perzentile.
  const peProgNavMatrix: number[][] | null = peRuntime ? [] : null;
  const productValueMatrix: number[][] | null = ctx.hasProducts ? [] : null;

  const allFinalValues: number[] = [];
  const allPaths: number[][] = [];
  // Best/Worst-Simulationsindex (niedrigstes/höchstes Endvermögen) —
  // der Reiter „Einzelpfad" reproduziert diese Pfade exakt (gleicher Index).
  let bestSimIndex = 0;
  let worstSimIndex = 0;
  let bestFinalValue = Number.NEGATIVE_INFINITY;
  let worstFinalValue = Number.POSITIVE_INFINITY;
  // Reiner Markt-Drawdown je Pfad (ohne Sparraten/Entnahmen/KESt).
  const marketDrawdowns: number[] = [];
  let successCount = 0;
  const failureYears: number[] = [];
  // Liquiditätslücke je Pfad (erstes Alter, nicht gedeckte Summe, gebundenes Vermögen).
  const gapAges: number[] = [];
  const gapUnpaid: number[] = [];
  const gapLocked: number[] = [];

  for (let sim = 0; sim < settings.numSimulations; sim++) {
    const out = simulatePath(ctx, sim, { collectPath: true });
    const finalValue = out.finalValue;
    allFinalValues.push(finalValue);
    allPaths.push(out.path as number[]);
    marketDrawdowns.push(out.marketMaxDD);
    if (out.gapFirstStep >= 0) {
      gapAges.push(client.currentAge + out.gapFirstStep / stepsPerYear);
      gapUnpaid.push(out.gapUnpaidReal);
      if (out.gapLockedValue > 0.5) gapLocked.push(out.gapLockedValue);
    }
    if (out.peProgNavYears && peProgNavMatrix) peProgNavMatrix.push(out.peProgNavYears);
    if (out.productValueYears && productValueMatrix) productValueMatrix.push(out.productValueYears);

    if (finalValue > bestFinalValue) {
      bestFinalValue = finalValue;
      bestSimIndex = sim;
    }
    if (finalValue < worstFinalValue) {
      worstFinalValue = finalValue;
      worstSimIndex = sim;
    }

    if (!out.failed) {
      successCount++;
    } else {
      failureYears.push(client.currentAge + out.failureStep / stepsPerYear);
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
  // - Programm-Modus  : Cross-Path-Perzentile über alle MC-Pfade
  //                     (Gesamt-PE-NAV = Bestand + Programm-Vintages;
  //                     die Commitments sind pfadabhängig).
  let pePath: number[] = hasPE
    ? Array.from({ length: totalSteps + 1 }, (_, step) => {
        const yIdx = Math.min(Math.floor(step / stepsPerYear), peTimelineDefault.length - 1);
        return peTimelineDefault[yIdx]?.totalNav ?? 0;
      })
    : [];
  let pePathP25: number[] | undefined = peEnsemble
    ? Array.from({ length: totalSteps + 1 }, (_, step) => {
        const yIdx = Math.min(Math.floor(step / stepsPerYear), peEnsemble.navP25.length - 1);
        return peEnsemble.navP25[yIdx] ?? 0;
      })
    : undefined;
  let pePathP75: number[] | undefined = peEnsemble
    ? Array.from({ length: totalSteps + 1 }, (_, step) => {
        const yIdx = Math.min(Math.floor(step / stepsPerYear), peEnsemble.navP75.length - 1);
        return peEnsemble.navP75[yIdx] ?? 0;
      })
    : undefined;
  // Produkt-Wertpfad: Perzentile über die Pfade je Jahr (LV stochastisch).
  const productPathBands: {
    productPath?: number[];
    productPathP25?: number[];
    productPathP75?: number[];
  } = {};
  if (productValueMatrix && productValueMatrix.length > 0 && productValueMatrix[0].length > 0) {
    const yearCount = productValueMatrix[0].length;
    const byYear = (q: number) =>
      Array.from({ length: yearCount }, (_, y) =>
        percentile(productValueMatrix.map((row) => row[y] ?? 0).sort((a, b) => a - b), q),
      );
    const p25 = byYear(25);
    const p50 = byYear(50);
    const p75 = byYear(75);
    const at = (arr: number[]) =>
      Array.from({ length: totalSteps + 1 }, (_, step) =>
        arr[Math.min(Math.floor(step / stepsPerYear), yearCount - 1)],
      );
    productPathBands.productPath = at(p50);
    productPathBands.productPathP25 = at(p25);
    productPathBands.productPathP75 = at(p75);
  }

  if (peProgNavMatrix && peProgNavMatrix.length > 0 && peProgNavMatrix[0].length > 0) {
    const yearCount = peProgNavMatrix[0].length;
    const p25ByYear = new Array<number>(yearCount).fill(0);
    const p50ByYear = new Array<number>(yearCount).fill(0);
    const p75ByYear = new Array<number>(yearCount).fill(0);
    for (let y = 0; y < yearCount; y++) {
      const col = peProgNavMatrix
        .map((row) => row[y] ?? 0)
        .sort((a, b) => a - b);
      p25ByYear[y] = percentile(col, 25);
      p50ByYear[y] = percentile(col, 50);
      p75ByYear[y] = percentile(col, 75);
    }
    const yearAt = (step: number): number =>
      Math.min(Math.floor(step / stepsPerYear), yearCount - 1);
    pePath = Array.from({ length: totalSteps + 1 }, (_, step) => p50ByYear[yearAt(step)]);
    pePathP25 = Array.from({ length: totalSteps + 1 }, (_, step) => p25ByYear[yearAt(step)]);
    pePathP75 = Array.from({ length: totalSteps + 1 }, (_, step) => p75ByYear[yearAt(step)]);
  }

  const annualWithdrawals: number[] = [];
  const annualPortfolioValues: number[] = [];
  for (let y = 0; y <= totalYears; y++) {
    const stepIdx = Math.min(y * stepsPerYear, totalSteps);
    annualPortfolioValues.push(percentilePaths.p50[Math.round(stepIdx)]);
    if (y >= accumulationYears) {
      const inflation = (1 + inputs.inflationRate / 100) ** y;
      annualWithdrawals.push(
        inflateWithdrawals
          ? desiredMonthly * 12 * inflation
          : desiredMonthly * 12
      );
    } else {
      annualWithdrawals.push(0);
    }
  }

  // ── Duale Bewertung (CR 6): Deflatoren + reale Skalare. ──────────
  // Reale Serien werden display-seitig via deflateSeries() abgeleitet
  // (exakt, keine Array-Duplikate); die skalaren Endwerte stehen hier.
  const deflators = buildDeflators(inputs.inflationRate, totalSteps, stepsPerYear);
  const endDeflator = deflators[totalSteps] ?? 1;
  const percentilesNominal: Record<string, number> = {
    p5: percentile(sortedFinal, 5),
    p10: percentile(sortedFinal, 10),
    p25: percentile(sortedFinal, 25),
    p50: percentile(sortedFinal, 50),
    p75: percentile(sortedFinal, 75),
    p90: percentile(sortedFinal, 90),
    p95: percentile(sortedFinal, 95),
  };
  const percentilesReal: Record<string, number> = Object.fromEntries(
    Object.entries(percentilesNominal).map(([k, v]) => [k, v * endDeflator]),
  );
  const meanFinal =
    allFinalValues.reduce((a, b) => a + b, 0) / allFinalValues.length;
  const valuation: ResultValuation = {
    inflationRatePct: inputs.inflationRate,
    stepsPerYear,
    deflators,
    horizonYear: client.birthYear + client.lifeExpectancy,
    retirementYear: client.birthYear + client.retirementAge,
    yearsToHorizon: totalYears,
    medianFinalWealthReal: percentilesNominal.p50 * endDeflator,
    meanFinalWealthReal: meanFinal * endDeflator,
    percentilesReal,
  };

  return {
    successRate: (successCount / settings.numSimulations) * 100,
    medianFinalWealth: percentile(sortedFinal, 50),
    meanFinalWealth: meanFinal,
    percentiles: percentilesNominal,
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
    pePath: hasPE || peRuntime ? pePath : undefined,
    pePathP25,
    pePathP75,
    peSuccessRate: peEnsemble ? peEnsemble.successRate : undefined,
    peMedianIRR: peEnsemble ? peEnsemble.medianIRRPct : undefined,
    peMedianTVPI: peEnsemble ? peEnsemble.medianTVPI : undefined,
    worstSimIndex,
    bestSimIndex,
    // Produkt-Töpfe WBA/LV: Cross-Path-Median + P25/P75 je Jahr
    // (step-aligned; LV ist pfadabhängig).
    ...productPathBands,
    valuation,
    // Benötigt aus dem Vermögen (heutige Kaufkraft): Wunsch − Pension,
    // null wenn kein Wunschbetrag erfasst (CR 19: Herleitung im Trace).
    requiredMonthlyWithdrawal:
      inputs.desiredMonthlyWithdrawal === null
        ? null
        : Math.max(0, inputs.desiredMonthlyWithdrawal - inputs.monthlyPension),
    withdrawalAssumption: "user",
    effectiveMonthlyWithdrawal: desiredMonthly,
    liquidityGap:
      gapAges.length > 0
        ? {
            probabilityPct: (gapAges.length / settings.numSimulations) * 100,
            withLockedAssetsPct: (gapLocked.length / settings.numSimulations) * 100,
            medianFirstAge: percentile([...gapAges].sort((a, b) => a - b), 50),
            medianUnpaidReal: percentile([...gapUnpaid].sort((a, b) => a - b), 50),
            medianLockedValue: percentile([...gapLocked].sort((a, b) => a - b), 50),
          }
        : null,
  };
}

export interface SustainableWithdrawalOptions {
  /** Cap der MC-Pfade je Bisektionsschritt (Default 2000). */
  maxSimulations?: number;
  /** Bisektions-Iterationen (Default 20). */
  iterations?: number;
  /** Fortschritts-Callback (abgeschlossene / geplante Iterationen). */
  onIteration?: (done: number, total: number) => void;
}

export function findSustainableWithdrawal(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  targetSuccessRate = 95,
  liquidityEvents: LiquidityEvent[] = [],
  opts: SustainableWithdrawalOptions = {}
): number {
  const iterations = opts.iterations ?? 20;
  const maxSims = opts.maxSimulations ?? 2000;
  const simSettings = {
    ...settings,
    numSimulations: Math.min(settings.numSimulations, maxSims),
  };
  const evalAt = (monthly: number): number =>
    runMonteCarloSimulation(
      client,
      { ...inputs, desiredMonthlyWithdrawal: monthly },
      portfolio,
      simSettings,
      liquidityEvents
    ).successRate;

  let low = 0;
  // Startobergrenze: 10 % des Startkapitals pro Monat. Bei hohen Spar-
  // raten/Inflation kann das zu eng sein → adaptiv verdoppeln, solange
  // die Obergrenze selbst noch tragfähig ist (max. 5 Verdopplungen).
  let high = Math.max(inputs.initialCapital * 0.1, 1000);
  let expansions = 0;
  while (expansions < 5 && evalAt(high) >= targetSuccessRate) {
    low = high;
    high *= 2;
    expansions++;
  }

  let bestWithdrawal = low;
  for (let iter = 0; iter < iterations; iter++) {
    const mid = (low + high) / 2;
    if (evalAt(mid) >= targetSuccessRate) {
      bestWithdrawal = mid;
      low = mid;
    } else {
      high = mid;
    }
    opts.onIteration?.(iter + 1, iterations);
  }
  return Math.round(bestWithdrawal);
}

export function findRequiredCapital(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  targetSuccessRate = 95,
  liquidityEvents: LiquidityEvent[] = []
): number {
  let low = 0;
  let high = Math.max((inputs.desiredMonthlyWithdrawal ?? 0) * 12 * 50, 1);
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
  targetSuccessRate = 95,
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
  const baseWithdrawal = inputs.desiredMonthlyWithdrawal ?? 0;
  const steps = 20;
  // Ohne Wunschbetrag (Modus „berechnen, was möglich ist") gibt es keine
  // sinnvolle Heatmap-Basis → leeres Ergebnis, Anzeige entfällt.
  if (baseWithdrawal <= 0) return results;

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


/**
 * Einzelpfad: derselbe Kern wie die Monte-Carlo-Simulation, in
 * Jahresschritten, mit Protokoll jeder Buchung. Pfad-Index N zeigt exakt
 * den Monte-Carlo-Pfad N (bei jährlichem Simulationsschritt identisch).
 */
export function runDetailedSingleSimulation(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  simIndex = 0,
  liquidityEvents: LiquidityEvent[] = []
): DetailedSimTrace {
  const ctx = buildPathContext(client, inputs, portfolio, settings, liquidityEvents, 1);
  const showPE = ctx.hasPE || ctx.peRuntime !== null;
  const showProducts = ctx.hasProducts;
  const rows: DetailedYearRow[] = [];

  const out = simulatePath(ctx, simIndex, {
    recorder: {
      onStep(d: StepDetail) {
        const age = client.currentAge + d.step;
        const startTotal = d.start[0] + d.start[1] + d.start[2];
        rows.push({
          year: client.birthYear + age,
          age,
          phase: d.isAccumulation ? "Anspar" : "Entnahme",
          startTotal,
          startCash: d.start[0],
          startBonds: d.start[1],
          startEquities: d.start[2],
          returnCash: d.returnAmounts[0],
          returnBonds: d.returnAmounts[1],
          returnEquities: d.returnAmounts[2],
          returnCashPct: d.start[0] > 0 ? d.returns[0] * 100 : 0,
          returnBondsPct: d.start[1] > 0 ? d.returns[1] * 100 : 0,
          returnEquitiesPct: d.start[2] > 0 ? d.returns[2] * 100 : 0,
          cashTax: d.cashTax,
          allocationSwitched: d.allocationSwitched || undefined,
          cashflow: d.cashflow,
          cashflowLabel: d.isAccumulation
            ? "Sparrate"
            : d.hasPension
              ? `Entnahme ${Math.round(d.grossWithdrawal)} − Pension ${Math.round(d.pension)}`
              : "Entnahme",
          liquidityEvent: d.liquidityEvent,
          liquidityEventLabel: d.liquidityEventLabel,
          rebalanced: d.rebalanced,
          rebalCashDelta: d.rebalDeltas[0],
          rebalBondsDelta: d.rebalDeltas[1],
          rebalEquitiesDelta: d.rebalDeltas[2],
          rebalSource: d.rebalSource,
          withdrawalFromCash: d.withdrawalFrom[0],
          withdrawalFromBonds: d.withdrawalFrom[1],
          withdrawalFromEquities: d.withdrawalFrom[2],
          unpaidWithdrawal: d.unpaid > 0.005 ? d.unpaid : undefined,
          endCash: d.end[0],
          endBonds: d.end[1],
          endEquities: d.end[2],
          endTotal: d.end[0] + d.end[1] + d.end[2],
          cumulativeInflation: d.cumulativeInflation,
          peCall: showPE ? d.peCall : undefined,
          peDistGross: showPE ? d.peDistGross : undefined,
          peDistNet: showPE ? d.peDistNet : undefined,
          peNav: showPE ? d.peNav : undefined,
          peCommitted: d.peCommitted,
          peUnfunded: d.peUnfunded,
          productPurchase: showProducts ? d.productPurchase : undefined,
          productCoupon: showProducts ? d.productCoupon : undefined,
          productPayout: showProducts ? d.productPayout : undefined,
          wbaValue: showProducts ? d.wbaValue : undefined,
          lvValue: showProducts ? d.lvValue : undefined,
        });
      },
    },
  });

  return {
    rows,
    simulationIndex: simIndex,
    seed: ctx.baseSeed + simIndex,
    finalWealth: Math.max(0, out.finalValue),
    success: !out.failed,
  };
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
