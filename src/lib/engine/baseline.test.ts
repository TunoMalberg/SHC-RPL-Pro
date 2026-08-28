/**
 * Tests der Baseline „Nicht investieren" (CR 12/17): deterministische
 * 0 %-Projektion, binäre Zielerreichung, Liquiditätsereignisse,
 * real positiver Liquiditätsertrag bei negativer Inflation.
 */
import { describe, expect, test } from "bun:test";
import type { FinancialInputs, ClientProfile } from "../types";
import { defaultClient, defaultInputs } from "../defaults";
import {
  findBaselineSustainableWithdrawal,
  runNoInvestProjection,
} from "./baseline";

const client: ClientProfile = { ...defaultClient }; // 45 → 65 → 90
const inputs: FinancialInputs = {
  ...defaultInputs,
  desiredMonthlyWithdrawal: 3000,
  monthlyPension: 1200,
};

describe("runNoInvestProjection — 0 % nominal, deterministisch", () => {
  test("Ansparphase exakt: 0 % Zins, Sparrate inflationsindexiert", () => {
    const flat: FinancialInputs = {
      ...inputs,
      useRealValues: false,
      annualSavingsIncrease: 0,
      inflationRate: 0,
      desiredMonthlyWithdrawal: 0,
    };
    const r = runNoInvestProjection(client, flat, []);
    // Ohne Zins, ohne Inflation, ohne Entnahme: Endwert = Start + Sparraten.
    const accYears = client.retirementAge - client.currentAge;
    expect(r.pathNominal[accYears]).toBeCloseTo(
      flat.initialCapital + flat.monthlySavings * 12 * accYears,
      6,
    );
    // Entnahme 0 → nie erschöpft, Pfadwert bleibt konstant nach Pension.
    expect(r.depletionAge).toBeNull();
  });

  test("binäre Zielerreichung: goalReached true/false, null ohne Wunsch", () => {
    const rich = runNoInvestProjection(
      client,
      { ...inputs, initialCapital: 5_000_000 },
      [],
    );
    expect(rich.goalReached).toBe(true);
    expect(rich.depletionAge).toBeNull();

    const poor = runNoInvestProjection(
      client,
      { ...inputs, initialCapital: 10_000, monthlySavings: 0 },
      [],
    );
    expect(poor.goalReached).toBe(false);
    expect(poor.depletionAge).not.toBeNull();
    expect(poor.depletionAge!).toBeGreaterThanOrEqual(client.retirementAge);

    const noWish = runNoInvestProjection(
      client,
      { ...inputs, desiredMonthlyWithdrawal: null },
      [],
    );
    expect(noWish.goalReached).toBeNull();
  });

  test("negative Inflation → real positiver Liquiditätsertrag (CR-Test 20)", () => {
    const deflation: FinancialInputs = {
      ...inputs,
      inflationRate: -1,
      desiredMonthlyWithdrawal: 0,
      monthlySavings: 0,
      useRealValues: false,
    };
    const r = runNoInvestProjection(client, deflation, []);
    // Nominal konstant (0 % Zins, keine Cashflows) …
    expect(r.finalWealthNominal).toBeCloseTo(deflation.initialCapital, 6);
    // … aber real WÄCHST das Vermögen (Deflation → Kaufkraftgewinn).
    expect(r.finalWealthReal).toBeGreaterThan(r.finalWealthNominal);
  });

  test("positive Inflation → realer Endwert < nominaler Endwert", () => {
    const r = runNoInvestProjection(client, { ...inputs, initialCapital: 2_000_000 }, []);
    expect(r.finalWealthReal).toBeLessThan(r.finalWealthNominal);
    // Deflationierung exakt: real = nominal × (1+i)^(−Jahre).
    const years = r.pathNominal.length - 1;
    expect(r.finalWealthReal).toBeCloseTo(
      r.finalWealthNominal * Math.pow(1 + inputs.inflationRate / 100, -years),
      6,
    );
  });

  test("Liquiditätsereignisse wirken (Crossing-Semantik, Einnahme + Ausgabe)", () => {
    const base = runNoInvestProjection(client, { ...inputs, desiredMonthlyWithdrawal: 0 }, []);
    const withEvents = runNoInvestProjection(
      client,
      { ...inputs, desiredMonthlyWithdrawal: 0 },
      [
        { id: "inc", age: client.currentAge + 5, description: "Erbschaft", amount: 100_000 },
        { id: "exp", age: client.currentAge + 10, description: "Renovierung", amount: -40_000 },
      ],
    );
    expect(withEvents.finalWealthNominal).toBeCloseTo(
      base.finalWealthNominal + 60_000,
      6,
    );
  });
});

describe("findBaselineSustainableWithdrawal — deterministische Bisektion", () => {
  test("Ergebnis trägt bis zum Horizont, +10 % nicht mehr", () => {
    const sustainable = findBaselineSustainableWithdrawal(client, inputs, []);
    expect(sustainable).toBeGreaterThan(0);

    const at = runNoInvestProjection(
      client,
      { ...inputs, desiredMonthlyWithdrawal: sustainable },
      [],
    );
    expect(at.goalReached).toBe(true);

    const above = runNoInvestProjection(
      client,
      { ...inputs, desiredMonthlyWithdrawal: Math.ceil(sustainable * 1.1) },
      [],
    );
    expect(above.goalReached).toBe(false);
  });

  test("mehr Kapital → höhere mögliche Entnahme (Monotonie)", () => {
    const lo = findBaselineSustainableWithdrawal(client, { ...inputs, initialCapital: 100_000 }, []);
    const hi = findBaselineSustainableWithdrawal(client, { ...inputs, initialCapital: 1_000_000 }, []);
    expect(hi).toBeGreaterThan(lo);
  });
});
