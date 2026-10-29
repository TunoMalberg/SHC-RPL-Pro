/**
 * Einzelpfad in heutiger Kaufkraft: gleiche Basis wie das Fächerdiagramm.
 */

import { describe, expect, test } from "bun:test";
import { defaultClient, defaultInputs, defaultPortfolio, defaultSettings } from "./defaults";
import { runDetailedSingleSimulation, runMonteCarloSimulation } from "./engine/montecarlo";
import { deflateTrace } from "./traceValuation";

const settings = { ...defaultSettings, numSimulations: 300, timeStepMonths: 12, randomSeed: 11 };
const inputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3_000 };

describe("Einzelpfad in heutiger Kaufkraft", () => {
  const trace = runDetailedSingleSimulation(defaultClient, inputs, defaultPortfolio, settings, 3, []);
  const real = deflateTrace(trace);

  test("Beträge je Jahr durch die aufgelaufene Inflation geteilt, Prozente unverändert", () => {
    const i = 20;
    const n = trace.rows[i];
    const r = real.rows[i];
    expect(r.endTotal).toBeCloseTo(n.endTotal / n.cumulativeInflation, 6);
    expect(r.cashflow).toBeCloseTo(n.cashflow / n.cumulativeInflation, 6);
    expect(r.returnEquitiesPct).toBe(n.returnEquitiesPct);
    expect(r.age).toBe(n.age);
  });

  test("Endvermögen = Monte-Carlo-Pfad gleicher Nummer × Deflator des Fächerdiagramms", () => {
    const mc = runMonteCarloSimulation(defaultClient, inputs, defaultPortfolio, settings, []);
    const deflators = mc.valuation?.deflators ?? [];
    const best = deflateTrace(
      runDetailedSingleSimulation(defaultClient, inputs, defaultPortfolio, settings, mc.bestSimIndex ?? 0, []),
    );
    const end = mc.bestPath.length - 1;
    expect(best.finalWealth).toBeCloseTo(mc.bestPath[end] * deflators[end], 0);
  });

  test("Text „Entnahme X − Pension Y“ in heutiger Kaufkraft", () => {
    const row = trace.rows.find((r) => r.cashflowLabel.includes("Pension"));
    if (!row) return;
    const realRow = real.rows[trace.rows.indexOf(row)];
    const [w] = row.cashflowLabel.match(/\d+/g) ?? ["0"];
    expect(realRow.cashflowLabel).toContain(String(Math.round(Number(w) / row.cumulativeInflation)));
  });
});
