"use client";

import { useAppState } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtEur, fmtPct } from "@/lib/format";
import { runMonteCarloSimulation, generateWithdrawalHeatmap } from "@/lib/engine/montecarlo";
import type { Scenario } from "@/lib/types";
import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const SCENARIO_COLORS = ["#3b82f6", "#ef4444", "#16a34a", "#eab308", "#8b5cf6", "#f97316"];

export function ScenarioComparisonSection() {
  const { state, dispatch } = useAppState();
  const { scenarios, client, inputs, portfolio, settings } = state;
  const [scenarioName, setScenarioName] = useState("");

  const addScenario = () => {
    const name = scenarioName.trim() || `Scenario ${scenarios.length + 1}`;
    const scenario: Scenario = {
      id: Date.now().toString(),
      name,
      inputs: { ...inputs },
      portfolio: { ...portfolio, buckets: [...portfolio.buckets] as typeof portfolio.buckets },
    };

    const result = runMonteCarloSimulation(client, scenario.inputs, scenario.portfolio, settings);
    result.withdrawalHeatmap = generateWithdrawalHeatmap(client, scenario.inputs, scenario.portfolio, settings);
    scenario.result = result;

    dispatch({ type: "ADD_SCENARIO", payload: scenario });
    setScenarioName("");
  };

  const step = 5;
  const comparisonData: Record<string, number | string>[] = [];

  if (scenarios.length > 0) {
    const maxLen = Math.max(...scenarios.filter(s => s.result).map(s => s.result!.medianPath.length));
    for (let i = 0; i < maxLen; i += step) {
      const point: Record<string, number | string> = { age: Math.round(client.currentAge + i) };
      for (const s of scenarios) {
        if (s.result && i < s.result.medianPath.length) {
          point[s.name] = Math.round(s.result.medianPath[i]);
        }
      }
      comparisonData.push(point);
    }
  }

  return (
    <div className="space-y-6" data-design-id="scenario-comparison-section">
      <div data-design-id="scenario-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="scenario-title">Scenario Comparison</h2>
        <p className="text-slate-500 mt-1" data-design-id="scenario-subtitle">
          Save and compare different planning assumptions side by side.
        </p>
      </div>

      <Card data-design-id="add-scenario-card">
        <CardContent className="pt-6">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label htmlFor="scenarioName">Scenario Name</Label>
              <Input
                id="scenarioName"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder={`Scenario ${scenarios.length + 1}`}
              />
            </div>
            <Button onClick={addScenario} className="bg-indigo-600 hover:bg-indigo-700" data-design-id="add-scenario-button">
              + Save Current Settings as Scenario
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Adjust inputs/portfolio, then save as a new scenario to compare.
          </p>
        </CardContent>
      </Card>

      {scenarios.length === 0 ? (
        <div className="text-center py-16 text-slate-400" data-design-id="no-scenarios">
          <p className="text-4xl mb-3">🔀</p>
          <p className="text-lg font-medium">No scenarios saved yet</p>
          <p className="text-sm">Modify your inputs and save different scenarios to compare.</p>
        </div>
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
                    <span className="text-slate-500">Capital</span>
                    <span className="font-medium">{fmtEur(s.inputs.initialCapital)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Savings/mo</span>
                    <span className="font-medium">{fmtEur(s.inputs.monthlySavings)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Withdrawal/mo</span>
                    <span className="font-medium">{fmtEur(s.inputs.desiredMonthlyWithdrawal)}</span>
                  </div>
                  {s.result && (
                    <>
                      <div className="pt-2 border-t mt-2">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Success Rate</span>
                          <span className={`font-bold ${s.result.successRate >= 90 ? "text-emerald-600" : s.result.successRate >= 70 ? "text-amber-600" : "text-rose-600"}`}>
                            {fmtPct(s.result.successRate)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Median Final</span>
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
                <CardTitle data-design-id="scenario-comparison-chart-title">Median Portfolio Path Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={comparisonData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="age"
                      tick={{ fontSize: 11 }}
                      label={{ value: "Age", position: "insideBottom", offset: -5, fontSize: 12 }}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `€${(Number(v) / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value: number) => fmtEur(value)}
                      labelFormatter={(l) => `Age ${l}`}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Legend />
                    {scenarios.map((s, idx) => (
                      <Line
                        key={s.id}
                        type="monotone"
                        dataKey={s.name}
                        stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card data-design-id="scenario-summary-table-card">
            <CardHeader>
              <CardTitle data-design-id="scenario-summary-table-title">Summary Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">Scenario</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Success</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Median</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">10th Pctl</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">90th Pctl</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Max DD</th>
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