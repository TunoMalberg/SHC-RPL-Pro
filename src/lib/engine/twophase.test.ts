/**
 * Tests für das Zwei-Phasen-Portfolio (Anspar- vs. Entnahmephase).
 *
 * Geprüft werden:
 *   1. Rückwärtskompatibilität — ohne `withdrawalPhase` bit-identische Ergebnisse.
 *   2. switchToWithdrawalAllocation — KESt-Mathematik beim Phasenwechsel.
 *   3. Phasen-Gewichte wirken tatsächlich (unterschiedliche Entnahme-Allokation
 *      liefert andere Ergebnisse als eine reine Anspar-Allokation).
 *
 * Aufruf: `bun test src/lib/engine/twophase.test.ts`
 */

import { describe, expect, test } from "bun:test";
import { runMonteCarloSimulation, switchToWithdrawalAllocation } from "./montecarlo";
import { defaultClient, defaultInputs, defaultPortfolio } from "../defaults";
import type {
  ClientProfile,
  FinancialInputs,
  PortfolioConfig,
  SimulationSettings,
  WithdrawalPhaseOverride,
} from "../types";

const baseClient: ClientProfile = { ...defaultClient };
const baseInputs: FinancialInputs = { ...defaultInputs };
const clone = (p: PortfolioConfig): PortfolioConfig => JSON.parse(JSON.stringify(p));
const basePortfolio: PortfolioConfig = clone(defaultPortfolio);
const baseSettings: SimulationSettings = {
  numSimulations: 500,
  timeStepMonths: 12,
  mode: "fixed_withdrawal",
  randomSeed: 42,
};

// ────────────────────────────────────────────────────────────────
describe("Zwei-Phasen — Rückwärtskompatibilität", () => {
  test("ohne withdrawalPhase liefert identische Ergebnisse wie zuvor", () => {
    const withUndefined: PortfolioConfig = { ...clone(basePortfolio), withdrawalPhase: undefined };
    const a = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    const b = runMonteCarloSimulation(baseClient, baseInputs, withUndefined, baseSettings, []);
    expect(a.successRate).toBe(b.successRate);
    expect(a.medianFinalWealth).toBe(b.medianFinalWealth);
    for (let i = 0; i < a.medianPath.length; i++) {
      expect(a.medianPath[i]).toBe(b.medianPath[i]);
    }
  });

  test("withdrawalPhase == Ansparphase-Gewichte bleibt nah am Single-Portfolio", () => {
    // Gleiche Gewichte + gleiche Rebal-Params. Beim Pensionsantritt erzwingt
    // die Zwei-Phasen-Logik ein einmaliges Rebalancing auf die Zielgewichte
    // und versteuert dabei den drift-bedingten Turnover (KESt). Das ist ein
    // realer, kleiner Effekt — die Ergebnisse dürfen nah, aber nicht identisch sein.
    const acc = basePortfolio.buckets.map((b) => b.allocation) as [number, number, number];
    const same: PortfolioConfig = {
      ...clone(basePortfolio),
      withdrawalPhase: {
        allocations: acc,
        rebalancingFrequency: basePortfolio.rebalancingFrequency,
        rebalancingThreshold: basePortfolio.rebalancingThreshold,
        cashYearsTarget: basePortfolio.cashYearsTarget ?? 2,
      },
    };
    const a = runMonteCarloSimulation(baseClient, baseInputs, basePortfolio, baseSettings, []);
    const b = runMonteCarloSimulation(baseClient, baseInputs, same, baseSettings, []);
    // Kleiner, aber legitimer Unterschied durch einmaliges Rebalancing + KESt.
    expect(Math.abs(a.successRate - b.successRate)).toBeLessThanOrEqual(5);
  });
});

// ────────────────────────────────────────────────────────────────
describe("switchToWithdrawalAllocation — KESt beim Phasenwechsel", () => {
  test("kein eingebetteter Gewinn (Wert == Höchststand) → keine Steuer", () => {
    const values = [10_000, 30_000, 60_000]; // total 100k
    const hwm = 100_000;
    const target = [0.3, 0.4, 0.3];
    const newHwm = switchToWithdrawalAllocation(values, target, hwm, 0.275);
    const total = values[0] + values[1] + values[2];
    expect(total).toBeCloseTo(100_000, 4); // keine Steuer abgezogen
    // Auf Zielgewichte umgeschichtet
    expect(values[0]).toBeCloseTo(30_000, 4);
    expect(values[1]).toBeCloseTo(40_000, 4);
    expect(values[2]).toBeCloseTo(30_000, 4);
    expect(newHwm).toBeGreaterThanOrEqual(0);
  });

  test("mit eingebettetem Gewinn wird nur der umgeschichtete Anteil versteuert", () => {
    // total=100k, hwm=60k → embeddedGain=40k
    const values = [0, 0, 100_000]; // 100% Aktien
    const target = [0.5, 0.5, 0.0]; // komplett raus aus Aktien
    // turnover = ½·(|0.5-0| + |0.5-0| + |0-1|) = ½·2 = 1.0 → voller Gewinn realisiert
    const hwm = 60_000;
    const kest = 0.275;
    const newHwm = switchToWithdrawalAllocation(values, target, hwm, kest);
    const embeddedGain = 40_000;
    const expectedTax = embeddedGain * 1.0 * kest; // 11_000
    const totalAfter = 100_000 - expectedTax; // 89_000
    const total = values[0] + values[1] + values[2];
    expect(total).toBeCloseTo(totalAfter, 2);
    expect(values[0]).toBeCloseTo(0.5 * totalAfter, 2);
    expect(values[2]).toBeCloseTo(0, 6);
    // Voller Gewinn realisiert → kein Reststundungspuffer → newHwm == totalAfter
    expect(newHwm).toBeCloseTo(totalAfter, 2);
  });

  test("teilweiser Turnover realisiert nur anteiligen Gewinn", () => {
    // total=100k, hwm=50k → embeddedGain=50k
    // Ist-Gewichte 50/50 Aktien/Anleihen, Ziel 50/50 aber cash-heavy
    const values = [0, 50_000, 50_000];
    const target = [0.5, 0.25, 0.25];
    // turnover = ½·(|0.5-0| + |0.25-0.5| + |0.25-0.5|) = ½·(0.5+0.25+0.25)=0.5
    const hwm = 50_000;
    const kest = 0.275;
    const newHwm = switchToWithdrawalAllocation(values, target, hwm, kest);
    const embeddedGain = 50_000;
    const realized = embeddedGain * 0.5; // 25k
    const tax = realized * kest; // 6_875
    const totalAfter = 100_000 - tax; // 93_125
    const total = values[0] + values[1] + values[2];
    expect(total).toBeCloseTo(totalAfter, 2);
    // Reststundung: embeddedGain - realized = 25k bleibt → newHwm = totalAfter - 25k
    expect(newHwm).toBeCloseTo(totalAfter - 25_000, 2);
  });

  test("leeres Portfolio (total<=0) lässt Höchststand unverändert", () => {
    const values = [0, 0, 0];
    const newHwm = switchToWithdrawalAllocation(values, [0.3, 0.4, 0.3], 12_345, 0.275);
    expect(newHwm).toBe(12_345);
  });
});

// ────────────────────────────────────────────────────────────────
describe("Zwei-Phasen — Gewichte wirken tatsächlich", () => {
  test("defensive Entnahmephase senkt Endvermögens-Streuung vs. offensive", () => {
    const defensiveWd: WithdrawalPhaseOverride = {
      allocations: [30, 55, 15], // wenig Aktien
      rebalancingFrequency: "annually",
      rebalancingThreshold: 5,
      cashYearsTarget: 3,
    };
    const offensiveWd: WithdrawalPhaseOverride = {
      allocations: [5, 15, 80], // viel Aktien
      rebalancingFrequency: "annually",
      rebalancingThreshold: 5,
      cashYearsTarget: 1,
    };
    const pDef: PortfolioConfig = { ...clone(basePortfolio), withdrawalPhase: defensiveWd };
    const pOff: PortfolioConfig = { ...clone(basePortfolio), withdrawalPhase: offensiveWd };
    const rDef = runMonteCarloSimulation(baseClient, baseInputs, pDef, baseSettings, []);
    const rOff = runMonteCarloSimulation(baseClient, baseInputs, pOff, baseSettings, []);
    // Unterschiedliche Entnahme-Allokation → messbar unterschiedliche Ergebnisse.
    expect(rDef.medianFinalWealth).not.toBe(rOff.medianFinalWealth);
    // Offensive Phase erzeugt breitere Verteilung (p90 - p10 größer am Ende).
    const spreadDef = rDef.p90Path.at(-1)! - rDef.p10Path.at(-1)!;
    const spreadOff = rOff.p90Path.at(-1)! - rOff.p10Path.at(-1)!;
    expect(spreadOff).toBeGreaterThan(spreadDef);
  });

  test("Ergebnisse bleiben valide (Erfolgsquote 0..100, Endvermögen ≥ 0)", () => {
    const wd: WithdrawalPhaseOverride = {
      allocations: [40, 40, 20],
      rebalancingFrequency: "quarterly",
      rebalancingThreshold: 10,
      cashYearsTarget: 2,
    };
    const p: PortfolioConfig = { ...clone(basePortfolio), withdrawalPhase: wd };
    const r = runMonteCarloSimulation(baseClient, baseInputs, p, baseSettings, []);
    expect(r.successRate).toBeGreaterThanOrEqual(0);
    expect(r.successRate).toBeLessThanOrEqual(100);
    expect(r.medianFinalWealth).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < r.medianPath.length; i++) {
      expect(r.p10Path[i]).toBeLessThanOrEqual(r.p25Path[i] + 1e-6);
      expect(r.medianPath[i]).toBeLessThanOrEqual(r.p75Path[i] + 1e-6);
    }
  });
});