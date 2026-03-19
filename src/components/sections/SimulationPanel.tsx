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
  const { settings, client, inputs, portfolio } = state;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  const runSimulation = useCallback(async () => {
    setRunning(true);
    setProgress("Running Monte Carlo simulation...");

    await new Promise((r) => setTimeout(r, 50));

    try {
      const result = runMonteCarloSimulation(client, inputs, portfolio, settings);

      if (settings.mode === "sustainable_withdrawal") {
        setProgress("Finding sustainable withdrawal rate...");
        await new Promise((r) => setTimeout(r, 20));
        result.sustainableWithdrawal = findSustainableWithdrawal(
          client, inputs, portfolio, settings
        );
      }

      if (settings.mode === "required_capital") {
        setProgress("Finding required capital...");
        await new Promise((r) => setTimeout(r, 20));
        result.requiredCapital = findRequiredCapital(
          client, inputs, portfolio, settings
        );
      }

      if (settings.mode === "required_savings") {
        setProgress("Finding required savings rate...");
        await new Promise((r) => setTimeout(r, 20));
        result.requiredSavings = findRequiredSavingsRate(
          client, inputs, portfolio, settings
        );
      }

      setProgress("Generating withdrawal heatmap...");
      await new Promise((r) => setTimeout(r, 20));
      result.withdrawalHeatmap = generateWithdrawalHeatmap(
        client, inputs, portfolio, settings
      );

      dispatch({ type: "SET_RESULT", payload: result });

      setProgress("Running historical backtest...");
      await new Promise((r) => setTimeout(r, 20));
      const historicalResult = runHistoricalBacktest(client, inputs, portfolio);
      dispatch({ type: "SET_HISTORICAL", payload: historicalResult });

      setProgress("Complete!");
      dispatch({ type: "SET_TAB", payload: "results" });
    } catch (err) {
      setProgress(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  }, [client, inputs, portfolio, settings, dispatch]);

  return (
    <div className="space-y-6" data-design-id="simulation-panel-section">
      <div data-design-id="simulation-panel-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="simulation-panel-title">Simulation Settings</h2>
        <p className="text-slate-500 mt-1" data-design-id="simulation-panel-subtitle">
          Configure and run the Monte Carlo simulation engine.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-design-id="sim-config-card">
          <CardHeader>
            <CardTitle className="text-lg" data-design-id="sim-config-title">Simulation Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="sim-mode-field">
              <Label>Simulation Mode</Label>
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
                    Fixed Withdrawal → Success Probability
                  </SelectItem>
                  <SelectItem value="sustainable_withdrawal">
                    Find Sustainable Withdrawal Rate
                  </SelectItem>
                  <SelectItem value="required_capital">
                    Find Required Capital
                  </SelectItem>
                  <SelectItem value="required_savings">
                    Find Required Savings Rate
                  </SelectItem>
                  <SelectItem value="scenario_comparison">
                    Scenario Comparison
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">
                {settings.mode === "fixed_withdrawal" &&
                  "Compute success probability for your planned withdrawal."}
                {settings.mode === "sustainable_withdrawal" &&
                  "Find the maximum withdrawal with ≥95% success."}
                {settings.mode === "required_capital" &&
                  "Find the capital needed for your withdrawal with ≥95% success."}
                {settings.mode === "required_savings" &&
                  "Find the monthly savings needed for your withdrawal with ≥95% success."}
                {settings.mode === "scenario_comparison" &&
                  "Compare multiple scenarios side by side."}
              </p>
            </div>

            <div data-design-id="sim-count-field">
              <Label>Number of Simulations: {settings.numSimulations.toLocaleString()}</Label>
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
                <span>1,000 (fast)</span>
                <span>10,000 (accurate)</span>
              </div>
            </div>

            <div data-design-id="sim-timestep-field">
              <Label>Time Step</Label>
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
                  <SelectItem value="12">Annual (faster)</SelectItem>
                  <SelectItem value="1">Monthly (more precise)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div data-design-id="sim-seed-field">
              <Label htmlFor="seed">Random Seed (optional)</Label>
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
                placeholder="Leave empty for random"
              />
            </div>
          </CardContent>
        </Card>

        <Card data-design-id="sim-summary-card">
          <CardHeader>
            <CardTitle className="text-lg" data-design-id="sim-summary-title">Plan Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3" data-design-id="summary-acc-phase">
                <div className="text-xs text-slate-500">Accumulation Phase</div>
                <div className="text-lg font-bold text-indigo-600">
                  {client.retirementAge - client.currentAge} years
                </div>
                <div className="text-xs text-slate-400">
                  Age {client.currentAge} → {client.retirementAge}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3" data-design-id="summary-dec-phase">
                <div className="text-xs text-slate-500">Decumulation Phase</div>
                <div className="text-lg font-bold text-rose-600">
                  {client.lifeExpectancy - client.retirementAge} years
                </div>
                <div className="text-xs text-slate-400">
                  Age {client.retirementAge} → {client.lifeExpectancy}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3" data-design-id="summary-start-capital">
                <div className="text-xs text-slate-500">Starting Capital</div>
                <div className="text-lg font-bold text-emerald-600">
                  {fmtEur(inputs.initialCapital)}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3" data-design-id="summary-monthly-need">
                <div className="text-xs text-slate-500">Monthly Need</div>
                <div className="text-lg font-bold text-amber-600">
                  {fmtEur(inputs.desiredMonthlyWithdrawal - inputs.monthlyPension)}
                </div>
                <div className="text-xs text-slate-400">After pension</div>
              </div>
            </div>

            <Button
              onClick={runSimulation}
              disabled={running}
              className="w-full h-14 text-lg font-semibold bg-indigo-600 hover:bg-indigo-700"
              data-design-id="run-simulation-button"
            >
              {running ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⟳</span>
                  {progress}
                </span>
              ) : (
                "▶  Run Simulation"
              )}
            </Button>

            {!running && progress && (
              <p className="text-sm text-center text-emerald-600 font-medium" data-design-id="sim-status">
                {progress}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}