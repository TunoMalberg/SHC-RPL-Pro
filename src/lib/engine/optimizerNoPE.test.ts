/**
 * Optimierung mit/ohne Private Equity (Schulungsvideo 10/2026):
 * includePE = false → nur Liquidität, Anleihen, Aktien; PE-Quote immer 0 %.
 */

import { describe, expect, test } from "bun:test";
import { defaultClient, defaultInputs, defaultPortfolio, defaultSettings } from "../defaults";
import { optimizePortfolio } from "./optimizer";

const inputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3_000 };
const settings = { ...defaultSettings, numSimulations: 200, randomSeed: 4711 };
const fast = { pathsPhase12: 60, pathsPhase3: 120, reEvalTopN: 3, refinementTopN: 2 };

describe("Optimierung: Private Equity einbeziehen ja/nein", () => {
  test("ausgeschaltet: keine Allokation mit PE-Anteil", () => {
    const r = optimizePortfolio(defaultClient, inputs, defaultPortfolio, settings, [], { ...fast, includePE: false });
    expect(r.ranked.length).toBeGreaterThan(10);
    expect(r.ranked.every((a) => a.pe === 0)).toBe(true);
  });

  test("eingeschaltet (Standard): PE-Stufen werden geprüft", () => {
    const r = optimizePortfolio(defaultClient, inputs, defaultPortfolio, settings, [], fast);
    expect(r.ranked.some((a) => a.pe > 0)).toBe(true);
  });
});
