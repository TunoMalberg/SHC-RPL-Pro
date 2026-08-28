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
  wilsonScoreInterval,
} from "./optimizer";
import { defaultClient, defaultInputs, defaultPortfolio } from "../defaults";

// CR 4: defaultInputs startet ohne Wunschbetrag (null) — Optimizer-Tests
// brauchen einen expliziten Entnahmewunsch, damit Erfolgsquoten differenzieren.
const optInputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3000 };
import type { SimulationSettings } from "../types";

describe("enumerateAllocations", () => {
  test("10 % Grid, pe=[0]: cash+bonds+equities=100 (PE getrennt)", () => {
    const all = enumerateAllocations(10, [0], 0);
    for (const a of all) {
      expect(a.cash + a.bonds + a.equities).toBe(100);
      expect(a.pe).toBe(0);
    }
    expect(all.length).toBe(66); // C(12,2) für (c,b,e) mit Schritten 10
  });

  test("respektiert minCashPct", () => {
    const all = enumerateAllocations(10, [0], 10);
    for (const a of all) expect(a.cash).toBeGreaterThanOrEqual(10);
  });

  test("pe-Steps werden alle abgedeckt — Buckets bleiben unabhängig auf 100", () => {
    const all = enumerateAllocations(10, [0, 10, 20], 0);
    const pes = new Set(all.map((a) => a.pe));
    expect([...pes].sort()).toEqual([0, 10, 20]);
    // Pro pe-Stufe: identische 66 (c,b,e)-Kombinationen, weil PE separat.
    for (const pe of [0, 10, 20]) {
      const subset = all.filter((a) => a.pe === pe);
      expect(subset.length).toBe(66);
      for (const a of subset) expect(a.cash + a.bonds + a.equities).toBe(100);
    }
  });

  test("keine Duplikate", () => {
    const all = enumerateAllocations(10, [0, 10, 20], 0);
    const keys = all.map((a) => `${a.cash}-${a.bonds}-${a.equities}-${a.pe}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("Step der 100 nicht teilt → leeres Ergebnis", () => {
    const all = enumerateAllocations(7, [0], 0); // 100 nicht durch 7 teilbar
    expect(all.length).toBe(0);
  });

  test("PE-Achse ist orthogonal zur Bucket-Achse (gleiche Buckets bei jedem pe)", () => {
    const all = enumerateAllocations(10, [0, 20], 5);
    const pe0Buckets = all
      .filter((a) => a.pe === 0)
      .map((a) => `${a.cash}-${a.bonds}-${a.equities}`)
      .sort();
    const pe20Buckets = all
      .filter((a) => a.pe === 20)
      .map((a) => `${a.cash}-${a.bonds}-${a.equities}`)
      .sort();
    expect(pe0Buckets).toEqual(pe20Buckets);
  });
});

describe("neighborhoodGrid", () => {
  test("liefert nur Allokationen in ±10 % Window um Center; Buckets summieren auf 100", () => {
    const center = { cash: 20, bonds: 30, equities: 50, pe: 0 };
    const grid = neighborhoodGrid([center], 5, 0, [0]);
    for (const a of grid) {
      expect(Math.abs(a.cash - center.cash)).toBeLessThanOrEqual(10);
      expect(Math.abs(a.bonds - center.bonds)).toBeLessThanOrEqual(10);
      expect(a.cash + a.bonds + a.equities).toBe(100);
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

  test("PE-Achse: ±10 % vom Center ist erlaubt", () => {
    const center = { cash: 20, bonds: 30, equities: 50, pe: 10 };
    const grid = neighborhoodGrid([center], 5, 0, [0, 5, 10, 15, 20, 25]);
    const pes = new Set(grid.map((a) => a.pe));
    expect([...pes].sort((a, b) => a - b)).toEqual([0, 5, 10, 15, 20]);
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

  test("'success_wealth' = p × (W_median / W_initial), wenn initialCapital > 0", () => {
    // Erfolg 80 %, Median 1.5 M, Startkapital 1 M → Score = 0.8 × 1.5 = 1.2
    const score = computeObjective("success_wealth", 80, 1_500_000, 0, 1_000_000);
    expect(score).toBeCloseTo(1.2, 6);
  });

  test("'success_wealth' bei doppeltem Endvermögen → doppelter Score (linear)", () => {
    const a = computeObjective("success_wealth", 80, 1_000_000, 0, 1_000_000);
    const b = computeObjective("success_wealth", 80, 2_000_000, 0, 1_000_000);
    expect(b / a).toBeCloseTo(2.0, 6);
  });

  test("'success_wealth' Fallback (kein Startkapital) → log-Skala", () => {
    const a = computeObjective("success_wealth", 80, 1_000_000, 0, 0);
    expect(a).toBeCloseTo(0.8 * 6, 6); // log10(1e6) = 6
  });

  test("'success_wealth' Mean-Fallback bei Median = 0 (marginale Pläne)", () => {
    // Marginaler Plan: Erfolg 35 %, Median = 0 €, Mean = 700.000 €,
    // Startkapital 1 M €. Ohne Mean-Fallback wäre Score = 0 (alle Pläne
    // gleich); mit Fallback: Score = 0.35 × 0.7 = 0.245.
    const score = computeObjective("success_wealth", 35, 0, 0, 1_000_000, 700_000);
    expect(score).toBeCloseTo(0.35 * 0.7, 6);
  });

  test("'success_wealth' Mean-Fallback differenziert PE-Verbesserung bei p<50 %", () => {
    // Beispiel aus Audit: gleiche c/b/e, PE 0 % vs PE 25 %.
    // Beide haben Median = 0, aber Mean unterscheidet sich.
    const pe0 = computeObjective("success_wealth", 37.56, 0, 0.407, 1_000_000, 710_000);
    const pe25 = computeObjective("success_wealth", 40.98, 0, 0.407, 1_000_000, 760_000);
    expect(pe25).toBeGreaterThan(pe0);
    // Improvement: kombinierter Effekt aus +3.42 Pp Erfolg und +5 % Mean
    expect((pe25 - pe0) / pe0).toBeGreaterThan(0.10); // ~14 %
  });

  test("'success_wealth' bevorzugt Median wenn > 0 (gesunder Plan)", () => {
    // Bei Erfolg > 50 % ist Median > 0 → Mean wird ignoriert.
    // Score = 0.8 × 1.5 = 1.2 (egal welcher Mean übergeben wird).
    const a = computeObjective("success_wealth", 80, 1_500_000, 0, 1_000_000, 999_999_999);
    expect(a).toBeCloseTo(1.2, 6);
  });
});

describe("wilsonScoreInterval", () => {
  test("p=0.5, n=1000: SE ≈ 1.6 Pp, CI-Halbweite ≈ 3.1 Pp", () => {
    const ci = wilsonScoreInterval(0.5, 1000);
    expect(ci.low).toBeGreaterThan(0.45);
    expect(ci.low).toBeLessThan(0.48);
    expect(ci.high).toBeGreaterThan(0.52);
    expect(ci.high).toBeLessThan(0.55);
    // Mitte muss bei p liegen (für p=0.5 ist Wilson-Mitte exakt 0.5)
    expect((ci.low + ci.high) / 2).toBeCloseTo(0.5, 2);
  });

  test("p=0 robustes Verhalten (Wilson > 0)", () => {
    const ci = wilsonScoreInterval(0, 1000);
    expect(ci.low).toBe(0);
    expect(ci.high).toBeGreaterThan(0);
    expect(ci.high).toBeLessThan(0.01);
  });

  test("p=1 robustes Verhalten (Wilson < 1)", () => {
    const ci = wilsonScoreInterval(1, 1000);
    expect(ci.high).toBe(1);
    expect(ci.low).toBeLessThan(1);
    expect(ci.low).toBeGreaterThan(0.99);
  });

  test("Größeres n → schmaleres Intervall (1/√n)", () => {
    const ci1k = wilsonScoreInterval(0.5, 1000);
    const ci5k = wilsonScoreInterval(0.5, 5000);
    const w1k = ci1k.high - ci1k.low;
    const w5k = ci5k.high - ci5k.low;
    // Verhältnis sollte ungefähr √5 ≈ 2.24 sein
    expect(w1k / w5k).toBeGreaterThan(2.0);
    expect(w1k / w5k).toBeLessThan(2.5);
  });

  test("n=0 → degeneriertes [0, 1]", () => {
    const ci = wilsonScoreInterval(0.5, 0);
    expect(ci.low).toBe(0);
    expect(ci.high).toBe(1);
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

  test("PE wird auf nächstes 5 %-Vielfaches gerundet", () => {
    const p = {
      ...defaultPortfolio,
      peFunds: [{
        id: "x", name: "X", commitment: 130_000, callRatio: 80, irr: 10,
        tvpi: 1.7, investmentPeriod: 5, fundDuration: 14, startAge: 50,
      }],
    };
    // 13 % → gerundet auf 15 %
    expect(currentAllocationOf(p, 1_000_000).pe).toBe(15);
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
  test("Buckets werden gesetzt (sum=100), alles andere bleibt unverändert", () => {
    const p = buildPortfolioFromAllocation(
      { cash: 20, bonds: 30, equities: 50, pe: 0 },
      defaultPortfolio,
      1_000_000,
      40,
    );
    expect(p.buckets[0].allocation).toBe(20);
    expect(p.buckets[1].allocation).toBe(30);
    expect(p.buckets[2].allocation).toBe(50);
    expect(p.buckets[0].allocation + p.buckets[1].allocation + p.buckets[2].allocation).toBe(100);
    expect(p.kestRate).toBe(defaultPortfolio.kestRate);
    expect(p.correlationMatrix).toEqual(defaultPortfolio.correlationMatrix);
    expect(p.peFunds).toEqual([]);
  });

  test("pe > 0: Buckets bleiben auf 100 % (nicht durch pe reduziert!)", () => {
    const p = buildPortfolioFromAllocation(
      { cash: 10, bonds: 30, equities: 60, pe: 20 },
      defaultPortfolio,
      1_000_000,
      45,
    );
    // Buckets sum = 100, NICHT 80
    expect(p.buckets[0].allocation + p.buckets[1].allocation + p.buckets[2].allocation).toBe(100);
    // PE-Achse = Zielquote → rollierendes Programm statt Einzelfonds.
    expect(p.peFunds).toEqual([]);
    expect(p.peProgram).toBeDefined();
    expect(p.peProgram!.enabled).toBe(true);
    expect(p.peProgram!.targetQuotaPct).toBe(20);
    expect(p.peProgram!.fundTemplate.irr).toBe(10);
    expect(p.peProgram!.fundTemplate.tvpi).toBe(1.7);
  });

  test("pe = 0: kein Programm gesetzt", () => {
    const p = buildPortfolioFromAllocation(
      { cash: 20, bonds: 30, equities: 50, pe: 0 },
      defaultPortfolio,
      1_000_000,
      45,
    );
    expect(p.peProgram).toBeUndefined();
  });

  test("Round-Trip: currentAllocationOf liest die Programm-Zielquote zurück", () => {
    const p = buildPortfolioFromAllocation(
      { cash: 10, bonds: 30, equities: 60, pe: 15 },
      defaultPortfolio,
      1_000_000,
      45,
    );
    expect(currentAllocationOf(p, 1_000_000).pe).toBe(15);
  });
});

describe("optimizePortfolio — End-to-End (langsam)", () => {
  const settings: SimulationSettings = {
    numSimulations: 100, // Default wird intern überschrieben
    timeStepMonths: 12,
    mode: "fixed_withdrawal",
    randomSeed: 42,
  };

  // Stark reduzierte Pfadzahlen, damit Test-Suite < 10 s bleibt.
  const fastOpts = {
    pathsPhase12: 50,
    pathsPhase3: 100,
    peStepsCoarse: [0, 10],
    refinementTopN: 2,
    reEvalTopN: 5,
  };

  test("liefert sortierte Liste mit ranked.length > 0", () => {
    const r = optimizePortfolio(defaultClient, optInputs, defaultPortfolio, settings, [], fastOpts);
    expect(r.ranked.length).toBeGreaterThan(10);
    expect(r.evaluations).toBe(r.ranked.length);
    for (let i = 1; i < r.ranked.length; i++) {
      expect(r.ranked[i - 1].score).toBeGreaterThanOrEqual(r.ranked[i].score);
    }
  });

  test("Baseline wird mit pathsPhase3 (höchste Genauigkeit) bewertet", () => {
    const r = optimizePortfolio(defaultClient, optInputs, defaultPortfolio, settings, [], fastOpts);
    expect(r.baseline).toBeDefined();
    expect(r.baseline.pathsUsed).toBe(fastOpts.pathsPhase3);
    expect(Number.isFinite(r.baseline.successRate)).toBe(true);
  });

  test("Phase 3: Top-N Einträge wurden mit pathsPhase3 re-evaluiert", () => {
    const r = optimizePortfolio(defaultClient, optInputs, defaultPortfolio, settings, [], fastOpts);
    // Die Top-N (= reEvalTopN) Einträge müssen pathsUsed === pathsPhase3 haben.
    // Achtung: ranked[] ist nach Score sortiert, nicht nach pathsUsed.
    const reEvaluated = r.ranked.filter((x) => x.pathsUsed === fastOpts.pathsPhase3);
    // Mindestens 'reEvalTopN' Einträge wurden mit Phase 3 bewertet
    // (plus Baseline, falls nicht in Top-N).
    expect(reEvaluated.length).toBeGreaterThanOrEqual(fastOpts.reEvalTopN);
    // Restliche Einträge nutzen pathsPhase12.
    const lowPaths = r.ranked.filter((x) => x.pathsUsed === fastOpts.pathsPhase12);
    expect(lowPaths.length).toBeGreaterThan(0);
  });

  test("Wilson-CI ist befüllt und konsistent (low ≤ rate ≤ high)", () => {
    const r = optimizePortfolio(defaultClient, optInputs, defaultPortfolio, settings, [], fastOpts);
    for (const entry of r.ranked) {
      expect(entry.successRateCiLow).toBeLessThanOrEqual(entry.successRate);
      expect(entry.successRateCiHigh).toBeGreaterThanOrEqual(entry.successRate);
      expect(entry.successRateCiLow).toBeGreaterThanOrEqual(0);
      expect(entry.successRateCiHigh).toBeLessThanOrEqual(100);
    }
  });

  test("Optimum >= Baseline (Score-Monotonie über alle Phasen)", () => {
    const r = optimizePortfolio(defaultClient, optInputs, defaultPortfolio, settings, [], fastOpts);
    expect(r.ranked[0].score).toBeGreaterThanOrEqual(r.baseline.score);
  });

  test("Drawdown stammt aus Engine, alle realistisch (< 0.95)", () => {
    const r = optimizePortfolio(defaultClient, optInputs, defaultPortfolio, settings, [], fastOpts);
    for (const entry of r.ranked) {
      expect(entry.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(entry.maxDrawdown).toBeLessThan(0.95);
    }
  });

  test("Reproduzierbarkeit: gleicher Seed → identische Top-3", () => {
    const opts = { ...fastOpts, randomSeed: 123 };
    const a = optimizePortfolio(defaultClient, optInputs, defaultPortfolio, settings, [], opts);
    const b = optimizePortfolio(defaultClient, optInputs, defaultPortfolio, settings, [], opts);
    for (let i = 0; i < 3; i++) {
      expect(a.ranked[i].cash).toBe(b.ranked[i].cash);
      expect(a.ranked[i].bonds).toBe(b.ranked[i].bonds);
      expect(a.ranked[i].equities).toBe(b.ranked[i].equities);
      expect(a.ranked[i].score).toBeCloseTo(b.ranked[i].score, 6);
    }
  });

  test("Default-Objective ist 'success_wealth'", () => {
    const r = optimizePortfolio(defaultClient, optInputs, defaultPortfolio, settings, [], fastOpts);
    expect(r.objective).toBe("success_wealth");
  });
});