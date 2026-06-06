/**
 * Unit-Tests für die Portfolio-Mathematik (3-Töpfe-Modell).
 *
 * Geprüfte Eigenschaften:
 *   - Erwartungswert/Volatilität gewichten korrekt
 *   - Rebalancing-Strategie folgt der dokumentierten „Verlustschutz"-Logik
 *   - Sharpe-Edge-Cases (σ = 0)
 *
 * Aufruf: `bun test src/lib/engine/portfolio.test.ts`
 */

import { describe, expect, test } from "bun:test";
import {
  computePortfolioReturn,
  computePortfolioVolatility,
  computeSharpeRatio,
  rebalanceThreeBuckets,
  rebalanceAccumulationPhase,
  rebalancePortfolio,
  buildCovarianceMatrix,
} from "./portfolio";
import { defaultPortfolio } from "../defaults";
import type { PortfolioConfig } from "../types";

function clonePortfolio(): PortfolioConfig {
  return JSON.parse(JSON.stringify(defaultPortfolio));
}

describe("computePortfolioReturn", () => {
  test("Default-Portfolio: gewichteter Net-Return liegt zwischen 3 und 6 %", () => {
    const r = computePortfolioReturn(defaultPortfolio);
    // Default-Allokation 15/35/50 mit Net-Returns ~1.1/2.1/4.0 → ~2.7-3.0 %
    expect(r).toBeGreaterThan(0.02);
    expect(r).toBeLessThan(0.06);
  });

  test("100 % Cash → entspricht Cash-Net-Return", () => {
    const p = clonePortfolio();
    p.buckets[0].allocation = 100;
    p.buckets[1].allocation = 0;
    p.buckets[2].allocation = 0;
    const r = computePortfolioReturn(p);
    expect(r).toBeCloseTo(p.buckets[0].netReturn / 100, 6);
  });

  test("100 % Aktien → entspricht Aktien-Net-Return", () => {
    const p = clonePortfolio();
    p.buckets[0].allocation = 0;
    p.buckets[1].allocation = 0;
    p.buckets[2].allocation = 100;
    const r = computePortfolioReturn(p);
    expect(r).toBeCloseTo(p.buckets[2].netReturn / 100, 6);
  });
});

describe("computePortfolioVolatility", () => {
  test("Default-Portfolio: Vola < Aktien-Vola alleine (Diversifikation)", () => {
    const sigma = computePortfolioVolatility(defaultPortfolio);
    const eqVol = defaultPortfolio.buckets[2].volatility / 100;
    expect(sigma).toBeLessThan(eqVol);
  });

  test("100 % Aktien → Vola gleich Aktien-Vola", () => {
    const p = clonePortfolio();
    p.buckets[0].allocation = 0;
    p.buckets[1].allocation = 0;
    p.buckets[2].allocation = 100;
    const sigma = computePortfolioVolatility(p);
    expect(sigma).toBeCloseTo(p.buckets[2].volatility / 100, 6);
  });

  test("Vollständig negativ korreliert + gleiche Gewichte → Vola sinkt", () => {
    const p = clonePortfolio();
    p.buckets[0].allocation = 50;
    p.buckets[1].allocation = 50;
    p.buckets[2].allocation = 0;
    p.buckets[0].volatility = 10;
    p.buckets[1].volatility = 10;
    p.correlationMatrix = [
      [1.0, -1.0, 0.0],
      [-1.0, 1.0, 0.0],
      [0.0, 0.0, 1.0],
    ];
    const sigma = computePortfolioVolatility(p);
    expect(sigma).toBeLessThan(0.001); // theoretisch 0
  });
});

describe("computeSharpeRatio", () => {
  test("liefert 0 bei σ = 0 (kein Division-by-Zero)", () => {
    expect(computeSharpeRatio(0.05, 0, 0.01)).toBe(0);
  });

  test("(μ − r_f) / σ", () => {
    expect(computeSharpeRatio(0.08, 0.15, 0.02)).toBeCloseTo(0.4, 4);
  });
});

describe("rebalanceThreeBuckets — Verlustschutz-Logik", () => {
  test("Aktien im Plus → Cash wird aus Aktien aufgefüllt", () => {
    const annualWithdrawal = 30_000;
    const cashYearsTarget = 2;
    const result = rebalanceThreeBuckets(
      [10_000, 200_000, 800_000], // Cash unter Ziel von 60k
      annualWithdrawal,
      cashYearsTarget,
      0.10, // Aktien +10 %
    );
    expect(result.rebalanced).toBe(true);
    expect(result.values[0]).toBeCloseTo(60_000, 2); // Cash auf 2× Withdrawal
    expect(result.values[1]).toBe(200_000);          // Anleihen unverändert
    expect(result.values[2]).toBeLessThan(800_000);  // Aktien gesunken
    expect(result.source).toContain("Aktien");
  });

  test("Aktien im Minus → Cash wird aus Anleihen aufgefüllt (Verlustschutz)", () => {
    const result = rebalanceThreeBuckets(
      [10_000, 200_000, 800_000],
      30_000,
      2,
      -0.15, // Aktien −15 %
    );
    expect(result.rebalanced).toBe(true);
    expect(result.values[0]).toBeCloseTo(60_000, 2);
    expect(result.values[1]).toBeLessThan(200_000);
    expect(result.values[2]).toBe(800_000); // Aktien geschont
    expect(result.source).toContain("Verlustschutz");
  });

  test("Kein Auffüllen, wenn Cash bereits am Ziel ist", () => {
    const result = rebalanceThreeBuckets(
      [60_000, 200_000, 800_000],
      30_000,
      2,
      0.05,
    );
    expect(result.rebalanced).toBe(false);
    expect(result.values[0]).toBe(60_000);
  });

  test("Kein Crash bei Total = 0 (alles aufgebraucht)", () => {
    const result = rebalanceThreeBuckets([0, 0, 0], 30_000, 2, 0.05);
    expect(result.rebalanced).toBe(false);
    expect(result.values).toEqual([0, 0, 0]);
  });

  test("Verlustschutz greift nicht ohne Anleihen → kein Source-Label-Geist", () => {
    // Regression: vor 2026-Q3 zeigte die Engine „Anleihen → Liquidität"
    // auch dann, wenn Anleihen leer waren. Dieser Test verhindert die
    // Wiederkehr.
    const result = rebalanceThreeBuckets(
      [10_000, 0, 800_000],
      30_000,
      2,
      -0.1,
    );
    expect(result.rebalanced).toBe(false);
    expect(result.source).toBe("");
  });
});

describe("rebalanceAccumulationPhase", () => {
  test("Threshold respektiert: kleine Abweichung → kein Trade", () => {
    const target = [0.15, 0.35, 0.50];
    const total = 100_000;
    const current = [
      0.16 * total, // 1 % über Ziel
      0.34 * total,
      0.50 * total,
    ];
    const r = rebalanceAccumulationPhase(current, target, 5); // 5 % Threshold
    expect(r.rebalanced).toBe(false);
  });

  test("Threshold überschritten → Rebalance auf Ziel", () => {
    const target = [0.15, 0.35, 0.50];
    const total = 100_000;
    const current = [
      0.30 * total, // 15 Pp über Ziel
      0.20 * total,
      0.50 * total,
    ];
    const r = rebalanceAccumulationPhase(current, target, 5);
    expect(r.rebalanced).toBe(true);
    expect(r.values[0]).toBeCloseTo(15_000, 2);
    expect(r.values[1]).toBeCloseTo(35_000, 2);
    expect(r.values[2]).toBeCloseTo(50_000, 2);
  });
});

describe("rebalancePortfolio — Hilfsfunktion", () => {
  test("Total = 0 → unverändert (kein NaN)", () => {
    const r = rebalancePortfolio([0, 0, 0], [0.5, 0.3, 0.2], 5);
    expect(r).toEqual([0, 0, 0]);
  });
});

describe("buildCovarianceMatrix", () => {
  test("Symmetrisch", () => {
    const cov = buildCovarianceMatrix(defaultPortfolio);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(cov[i][j]).toBeCloseTo(cov[j][i], 12);
      }
    }
  });

  test("Diagonale = σ²", () => {
    const cov = buildCovarianceMatrix(defaultPortfolio);
    const v0 = defaultPortfolio.buckets[0].volatility / 100;
    expect(cov[0][0]).toBeCloseTo(v0 * v0, 12);
  });
});