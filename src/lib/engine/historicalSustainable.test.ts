/**
 * Historisch tragbare Entnahme je Startjahr: größter Betrag, mit dem das
 * Zeitfenster gerade nicht scheitert.
 */

import { describe, expect, test } from "bun:test";
import { defaultClient, defaultInputs, defaultPortfolio } from "../defaults";
import { runHistoricalBacktest } from "./historical";

const inputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3000 };

describe("Historisch tragbare Entnahme", () => {
  const h = runHistoricalBacktest(defaultClient, inputs, defaultPortfolio, []);

  test("je Startjahr ein Wert, Zusammenfassung = Minimum und Median", () => {
    const values = h.scenarios.map((s) => s.sustainableMonthly as number);
    expect(values.every((v) => v > 0)).toBe(true);
    expect(h.sustainableMonthlyWorst?.monthly).toBe(Math.min(...values));
    const sorted = [...values].sort((a, b) => a - b);
    const m = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
    expect(h.sustainableMonthlyMedian).toBe(median);
  });

  test("Grenze ist scharf: mit dem Wert hält das Startjahr, mit 50 € mehr nicht", () => {
    const worst = h.sustainableMonthlyWorst;
    if (!worst) throw new Error("keine tragbare Entnahme berechnet");
    const at = (monthly: number) =>
      runHistoricalBacktest(defaultClient, { ...inputs, desiredMonthlyWithdrawal: monthly }, defaultPortfolio, [])
        .scenarios.find((s) => s.startYear === worst.startYear);
    expect(at(worst.monthly)?.success).toBe(true);
    expect(at(worst.monthly + 50)?.success).toBe(false);
  });

  test("unabhängig vom eingegebenen Wunschbetrag", () => {
    const other = runHistoricalBacktest(
      defaultClient, { ...inputs, desiredMonthlyWithdrawal: 5000 }, defaultPortfolio, [],
    );
    expect(other.sustainableMonthlyWorst).toEqual(h.sustainableMonthlyWorst);
  });

  test("ohne Entnahmephase kein Wert", () => {
    const noWithdrawal = runHistoricalBacktest(
      { ...defaultClient, retirementAge: 80, lifeExpectancy: 80 }, inputs, defaultPortfolio, [],
    );
    expect(noWithdrawal.sustainableMonthlyWorst).toBeNull();
  });
});
