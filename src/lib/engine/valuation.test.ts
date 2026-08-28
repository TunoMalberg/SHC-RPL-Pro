/**
 * Tests der Bewertungsebene (CR 6/13).
 *
 * Verbindliche Formel: realReturn = ((1+nominal)/(1+inflation)) − 1;
 * periodische variable Sätze werden über periodengleiche Faktoren
 * verkettet.
 */
import { describe, expect, test } from "bun:test";
import {
  buildDeflators,
  chainDeflators,
  deflateSeries,
  deflateFromYear,
  inflateToYear,
  realReturn,
} from "./valuation";

describe("realReturn (Fisher, CR 13)", () => {
  test("exakte Formel ((1+n)/(1+i))−1", () => {
    // 5 % nominal, 2 % Inflation → (1.05/1.02)−1 = 2.9411…%
    expect(realReturn(5, 2)).toBeCloseTo(((1.05 / 1.02) - 1) * 100, 10);
  });

  test("Inflation 0 → real = nominal", () => {
    expect(realReturn(4.2, 0)).toBeCloseTo(4.2, 10);
  });

  test("negative Inflation (Deflation) → real > nominal", () => {
    // 0 % nominal + Deflation −1 % → real positiver Liquiditätsertrag.
    expect(realReturn(0, -1)).toBeCloseTo(((1 / 0.99) - 1) * 100, 10);
    expect(realReturn(0, -1)).toBeGreaterThan(0);
  });

  test("nicht die naive Differenz n − i", () => {
    expect(realReturn(7, 2.5)).not.toBeCloseTo(4.5, 4);
  });
});

describe("buildDeflators", () => {
  test("Index 0 = 1.0, Ende = (1+i)^(−Jahre), step-aligned", () => {
    const d = buildDeflators(2.5, 40, 1);
    expect(d.length).toBe(41);
    expect(d[0]).toBe(1);
    expect(d[40]).toBeCloseTo(Math.pow(1.025, -40), 12);
  });

  test("monatliche Schritte konsistent mit jährlichen", () => {
    const annual = buildDeflators(2.5, 10, 1);
    const monthly = buildDeflators(2.5, 120, 12);
    // Jahr 10 = Step 120 monatlich = Step 10 jährlich.
    expect(monthly[120]).toBeCloseTo(annual[10], 10);
  });

  test("Inflation 0 → alle Deflatoren 1", () => {
    const d = buildDeflators(0, 5, 1);
    for (const v of d) expect(v).toBe(1);
  });
});

describe("chainDeflators (variable Raten, CR 13)", () => {
  test("Verkettung periodengleicher Faktoren", () => {
    const d = chainDeflators([2, 3, -1]);
    expect(d[0]).toBe(1);
    expect(d[1]).toBeCloseTo(1 / 1.02, 12);
    expect(d[2]).toBeCloseTo(1 / (1.02 * 1.03), 12);
    expect(d[3]).toBeCloseTo(1 / (1.02 * 1.03 * 0.99), 12);
  });

  test("konstante Rate == buildDeflators (jährlich)", () => {
    const chained = chainDeflators([2.5, 2.5, 2.5, 2.5]);
    const built = buildDeflators(2.5, 4, 1);
    for (let s = 0; s <= 4; s++) expect(chained[s]).toBeCloseTo(built[s], 12);
  });
});

describe("deflateSeries / inflateToYear / deflateFromYear", () => {
  test("Roundtrip: deflationieren und zurück", () => {
    const nominal = [100000, 110000, 121000];
    const d = buildDeflators(3, 2, 1);
    const real = deflateSeries(nominal, d);
    for (let s = 0; s < nominal.length; s++) {
      expect(real[s] / d[s]).toBeCloseTo(nominal[s], 8);
    }
  });

  test("inflateToYear ↔ deflateFromYear invers", () => {
    const nominal = inflateToYear(3000, 2.5, 20);
    expect(nominal).toBeCloseTo(3000 * Math.pow(1.025, 20), 8);
    expect(deflateFromYear(nominal, 2.5, 20)).toBeCloseTo(3000, 8);
  });
});
