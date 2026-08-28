/**
 * Tests des Planungskorridors (CR 9/10/16): Monotonie, Dualität
 * (Perzentil ⇔ Ziel-Erfolgsquote), fromWealth-Ableitung, Nominal-
 * Zwilling mit Jahresbezug, Basis-Umschaltung, Einordnung ohne
 * zusätzliche Schwellenwerte, Config-Steuerung.
 */
import { describe, expect, test } from "bun:test";
import type { FinancialInputs, SimulationSettings } from "../types";
import { defaultClient, defaultInputs, defaultPortfolio } from "../defaults";
import { DISPLAY_CONFIG } from "../displayConfig";
import { computeCorridorWithdrawals, rankAgainstCorridor } from "./corridor";
import { runMonteCarloSimulation } from "./montecarlo";

const client = { ...defaultClient };
const inputs: FinancialInputs = {
  ...defaultInputs,
  desiredMonthlyWithdrawal: 3000,
};
// Kleine Pfadzahl für Testgeschwindigkeit — Seed fix für Reproduzierbarkeit.
const settings: SimulationSettings = {
  numSimulations: 400,
  timeStepMonths: 12,
  mode: "fixed_withdrawal",
  randomSeed: 42,
};

const corridor = computeCorridorWithdrawals(client, inputs, defaultPortfolio, settings, []);

describe("computeCorridorWithdrawals", () => {
  test("Perzentile aus DISPLAY_CONFIG (25/50/75), Zielquoten 75/50/25", () => {
    expect(corridor.scenarios.difficult.percentile).toBe(
      DISPLAY_CONFIG.planningCorridorPercentiles.difficult,
    );
    expect(corridor.scenarios.typical.percentile).toBe(50);
    expect(corridor.scenarios.favorable.percentile).toBe(75);
    expect(corridor.scenarios.difficult.targetSuccessRate).toBe(75);
    expect(corridor.scenarios.typical.targetSuccessRate).toBe(50);
    expect(corridor.scenarios.favorable.targetSuccessRate).toBe(25);
  });

  test("Monotonie: schwierig ≤ typisch ≤ günstig", () => {
    expect(corridor.scenarios.difficult.totalMonthly).toBeLessThanOrEqual(
      corridor.scenarios.typical.totalMonthly,
    );
    expect(corridor.scenarios.typical.totalMonthly).toBeLessThanOrEqual(
      corridor.scenarios.favorable.totalMonthly,
    );
    expect(corridor.scenarios.difficult.totalMonthly).toBeGreaterThan(0);
  });

  test("Dualität: Lauf mit typischer Entnahme → Erfolgsquote ≈ 50 %", () => {
    const result = runMonteCarloSimulation(
      client,
      { ...inputs, desiredMonthlyWithdrawal: corridor.scenarios.typical.totalMonthly },
      defaultPortfolio,
      { ...settings, randomSeed: corridor.seedUsed },
      [],
    );
    // Bisektions-Toleranz + MC-Rauschen: ±10 Prozentpunkte.
    expect(result.successRate).toBeGreaterThanOrEqual(40);
    expect(result.successRate).toBeLessThanOrEqual(62);
  });

  test("fromWealth = max(0, total − Pension)", () => {
    for (const key of ["difficult", "typical", "favorable"] as const) {
      const sc = corridor.scenarios[key];
      expect(sc.fromWealthMonthly).toBe(
        Math.max(0, sc.totalMonthly - inputs.monthlyPension),
      );
    }
  });

  test("Nominal-Zwilling: real × (1+i)^JahreBisPension, Jahr gesetzt (CR 6)", () => {
    const years = client.retirementAge - client.currentAge;
    expect(corridor.yearsToRetirement).toBe(years);
    expect(corridor.retirementYear).toBe(client.birthYear + client.retirementAge);
    const sc = corridor.scenarios.typical;
    expect(sc.totalMonthlyNominalAtRetirement).toBeCloseTo(
      Math.round(sc.totalMonthly * Math.pow(1 + inputs.inflationRate / 100, years)),
      0,
    );
    expect(sc.totalMonthlyNominalAtRetirement).toBeGreaterThan(sc.totalMonthly);
  });

  test("Experten-Toggle OFF → Basis nominal, kein Zwillings-Aufschlag", () => {
    const nomCorridor = computeCorridorWithdrawals(
      client,
      { ...inputs, inflateWithdrawalToRetirement: false },
      defaultPortfolio,
      settings,
      [],
    );
    expect(nomCorridor.basis).toBe("nominal");
    expect(nomCorridor.scenarios.typical.totalMonthlyNominalAtRetirement).toBe(
      nomCorridor.scenarios.typical.totalMonthly,
    );
    expect(corridor.basis).toBe("real");
  });

  test("reproduzierbar bei fixem Seed", () => {
    const again = computeCorridorWithdrawals(client, inputs, defaultPortfolio, settings, []);
    expect(again.scenarios.typical.totalMonthly).toBe(corridor.scenarios.typical.totalMonthly);
    expect(again.scenarios.difficult.totalMonthly).toBe(corridor.scenarios.difficult.totalMonthly);
    expect(again.scenarios.favorable.totalMonthly).toBe(corridor.scenarios.favorable.totalMonthly);
  });
});

describe("rankAgainstCorridor — Einordnung ohne Zusatz-Schwellen (CR 10)", () => {
  test("unter schwierig / im Korridor / über günstig — exakt an den Grenzen", () => {
    const d = corridor.scenarios.difficult.fromWealthMonthly;
    const f = corridor.scenarios.favorable.fromWealthMonthly;
    expect(rankAgainstCorridor(d, corridor)).toBe("below_difficult");
    expect(rankAgainstCorridor(d + 1, corridor)).toBe("within_corridor");
    expect(rankAgainstCorridor(f, corridor)).toBe("within_corridor");
    expect(rankAgainstCorridor(f + 1, corridor)).toBe("above_favorable");
  });
});
