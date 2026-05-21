/**
 * Bestandsportfolio-Backtest-Engine.
 *
 * Konsumiert: Holding[] + per-symbol PriceSeries (adjusted close) + FX-Serien
 * Liefert:    HoldingsBacktestResult (Metriken, Allokation, Stresstests, Konzentrations-Flags)
 *
 * Algorithmus:
 *  1) FX-bereinige jede Position auf EUR (täglich, Forward-Fill für FX-Lücken)
 *  2) Berechne tägliche Position-Returns aus adjClose
 *  3) Bestimme gemeinsames Backtest-Window (Schnittmenge der verfügbaren Tagen)
 *  4) Gewichte nach aktuellem Marktwert in EUR — fest (heutige Allokation, kein Rebalancing simuliert)
 *  5) Aggregate täglicher Portfolio-Return = Σ w_i × r_i
 *  6) Kennzahlen: Annualisierter Return, Vol, Sharpe (vs. 2 % RF), Sortino, MaxDD
 *  7) Stresstests: historische Replay-Phasen + FX-Schock + Klumpenrisiko
 */

import type {
  AllocationBucket,
  ConcentrationFlag,
  Holding,
  HoldingAssetClass,
  HoldingsBacktestResult,
  PositionMetric,
  StressTestResult,
} from "./types";
import type { PriceSeries } from "./yahoo";

const RISK_FREE_ANNUAL = 0.02;
const TRADING_DAYS = 252;

interface PreparedSeries {
  holding: Holding;
  /** date → eur price (adj). */
  pricesEUR: Map<string, number>;
  /** sorted ascending dates with valid prices. */
  dates: string[];
  /** weight in portfolio (0..1). */
  weight: number;
  /** market value in EUR today. */
  mvEUR: number;
}

function pctile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function safeStdDev(returns: number[], mean: number): number {
  if (returns.length < 2) return 0;
  let sq = 0;
  for (const r of returns) sq += (r - mean) * (r - mean);
  return Math.sqrt(sq / (returns.length - 1));
}

function fxOnDate(fxSeries: Record<string, number>, date: string, fallback: number): number {
  // Frankfurter has weekday rates only; forward-fill.
  if (fxSeries[date]) return fxSeries[date];
  // Walk backwards up to 10 days
  const d = new Date(date + "T00:00:00Z");
  for (let i = 0; i < 10; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const k = d.toISOString().slice(0, 10);
    if (fxSeries[k]) return fxSeries[k];
  }
  return fallback;
}

function mapAssetClassToBucketKey(ac: HoldingAssetClass): { key: string; label: string } {
  return { key: ac, label: ac };
}

export interface BacktestInput {
  holdings: Holding[];
  /** symbol-keyed PriceSeries map (Yahoo or Stooq). Keys are the actual symbol used to fetch (post resolve). */
  priceSeriesByHoldingId: Map<string, PriceSeries | null>;
  /** date-keyed FX EUR per non-EUR currency. */
  fxByCurrency: Map<string, Record<string, number>>;
  /** Spot rates for today's market value (used if currentPrice is in non-EUR). */
  fxSpotByCurrency: Map<string, number>;
}

export function runHoldingsBacktest(input: BacktestInput): HoldingsBacktestResult {
  const { holdings, priceSeriesByHoldingId, fxByCurrency, fxSpotByCurrency } = input;
  const warnings: string[] = [];

  // 1) Compute today's market value in EUR per holding
  let totalMVEUR = 0;
  let totalCostEUR = 0;
  const mvEURById = new Map<string, number>();
  const costEURById = new Map<string, number>();

  for (const h of holdings) {
    const fxSpot = fxSpotByCurrency.get(h.currency) ?? 1.0;
    const mv = h.currentPrice * h.quantity * fxSpot;
    mvEURById.set(h.id, mv);
    totalMVEUR += mv;
    if (h.costPrice && h.costPrice > 0) {
      const c = h.costPrice * h.quantity * fxSpot;
      costEURById.set(h.id, c);
      totalCostEUR += c;
    }
  }
  if (totalMVEUR <= 0) {
    return emptyResult(warnings.concat("Marktwert 0 — keine valide Position."));
  }

  // 2) Build EUR-converted price maps per holding
  const prepared: PreparedSeries[] = [];
  for (const h of holdings) {
    const series = priceSeriesByHoldingId.get(h.id);
    const weight = (mvEURById.get(h.id) ?? 0) / totalMVEUR;
    const mvEUR = mvEURById.get(h.id) ?? 0;
    if (!series || series.bars.length === 0) {
      // Position keeps its weight but no historical contribution
      prepared.push({
        holding: h,
        pricesEUR: new Map(),
        dates: [],
        weight,
        mvEUR,
      });
      warnings.push(`Keine Preishistorie für ${h.name} — Position wird in Backtest nicht historisch berücksichtigt.`);
      continue;
    }
    const fxSeries = fxByCurrency.get(h.currency) ?? {};
    const fxSpot = fxSpotByCurrency.get(h.currency) ?? 1.0;
    const map = new Map<string, number>();
    const dates: string[] = [];
    for (const bar of series.bars) {
      const fx = h.currency === "EUR" ? 1.0 : fxOnDate(fxSeries, bar.date, fxSpot);
      const eurPx = bar.adjClose * fx;
      if (Number.isFinite(eurPx) && eurPx > 0) {
        map.set(bar.date, eurPx);
        dates.push(bar.date);
      }
    }
    prepared.push({ holding: h, pricesEUR: map, dates, weight, mvEUR });
  }

  // 3) Find common backtest window — intersection of date sets for positions with prices
  const seriesWithPrices = prepared.filter((p) => p.dates.length > 0);
  if (seriesWithPrices.length === 0) {
    return finalize(prepared, warnings.concat("Keine historischen Preise auflösbar."), totalMVEUR, totalCostEUR);
  }
  // Use union of dates from the position with the longest history,
  // but require ALL positions to have at least one price within the window
  const baseDates = [...seriesWithPrices[0].dates].sort();
  let from = baseDates[0];
  let to = baseDates[baseDates.length - 1];
  for (const p of seriesWithPrices) {
    if (p.dates[0] > from) from = p.dates[0];
    if (p.dates[p.dates.length - 1] < to) to = p.dates[p.dates.length - 1];
  }
  if (from >= to) {
    return finalize(prepared, warnings.concat("Kein gemeinsames Zeitfenster — Positionen überschneiden sich nicht."), totalMVEUR, totalCostEUR);
  }

  // Build sorted union of trading dates, restricted to [from, to]
  const dateSet = new Set<string>();
  for (const p of seriesWithPrices) {
    for (const d of p.dates) {
      if (d >= from && d <= to) dateSet.add(d);
    }
  }
  const dates = [...dateSet].sort();

  // Forward-fill prices for each position over `dates`
  const ffPrices = new Map<string, number[]>();
  for (const p of seriesWithPrices) {
    const arr: number[] = new Array(dates.length).fill(NaN);
    let last = NaN;
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      const v = p.pricesEUR.get(d);
      if (typeof v === "number" && Number.isFinite(v)) last = v;
      arr[i] = last;
    }
    ffPrices.set(p.holding.id, arr);
  }

  // 4) Per-position daily returns (EUR adj)
  const posReturns = new Map<string, number[]>();
  const posMetrics: PositionMetric[] = [];
  for (const p of prepared) {
    const px = ffPrices.get(p.holding.id);
    if (!px || px.length < 30) {
      posMetrics.push({
        holdingId: p.holding.id,
        isin: p.holding.isin,
        ticker: p.holding.ticker,
        name: p.holding.name,
        weight: p.weight,
        marketValueEUR: p.mvEUR,
        costBasisEUR: costEURById.get(p.holding.id),
      });
      continue;
    }
    const rets: number[] = [];
    for (let i = 1; i < px.length; i++) {
      const a = px[i - 1];
      const b = px[i];
      if (a > 0 && Number.isFinite(a) && Number.isFinite(b)) {
        rets.push(b / a - 1);
      } else {
        rets.push(0);
      }
    }
    posReturns.set(p.holding.id, rets);

    const mean = rets.reduce((s, x) => s + x, 0) / Math.max(1, rets.length);
    const sd = safeStdDev(rets, mean);
    const annR = (1 + mean) ** TRADING_DAYS - 1;
    const annV = sd * Math.sqrt(TRADING_DAYS);

    // MaxDD on price path
    let peak = px[0];
    let maxDd = 0;
    for (const v of px) {
      if (v > peak) peak = v;
      const dd = peak > 0 ? v / peak - 1 : 0;
      if (dd < maxDd) maxDd = dd;
    }

    const cost = costEURById.get(p.holding.id);
    const pnlPct = cost && cost > 0 ? (p.mvEUR - cost) / cost : undefined;

    posMetrics.push({
      holdingId: p.holding.id,
      isin: p.holding.isin,
      ticker: p.holding.ticker,
      name: p.holding.name,
      weight: p.weight,
      marketValueEUR: p.mvEUR,
      costBasisEUR: cost,
      pnlPctVsCost: pnlPct,
      annualizedReturn: annR,
      annualizedVol: annV,
      maxDrawdown: maxDd,
      historyDays: px.length,
      historyStart: dates[0],
      historyEnd: dates[dates.length - 1],
    });
  }

  // 5) Portfolio daily return = Σ w_i × r_i (constant weights = today's allocation)
  const portReturns: number[] = new Array(dates.length - 1).fill(0);
  for (const p of prepared) {
    const r = posReturns.get(p.holding.id);
    if (!r) continue;
    for (let i = 0; i < portReturns.length; i++) {
      portReturns[i] += p.weight * r[i];
    }
  }

  // Index path = 100 → cumprod (1+r)
  const indexPath: { date: string; value: number }[] = [];
  let v = 100;
  indexPath.push({ date: dates[0], value: v });
  for (let i = 0; i < portReturns.length; i++) {
    v *= 1 + portReturns[i];
    indexPath.push({ date: dates[i + 1], value: v });
  }

  // Portfolio metrics
  const meanP = portReturns.reduce((s, x) => s + x, 0) / Math.max(1, portReturns.length);
  const sdP = safeStdDev(portReturns, meanP);
  const annR = (1 + meanP) ** TRADING_DAYS - 1;
  const annV = sdP * Math.sqrt(TRADING_DAYS);
  const sharpe = annV > 0 ? (annR - RISK_FREE_ANNUAL) / annV : 0;

  const downside = portReturns.filter((r) => r < 0);
  const downsideMean = downside.reduce((s, x) => s + x, 0) / Math.max(1, downside.length);
  const downsideSd = safeStdDev(downside, downsideMean);
  const sortino = downsideSd > 0 ? (annR - RISK_FREE_ANNUAL) / (downsideSd * Math.sqrt(TRADING_DAYS)) : 0;

  // MaxDD on portfolio index
  let peak = indexPath[0].value;
  let maxDD = 0;
  for (const p of indexPath) {
    if (p.value > peak) peak = p.value;
    const dd = peak > 0 ? p.value / peak - 1 : 0;
    if (dd < maxDD) maxDD = dd;
  }

  // Per-year returns (simple bucket by year)
  const yearMap = new Map<number, number[]>();
  for (let i = 0; i < portReturns.length; i++) {
    const year = Number.parseInt(dates[i + 1].slice(0, 4), 10);
    const arr = yearMap.get(year) ?? [];
    arr.push(portReturns[i]);
    yearMap.set(year, arr);
  }
  const yearReturns = [...yearMap.values()].map((arr) =>
    arr.reduce((acc, r) => acc * (1 + r), 1) - 1,
  );
  const bestYear = yearReturns.length ? Math.max(...yearReturns) : 0;
  const worstYear = yearReturns.length ? Math.min(...yearReturns) : 0;

  const windowYears = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / (365.25 * 86400_000);

  // Allocations
  const classMap = new Map<string, AllocationBucket>();
  const regionMap = new Map<string, AllocationBucket>();
  const ccyMap = new Map<string, AllocationBucket>();
  for (const p of prepared) {
    const ac = mapAssetClassToBucketKey(p.holding.assetClass);
    bumpBucket(classMap, ac.key, ac.label, p.weight, p.mvEUR);
    if (p.holding.region) {
      bumpBucket(regionMap, p.holding.region, p.holding.region, p.weight, p.mvEUR);
    } else {
      bumpBucket(regionMap, "Unbekannt", "Unbekannt", p.weight, p.mvEUR);
    }
    bumpBucket(ccyMap, p.holding.currency, p.holding.currency, p.weight, p.mvEUR);
  }

  // Top-10 by weight
  const topHoldings = [...prepared]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)
    .map((p) => ({
      name: p.holding.name,
      weight: p.weight,
      marketValueEUR: p.mvEUR,
      isin: p.holding.isin,
    }));

  // Stress tests — portfolio replay over historical sub-windows + analytical FX/sector shocks
  const stressTests: StressTestResult[] = [];

  // Replay 2008 (06/2008–03/2009 ≈ 200 trading days)
  pushReplay(stressTests, dates, indexPath, "crisis_2008", "Finanzkrise 2008/09 (06/2008–03/2009)", "2008-06-01", "2009-03-09");
  pushReplay(stressTests, dates, indexPath, "covid_2020", "Covid-19 Crash (02/2020–04/2020)", "2020-02-19", "2020-03-23");
  pushReplay(stressTests, dates, indexPath, "dotcom_2000", "Dotcom-Crash (03/2000–10/2002)", "2000-03-24", "2002-10-09");
  pushReplay(stressTests, dates, indexPath, "sector_tech_crash", "Tech-Crash 2022 (01/2022–10/2022)", "2022-01-03", "2022-10-12");

  // FX-Schock ±15% for non-EUR positions
  let fxLossPct = 0;
  for (const p of prepared) {
    if (p.holding.currency !== "EUR") fxLossPct += p.weight * -0.15;
  }
  stressTests.push({
    scenario: "fx_shock",
    scenarioLabel: "FX-Schock (Fremdwährungen −15 %)",
    lossPct: fxLossPct,
    lossEUR: fxLossPct * totalMVEUR,
    description: "Annahme: Alle Nicht-EUR-Positionen verlieren 15 % gg. EUR.",
  });

  // Rate-Shock ±200 bp on bonds with duration
  let rateLossPct = 0;
  for (const p of prepared) {
    const d = p.holding.duration;
    if (d && d > 0) {
      rateLossPct += p.weight * -d * 0.02;
    }
  }
  if (rateLossPct < 0) {
    stressTests.push({
      scenario: "rate_shock_up",
      scenarioLabel: "Zinsschock +200 bp (Anleihen)",
      lossPct: rateLossPct,
      lossEUR: rateLossPct * totalMVEUR,
      description: "Annahme: Anleihen mit Modified Duration verlieren ΔP/P ≈ −Duration × Δr.",
    });
  }

  // Concentration flags
  const concentrationFlags: ConcentrationFlag[] = [];
  for (const p of prepared) {
    if (p.weight >= 0.20) {
      concentrationFlags.push({
        type: "single_position",
        level: "critical",
        label: p.holding.name,
        weight: p.weight,
        threshold: 0.20,
        message: `Einzelposition ${(p.weight * 100).toFixed(1)} % > 20 % — kritisches Klumpenrisiko.`,
      });
    } else if (p.weight >= 0.10) {
      concentrationFlags.push({
        type: "single_position",
        level: "warn",
        label: p.holding.name,
        weight: p.weight,
        threshold: 0.10,
        message: `Einzelposition ${(p.weight * 100).toFixed(1)} % > 10 % — Warnung.`,
      });
    }
  }
  // sector concentration
  const sectorMap = new Map<string, number>();
  for (const p of prepared) {
    if (p.holding.sector) {
      sectorMap.set(p.holding.sector, (sectorMap.get(p.holding.sector) ?? 0) + p.weight);
    }
  }
  for (const [sec, w] of sectorMap) {
    if (w >= 0.35) {
      concentrationFlags.push({
        type: "sector",
        level: "warn",
        label: sec,
        weight: w,
        threshold: 0.35,
        message: `Sektor ${sec} ${(w * 100).toFixed(1)} % > 35 %.`,
      });
    }
  }
  // currency concentration foreign
  const fxNonEur = [...ccyMap.values()].filter((b) => b.key !== "EUR").reduce((s, b) => s + b.weight, 0);
  if (fxNonEur > 0.5) {
    concentrationFlags.push({
      type: "currency",
      level: "warn",
      label: "Fremdwährungen",
      weight: fxNonEur,
      threshold: 0.5,
      message: `Fremdwährungs-Anteil ${(fxNonEur * 100).toFixed(1)} % > 50 %.`,
    });
  }

  return {
    totalMarketValueEUR: totalMVEUR,
    totalCostBasisEUR: totalCostEUR > 0 ? totalCostEUR : undefined,
    unrealizedPnLEUR: totalCostEUR > 0 ? totalMVEUR - totalCostEUR : undefined,
    unrealizedPnLPct: totalCostEUR > 0 ? (totalMVEUR - totalCostEUR) / totalCostEUR : undefined,
    positionMetrics: posMetrics.sort((a, b) => b.weight - a.weight),
    classWeights: [...classMap.values()].sort((a, b) => b.weight - a.weight),
    regionWeights: [...regionMap.values()].sort((a, b) => b.weight - a.weight),
    currencyWeights: [...ccyMap.values()].sort((a, b) => b.weight - a.weight),
    topHoldings,
    portfolioMetrics: {
      windowFrom: dates[0],
      windowTo: dates[dates.length - 1],
      windowYears,
      annualizedReturn: annR,
      annualizedVol: annV,
      sharpe,
      sortino,
      maxDrawdown: maxDD,
      bestYear,
      worstYear,
      indexPath,
    },
    stressTests,
    concentrationFlags,
    warnings,
  };
}

function bumpBucket(map: Map<string, AllocationBucket>, key: string, label: string, weight: number, eur: number) {
  const cur = map.get(key);
  if (cur) {
    cur.weight += weight;
    cur.marketValueEUR += eur;
  } else {
    map.set(key, { key, label, weight, marketValueEUR: eur });
  }
}

function pushReplay(
  out: StressTestResult[],
  dates: string[],
  index: { date: string; value: number }[],
  scenario: StressTestResult["scenario"],
  label: string,
  fromIso: string,
  toIso: string,
) {
  // Find first index date >= fromIso and last <= toIso
  let i0 = -1;
  let i1 = -1;
  for (let i = 0; i < index.length; i++) {
    if (i0 === -1 && index[i].date >= fromIso) i0 = i;
    if (index[i].date <= toIso) i1 = i;
  }
  if (i0 === -1 || i1 === -1 || i1 - i0 < 5) return;
  const v0 = index[i0].value;
  // peak-to-trough within window
  let peak = v0;
  let trough = v0;
  for (let i = i0; i <= i1; i++) {
    if (index[i].value > peak) {
      peak = index[i].value;
      trough = peak;
    }
    if (index[i].value < trough) trough = index[i].value;
  }
  const lossPct = peak > 0 ? trough / peak - 1 : 0;
  const totalMV = 0; // caller will multiply
  out.push({
    scenario,
    scenarioLabel: label,
    lossPct,
    lossEUR: lossPct, // placeholder; will be multiplied below
    description: `Historischer Replay: maximaler Peak-to-Trough-Verlust im Fenster ${fromIso} – ${toIso} mit heutiger Allokation.`,
  });
}

function finalize(
  prepared: PreparedSeries[],
  warnings: string[],
  totalMVEUR: number,
  totalCostEUR: number,
): HoldingsBacktestResult {
  // Minimal result when no historical window available
  const classMap = new Map<string, AllocationBucket>();
  const regionMap = new Map<string, AllocationBucket>();
  const ccyMap = new Map<string, AllocationBucket>();
  for (const p of prepared) {
    bumpBucket(classMap, p.holding.assetClass, p.holding.assetClass, p.weight, p.mvEUR);
    bumpBucket(regionMap, p.holding.region ?? "Unbekannt", p.holding.region ?? "Unbekannt", p.weight, p.mvEUR);
    bumpBucket(ccyMap, p.holding.currency, p.holding.currency, p.weight, p.mvEUR);
  }
  return {
    totalMarketValueEUR: totalMVEUR,
    totalCostBasisEUR: totalCostEUR > 0 ? totalCostEUR : undefined,
    unrealizedPnLEUR: totalCostEUR > 0 ? totalMVEUR - totalCostEUR : undefined,
    unrealizedPnLPct: totalCostEUR > 0 ? (totalMVEUR - totalCostEUR) / totalCostEUR : undefined,
    positionMetrics: prepared.map((p) => ({
      holdingId: p.holding.id,
      isin: p.holding.isin,
      ticker: p.holding.ticker,
      name: p.holding.name,
      weight: p.weight,
      marketValueEUR: p.mvEUR,
    })),
    classWeights: [...classMap.values()].sort((a, b) => b.weight - a.weight),
    regionWeights: [...regionMap.values()].sort((a, b) => b.weight - a.weight),
    currencyWeights: [...ccyMap.values()].sort((a, b) => b.weight - a.weight),
    topHoldings: [...prepared]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
      .map((p) => ({ name: p.holding.name, weight: p.weight, marketValueEUR: p.mvEUR, isin: p.holding.isin })),
    portfolioMetrics: {
      windowFrom: "",
      windowTo: "",
      windowYears: 0,
      annualizedReturn: 0,
      annualizedVol: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdown: 0,
      bestYear: 0,
      worstYear: 0,
      indexPath: [],
    },
    stressTests: [],
    concentrationFlags: [],
    warnings,
  };
}

function emptyResult(warnings: string[]): HoldingsBacktestResult {
  return {
    totalMarketValueEUR: 0,
    positionMetrics: [],
    classWeights: [],
    regionWeights: [],
    currencyWeights: [],
    topHoldings: [],
    portfolioMetrics: {
      windowFrom: "",
      windowTo: "",
      windowYears: 0,
      annualizedReturn: 0,
      annualizedVol: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdown: 0,
      bestYear: 0,
      worstYear: 0,
      indexPath: [],
    },
    stressTests: [],
    concentrationFlags: [],
    warnings,
  };
}

/**
 * After running runHoldingsBacktest, multiply lossEUR for replay scenarios that were filled with lossPct only.
 */
export function finalizeStressTestEUR(result: HoldingsBacktestResult): void {
  for (const st of result.stressTests) {
    if (st.scenario === "fx_shock" || st.scenario === "rate_shock_up" || st.scenario === "rate_shock_down") continue;
    st.lossEUR = st.lossPct * result.totalMarketValueEUR;
  }
}