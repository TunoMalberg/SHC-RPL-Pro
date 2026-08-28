"use client";

import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";
import { fmtEur, fmtPct } from "@/lib/format";
import { runMonteCarloSimulation, generateWithdrawalHeatmap } from "@/lib/engine/montecarlo";
import type { Scenario } from "@/lib/types";
import { useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const SCENARIO_COLORS = ["#D31220", "#87BBE6", "#8FB687", "#FAC075", "#8A83BE", "#DA4D3E"];

export function ScenarioComparisonSection() {
  const { state, dispatch } = useAppState();
  const { scenarios, client, inputs, portfolio, settings } = state;
  const { t } = useI18n();
  const [scenarioName, setScenarioName] = useState("");

  const addScenario = () => {
    const name = scenarioName.trim() || `${t("scenarios.namePlaceholder")} ${scenarios.length + 1}`;
    const scenario: Scenario = {
      id: Date.now().toString(),
      name,
      inputs: { ...inputs },
      portfolio: { ...portfolio, buckets: [...portfolio.buckets] as typeof portfolio.buckets },
      source: "manual",
    };

    const result = runMonteCarloSimulation(client, scenario.inputs, scenario.portfolio, settings);
    result.withdrawalHeatmap = generateWithdrawalHeatmap(client, scenario.inputs, scenario.portfolio, settings);
    scenario.result = result;

    dispatch({ type: "ADD_SCENARIO", payload: scenario });
    setScenarioName("");
  };

  // FIX (2026-05-16): An exakten Jahresgrenzen samplen, damit das angezeigte
  // Alter im Monatlich-Step nicht verschoben wird.
  // Erweiterung (2026-05-22): pro Szenario zusätzlich zu Median (key = name)
  // auch p25 (`p25_<name>`) und p75 (`p75_<name>`) sowie das Tupel
  // `band_<name>` = [p25, p75] für die Recharts-Range-Area mitgeben.
  const comparisonData: Record<string, number | string | [number, number]>[] = [];

  if (scenarios.length > 0) {
    const totalYears = Math.max(1, client.lifeExpectancy - client.currentAge);
    const maxLen = Math.max(
      ...scenarios.filter((s) => s.result).map((s) => s.result!.medianPath.length),
    );
    const stepsPerYear = Math.max(1, Math.round((maxLen - 1) / totalYears));
    for (let y = 0; y <= totalYears; y++) {
      const i = Math.min(y * stepsPerYear, maxLen - 1);
      const point: Record<string, number | string | [number, number]> = {
        age: client.currentAge + y,
      };
      for (const s of scenarios) {
        if (s.result && i < s.result.medianPath.length) {
          const med = Math.round(s.result.medianPath[i]);
          const p25 = Math.round(s.result.p25Path?.[i] ?? med);
          const p75 = Math.round(s.result.p75Path?.[i] ?? med);
          point[s.name] = med;
          point[`p25_${s.name}`] = p25;
          point[`p75_${s.name}`] = p75;
          point[`band_${s.name}`] = [p25, p75];
        }
      }
      comparisonData.push(point);
    }
  }

  return (
    <div className="space-y-6" data-design-id="scenario-comparison-section">
      <div data-design-id="scenario-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="scenario-title">{t("scenarios.title")}</h2>
        <p className="text-slate-500 mt-1" data-design-id="scenario-subtitle">
          {t("scenarios.subtitle")}
        </p>
      </div>

      <Card data-design-id="add-scenario-card">
        <CardContent className="pt-6">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label htmlFor="scenarioName">{t("scenarios.name")}</Label>
              <Input
                id="scenarioName"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder={`${t("scenarios.namePlaceholder")} ${scenarios.length + 1}`}
              />
            </div>
            <Button onClick={addScenario} className="bg-[#D31220] hover:bg-[#a80e19]" data-design-id="add-scenario-button">
              + Aktuelle Einstellungen als Szenario speichern
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {t("scenarios.addHint")}
          </p>
        </CardContent>
      </Card>

      {scenarios.length === 0 ? (
        <EmptyState
          icon="🔀"
          title={t("empty.scenarios.title")}
          description={t("empty.scenarios.desc")}
          hint={t("empty.scenarios.hint")}
          ctaToSimulation={false}
          designId="no-scenarios"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-design-id="scenario-cards-grid">
            {scenarios.map((s, idx) => (
              <Card
                key={s.id}
                className="relative"
                style={{ borderColor: SCENARIO_COLORS[idx % SCENARIO_COLORS.length] }}
                data-design-id={`scenario-card-${idx}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base" style={{ color: SCENARIO_COLORS[idx % SCENARIO_COLORS.length] }}>
                      {s.name}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dispatch({ type: "REMOVE_SCENARIO", payload: s.id })}
                      className="text-slate-400 hover:text-rose-500 h-6 w-6 p-0"
                    >
                      ✕
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t("scenarios.capital")}</span>
                    <span className="font-medium">{fmtEur(s.inputs.initialCapital)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t("scenarios.savingsMonth")}</span>
                    <span className="font-medium">{fmtEur(s.inputs.monthlySavings)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t("scenarios.withdrawalMonth")}</span>
                    <span className="font-medium">{s.inputs.desiredMonthlyWithdrawal !== null ? fmtEur(s.inputs.desiredMonthlyWithdrawal) : "—"}</span>
                  </div>
                  {s.result && (
                    <>
                      <div className="pt-2 border-t mt-2">
                        <div className="flex justify-between">
                          <span className="text-slate-500">{t("scenarios.successRate")}</span>
                          <span className={`font-bold ${s.result.successRate >= 90 ? "text-[#5a8a50]" : s.result.successRate >= 70 ? "text-[#FAC075]" : "text-rose-600"}`}>
                            {fmtPct(s.result.successRate)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">{t("scenarios.medianWealth")}</span>
                          <span className="font-medium">{fmtEur(s.result.medianFinalWealth)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {comparisonData.length > 0 && (
            <Card data-design-id="scenario-comparison-chart-card">
              <CardHeader>
                <CardTitle data-design-id="scenario-comparison-chart-title">
                  {t("scenarios.comparisonChart")}
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1">{t("scenarios.comparisonChartSub")}</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={420}>
                  <ComposedChart data={comparisonData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="age"
                      tick={{ fontSize: 11 }}
                      label={{ value: t("results.ageAxis"), position: "insideBottom", offset: -5, fontSize: 12 }}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `€${(Number(v) / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value, name) => {
                        const label = String(name);
                        if (label.startsWith("p25_") || label.startsWith("p75_") || label.startsWith("band_")) {
                          // Range entries are surfaced as arrays — handled by range labels below.
                          if (Array.isArray(value)) {
                            const [lo, hi] = value as [number, number];
                            return [`${fmtEur(lo)} – ${fmtEur(hi)}`, `25–75 % (${label.replace("band_", "")})`];
                          }
                          return [fmtEur(Number(value) || 0), label];
                        }
                        return [fmtEur(Number(value) || 0), `${t("scenarios.medianShort")} ${label}`];
                      }}
                      labelFormatter={(l) => `${t("results.ageAxis")} ${l}`}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {/* 25/75 funnel per scenario — drawn first so the median lines sit on top */}
                    {scenarios.map((s, idx) => (
                      <Area
                        key={`band-${s.id}`}
                        type="monotone"
                        dataKey={`band_${s.name}`}
                        stroke="none"
                        fill={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                        fillOpacity={0.14}
                        isAnimationActive={false}
                        legendType="none"
                        activeDot={false}
                      />
                    ))}
                    {scenarios.map((s, idx) => (
                      <Line
                        key={`median-${s.id}`}
                        type="monotone"
                        dataKey={s.name}
                        stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                        strokeWidth={2.2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  {t("scenarios.comparisonChartLegend")}
                </p>
              </CardContent>
            </Card>
          )}

          <Card data-design-id="scenario-summary-table-card">
            <CardHeader>
              <CardTitle data-design-id="scenario-summary-table-title">{t("scenarios.summaryTable")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">{t("scenarios.scenario")}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">{t("scenarios.success")}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">{t("results.median")}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">{t("scenarios.p10")}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">{t("scenarios.p90")}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">{t("hist.maxDD")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((s, idx) => (
                      <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-3 font-medium" style={{ color: SCENARIO_COLORS[idx % SCENARIO_COLORS.length] }}>
                          {s.name}
                        </td>
                        <td className="py-2 px-3 text-right font-bold">
                          {s.result ? fmtPct(s.result.successRate) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {s.result ? fmtEur(s.result.medianFinalWealth) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {s.result ? fmtEur(s.result.percentiles.p10) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {s.result ? fmtEur(s.result.percentiles.p90) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right text-rose-600">
                          {s.result ? fmtPct(s.result.maxDrawdown) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}