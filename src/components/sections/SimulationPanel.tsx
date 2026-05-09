"use client";

import { useState, useCallback } from "react";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStep, setProgressStep] = useState("");
  const [progressDone, setProgressDone] = useState("");

  const runSimulation = useCallback(async () => {
    setRunning(true);
    setProgressDone("");
    setProgressPct(5);
    setProgressStep(t("sim.progressStep1"));

    await new Promise((r) => setTimeout(r, 50));

    try {
      const result = runMonteCarloSimulation(client, inputs, portfolio, settings, liquidityEvents);
      setProgressPct(40);

      if (settings.mode === "sustainable_withdrawal") {
        setProgressStep(t("sim.progressStep2"));
        await new Promise((r) => setTimeout(r, 20));
        result.sustainableWithdrawal = findSustainableWithdrawal(
          client, inputs, portfolio, settings, 95, liquidityEvents
        );
        setProgressPct(55);
      }

      if (settings.mode === "required_capital") {
        setProgressStep(t("sim.progressStep3"));
        await new Promise((r) => setTimeout(r, 20));
        result.requiredCapital = findRequiredCapital(
          client, inputs, portfolio, settings, 95, liquidityEvents
        );
        setProgressPct(55);
      }

      if (settings.mode === "required_savings") {
        setProgressStep(t("sim.progressStep4"));
        await new Promise((r) => setTimeout(r, 20));
        result.requiredSavings = findRequiredSavingsRate(
          client, inputs, portfolio, settings, 95, liquidityEvents
        );
        setProgressPct(55);
      }

      setProgressStep(t("sim.progressStep5"));
      setProgressPct(65);
      await new Promise((r) => setTimeout(r, 20));
      result.withdrawalHeatmap = generateWithdrawalHeatmap(
        client, inputs, portfolio, settings, liquidityEvents
      );
      setProgressPct(80);

      dispatch({ type: "SET_RESULT", payload: result });

      setProgressStep(t("sim.progressStep6"));
      await new Promise((r) => setTimeout(r, 20));
      const historicalResult = runHistoricalBacktest(client, inputs, portfolio, liquidityEvents);
      dispatch({ type: "SET_HISTORICAL", payload: historicalResult });

      setProgressPct(100);
      setProgressStep("");
      setProgressDone(t("sim.progressDone"));
      dispatch({ type: "SET_TAB", payload: "results" });
    } catch (err) {
      setProgressStep(`${t("sim.progressError")}: ${err instanceof Error ? err.message : t("sim.unknownError")}`);
    } finally {
      setRunning(false);
    }
  }, [client, inputs, portfolio, settings, liquidityEvents, dispatch]);

  return (
    <div className="space-y-6" data-design-id="simulation-panel-section">
      <div data-design-id="simulation-panel-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="simulation-panel-title">{t("sim.title")}</h2>
        <p className="text-slate-500 mt-1" data-design-id="simulation-panel-subtitle">
          {t("sim.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-design-id="sim-config-card">
          <CardHeader>
            <CardTitle className="text-lg" data-design-id="sim-config-title">{t("sim.configTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="sim-mode-field">
              <Label>{t("sim.mode")}</Label>
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
                    {t("sim.modeFixedWithdrawal")}
                  </SelectItem>
                  <SelectItem value="sustainable_withdrawal">
                    {t("sim.modeSustainable")}
                  </SelectItem>
                  <SelectItem value="required_capital">
                    {t("sim.modeCapital")}
                  </SelectItem>
                  <SelectItem value="required_savings">
                    {t("sim.modeSavings")}
                  </SelectItem>
                  <SelectItem value="scenario_comparison">
                    {t("sim.modeScenario")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">
                {settings.mode === "fixed_withdrawal" &&
                  t("sim.modeFixedDesc")}
                {settings.mode === "sustainable_withdrawal" &&
                  t("sim.modeSustainableDesc")}
                {settings.mode === "required_capital" &&
                  t("sim.modeCapitalDesc")}
                {settings.mode === "required_savings" &&
                  t("sim.modeSavingsDesc")}
                {settings.mode === "scenario_comparison" &&
                  t("sim.modeScenarioDesc")}
              </p>
            </div>

            <div data-design-id="sim-count-field">
              <Label>{t("sim.numSims")}: {settings.numSimulations.toLocaleString()}</Label>
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
                <span>{t("sim.fast")}</span>
                <span>{t("sim.precise")}</span>
              </div>
            </div>

            <div data-design-id="sim-timestep-field">
              <Label>{t("sim.timeStep")}</Label>
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
                  <SelectItem value="12">{t("sim.annual")}</SelectItem>
                  <SelectItem value="1">{t("sim.monthly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div data-design-id="sim-seed-field">
              <Label htmlFor="seed">{t("sim.seed")}</Label>
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
                placeholder={t("sim.seedPlaceholder")}
              />
            </div>
          </CardContent>
        </Card>

        <Card data-design-id="sim-summary-card">
          <CardHeader>
            <CardTitle className="text-lg" data-design-id="sim-summary-title">{t("sim.summaryTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3" data-design-id="summary-acc-phase">
                <div className="text-xs text-slate-500">{t("sim.accPhase")}</div>
                <div className="text-lg font-bold text-[#D31220]">
                  {client.retirementAge - client.currentAge} {t("client.years")}
                </div>
                <div className="text-xs text-slate-400">
                  {t("sim.age")} {client.currentAge} → {client.retirementAge}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3" data-design-id="summary-dec-phase">
                <div className="text-xs text-slate-500">{t("sim.decPhase")}</div>
                <div className="text-lg font-bold text-rose-600">
                  {client.lifeExpectancy - client.retirementAge} {t("client.years")}
                </div>
                <div className="text-xs text-slate-400">
                  {t("sim.age")} {client.retirementAge} → {client.lifeExpectancy}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3" data-design-id="summary-start-capital">
                <div className="text-xs text-slate-500">{t("sim.startCapital")}</div>
                <div className="text-lg font-bold text-[#5a8a50]">
                  {fmtEur(inputs.initialCapital)}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3" data-design-id="summary-monthly-need">
                <div className="text-xs text-slate-500">{t("sim.monthlyNeed")}</div>
                <div className="text-lg font-bold text-[#FAC075]">
                  {fmtEur(inputs.desiredMonthlyWithdrawal - inputs.monthlyPension)}
                </div>
                <div className="text-xs text-slate-400">{t("sim.afterPension")}</div>
              </div>
            </div>

            {liquidityEvents.length > 0 && (
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-100" data-design-id="summary-liquidity-events">
                <div className="text-xs text-[#8A83BE] font-medium">
                  {liquidityEvents.length} {liquidityEvents.length > 1 ? t("sim.liquidityConsideredPlural") : t("sim.liquidityConsidered")}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {t("sim.net")}: {fmtEur(liquidityEvents.reduce((s, e) => s + e.amount, 0))}
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
                  <span className="animate-spin inline-block">⟳</span>
                  {t("sim.progressLabel").replace("{n}", settings.numSimulations.toLocaleString())}
                </span>
              ) : (
                t("sim.runButton")
              )}
            </Button>

            {running && (
              <div className="space-y-2" data-design-id="sim-progress">
                <Progress value={progressPct} className="h-3" />
                <div className="flex justify-between text-xs text-slate-500">
                  <span className="font-medium text-[#D31220]">{progressStep}</span>
                  <span className="font-bold">{progressPct}%</span>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {[
                    { label: "MC", pct: 40 },
                    { label: "SWR", pct: 55 },
                    { label: "Cap", pct: 60 },
                    { label: "Sav", pct: 65 },
                    { label: "Heat", pct: 80 },
                    { label: "Hist", pct: 100 },
                  ].map((step) => (
                    <div
                      key={step.label}
                      className={`h-1.5 rounded-full transition-colors ${progressPct >= step.pct ? "bg-[#D31220]" : "bg-slate-200"}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {!running && progressDone && (
              <p className="text-sm text-center text-[#5a8a50] font-medium" data-design-id="sim-status">
                ✓ {progressDone}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}