import type { PortfolioConfig } from "../types";

export function computePortfolioReturn(config: PortfolioConfig): number {
  let totalReturn = 0;
  for (const bucket of config.buckets) {
    totalReturn += (bucket.allocation / 100) * (bucket.netReturn / 100);
  }
  return totalReturn;
}

export function computePortfolioVolatility(config: PortfolioConfig): number {
  const weights = config.buckets.map((b) => b.allocation / 100);
  const vols = config.buckets.map((b) => b.volatility / 100);
  const corr = config.correlationMatrix;

  let variance = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      variance += weights[i] * weights[j] * vols[i] * vols[j] * corr[i][j];
    }
  }
  return Math.sqrt(Math.max(0, variance));
}

export function computeSharpeRatio(
  portfolioReturn: number,
  portfolioVol: number,
  riskFreeRate: number
): number {
  if (portfolioVol === 0) return 0;
  return (portfolioReturn - riskFreeRate) / portfolioVol;
}

export function rebalancePortfolio(
  currentValues: number[],
  targetWeights: number[],
  threshold: number
): number[] {
  const total = currentValues.reduce((a, b) => a + b, 0);
  if (total <= 0) return currentValues;

  const currentWeights = currentValues.map((v) => v / total);
  const needsRebalance = currentWeights.some(
    (w, i) => Math.abs(w - targetWeights[i]) > threshold / 100
  );

  if (!needsRebalance) return currentValues;

  return targetWeights.map((w) => w * total);
}

/**
 * Wissenschaftlich fundierte 3-Töpfe-Rebalancing-Strategie (Entnahmephase)
 *
 * Regeln:
 * 1. Entnahmen kommen ausschließlich aus Topf 1 (Cash/Liquidität)
 * 2. Topf 1 soll stets cashYearsTarget × jährliche Entnahme enthalten
 * 3. Auffüll-Logik (Kernprinzip: keine Verluste realisieren):
 *    a) Wenn Aktien Gewinne haben (returnEquities > 0):
 *       → Cash wird aus Aktien aufgefüllt
 *    b) Wenn Aktien Verluste haben (returnEquities <= 0):
 *       → Cash wird aus Anleihen aufgefüllt (Verlustschutz)
 *    c) Wenn auch Anleihen nicht ausreichen:
 *       → verbleibende Differenz bleibt als Unterdeckung
 * 4. In der Ansparphase: kein separater Cash-Topf, klassisches Rebalancing
 *
 * Returns: [newCash, newBonds, newEquities] und Beschreibung der Aktion
 */
export interface BucketRebalanceResult {
  values: number[];
  rebalanced: boolean;
  source: string;
  cashDelta: number;
  bondsDelta: number;
  equitiesDelta: number;
}

export function rebalanceThreeBuckets(
  currentValues: number[],
  annualWithdrawal: number,
  cashYearsTarget: number,
  equityReturn: number,
): BucketRebalanceResult {
  const [cash, bonds, equities] = currentValues;
  const total = cash + bonds + equities;

  if (total <= 0) {
    return {
      values: currentValues,
      rebalanced: false,
      source: "",
      cashDelta: 0,
      bondsDelta: 0,
      equitiesDelta: 0,
    };
  }

  const targetCash = annualWithdrawal * cashYearsTarget;
  const deficit = targetCash - cash;

  if (deficit <= 0) {
    return {
      values: currentValues,
      rebalanced: false,
      source: "",
      cashDelta: 0,
      bondsDelta: 0,
      equitiesDelta: 0,
    };
  }

  let newCash = cash;
  let newBonds = bonds;
  let newEquities = equities;
  let source = "";

  if (equityReturn > 0) {
    const transferFromEquities = Math.min(deficit, equities);
    newEquities -= transferFromEquities;
    newCash += transferFromEquities;
    const remaining = deficit - transferFromEquities;

    if (remaining > 0 && newBonds > 0) {
      const transferFromBonds = Math.min(remaining, newBonds);
      newBonds -= transferFromBonds;
      newCash += transferFromBonds;
      source = "Aktien + Anleihen → Liquidität";
    } else {
      source = "Aktien → Liquidität";
    }
  } else {
    const transferFromBonds = Math.min(deficit, bonds);
    newBonds -= transferFromBonds;
    newCash += transferFromBonds;
    const remaining = deficit - transferFromBonds;

    if (remaining > 0 && newEquities > 0) {
      source = "Anleihen → Liquidität (Verlustschutz, Anleihen reichen nicht)";
    } else {
      source = "Anleihen → Liquidität (Verlustschutz)";
    }
  }

  return {
    values: [newCash, newBonds, newEquities],
    rebalanced: true,
    source,
    cashDelta: newCash - cash,
    bondsDelta: newBonds - bonds,
    equitiesDelta: newEquities - equities,
  };
}

/**
 * Accumulation-phase rebalancing: standard target-weight rebalancing
 * (no separate cash bucket during accumulation)
 */
export function rebalanceAccumulationPhase(
  currentValues: number[],
  targetWeights: number[],
  threshold: number,
): BucketRebalanceResult {
  const result = rebalancePortfolio(currentValues, targetWeights, threshold);
  const changed = result[0] !== currentValues[0] || result[1] !== currentValues[1] || result[2] !== currentValues[2];

  return {
    values: result,
    rebalanced: changed,
    source: changed ? "Zielallokation" : "",
    cashDelta: result[0] - currentValues[0],
    bondsDelta: result[1] - currentValues[1],
    equitiesDelta: result[2] - currentValues[2],
  };
}

export function buildCovarianceMatrix(config: PortfolioConfig): number[][] {
  const vols = config.buckets.map((b) => b.volatility / 100);
  const corr = config.correlationMatrix;
  const n = 3;
  const cov: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cov[i][j] = vols[i] * vols[j] * corr[i][j];
    }
  }
  return cov;
}