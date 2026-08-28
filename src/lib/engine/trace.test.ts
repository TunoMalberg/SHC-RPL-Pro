/**
 * Tests des calculationTrace (CR 19): alle Sektionen vorhanden,
 * JSON-serialisierbar, Herleitung required = desired − pension,
 * Event-Split, real = nominal × Deflator, Version + Stichtag.
 */
import { describe, expect, test } from "bun:test";
import type { FinancialInputs, LiquidityEvent, SimulationSettings } from "../types";
import { defaultClient, defaultInputs, defaultPortfolio } from "../defaults";
import { DISPLAY_CONFIG } from "../displayConfig";
import { runMonteCarloSimulation } from "./montecarlo";
import { computeCorridorWithdrawals } from "./corridor";
import { buildCalculationTrace } from "./trace";

const client = { ...defaultClient };
const inputs: FinancialInputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3000 };
const settings: SimulationSettings = {
  numSimulations: 300,
  timeStepMonths: 12,
  mode: "fixed_withdrawal",
  randomSeed: 7,
};
const events: LiquidityEvent[] = [
  { id: "a", age: 55, description: "Erbschaft", amount: 100_000 },
  { id: "b", age: 70, description: "Pflegekosten", amount: -50_000 },
  { id: "c", age: 60, description: "LV-Auszahlung", amount: 30_000 },
];

const result = runMonteCarloSimulation(client, inputs, defaultPortfolio, settings, events);
const corridor = computeCorridorWithdrawals(client, inputs, defaultPortfolio, settings, events);
const trace = buildCalculationTrace(client, inputs, defaultPortfolio, settings, events, result, corridor);

describe("buildCalculationTrace (CR 19)", () => {
  test("alle Sektionen vorhanden + JSON-serialisierbar", () => {
    expect(trace.assumptions.buckets.length).toBe(3);
    expect(trace.assumptions.correlationMatrix.length).toBe(3);
    expect(trace.assumptions.inflationRatePct).toBe(inputs.inflationRate);
    expect(trace.assumptions.kestRatePct).toBe(defaultPortfolio.kestRate);
    expect(trace.simulation.numSimulations).toBe(settings.numSimulations);
    expect(trace.simulation.seed).toBe(7);
    expect(trace.valuation.deflators.length).toBeGreaterThan(0);
    expect(trace.corridor.result).not.toBeNull();
    expect(trace.cashflows.ages.length).toBeGreaterThan(0);
    expect(trace.series.medianNominal.length).toBeGreaterThan(0);
    expect(trace.rounding.locale).toBe("de-AT");
    // JSON-Roundtrip ohne Fehler und ohne Informationsverlust der Skalare.
    const parsed = JSON.parse(JSON.stringify(trace));
    expect(parsed.derivation.requiredMonthlyWithdrawal).toBe(
      trace.derivation.requiredMonthlyWithdrawal,
    );
  });

  test("Herleitung: required = max(0, desired − pension) (CR 19)", () => {
    expect(trace.derivation.desiredMonthlyIncome).toBe(3000);
    expect(trace.derivation.externalMonthlyIncome).toBe(inputs.monthlyPension);
    expect(trace.derivation.requiredMonthlyWithdrawal).toBe(
      Math.max(0, 3000 - inputs.monthlyPension),
    );
    expect(trace.derivation.formula).toContain("max(0, desiredMonthlyIncome - externalMonthlyIncome)");
  });

  test("Pension > Wunsch → required = 0 (Floor)", () => {
    const t2 = buildCalculationTrace(
      client,
      { ...inputs, desiredMonthlyWithdrawal: 1000, monthlyPension: 2500 },
      defaultPortfolio, settings, [], result, corridor,
    );
    expect(t2.derivation.requiredMonthlyWithdrawal).toBe(0);
    // Einordnung nur bei required > 0 (CR 10).
    expect(t2.ranking).toBeNull();
  });

  test("Einordnung vorhanden und konsistent mit Korridor", () => {
    expect(trace.ranking).not.toBeNull();
    expect(trace.ranking!.requiredFromWealthMonthly).toBe(3000 - inputs.monthlyPension);
    expect(trace.ranking!.comparedAgainst.difficult).toBe(
      corridor.scenarios.difficult.fromWealthMonthly,
    );
    expect(["below_difficult", "within_corridor", "above_favorable"]).toContain(
      trace.ranking!.result,
    );
  });

  test("Liquiditätsereignisse getrennt nach Einnahmen/Ausgaben (CR 5/19)", () => {
    expect(trace.liquidityEvents.additionalIncomes.map((e) => e.id).sort()).toEqual(["a", "c"]);
    expect(trace.liquidityEvents.additionalExpenses.map((e) => e.id)).toEqual(["b"]);
    expect(trace.liquidityEvents.totalIncomes).toBe(130_000);
    expect(trace.liquidityEvents.totalExpenses).toBe(-50_000);
  });

  test("reale Serie = nominale Serie × Deflatoren (exakt, CR 6)", () => {
    const { medianNominal, medianReal } = trace.series;
    const d = trace.valuation.deflators;
    for (let s = 0; s < Math.min(medianNominal.length, d.length); s += 7) {
      expect(medianReal[s]).toBeCloseTo(medianNominal[s] * d[s], 8);
    }
    // Letzter Realwert < letzter Nominalwert (positive Inflation).
    const last = medianNominal.length - 1;
    if (medianNominal[last] > 0) {
      expect(medianReal[last]).toBeLessThan(medianNominal[last]);
    }
  });

  test("configVersion + Stichtag + technische Parameter ausgewiesen", () => {
    expect(trace.configVersion).toBe(DISPLAY_CONFIG.version);
    expect(new Date(trace.stichtag).toString()).not.toBe("Invalid Date");
    expect(trace.corridor.technical.maxSimulations).toBe(
      DISPLAY_CONFIG.technical.corridorBisection.maxSimulations,
    );
    expect(trace.corridor.percentiles).toEqual({ difficult: 25, typical: 50, favorable: 75 });
    expect(trace.valuation.formulaRealReturn).toContain("(1 + nominalReturn) / (1 + inflationRate)");
  });

  test("ohne Wunschbetrag: derivation null-korrekt", () => {
    const t3 = buildCalculationTrace(
      client,
      { ...inputs, desiredMonthlyWithdrawal: null },
      defaultPortfolio, settings, [], result, corridor,
    );
    expect(t3.derivation.desiredMonthlyIncome).toBeNull();
    expect(t3.derivation.requiredMonthlyWithdrawal).toBeNull();
    expect(t3.ranking).toBeNull();
  });
});
