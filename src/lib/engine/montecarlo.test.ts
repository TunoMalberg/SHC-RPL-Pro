/**
 * Sanity-Tests für die Monte-Carlo-Engine.
 *
 * Diese Tests prüfen Eigenschaften, die niemals brechen dürfen, ohne dass die
 * gesamte App ihren wirtschaftlichen Sinn verliert:
 *   - Reproduzierbarkeit bei festem Seed
 *   - Quantil-Ordnung p10 ≤ p25 ≤ Median ≤ p75 ≤ p90
 *   - Erfolgsquote ∈ [0, 100]
 *   - Endvermögen ≥ 0
 *   - Liquiditätsereignisse beeinflussen das Endvermögen monoton
 *
 * Aufruf: `bun test src/lib/engine/montecarlo.test.ts`
 */

import { describe, expect, test } from "bun:test";
import { runMonteCarloSimulation } from "./montecarlo";
import { defaultClient, defaultInputs, defaultPortfolio } from "../defaults";
import type { ClientProfile, FinancialInputs, PortfolioConfig, SimulationSettings, LiquidityEvent } from "../types";

const baseClient: ClientProfile = { ...defaultClient };
const baseInputs: FinancialInputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3000 };
const basePortfolio: PortfolioConfig = JSON.parse(JSON.stringify(defaultPortfolio));
const baseSettings: SimulationSettings = {
  numSimulations: 500, // klein, damit Tests <1 s laufen
  timeStepMonths: 12,
  mode: "fixed_withdrawal",
  randomSeed: 42,
};

describe("runMonteCarloSimulation — Reproduzierbarkeit", () => {
  test("zwei Aufrufe mit identischem Seed liefern identische Ergebnisse", () => {
    const a = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    const b = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    expect(a.successRate).toBe(b.successRate);
    expect(a.medianFinalWealth).toBe(b.medianFinalWealth);
    expect(a.medianPath.length).toBe(b.medianPath.length);
    for (let i = 0; i < a.medianPath.length; i++) {
      expect(a.medianPath[i]).toBe(b.medianPath[i]);
    }
  });

  test("unterschiedliche Seeds → unterschiedliches Median-Endvermögen", () => {
    const a = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, { ...baseSettings, randomSeed: 1 }, []);
    const b = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, { ...baseSettings, randomSeed: 2 }, []);
    // Statistisch wäre exakte Gleichheit ein Zufall mit Wahrscheinlichkeit ~0
    expect(a.medianFinalWealth).not.toBe(b.medianFinalWealth);
  });
});

describe("runMonteCarloSimulation — Quantil-Ordnung", () => {
  test("p10 ≤ p25 ≤ Median ≤ p75 ≤ p90 für jede Periode", () => {
    const r = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    expect(r.medianPath.length).toBeGreaterThan(0);
    for (let i = 0; i < r.medianPath.length; i++) {
      expect(r.p10Path[i]).toBeLessThanOrEqual(r.p25Path[i] + 1e-6);
      expect(r.p25Path[i]).toBeLessThanOrEqual(r.medianPath[i] + 1e-6);
      expect(r.medianPath[i]).toBeLessThanOrEqual(r.p75Path[i] + 1e-6);
      expect(r.p75Path[i]).toBeLessThanOrEqual(r.p90Path[i] + 1e-6);
    }
  });

  test("Worst ≤ p10 und p90 ≤ Best", () => {
    const r = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    for (let i = 0; i < r.medianPath.length; i++) {
      expect(r.worstPath[i]).toBeLessThanOrEqual(r.p10Path[i] + 1e-6);
      expect(r.p90Path[i]).toBeLessThanOrEqual(r.bestPath[i] + 1e-6);
    }
  });
});

describe("runMonteCarloSimulation — Plausibilitäten", () => {
  test("Erfolgsquote ∈ [0, 100]", () => {
    const r = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    expect(r.successRate).toBeGreaterThanOrEqual(0);
    expect(r.successRate).toBeLessThanOrEqual(100);
  });

  test("Endvermögen ist nie negativ (positive Pfad-Werte garantiert)", () => {
    const r = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    for (const v of r.medianPath) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of r.p10Path) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of r.worstPath) expect(v).toBeGreaterThanOrEqual(0);
    expect(r.medianFinalWealth).toBeGreaterThanOrEqual(0);
  });

  test("Pfadlängen konsistent (Akkumulation + Dekumulation)", () => {
    const r = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    const expected = baseClient.lifeExpectancy - baseClient.currentAge + 1;
    expect(r.medianPath.length).toBe(expected);
    expect(r.p10Path.length).toBe(expected);
    expect(r.yearLabels.length).toBe(expected);
  });

  test("Korrelations-Matrix-Mismatch ist robust (Engine produziert kein NaN)", () => {
    // Defekte Korrelationsmatrix (nicht positiv-definit). Engine darf nicht
    // mit NaN-Pfaden weitermachen — Cholesky clamped auf max(0, ...).
    const broken = JSON.parse(JSON.stringify(basePortfolio));
    broken.correlationMatrix = [
      [1.0, 0.95, -0.9],
      [0.95, 1.0, 0.95],
      [-0.9, 0.95, 1.0],
    ];
    const r = runMonteCarloSimulation(baseClient, baseInputs, broken, baseSettings, []);
    expect(Number.isFinite(r.successRate)).toBe(true);
    expect(Number.isFinite(r.medianFinalWealth)).toBe(true);
  });
});

describe("runMonteCarloSimulation — Liquiditätsereignisse", () => {
  test("Positive Erbschaft erhöht Median-Endvermögen", () => {
    const noEvent = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    const inflow: LiquidityEvent[] = [
      { id: "test-inflow", age: baseClient.currentAge + 10, description: "Erbschaft", amount: 100_000 },
    ];
    const withEvent = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, inflow);
    expect(withEvent.medianFinalWealth).toBeGreaterThan(noEvent.medianFinalWealth);
  });

  test("Negativer Outflow reduziert Median-Endvermögen", () => {
    const noEvent = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    const outflow: LiquidityEvent[] = [
      { id: "test-outflow", age: baseClient.currentAge + 10, description: "Hauskauf", amount: -100_000 },
    ];
    const withEvent = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, outflow);
    expect(withEvent.medianFinalWealth).toBeLessThan(noEvent.medianFinalWealth);
  });
});

describe("runMonteCarloSimulation — Pension-Logik", () => {
  test("höhere Pension → höheres Median-Endvermögen (weniger Entnahme nötig)", () => {
    const lowPension = { ...baseInputs, monthlyPension: 500 };
    const highPension = { ...baseInputs, monthlyPension: 2500 };
    const a = runMonteCarloSimulation(baseClient, lowPension, basePortfolio, baseSettings, []);
    const b = runMonteCarloSimulation(baseClient, highPension, basePortfolio, baseSettings, []);
    expect(b.medianFinalWealth).toBeGreaterThan(a.medianFinalWealth);
  });

  test("Pensionsbeginn vor Rentenbeginn ist erlaubt (Bug-Fix-Regression)", () => {
    // 2026-Q2-Bug: Pension-Linie wurde bei retirementAge gezeichnet,
    // obwohl pensionStartAge ≠ retirementAge erlaubt ist.
    const earlyPension = { ...baseInputs, pensionStartAge: 60 };
    const client = { ...baseClient, retirementAge: 67 };
    const r = runMonteCarloSimulation(client, earlyPension, basePortfolio, baseSettings, []);
    expect(r.medianFinalWealth).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.successRate)).toBe(true);
  });
});
/* ── CR „Heutige Kaufkraft & Planungskorridor" ─────────────────────── */

describe("runMonteCarloSimulation — duale Bewertung (CR 6)", () => {
  test("valuation-Objekt: Deflatoren, reale Skalare, Jahresbezüge", () => {
    const r = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    expect(r.valuation).toBeDefined();
    const v = r.valuation!;
    expect(v.inflationRatePct).toBe(baseInputs.inflationRate);
    expect(v.deflators.length).toBe(r.medianPath.length);
    expect(v.deflators[0]).toBe(1);
    // Enddeflator = (1+i)^(−Jahre)
    const years = baseClient.lifeExpectancy - baseClient.currentAge;
    expect(v.deflators[v.deflators.length - 1]).toBeCloseTo(
      Math.pow(1 + baseInputs.inflationRate / 100, -years), 10,
    );
    // Reale Skalare exakt aus nominalen abgeleitet.
    expect(v.medianFinalWealthReal).toBeCloseTo(
      r.medianFinalWealth * v.deflators[v.deflators.length - 1], 6,
    );
    expect(v.percentilesReal.p50).toBeCloseTo(v.medianFinalWealthReal, 6);
    expect(v.percentilesReal.p10).toBeLessThanOrEqual(v.percentilesReal.p90);
    // Jahresbezüge (kein Nominalwert ohne Jahr, CR 6).
    expect(v.horizonYear).toBe(baseClient.birthYear + baseClient.lifeExpectancy);
    expect(v.retirementYear).toBe(baseClient.birthYear + baseClient.retirementAge);
  });

  test("requiredMonthlyWithdrawal = max(0, Wunsch − Pension); null ohne Wunsch (CR 4/19)", () => {
    const r = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    expect(r.requiredMonthlyWithdrawal).toBe(
      Math.max(0, 3000 - baseInputs.monthlyPension),
    );
    const rNull = runMonteCarloSimulation(
      baseClient, { ...baseInputs, desiredMonthlyWithdrawal: null },
      basePortfolio, baseSettings, [],
    );
    expect(rNull.requiredMonthlyWithdrawal).toBeNull();
    // Ohne Wunsch keine Entnahme → Plan scheitert nie.
    expect(rNull.successRate).toBe(100);
    // Floor bei Pension > Wunsch.
    const rFloor = runMonteCarloSimulation(
      baseClient, { ...baseInputs, desiredMonthlyWithdrawal: 500, monthlyPension: 2000 },
      basePortfolio, baseSettings, [],
    );
    expect(rFloor.requiredMonthlyWithdrawal).toBe(0);
  });
});
