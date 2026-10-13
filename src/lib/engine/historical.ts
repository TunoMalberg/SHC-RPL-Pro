import type {
  HistoricalData,
  HistoricalResult,
  HistoricalAnalysis,
  FinancialInputs,
  PortfolioConfig,
  ClientProfile,
  LiquidityEvent,
  SimulationSettings,
} from "../types";
import { buildPathContext, simulatePath } from "./pathCore";

// Historische Marktdaten 1970–2024
// Aktien: MSCI World Total Return in EUR (vor 1999: umgerechnet über DEM/ATS-Wechselkurs)
//   Quellen: MSCI Factsheets (EUR, ab 2012), Wikipedia MSCI World USD + Bundesbank DEM/USD Kurse
// Anleihen: Europäische Staatsanleihen Gesamtrendite (DE Bunds / EUR Gov Bonds)
//   Quellen: Bundesbank, OECD, Credit Suisse Global Investment Returns Yearbook
// Cash: Österreichische Geldmarktzinsen (OeNB Diskontrate 1970-1998, EURIBOR/EZB ab 1999)
//   Quellen: OeNB, EZB, FRED
// Inflation: Österreichischer VPI (Verbraucherpreisindex, Statistik Austria Basis 2020/Kettenindex)
//   Quellen: Statistik Austria VPI-Jahreswerte 1970–2024
//   Diese Jahresinflationsraten werden im Backtest kumulativ verkettet
//   (Produkt über alle Jahre) und nicht mehr als Einzelwert potenziert.
export const historicalData: HistoricalData[] = [
  { year: 1970, equityReturn: -9.1, bondReturn: 1.2, cashReturn: 5.0, inflation: 4.4 },
  { year: 1971, equityReturn: 14.0, bondReturn: 5.8, cashReturn: 5.0, inflation: 4.7 },
  { year: 1972, equityReturn: 13.3, bondReturn: 4.2, cashReturn: 4.5, inflation: 6.4 },
  { year: 1973, equityReturn: -29.0, bondReturn: 2.1, cashReturn: 5.5, inflation: 7.5 },
  { year: 1974, equityReturn: -26.4, bondReturn: -1.5, cashReturn: 6.5, inflation: 9.5 },
  { year: 1975, equityReturn: 27.9, bondReturn: 9.8, cashReturn: 6.0, inflation: 8.4 },
  { year: 1976, equityReturn: 17.6, bondReturn: 10.2, cashReturn: 5.0, inflation: 7.3 },
  { year: 1977, equityReturn: -3.2, bondReturn: 8.5, cashReturn: 5.5, inflation: 5.5 },
  { year: 1978, equityReturn: 2.1, bondReturn: 6.4, cashReturn: 4.5, inflation: 3.6 },
  { year: 1979, equityReturn: 3.1, bondReturn: 1.8, cashReturn: 5.0, inflation: 3.7 },
  { year: 1980, equityReturn: 26.6, bondReturn: -1.2, cashReturn: 6.5, inflation: 6.3 },
  { year: 1981, equityReturn: 20.4, bondReturn: -1.8, cashReturn: 8.0, inflation: 6.8 },
  { year: 1982, equityReturn: 19.4, bondReturn: 12.5, cashReturn: 7.5, inflation: 5.4 },
  { year: 1983, equityReturn: 29.7, bondReturn: 7.8, cashReturn: 5.5, inflation: 3.3 },
  { year: 1984, equityReturn: 17.8, bondReturn: 8.2, cashReturn: 5.0, inflation: 5.7 },
  { year: 1985, equityReturn: 46.6, bondReturn: 14.5, cashReturn: 4.5, inflation: 3.2 },
  { year: 1986, equityReturn: 5.4, bondReturn: 10.8, cashReturn: 4.0, inflation: 1.7 },
  { year: 1987, equityReturn: -3.3, bondReturn: 2.5, cashReturn: 3.5, inflation: 1.4 },
  { year: 1988, equityReturn: 21.1, bondReturn: 5.2, cashReturn: 4.0, inflation: 1.9 },
  { year: 1989, equityReturn: 25.5, bondReturn: 3.8, cashReturn: 5.5, inflation: 2.6 },
  { year: 1990, equityReturn: -28.2, bondReturn: -0.5, cashReturn: 7.0, inflation: 3.3 },
  { year: 1991, equityReturn: 22.2, bondReturn: 5.2, cashReturn: 7.5, inflation: 3.3 },
  { year: 1992, equityReturn: -10.3, bondReturn: 7.8, cashReturn: 8.0, inflation: 4.0 },
  { year: 1993, equityReturn: 30.5, bondReturn: 14.2, cashReturn: 6.0, inflation: 3.6 },
  { year: 1994, equityReturn: 3.5, bondReturn: -4.5, cashReturn: 5.0, inflation: 3.0 },
  { year: 1995, equityReturn: 7.1, bondReturn: 17.5, cashReturn: 4.5, inflation: 2.2 },
  { year: 1996, equityReturn: 19.8, bondReturn: 8.2, cashReturn: 3.5, inflation: 1.9 },
  { year: 1997, equityReturn: 34.0, bondReturn: 6.5, cashReturn: 3.3, inflation: 1.3 },
  { year: 1998, equityReturn: 26.6, bondReturn: 12.8, cashReturn: 3.4, inflation: 0.9 },
  { year: 1999, equityReturn: 30.7, bondReturn: -2.1, cashReturn: 2.9, inflation: 0.6 },
  { year: 2000, equityReturn: 0.5, bondReturn: 7.5, cashReturn: 4.4, inflation: 2.3 },
  { year: 2001, equityReturn: -13.9, bondReturn: 5.2, cashReturn: 4.3, inflation: 2.7 },
  { year: 2002, equityReturn: -23.8, bondReturn: 9.4, cashReturn: 3.3, inflation: 1.8 },
  { year: 2003, equityReturn: 11.8, bondReturn: 4.2, cashReturn: 2.3, inflation: 1.4 },
  { year: 2004, equityReturn: 4.8, bondReturn: 7.5, cashReturn: 2.1, inflation: 2.1 },
  { year: 2005, equityReturn: 10.0, bondReturn: 5.9, cashReturn: 2.2, inflation: 2.3 },
  { year: 2006, equityReturn: 19.5, bondReturn: 0.3, cashReturn: 3.1, inflation: 1.4 },
  { year: 2007, equityReturn: 0.4, bondReturn: 1.5, cashReturn: 4.3, inflation: 2.2 },
  { year: 2008, equityReturn: -44.4, bondReturn: 9.2, cashReturn: 4.6, inflation: 3.2 },
  { year: 2009, equityReturn: 37.9, bondReturn: 4.3, cashReturn: 1.2, inflation: 0.5 },
  { year: 2010, equityReturn: 18.2, bondReturn: 1.0, cashReturn: 0.8, inflation: 1.8 },
  { year: 2011, equityReturn: -9.5, bondReturn: 3.4, cashReturn: 1.4, inflation: 3.3 },
  { year: 2012, equityReturn: 14.1, bondReturn: 11.2, cashReturn: 0.6, inflation: 2.5 },
  { year: 2013, equityReturn: 21.2, bondReturn: 2.4, cashReturn: 0.2, inflation: 2.0 },
  { year: 2014, equityReturn: 19.5, bondReturn: 13.2, cashReturn: 0.2, inflation: 1.6 },
  { year: 2015, equityReturn: 10.4, bondReturn: 1.6, cashReturn: 0.0, inflation: 0.9 },
  { year: 2016, equityReturn: 10.7, bondReturn: 3.2, cashReturn: -0.3, inflation: 0.9 },
  { year: 2017, equityReturn: 7.5, bondReturn: 0.2, cashReturn: -0.3, inflation: 2.1 },
  { year: 2018, equityReturn: -4.1, bondReturn: 0.9, cashReturn: -0.3, inflation: 2.0 },
  { year: 2019, equityReturn: 30.0, bondReturn: 6.8, cashReturn: -0.4, inflation: 1.5 },
  { year: 2020, equityReturn: 6.3, bondReturn: 4.9, cashReturn: -0.4, inflation: 1.4 },
  { year: 2021, equityReturn: 31.1, bondReturn: -3.5, cashReturn: -0.5, inflation: 2.8 },
  { year: 2022, equityReturn: -12.8, bondReturn: -18.5, cashReturn: 0.3, inflation: 8.6 },
  { year: 2023, equityReturn: 19.6, bondReturn: 7.2, cashReturn: 3.4, inflation: 7.8 },
  { year: 2024, equityReturn: 26.6, bondReturn: 2.6, cashReturn: 3.6, inflation: 2.9 },
];

/**
 * Geometrische Mittelwerte (annualisierte Brutto-Renditen) pro Topf
 * über den gesamten hinterlegten Datensatz (1970–2024).
 *
 * Wird im UI angezeigt, um die vom Berater eingegebenen Brutto-Renditen
 * mit den tatsächlich realisierten Marktrenditen zu vergleichen.
 */
export interface HistoricalGrossReturns {
  cash: number;       // % p.a.
  bonds: number;      // % p.a.
  equities: number;   // % p.a.
  inflation: number;  // % p.a.
  startYear: number;
  endYear: number;
  years: number;
}

export function computeHistoricalGrossReturns(
  data: HistoricalData[] = historicalData,
): HistoricalGrossReturns {
  if (!data.length) {
    return { cash: 0, bonds: 0, equities: 0, inflation: 0, startYear: 0, endYear: 0, years: 0 };
  }
  const geo = (rates: number[]): number => {
    const product = rates.reduce((acc, r) => acc * (1 + r / 100), 1);
    return (Math.pow(product, 1 / rates.length) - 1) * 100;
  };
  return {
    cash: geo(data.map((d) => d.cashReturn)),
    bonds: geo(data.map((d) => d.bondReturn)),
    equities: geo(data.map((d) => d.equityReturn)),
    inflation: geo(data.map((d) => d.inflation)),
    startYear: data[0].year,
    endYear: data[data.length - 1].year,
    years: data.length,
  };
}

/**
 * Historischer Backtest mit rollierenden Zeitfenstern.
 *
 * Gerechnet wird mit dem gemeinsamen Rechenkern (pathCore.ts) — dieselben
 * Regeln wie Monte-Carlo und Einzelpfad (Kosten, KESt auf Bankeinlagen,
 * Höchststand-KESt, Zweiphasen-Allokation, Umschichtung, Liquiditätspuffer,
 * Liquiditätsereignisse, Erfolgskriterium). Statt Zufallsrenditen laufen die
 * echten Jahresrenditen (nach Kosten) und die echte österreichische
 * Inflation des jeweiligen Zeitfensters durch.
 *
 * Private Equity, PE-Programm, Wohnbauanleihe und Lebensversicherung sind im
 * Backtest bewusst ausgeschaltet: dafür gibt es keine historischen Reihen.
 */
export function runHistoricalBacktest(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  liquidityEvents: LiquidityEvent[] = []
): HistoricalAnalysis {
  const liquidOnly: PortfolioConfig = {
    ...portfolio,
    peFunds: [],
    peProgram: undefined,
    wohnbauanleihen: [],
    lebensversicherungen: [],
  };
  const settings: SimulationSettings = {
    numSimulations: 1,
    timeStepMonths: 12,
    mode: "fixed_withdrawal",
  };
  const ctx = buildPathContext(client, inputs, liquidOnly, settings, liquidityEvents, 1);
  const totalYears = ctx.totalSteps;
  const costs = portfolio.buckets.map((b) => b.costs / 100);

  const scenarios: HistoricalResult[] = [];
  const hasWithdrawalPhase = client.lifeExpectancy > Math.max(client.currentAge, client.retirementAge);

  /** Echte Marktjahre ab `startIdx`: Netto-Renditen (nach Kosten) + Inflation. */
  const marketFrom = (startIdx: number) => ({
    returns: (step: number): number[] => {
      const d = historicalData[startIdx + step];
      return [
        d.cashReturn / 100 - costs[0],
        d.bondReturn / 100 - costs[1],
        d.equityReturn / 100 - costs[2],
      ];
    },
    inflation: (step: number) => historicalData[startIdx + step].inflation / 100,
  });

  /**
   * Historisch tragbare Entnahme eines Startjahres: größter Gesamtbetrag je
   * Monat (heutige Kaufkraft, inkl. Pension), bei dem der Plan in diesem
   * Zeitfenster gerade nicht scheitert — Halbierungssuche auf 1 € genau,
   * mit genau denselben Regeln wie der Backtest selbst.
   */
  const sustainableFor = (startIdx: number): number | null => {
    if (!hasWithdrawalPhase) return null;
    const market = marketFrom(startIdx);
    const survives = (monthly: number): boolean => {
      const c = buildPathContext(
        client, { ...inputs, desiredMonthlyWithdrawal: monthly }, liquidOnly, settings, liquidityEvents, 1,
      );
      return !simulatePath(c, 0, { market }).failed;
    };
    if (!survives(0)) return 0;
    let lo = 0;
    let hi = Math.max(1_000, inputs.monthlyPension * 2, inputs.initialCapital / 100);
    for (let n = 0; n < 16 && survives(hi); n++) {
      lo = hi;
      hi *= 2;
    }
    for (let n = 0; n < 40 && hi - lo > 1; n++) {
      const mid = (lo + hi) / 2;
      if (survives(mid)) lo = mid;
      else hi = mid;
    }
    return Math.floor(lo);
  };

  for (let startIdx = 0; startIdx <= historicalData.length - totalYears; startIdx++) {
    const startYear = historicalData[startIdx].year;
    const market = marketFrom(startIdx);
    const yearReturns = market.returns;

    // Schlechtestes Portfoliojahr (Allokation des jeweiligen Regimes).
    let worstYear = startYear;
    let worstReturn = 0;
    for (let y = 0; y < totalYears; y++) {
      const weights = y < ctx.switchStep ? ctx.accWeights : ctx.wdWeights;
      const r = yearReturns(y).reduce((s, v, i) => s + weights[i] * v, 0);
      if (r < worstReturn) {
        worstReturn = r;
        worstYear = historicalData[startIdx + y].year;
      }
    }

    const out = simulatePath(ctx, 0, { collectPath: true, market });

    // Kaufkraft: je Jahr mit der echten österreichischen Inflation des
    // Fensters abzinsen (gleiche Inflation, mit der Entnahmen steigen).
    const nominalPath = out.path as number[];
    const pathReal: number[] = [];
    let cpi = 1;
    for (let i = 0; i < nominalPath.length; i++) {
      if (i > 0) cpi *= 1 + historicalData[startIdx + i - 1].inflation / 100;
      pathReal.push(nominalPath[i] / cpi);
    }

    scenarios.push({
      startYear,
      endYear: startYear + totalYears,
      success: !out.failed,
      finalWealth: Math.max(0, out.finalValue),
      finalWealthReal: Math.max(0, out.finalValue) / cpi,
      pathReal,
      sustainableMonthly: sustainableFor(startIdx),
      // Reiner Markt-Drawdown (ohne Sparraten/Entnahmen) — wie Monte-Carlo.
      maxDrawdown: out.marketMaxDD,
      path: out.path as number[],
      worstYear,
      worstReturn: worstReturn * 100,
    });
  }

  const successfulScenarios = scenarios.filter((s) => s.success);
  const sortedByWealth = [...scenarios].sort(
    (a, b) => a.finalWealth - b.finalWealth
  );

  const median = (values: number[]): number => {
    if (values.length === 0) return 0;
    const v = [...values].sort((a, b) => a - b);
    const m = Math.floor(v.length / 2);
    return v.length % 2 === 1 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  const medianFinalWealth = median(scenarios.map((s) => s.finalWealth));
  const avg = (values: number[]) =>
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  return {
    scenarios,
    overallSuccessRate:
      scenarios.length > 0
        ? (successfulScenarios.length / scenarios.length) * 100
        : 0,
    averageFinalWealth: avg(scenarios.map((s) => s.finalWealth)),
    medianFinalWealth,
    medianFinalWealthReal: median(scenarios.map((s) => s.finalWealthReal)),
    averageFinalWealthReal: avg(scenarios.map((s) => s.finalWealthReal)),
    ...sustainableSummary(scenarios),
    worstScenario: sortedByWealth[0],
    bestScenario: sortedByWealth[sortedByWealth.length - 1],
    drawdownDistribution: scenarios.map((s) => s.maxDrawdown * 100),
  };
}

/** Ungünstigstes Startjahr und Median der historisch tragbaren Entnahme. */
function sustainableSummary(scenarios: HistoricalResult[]): Pick<
  HistoricalAnalysis,
  "sustainableMonthlyWorst" | "sustainableMonthlyMedian"
> {
  const withValue = scenarios.filter((s) => s.sustainableMonthly !== null);
  if (withValue.length === 0) return { sustainableMonthlyWorst: null, sustainableMonthlyMedian: null };
  const worst = withValue.reduce((a, b) => ((b.sustainableMonthly ?? 0) < (a.sustainableMonthly ?? 0) ? b : a));
  const v = withValue.map((s) => s.sustainableMonthly as number).sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return {
    sustainableMonthlyWorst: { startYear: worst.startYear, monthly: worst.sustainableMonthly as number },
    sustainableMonthlyMedian: v.length % 2 === 1 ? v[m] : (v[m - 1] + v[m]) / 2,
  };
}
