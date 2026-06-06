/**
 * Tests für validation.ts.
 * Aufruf: `bun test src/lib/validation.test.ts`
 */

import { describe, expect, test } from "bun:test";
import {
  clamp,
  round,
  validateClient,
  validateInputs,
  validatePortfolio,
  validateLiquidityEvents,
  validateBacktestBody,
  validatePlanInputs,
} from "./validation";
import { defaultClient, defaultInputs, defaultPortfolio } from "./defaults";

describe("clamp / round", () => {
  test("clamp begrenzt korrekt", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
  test("clamp ersetzt NaN durch fallback (default = min)", () => {
    expect(clamp(Number.NaN, 0, 10)).toBe(0);
    expect(clamp(Number.NaN, 0, 10, 7)).toBe(7);
    expect(clamp(Number.POSITIVE_INFINITY, 0, 10)).toBe(10);
  });
  test("round respektiert Nachkommastellen", () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(1.23556, 2)).toBe(1.24);
    expect(round(Number.NaN)).toBe(0);
  });
});

describe("validateClient", () => {
  test("Default-Profil ist gültig", () => {
    const r = validateClient(defaultClient);
    expect(r.ok).toBe(true);
    expect(r.errors.filter((e) => e.severity === "error").length).toBe(0);
  });
  test("Rentenalter < aktuelles Alter → Fehler", () => {
    const r = validateClient({ ...defaultClient, currentAge: 60, retirementAge: 50 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === "client.retirementAge")).toBe(true);
  });
  test("Lebenserwartung ≤ Rentenalter → Fehler", () => {
    const r = validateClient({ ...defaultClient, retirementAge: 65, lifeExpectancy: 65 });
    expect(r.ok).toBe(false);
  });
  test("Aktuelles Alter 17 → Fehler", () => {
    const r = validateClient({ ...defaultClient, currentAge: 17 });
    expect(r.ok).toBe(false);
  });
});

describe("validateInputs", () => {
  test("Default-Eingaben sind gültig", () => {
    const r = validateInputs(defaultInputs, defaultClient);
    expect(r.ok).toBe(true);
  });
  test("Negative Sparrate → Fehler", () => {
    const r = validateInputs({ ...defaultInputs, monthlySavings: -100 }, defaultClient);
    expect(r.ok).toBe(false);
  });
  test("Inflationsrate 30 % → Fehler", () => {
    const r = validateInputs({ ...defaultInputs, inflationRate: 30 }, defaultClient);
    expect(r.ok).toBe(false);
  });
  test("Pensionsbeginn nach Lebenserwartung → Warnung, nicht Fehler", () => {
    const r = validateInputs({ ...defaultInputs, pensionStartAge: 95 }, { ...defaultClient, lifeExpectancy: 90 });
    expect(r.ok).toBe(false); // pensionStartAge ist auch im Bereich 30-90 → ohnehin Fehler
    // Mit erlaubtem pensionStartAge:
    const r2 = validateInputs({ ...defaultInputs, pensionStartAge: 89 }, { ...defaultClient, lifeExpectancy: 80 });
    expect(r2.errors.some((e) => e.severity === "warn" && e.path === "inputs.pensionStartAge")).toBe(true);
  });
});

describe("validatePortfolio", () => {
  test("Default-Portfolio ist gültig", () => {
    const r = validatePortfolio(defaultPortfolio);
    expect(r.ok).toBe(true);
  });
  test("Allokationen ≠ 100 % → Fehler", () => {
    const broken = JSON.parse(JSON.stringify(defaultPortfolio));
    broken.buckets[0].allocation = 20;
    broken.buckets[1].allocation = 30;
    broken.buckets[2].allocation = 40; // Summe = 90
    const r = validatePortfolio(broken);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes("100 %"))).toBe(true);
  });
  test("Korrelations-Diagonale ≠ 1 → Fehler", () => {
    const broken = JSON.parse(JSON.stringify(defaultPortfolio));
    broken.correlationMatrix[0][0] = 0.5;
    const r = validatePortfolio(broken);
    expect(r.ok).toBe(false);
  });
  test("Korrelation außerhalb [-1, 1] → Fehler", () => {
    const broken = JSON.parse(JSON.stringify(defaultPortfolio));
    broken.correlationMatrix[0][1] = 1.5;
    const r = validatePortfolio(broken);
    expect(r.ok).toBe(false);
  });
  test("KESt 70 % → Fehler", () => {
    const broken = { ...defaultPortfolio, kestRate: 70 };
    const r = validatePortfolio(broken);
    expect(r.ok).toBe(false);
  });
});

describe("validateLiquidityEvents", () => {
  test("Leeres Array ist gültig", () => {
    expect(validateLiquidityEvents([], defaultClient).ok).toBe(true);
  });
  test("NaN amount → Fehler", () => {
    const r = validateLiquidityEvents(
      [{ id: "1", age: 70, description: "x", amount: Number.NaN }],
      defaultClient,
    );
    expect(r.ok).toBe(false);
  });
  test("Alter vor aktuellem Alter → Warnung, kein Fehler", () => {
    const r = validateLiquidityEvents(
      [{ id: "1", age: 30, description: "x", amount: 1000 }],
      defaultClient,
    );
    expect(r.ok).toBe(true); // nur Warnung
    expect(r.errors.some((e) => e.severity === "warn")).toBe(true);
  });
});

describe("validateBacktestBody", () => {
  test("null → Fehler", () => {
    expect(validateBacktestBody(null).ok).toBe(false);
  });
  test("Leeres holdings-Array → Fehler", () => {
    expect(validateBacktestBody({ holdings: [] }).ok).toBe(false);
  });
  test("> 200 Positionen → Fehler", () => {
    const arr = Array.from({ length: 201 }, (_, i) => ({ id: String(i) }));
    expect(validateBacktestBody({ holdings: arr }).ok).toBe(false);
  });
  test("Ungültiges from-Format → Fehler", () => {
    expect(validateBacktestBody({ holdings: [{ id: "1" }], from: "20-01-01" }).ok).toBe(false);
  });
  test("1 Holding ohne from → ok", () => {
    expect(validateBacktestBody({ holdings: [{ id: "1" }] }).ok).toBe(true);
  });
});

describe("validatePlanInputs — Aggregator", () => {
  test("Defaults zusammen → ok", () => {
    const r = validatePlanInputs(defaultClient, defaultInputs, defaultPortfolio, []);
    expect(r.ok).toBe(true);
  });
  test("Aggregiert Fehler aus allen Slices", () => {
    const brokenPortfolio = JSON.parse(JSON.stringify(defaultPortfolio));
    brokenPortfolio.buckets[0].allocation = 0;
    brokenPortfolio.buckets[1].allocation = 0;
    brokenPortfolio.buckets[2].allocation = 0;
    const r = validatePlanInputs(
      { ...defaultClient, currentAge: 80, retirementAge: 65 }, // Konflikt
      { ...defaultInputs, monthlySavings: -1 }, // negative Sparrate
      brokenPortfolio,
      [],
    );
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});