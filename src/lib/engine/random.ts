export class SeededRandom {
  private state: number;

  constructor(seed?: number) {
    this.state = seed ?? Date.now();
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0xffffffff;
  }

  nextGaussian(): number {
    let u1: number;
    do {
      u1 = this.next();
    } while (u1 === 0);
    const u2 = this.next();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  nextCorrelatedGaussian(choleskyRow: number[]): number {
    const z: number[] = [];
    for (let i = 0; i < choleskyRow.length; i++) {
      z.push(this.nextGaussian());
    }
    let result = 0;
    for (let i = 0; i < choleskyRow.length; i++) {
      result += choleskyRow[i] * z[i];
    }
    return result;
  }
}

export function choleskyDecomposition(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        const val = matrix[i][i] - sum;
        L[i][j] = Math.sqrt(Math.max(0, val));
      } else {
        L[i][j] = L[j][j] === 0 ? 0 : (matrix[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Generate correlated returns using Geometric Brownian Motion (GBM).
 *
 * Uses the log-normal model with Itô correction (variance drag):
 *   r = exp((μ − σ²/2) + σ·Z) − 1
 *
 * This ensures the *geometric* mean of simulated returns equals the
 * intended expected return, and guarantees returns > −100 % (positive
 * portfolio values).
 *
 * @param means  – per-step arithmetic mean returns  (e.g. annual / stepsPerYear)
 * @param vols   – per-step volatilities              (e.g. annual / √stepsPerYear)
 */
export function generateCorrelatedReturns(
  rng: SeededRandom,
  cholesky: number[][],
  means: number[],
  vols: number[]
): number[] {
  const n = means.length;
  const z: number[] = [];
  for (let i = 0; i < n; i++) {
    z.push(rng.nextGaussian());
  }

  const correlated: number[] = [];
  for (let i = 0; i < n; i++) {
    let val = 0;
    for (let j = 0; j <= i; j++) {
      val += cholesky[i][j] * z[j];
    }
    // GBM with Itô correction: exp((μ − σ²/2) + σ·Z) − 1
    const drift = means[i] - 0.5 * vols[i] * vols[i];
    correlated.push(Math.exp(drift + vols[i] * val) - 1);
  }
  return correlated;
}