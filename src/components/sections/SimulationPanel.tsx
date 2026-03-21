"use client";

import { useState, useCallback } from "react";
import { useAppState } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  runMonteCarloSimulation,
  findSustainableWithdrawal,
  findRequiredCapital,
  findRequiredSavingsRate,
  generateWithdrawalHeatmap,
} from "@/lib/engine/montecarlo";
import { runHistoricalBacktest } from "@/lib/engine/historical";
import type { SimulationMode } from "@/lib/types";
import { fmtEur } from "@/lib/format";

export function SimulationPanel() {
  const { state, dispatch } = useAppState();
  const { settings, client, inputs, portfolio, liquidityEvents } = state;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  const runSimulation = useCallback(async () => {
    setRunning(true);
    setProgress("Monte-Carlo-Simulation wird ausgeführt...");

    await new Promise((r) => setTimeout(r, 50));

    try {
      const result = runMonteCarloSimulation(client, inputs, portfolio, settings, liquidityEvents);

      if (settings.mode === "sustainable_withdrawal") {
        setProgress("Nachhaltige Entnahmerate wird ermittelt...");
        await new Promise((r) => setTimeout(r, 20));
        result.sustainableWithdrawal = findSustainableWithdrawal(
          client, inputs, portfolio, settings, 95, liquidityEvents
        );
      }

      if (settings.mode === "required_capital") {
        setProgress("Erforderliches Kapital wird ermittelt...");
        await new Promise((r) => setTimeout(r, 20));
        result.requiredCapital = findRequiredCapital(
          client, inputs, portfolio, settings, 95, liquidityEvents
        );
      }

      if (settings.mode === "required_savings") {
        setProgress("Erforderliche Sparrate wird ermittelt...");
        await new Promise((r) => setTimeout(r, 20));
        result.requiredSavings = findRequiredSavingsRate(
          client, inputs, portfolio, settings, 95, liquidityEvents
        );
      }

      setProgress("Entnahme-Heatmap wird erstellt...");
      await new Promise((r) => setTimeout(r, 20));
      result.withdrawalHeatmap = generateWithdrawalHeatmap(
        client, inputs, portfolio, settings, liquidityEvents
      );

      dispatch({ type: "SET_RESULT", payload: result });

      setProgress("Historischer Backtest wird durchgeführt...");
      await new Promise((r) => setTimeout(r, 20));
      const historicalResult = runHistoricalBacktest(client, inputs, portfolio, liquidityEvents);
      dispatch({ type: "SET_HISTORICAL", payload: historicalResult });

      setProgress("Abgeschlossen!");
      dispatch({ type: "SET_TAB", payload: "results" });
    } catch (err) {
      setProgress(`Fehler: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`);
    } finally {
      setRunning(false);
    }
  }, [client, inputs, portfolio, settings, liquidityEvents, dispatch]);

  return (
    <div className="space-y-6" data-design-id="simulation-panel-section">
      <div data-design-id="simulation-panel-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="simulation-panel-title">Simulationseinstellungen</h2>
        <p className="text-slate-500 mt-1" data-design-id="simulation-panel-subtitle">
          Konfigurieren und starten Sie die Monte-Carlo-Simulationsengine.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-design-id="sim-config-card">
          <CardHeader>
            <CardTitle className="text-lg" data-design-id="sim-config-title">Simulationskonfiguration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="sim-mode-field">
              <Label>Simulationsmodus</Label>
              <Select
                value={settings.mode}
                onValueChange={(v) =>
                  dispatch({
                    type: "SET_SETTINGS",
                    payload: { mode: v as SimulationMode },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_withdrawal">
                    Feste Entnahme → Erfolgswahrscheinlichkeit
                  </SelectItem>
                  <SelectItem value="sustainable_withdrawal">
                    Nachhaltige Entnahmerate ermitteln
                  </SelectItem>
                  <SelectItem value="required_capital">
                    Erforderliches Kapital ermitteln
                  </SelectItem>
                  <SelectItem value="required_savings">
                    Erforderliche Sparrate ermitteln
                  </SelectItem>
                  <SelectItem value="scenario_comparison">
                    Szenariovergleich
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">
                {settings.mode === "fixed_withdrawal" &&
                  "Berechne die Erfolgswahrscheinlichkeit für Ihre geplante Entnahme."}
                {settings.mode === "sustainable_withdrawal" &&
                  "Ermittle die maximale Entnahme mit ≥95% Erfolg."}
                {settings.mode === "required_capital" &&
                  "Ermittle das benötigte Kapital für Ihre Entnahme mit ≥95% Erfolg."}
                {settings.mode === "required_savings" &&
                  "Ermittle die monatliche Sparrate für Ihre Entnahme mit ≥95% Erfolg."}
                {settings.mode === "scenario_comparison" &&
                  "Vergleichen Sie mehrere Szenarien nebeneinander."}
              </p>
            </div>

            <div data-design-id="sim-count-field">
              <Label>Anzahl Simulationen: {settings.numSimulations.toLocaleString()}</Label>
              <Slider
                value={[settings.numSimulations]}
                onValueChange={([val]) =>
                  dispatch({ type: "SET_SETTINGS", payload: { numSimulations: val } })
                }
                min={1000}
                max={10000}
                step={1000}
              />
              <div className="flex justify-between text-xs text-slate-400">
                <span>1.000 (schnell)</span>
                <span>10.000 (genau)</span>
              </div>
            </div>

            <div data-design-id="sim-timestep-field">
              <Label>Zeitschritt</Label>
              <Select
                value={String(settings.timeStepMonths)}
                onValueChange={(v) =>
                  dispatch({
                    type: "SET_SETTINGS",
                    payload: { timeStepMonths: parseInt(v) },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12">Jährlich (schneller)</SelectItem>
                  <SelectItem value="1">Monatlich (präziser)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div data-design-id="sim-seed-field">
              <Label htmlFor="seed">Zufallsseed (optional)</Label>
              <Input
                id="seed"
                type="number"
                value={settings.randomSeed ?? ""}
                onChange={(e) =>
                  dispatch({
                    type: "SET_SETTINGS",
                    payload: {
                      randomSeed: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    },
                  })
                }
                placeholder="Leer lassen für zufällig"
              />
            </div>
          </CardContent>
        </Card>

        <Card data-design-id="sim-summary-card">
          <CardHeader>
            <CardTitle className="text-lg" data-design-id="sim-summary-title">Planübersicht</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3" data-design-id="summary-acc-phase">
                <div className="text-xs text-slate-500">Ansparphase</div>
                <div className="text-lg font-bold text-[#D31220]">
                  {client.retirementAge - client.currentAge} Jahre
                </div>
                <div className="text-xs text-slate-400">
                  Alter {client.currentAge} → {client.retirementAge}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3" data-design-id="summary-dec-phase">
                <div className="text-xs text-slate-500">Entnahmephase</div>
                <div className="text-lg font-bold text-rose-600">
                  {client.lifeExpectancy - client.retirementAge} Jahre
                </div>
                <div className="text-xs text-slate-400">
                  Alter {client.retirementAge} → {client.lifeExpectancy}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3" data-design-id="summary-start-capital">
                <div className="text-xs text-slate-500">Startkapital</div>
                <div className="text-lg font-bold text-[#5a8a50]">
                  {fmtEur(inputs.initialCapital)}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3" data-design-id="summary-monthly-need">
                <div className="text-xs text-slate-500">Monatlicher Bedarf</div>
                <div className="text-lg font-bold text-[#FAC075]">
                  {fmtEur(inputs.desiredMonthlyWithdrawal - inputs.monthlyPension)}
                </div>
                <div className="text-xs text-slate-400">Nach Pension</div>
              </div>
            </div>

            {liquidityEvents.length > 0 && (
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-100" data-design-id="summary-liquidity-events">
                <div className="text-xs text-[#8A83BE] font-medium">
                  {liquidityEvents.length} Liquiditätsereignis{liquidityEvents.length > 1 ? "se" : ""} berücksichtigt
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Netto: {fmtEur(liquidityEvents.reduce((s, e) => s + e.amount, 0))}
                </div>
              </div>
            )}

            <Button
              onClick={runSimulation}
              disabled={running}
              className="w-full h-14 text-lg font-semibold bg-[#D31220] hover:bg-[#a80e19]"
              data-design-id="run-simulation-button"
            >
              {running ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⟳</span>
                  {progress}
                </span>
              ) : (
                "▶  Simulation starten"
              )}
            </Button>

            {!running && progress && (
              <p className="text-sm text-center text-[#5a8a50] font-medium" data-design-id="sim-status">
                {progress}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}