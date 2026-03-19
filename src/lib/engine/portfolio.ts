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