/**
 * Tests für den Portfolio-Optimizer.
 * Aufruf: `bun test src/lib/engine/optimizer.test.ts`
 */

import { describe, expect, test } from "bun:test";
import {
  enumerateAllocations,
  neighborhoodGrid,
  computeMaxDrawdownInPath,
  computeObjective,
  currentAllocationOf,
  buildPortfolioFromAllocation,
  optimizePortfolio,
} from "./optimizer";
import { defaultClient, defaultInputs, defaultPortfolio } from "../defaults";
import type { SimulationSettings } from "../types";

describe("enumerateAllocations", () => {
  test("10 % Grid, pe=[0]: Compositions sum auf 100", () => {
    const all = enumerateAllocations(10, [0], 0);
    for (const a of all) {
      expect(a.cash + a.bonds + a.equities + a.pe).toBe(100);
    }
    expect(all.length).toBe(66); // C(12,2) für (c,b,e) mit Schritten 10
  });

  test("respektiert minCashPct", () => {
    const all = enumerateAllocations(10, [0], 10);
    for (const a of all) expect(a.cash).toBeGreaterThanOrEqual(10);
  });

  test("pe-Steps werden alle abgedeckt", () => {
    const all = enumerateAllocations(10, [0, 10, 20], 0);
    const pes = new Set(all.map((a) => a.pe));
    expect([...pes].sort()).toEqual([0, 10, 20]);
  });

  test("keine Duplikate", () => {
    const all = enumerateAllocations(10, [0, 10, 20], 0);
    const keys = all.map((a) => `${a.cash}-${a.bonds}-${a.equities}-${a.pe}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("step das remaining nicht teilt → leeres Ergebnis für diese pe-Stufe", () => {
    const all = enumerateAllocations(10, [5], 0); // remaining=95, nicht durch 10 teilbar
    expect(all.length).toBe(0);
  });
});

describe("neighborhoodGrid", () => {
  test("liefert nur Allokationen in ±10 % Window um Center", () => {
    const center = { cash: 20, bonds: 30, equities: 50, pe: 0 };
    const grid = neighborhoodGrid([center], 5, 0, [0]);
    for (const a of grid) {
      expect(Math.abs(a.cash - center.cash)).toBeLessThanOrEqual(10);
      expect(Math.abs(a.bonds - center.bonds)).toBeLessThanOrEqual(10);
      expect(a.cash + a.bonds + a.equities + a.pe).toBe(100);
    }
  });

  test("dedupliziert über mehrere Centers", () => {
    const centers = [
      { cash: 20, bonds: 30, equities: 50, pe: 0 },
      { cash: 25, bonds: 30, equities: 45, pe: 0 }, // überlappt mit erstem
    ];
    const grid = neighborhoodGrid(centers, 5, 0, [0]);
    const keys = grid.map((a) => `${a.cash}-${a.bonds}-${a.equities}-${a.pe}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("computeMaxDrawdownInPath", () => {
  test("monoton steigender Pfad → DD = 0", () => {
    expect(computeMaxDrawdownInPath([100, 110, 120, 130])).toBe(0);
  });

  test("Crash 100 → 50 → 80 → 70 → DD = 0.5 (max von peak 100 zu trough 50)", () => {
    expect(computeMaxDrawdownInPath([100, 50, 80, 70])).toBeCloseTo(0.5, 6);
  });

  test("leerer Pfad → 0", () => {
    expect(computeMaxDrawdownInPath([])).toBe(0);
  });

  test("Peak 0 wird ohne Division-by-Zero behandelt", () => {
    expect(computeMaxDrawdownInPath([0, 0, 100, 50])).toBeCloseTo(0.5, 6);
  });
});

describe("computeObjective", () => {
  test("'success' = successRate/100", () => {
    expect(computeObjective("success", 87, 1_000_000, 0.3)).toBeCloseTo(0.87);
  });

  test("'success_dd' bestraft DD > 35 %", () => {
    const noPenalty = computeObjective("success_dd", 90, 1_000_000, 0.30);
    const penalty50 = computeObjective("success_dd", 90, 1_000_000, 0.50);
    expect(noPenalty).toBeCloseTo(0.9);
    expect(penalty50).toBeLessThan(noPenalty);
    // Bei 50 % DD: penalty = 1 - (50-35)/100 = 0.85, score = 0.9 × 0.85 = 0.765
    expect(penalty50).toBeCloseTo(0.765, 3);
  });

  test("'success_dd' bei extremem DD (>135 %) clamped auf 0", () => {
    expect(computeObjective("success_dd", 90, 1_000_000, 1.5)).toBe(0);
  });

  test("'success_wealth' belohnt höheres Endvermögen, aber log-skaliert", () => {
    const a = computeObjective("success_wealth", 80, 1_000_000, 0);
    const b = computeObjective("success_wealth", 80, 10_000_000, 0);
    // log10(1e6)=6, log10(1e7)=7; b/a = 7/6 ≈ 1.167
    expect(b / a).toBeCloseTo(7 / 6, 2);
  });
});

describe("currentAllocationOf", () => {
  test("Default-Portfolio ohne PE", () => {
    const a = currentAllocationOf(defaultPortfolio, 1_000_000);
    expect(a.pe).toBe(0);
    expect(a.cash + a.bonds + a.equities).toBeCloseTo(100, 0);
  });

  test("PE wird korrekt aus Commitments abgeleitet", () => {
    const p = {
      ...defaultPortfolio,
      peFunds: [{
        id: "x",
        name: "X",
        commitment: 200_000,
        callRatio: 80,
        irr: 10,
        tvpi: 1.7,
        investmentPeriod: 5,
        fundDuration: 14,
        startAge: 50,
      }],
    };
    expect(currentAllocationOf(p, 1_000_000).pe).toBe(20);
  });

  test("PE > 25 % wird auf 25 % geclamped (außerhalb Optimizer-Suchraum)", () => {
    const p = {
      ...defaultPortfolio,
      peFunds: [{
        id: "x",
        name: "X",
        commitment: 600_000,
        callRatio: 80,
        irr: 10,
        tvpi: 1.7,
        investmentPeriod: 5,
        fundDuration: 14,
        startAge: 50,
      }],
    };
    expect(currentAllocationOf(p, 1_000_000).pe).toBe(25);
  });

  test("initialCapital = 0 → pe = 0 (kein Division-by-Zero)", () => {
    const p = {
      ...defaultPortfolio,
      peFunds: [{
        id: "x", name: "X", commitment: 100_000, callRatio: 80, irr: 10,
        tvpi: 1.7, investmentPeriod: 5, fundDuration: 14, startAge: 50,
      }],
    };
    expect(currentAllocationOf(p, 0).pe).toBe(0);
  });
});

describe("buildPortfolioFromAllocation", () => {
  test("Allokationen werden gesetzt, alles andere bleibt unverändert", () => {
    const p = buildPortfolioFromAllocation(
      { cash: 20, bonds: 30, equities: 50, pe: 0 },
      defaultPortfolio,
      1_000_000,
      40,
    );
    expect(p.buckets[0].allocation).toBe(20);
    expect(p.buckets[1].allocation).toBe(30);
    expect(p.buckets[2].allocation).toBe(50);
    expect(p.kestRate).toBe(defaultPortfolio.kestRate);
    expect(p.correlationMatrix).toEqual(defaultPortfolio.correlationMatrix);
    expect(p.peFunds).toEqual([]);
  });

  test("pe > 0 erzeugt synthetischen PE-Fund mit korrektem Commitment", () => {
    const p = buildPortfolioFromAllocation(
      { cash: 10, bonds: 30, equities: 40, pe: 20 },
      defaultPortfolio,
      1_000_000,
      45,
    );
    expect(p.peFunds).toHaveLength(1);
    expect(p.peFunds![0].commitment).toBe(200_000);
    expect(p.peFunds![0].startAge).toBe(45);
    expect(p.peFunds![0].irr).toBe(10);
    expect(p.peFunds![0].tvpi).toBe(1.7);
  });
});

describe("optimizePortfolio — End-to-End (langsam)", () => {
  const settings: SimulationSettings = {
    numSimulations: 100, // wird intern auf pathsPerEval umgesetzt
    timeStepMonths: 12,
    mode: "fixed_withdrawal",
    randomSeed: 42,
  };

  test("liefert sortierte Liste mit ranked.length > 0", () => {
    const r = optimizePortfolio(
      defaultClient,
      defaultInputs,
      defaultPortfolio,
      settings,
      [],
      {
        pathsPerEval: 50, // klein für Test
        peStepsCoarse: [0, 10], // reduziert für Test-Speed
        refinementTopN: 2,
      },
    );
    expect(r.ranked.length).toBeGreaterThan(10);
    expect(r.evaluations).toBe(r.ranked.length);
    // Sortierung absteigend nach Score
    for (let i = 1; i < r.ranked.length; i++) {
      expect(r.ranked[i - 1].score).toBeGreaterThanOrEqual(r.ranked[i].score);
    }
  });

  test("Baseline ist im Ergebnis vorhanden und vergleichbar (gleiche Pfadzahl)", () => {
    const r = optimizePortfolio(
      defaultClient,
      defaultInputs,
      defaultPortfolio,
      settings,
      [],
      {
        pathsPerEval: 50,
        peStepsCoarse: [0],
        refinementTopN: 1,
      },
    );
    expect(r.baseline).toBeDefined();
    expect(Number.isFinite(r.baseline.successRate)).toBe(true);
    expect(r.baseline.successRate).toBeGreaterThanOrEqual(0);
    expect(r.baseline.successRate).toBeLessThanOrEqual(100);
  });

  test("Reproduzierbarkeit: gleicher Seed → identische Top-3", () => {
    const opts = {
      pathsPerEval: 50,
      peStepsCoarse: [0],
      refinementTopN: 1,
      randomSeed: 123,
    };
    const a = optimizePortfolio(defaultClient, defaultInputs, defaultPortfolio, settings, [], opts);
    const b = optimizePortfolio(defaultClient, defaultInputs, defaultPortfolio, settings, [], opts);
    for (let i = 0; i < 3; i++) {
      expect(a.ranked[i].cash).toBe(b.ranked[i].cash);
      expect(a.ranked[i].bonds).toBe(b.ranked[i].bonds);
      expect(a.ranked[i].equities).toBe(b.ranked[i].equities);
      expect(a.ranked[i].score).toBeCloseTo(b.ranked[i].score, 6);
    }
  });
});