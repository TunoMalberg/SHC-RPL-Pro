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
    let u2: number;
    do {
      u1 = this.next();
    } while (u1 === 0);
    u2 = this.next();
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
    correlated.push(means[i] + vols[i] * val);
  }
  return correlated;
}