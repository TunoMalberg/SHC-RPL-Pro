/**
 * Regressionstest Perioden-/Flag-Konsistenz (CR 14):
 * Der historische Backtest muss die Entnahme-Inflation am Schalter
 * `inflateWithdrawalToRetirement` festmachen (wie die MC-Engine seit
 * Commit e967b66) — nicht mehr an `useRealValues` (steuert nur die
 * Sparphase).
 */
import { describe, expect, test } from "bun:test";
import type { FinancialInputs } from "../types";
import { defaultClient, defaultInputs, defaultPortfolio } from "../defaults";
import { runHistoricalBacktest } from "./historical";

const client = { ...defaultClient };
const inputs: FinancialInputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3000 };

describe("runHistoricalBacktest — Entnahme-Inflation (CR 14)", () => {
  test("inflateWithdrawalToRetirement OFF → höhere Endvermögen als ON", () => {
    // ON: Entnahmen wachsen mit realisiertem VPI → mehr Kapitalverzehr.
    const on = runHistoricalBacktest(
      client, { ...inputs, inflateWithdrawalToRetirement: true }, defaultPortfolio, [],
    );
    const off = runHistoricalBacktest(
      client, { ...inputs, inflateWithdrawalToRetirement: false }, defaultPortfolio, [],
    );
    expect(off.averageFinalWealth).toBeGreaterThan(on.averageFinalWealth);
  });

  test("useRealValues wirkt NICHT mehr auf die Entnahme (nur Sparphase)", () => {
    // Beide Läufe mit fixem Entnahme-Flag; useRealValues variiert nur die
    // Sparraten-Indexierung — bei monthlySavings = 0 identische Ergebnisse.
    const noSavings = { ...inputs, monthlySavings: 0, inflateWithdrawalToRetirement: true };
    const a = runHistoricalBacktest(client, { ...noSavings, useRealValues: true }, defaultPortfolio, []);
    const b = runHistoricalBacktest(client, { ...noSavings, useRealValues: false }, defaultPortfolio, []);
    expect(a.averageFinalWealth).toBeCloseTo(b.averageFinalWealth, 6);
    expect(a.overallSuccessRate).toBeCloseTo(b.overallSuccessRate, 10);
  });

  test("null-Wunsch → keine Entnahme, Backtest scheitert nie", () => {
    const r = runHistoricalBacktest(
      client, { ...inputs, desiredMonthlyWithdrawal: null }, defaultPortfolio, [],
    );
    expect(r.overallSuccessRate).toBe(100);
  });
});
