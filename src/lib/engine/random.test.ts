/**
 * Unit-Tests für den Zufallsgenerator und die Cholesky-Zerlegung.
 *
 * Diese Bausteine sind das mathematische Fundament der gesamten Monte-Carlo-
 * Simulation. Wenn sich hier ein Bug einschleicht, sind alle Wahrscheinlich-
 * keits- und Korrelationsaussagen der App falsch — daher hoher Test-Fokus.
 *
 * Aufruf:  `bun test src/lib/engine/random.test.ts`
 */

import { describe, expect, test } from "bun:test";
import { SeededRandom, choleskyDecomposition, generateCorrelatedReturns } from "./random";

describe("SeededRandom — Reproduzierbarkeit", () => {
  test("zwei Instanzen mit gleichem Seed liefern identische Sequenzen", () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  test("verschiedene Seeds liefern unterschiedliche Sequenzen", () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    let identical = true;
    for (let i = 0; i < 100; i++) {
      if (a.next() !== b.next()) {
        identical = false;
        break;
      }
    }
    expect(identical).toBe(false);
  });

  test("next() liefert Werte im Intervall [0, 1)", () => {
    const rng = new SeededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("SeededRandom — Gauß-Verteilung", () => {
  test("nextGaussian() hat Mittelwert ~0 und Varianz ~1", () => {
    const rng = new SeededRandom(123);
    const N = 50_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      const z = rng.nextGaussian();
      sum += z;
      sumSq += z * z;
    }
    const mean = sum / N;
    const variance = sumSq / N - mean * mean;
    // Toleranz: ±0.05 für Mittelwert, ±0.05 für Varianz bei 50k Samples
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(variance - 1)).toBeLessThan(0.05);
  });
});

describe("Cholesky-Zerlegung", () => {
  test("Identität: L · Lᵀ = Identität für 3×3-Identitätsmatrix", () => {
    const I = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const L = choleskyDecomposition(I);
    expect(L[0][0]).toBe(1);
    expect(L[1][1]).toBe(1);
    expect(L[2][2]).toBe(1);
    // Off-diagonal elements are zero
    expect(L[1][0]).toBe(0);
    expect(L[2][0]).toBe(0);
    expect(L[2][1]).toBe(0);
  });

  test("rekonstruiert die Default-Korrelationsmatrix der App auf 1e-9 genau", () => {
    // Die echte Default-Matrix aus defaults.ts
    const corr = [
      [1.0, 0.2, -0.05],
      [0.2, 1.0, 0.25],
      [-0.05, 0.25, 1.0],
    ];
    const L = choleskyDecomposition(corr);

    // L · Lᵀ muss die Originalmatrix wiedergeben
    const reconstructed: number[][] = Array.from({ length: 3 }, () => Array(3).fill(0));
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) {
          sum += L[i][k] * L[j][k];
        }
        reconstructed[i][j] = sum;
      }
    }

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(Math.abs(reconstructed[i][j] - corr[i][j])).toBeLessThan(1e-9);
      }
    }
  });

  test("L ist eine untere Dreiecksmatrix", () => {
    const corr = [
      [1.0, 0.5, 0.3],
      [0.5, 1.0, 0.4],
      [0.3, 0.4, 1.0],
    ];
    const L = choleskyDecomposition(corr);
    // alle Werte oberhalb der Diagonalen sind 0
    expect(L[0][1]).toBe(0);
    expect(L[0][2]).toBe(0);
    expect(L[1][2]).toBe(0);
    // Diagonale ist positiv
    expect(L[0][0]).toBeGreaterThan(0);
    expect(L[1][1]).toBeGreaterThan(0);
    expect(L[2][2]).toBeGreaterThan(0);
  });
});

describe("generateCorrelatedReturns — GBM mit Itô-Korrektur", () => {
  test("Returns sind > -100 % (positives Vermögen garantiert)", () => {
    const rng = new SeededRandom(99);
    const corr = [
      [1.0, 0.0, 0.0],
      [0.0, 1.0, 0.0],
      [0.0, 0.0, 1.0],
    ];
    const L = choleskyDecomposition(corr);
    const means = [0.005, 0.01, 0.07];
    const vols = [0.002, 0.055, 0.18];

    for (let i = 0; i < 10_000; i++) {
      const returns = generateCorrelatedReturns(rng, L, means, vols);
      for (const r of returns) {
        expect(r).toBeGreaterThan(-1.0);
      }
    }
  });

  test("Geometrischer Mittelwert ≈ μ (nach Itô-Korrektur)", () => {
    const rng = new SeededRandom(2026);
    const corr = [[1.0]];
    const L = choleskyDecomposition(corr);
    const targetMean = 0.07; // 7 % p.a.
    const vol = 0.18;
    const N = 100_000;

    let logSum = 0;
    for (let i = 0; i < N; i++) {
      const [r] = generateCorrelatedReturns(rng, L, [targetMean], [vol]);
      logSum += Math.log(1 + r);
    }
    const geomMean = Math.exp(logSum / N) - 1;
    // Bei GBM mit Itô-Korrektur: geometrischer Mittelwert ≈ μ − σ²/2 ≈ 0.05
    // Wir prüfen deshalb auf den theoretischen Wert (μ − σ²/2):
    const expectedGeom = targetMean - 0.5 * vol * vol;
    expect(Math.abs(geomMean - expectedGeom)).toBeLessThan(0.005);
  });
});