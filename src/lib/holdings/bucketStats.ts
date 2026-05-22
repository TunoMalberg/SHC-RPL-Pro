/**
 * Aggregiert die Backtest-Position-Returns auf das 3-Topf-Schema
 * (Cash / Anleihen / Aktien) und liefert µ, σ und Korrelationsmatrix
 * für die Übernahme als Monte-Carlo-Szenario.
 *
 * Mapping HoldingAssetClass → Topf:
 *   • Geldmarkt / Cash                        → Cash
 *   • Anleihen Staat / Unternehmen / HY       → Bonds
 *   • Aktien * / Immobilien (REIT) /
 *     Rohstoffe / Alternatives / Mischfonds   → Equities (Wachstumsbucket)
 *   • Sonstiges                               → Equities (konservative Annahme)
 *
 * Für Mischfonds wäre eine 70/30-Aufteilung exakter — aktuell
 * pragmatisch: vollständig im Equity-Topf, Berater kann das im
 * Topf-Editor manuell anpassen.
 */

import type { Holding, HoldingAssetClass } from "./types";

const TRADING_DAYS = 252;

export type BucketName = "cash" | "bonds" | "equities";

export interface BucketStats {
  bucket: BucketName;
  weight: number; // 0..1 of total portfolio
  expectedReturn: number; // % p.a.
  volatility: number; // % p.a.
}

export interface BucketBacktestResult {
  buckets: BucketStats[];
  /** 3×3 corr matrix in order [cash, bonds, equities]. */
  correlationMatrix: number[][];
  /** Anzahl Tage in Schnittmenge (für QC). */
  daysOfHistory: number;
  /** Topf-Return-Series (für Plot/Debug, optional). */
  bucketReturnsByName?: Record<BucketName, number[]>;
}

const BUCKET_OF: Record<HoldingAssetClass, BucketName> = {
  "Geldmarkt / Cash": "cash",
  "Anleihen Staat": "bonds",
  "Anleihen Unternehmen": "bonds",
  "Anleihen High Yield": "bonds",
  "Aktien Welt": "equities",
  "Aktien USA": "equities",
  "Aktien Europa": "equities",
  "Aktien Schwellenländer": "equities",
  "Aktien Sektor": "equities",
  "Rohstoffe / Gold": "equities",
  "Immobilien (REIT)": "equities",
  "Alternatives / PE": "equities",
  "Mischfonds": "equities",
  "Sonstiges": "equities",
};

export interface BucketStatsInput {
  holdings: Holding[];
  /** Marktwert in EUR pro Holding-ID (für Gewichte). */
  mvEURById: Map<string, number>;
  /** Pro Holding-ID die täglichen EUR-Returns aus dem Backtest (gleicher Index!). */
  posReturnsById: Map<string, number[]>;
  /** Reihenfolge der Tage (= Länge posReturns + 1). Wird hier nicht gebraucht, hilft aber als QC. */
  dates: string[];
}

/**
 * Annualization & correlation aus den dailyposReturns.
 *
 * Annahme: alle Series in posReturnsById haben dieselbe Länge (Forward-Fill
 * im Backtest sorgt dafür). Falls eine Serie kürzer ist, wird sie mit 0
 * gepaddet und nicht in den Topf einbezogen.
 */
export function buildBucketStats(input: BucketStatsInput): BucketBacktestResult {
  const { holdings, mvEURById, posReturnsById } = input;

  const totalMV = holdings.reduce((s, h) => s + (mvEURById.get(h.id) ?? 0), 0);
  if (totalMV <= 0) {
    return emptyBuckets();
  }

  // 1) length = max consistent return-array length
  let len = 0;
  for (const arr of posReturnsById.values()) {
    if (arr.length > len) len = arr.length;
  }
  if (len < 30) {
    return emptyBuckets();
  }

  // 2) Aggregate daily returns into 3 buckets, weighted by mvEUR
  const cashRet = new Array<number>(len).fill(0);
  const bondsRet = new Array<number>(len).fill(0);
  const eqRet = new Array<number>(len).fill(0);
  let cashMV = 0;
  let bondsMV = 0;
  let eqMV = 0;

  for (const h of holdings) {
    const bucket = BUCKET_OF[h.assetClass] ?? "equities";
    const mv = mvEURById.get(h.id) ?? 0;
    if (mv <= 0) continue;
    if (bucket === "cash") cashMV += mv;
    else if (bucket === "bonds") bondsMV += mv;
    else eqMV += mv;
    const r = posReturnsById.get(h.id);
    if (!r || r.length !== len) continue;
    const target = bucket === "cash" ? cashRet : bucket === "bonds" ? bondsRet : eqRet;
    // Track running weighted sum: we'll renormalise after the loop
    for (let i = 0; i < len; i++) {
      target[i] += r[i] * mv;
    }
  }
  // Renormalise per-bucket weighted-avg returns
  if (cashMV > 0) for (let i = 0; i < len; i++) cashRet[i] /= cashMV;
  if (bondsMV > 0) for (let i = 0; i < len; i++) bondsRet[i] /= bondsMV;
  if (eqMV > 0) for (let i = 0; i < len; i++) eqRet[i] /= eqMV;

  const wCash = cashMV / totalMV;
  const wBonds = bondsMV / totalMV;
  const wEq = eqMV / totalMV;

  const stats = (rs: number[]) => {
    const m = rs.reduce((s, x) => s + x, 0) / Math.max(1, rs.length);
    let sq = 0;
    for (const r of rs) sq += (r - m) * (r - m);
    const sd = Math.sqrt(sq / Math.max(1, rs.length - 1));
    const annR = (1 + m) ** TRADING_DAYS - 1;
    const annV = sd * Math.sqrt(TRADING_DAYS);
    return { annR, annV };
  };

  const sC = cashMV > 0 ? stats(cashRet) : { annR: 0.015, annV: 0.002 };
  const sB = bondsMV > 0 ? stats(bondsRet) : { annR: 0.035, annV: 0.055 };
  const sE = eqMV > 0 ? stats(eqRet) : { annR: 0.07, annV: 0.18 };

  const corr = correlationMatrix3([cashRet, bondsRet, eqRet]);
  // If a bucket has no holdings, its row/col cannot be meaningfully estimated → fall back to defaults
  if (cashMV === 0) {
    corr[0] = [1, 0.0, -0.05];
    corr[1][0] = 0.0;
    corr[2][0] = -0.05;
  }
  if (bondsMV === 0) {
    corr[1] = [0.0, 1, 0.25];
    corr[0][1] = 0.0;
    corr[2][1] = 0.25;
  }
  if (eqMV === 0) {
    corr[2] = [-0.05, 0.25, 1];
    corr[0][2] = -0.05;
    corr[1][2] = 0.25;
  }

  return {
    buckets: [
      {
        bucket: "cash",
        weight: wCash,
        expectedReturn: round2(sC.annR * 100),
        volatility: round2(sC.annV * 100),
      },
      {
        bucket: "bonds",
        weight: wBonds,
        expectedReturn: round2(sB.annR * 100),
        volatility: round2(sB.annV * 100),
      },
      {
        bucket: "equities",
        weight: wEq,
        expectedReturn: round2(sE.annR * 100),
        volatility: round2(sE.annV * 100),
      },
    ],
    correlationMatrix: corr,
    daysOfHistory: len,
    bucketReturnsByName: { cash: cashRet, bonds: bondsRet, equities: eqRet },
  };
}

function correlationMatrix3(series: number[][]): number[][] {
  const n = series.length;
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) m[i][i] = 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = pearson(series[i], series[j]);
      m[i][j] = round3(c);
      m[j][i] = round3(c);
    }
  }
  return m;
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}

function emptyBuckets(): BucketBacktestResult {
  return {
    buckets: [
      { bucket: "cash", weight: 0, expectedReturn: 1.5, volatility: 0.2 },
      { bucket: "bonds", weight: 0, expectedReturn: 3.5, volatility: 5.5 },
      { bucket: "equities", weight: 0, expectedReturn: 7.0, volatility: 18.0 },
    ],
    correlationMatrix: [
      [1.0, 0.0, -0.05],
      [0.0, 1.0, 0.25],
      [-0.05, 0.25, 1.0],
    ],
    daysOfHistory: 0,
  };
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}
function round3(x: number) {
  return Math.round(x * 1000) / 1000;
}