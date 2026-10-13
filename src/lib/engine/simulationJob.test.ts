/**
 * Hintergrundrechnung (Paket 4): der gebündelte Lauf liefert exakt dieselben
 * Ergebnisse wie die Einzelbausteine — der Umzug in den Web Worker ändert
 * keine Zahl.
 */

import { describe, expect, test } from "bun:test";
import { REFERENCE_CASES } from "./golden/referenceCases";
import { runHistoricalBacktest } from "./historical";
import { runPlanSimulation } from "./planRun";
import { computeCorridorWithdrawals } from "./corridor";
import { runSimulationJob, type SimulationProgress } from "./simulationJob";

const standard = REFERENCE_CASES.find((c) => c.id === "standard");
if (!standard) throw new Error("Referenzfall fehlt");
const req = {
  client: standard.client,
  inputs: standard.inputs,
  portfolio: standard.portfolio,
  settings: { ...standard.settings, numSimulations: 300 },
  liquidityEvents: standard.liquidityEvents,
};

describe("Simulationslauf im Hintergrund", () => {
  test("Einzellauf: gleiche Zahlen wie die Bausteine, mit Fortschritt", () => {
    const steps: SimulationProgress[] = [];
    const job = runSimulationJob(req, (p) => steps.push(p));
    if (job.kind !== "single") throw new Error("Einzellauf erwartet");

    const corridor = computeCorridorWithdrawals(req.client, req.inputs, req.portfolio, req.settings, req.liquidityEvents);
    const { result, effectiveInputs } = runPlanSimulation(
      req.client, req.inputs, req.portfolio, req.settings, req.liquidityEvents, { corridor },
    );
    expect(job.result.successRate).toBe(result.successRate);
    expect(job.result.medianFinalWealth).toBe(result.medianFinalWealth);
    expect(job.result.corridor?.scenarios.typical.totalMonthly).toBe(corridor.scenarios.typical.totalMonthly);
    expect(job.result.calculationTrace).toBeDefined();
    expect(job.result.configHash).toBeDefined();
    expect(job.historical.medianFinalWealth).toBe(
      runHistoricalBacktest(req.client, effectiveInputs, req.portfolio, req.liquidityEvents).medianFinalWealth,
    );
    expect(steps.map((s) => s.step)).toEqual(["corridor", "main", "heatmap", "historical"]);
    expect(steps.every((s, i) => i === 0 || s.pct >= steps[i - 1].pct)).toBe(true);
  });

  test("MiFID-Szenariovergleich: vier Varianten, Hauptergebnis markiert", () => {
    const job = runSimulationJob({ ...req, settings: { ...req.settings, mode: "scenario_comparison" } });
    if (job.kind !== "multirun") throw new Error("Multirun erwartet");
    expect(job.variants.map((v) => v.profile)).toEqual(["conservative", "balanced", "growth", "speculative"]);
    expect(job.variants[job.mainIndex].result.configHash).toBeDefined();
    expect(job.historical.scenarios.length).toBeGreaterThan(0);
  });

  test("Ergebnis ist übertragbar (strukturierte Kopie wie beim Worker)", () => {
    const job = runSimulationJob(req);
    const copy = structuredClone(job);
    expect(copy).toEqual(job);
  });
});
