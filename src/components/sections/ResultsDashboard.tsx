"use client";

import { useAppState } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtEur, fmtPct } from "@/lib/format";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from "recharts";

export function ResultsDashboard() {
  const { state } = useAppState();
  const { result, client, inputs } = state;

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400" data-design-id="no-results">
        <div className="text-center">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-lg font-medium">Noch keine Simulationsergebnisse</p>
          <p className="text-sm">Starten Sie eine Simulation im Tab „Simulation", um hier Ergebnisse zu sehen.</p>
        </div>
      </div>
    );
  }

  const accYears = client.retirementAge - client.currentAge;
  const retIdx = Math.min(accYears, result.medianPath.length - 1);
  const capitalAtRet = result.medianPath[retIdx];
  const withdrawalRate = capitalAtRet > 0
    ? (inputs.desiredMonthlyWithdrawal * 12 / capitalAtRet) * 100
    : 0;

  const step = Math.max(1, Math.floor(result.yearLabels.length / 80));
  const fanData = result.yearLabels
    .filter((_, i) => i % step === 0)
    .map((age, idx) => {
      const i = idx * step;
      return {
        age: Math.round(age),
        worst: Math.round(result.worstPath[i]),
        p10: Math.round(result.p10Path[i]),
        p25: Math.round(result.p25Path[i]),
        median: Math.round(result.medianPath[i]),
        p75: Math.round(result.p75Path[i]),
        p90: Math.round(result.p90Path[i]),
        best: Math.round(result.bestPath[i]),
      };
    });

  const heatmapData = (result.withdrawalHeatmap ?? []).map((item) => ({
    withdrawal: item.withdrawal,
    successRate: item.successRate,
  }));

  const successColor =
    result.successRate >= 90
      ? "text-emerald-600"
      : result.successRate >= 70
        ? "text-amber-600"
        : "text-rose-600";

  const successBg =
    result.successRate >= 90
      ? "bg-emerald-50 border-emerald-200"
      : result.successRate >= 70
        ? "bg-amber-50 border-amber-200"
        : "bg-rose-50 border-rose-200";

  return (
    <div className="space-y-6" data-design-id="results-dashboard">
      <div data-design-id="results-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="results-title">Simulationsergebnisse</h2>
        <p className="text-slate-500 mt-1" data-design-id="results-subtitle">
          Monte-Carlo-Analyse mit {result.yearLabels.length > 0 ? Math.round(result.yearLabels[result.yearLabels.length - 1] - result.yearLabels[0]) : 0} Jahren Horizont.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={`${successBg}`} data-design-id="kpi-success-rate">
          <CardContent className="pt-4 pb-4 text-center">
            <div className={`text-3xl font-bold ${successColor}`}>
              {fmtPct(result.successRate)}
            </div>
            <div className="text-xs text-slate-500 mt-1">Erfolgsquote</div>
          </CardContent>
        </Card>
        <Card data-design-id="kpi-median-wealth">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {fmtEur(result.medianFinalWealth)}
            </div>
            <div className="text-xs text-slate-500 mt-1">Median Endvermögen</div>
          </CardContent>
        </Card>
        <Card data-design-id="kpi-withdrawal-rate">
          <CardContent className="pt-4 pb-4 text-center">
            <div className={`text-2xl font-bold ${withdrawalRate <= 4 ? "text-emerald-600" : "text-rose-600"}`}>
              {fmtPct(withdrawalRate)}
            </div>
            <div className="text-xs text-slate-500 mt-1">Entnahmerate</div>
          </CardContent>
        </Card>
        <Card data-design-id="kpi-max-drawdown">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-rose-600">
              {fmtPct(result.maxDrawdown)}
            </div>
            <div className="text-xs text-slate-500 mt-1">Max. Drawdown</div>
          </CardContent>
        </Card>
      </div>

      {result.sustainableWithdrawal !== undefined && (
        <Card className="border-emerald-200 bg-emerald-50/50" data-design-id="sustainable-withdrawal-card">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">Nachhaltige monatliche Entnahme (95% Konfidenz)</div>
                <div className="text-3xl font-bold text-emerald-600">{fmtEur(result.sustainableWithdrawal)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500">Jährlich</div>
                <div className="text-xl font-bold text-emerald-600">{fmtEur(result.sustainableWithdrawal * 12)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {result.requiredCapital !== undefined && (
        <Card className="border-blue-200 bg-blue-50/50" data-design-id="required-capital-card">
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-slate-500">Erforderliches Kapital (95% Konfidenz)</div>
            <div className="text-3xl font-bold text-blue-600">{fmtEur(result.requiredCapital)}</div>
          </CardContent>
        </Card>
      )}

      {result.requiredSavings !== undefined && (
        <Card className="border-indigo-200 bg-indigo-50/50" data-design-id="required-savings-card">
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-slate-500">Erforderliche monatliche Sparrate (95% Konfidenz)</div>
            <div className="text-3xl font-bold text-indigo-600">{fmtEur(result.requiredSavings)}</div>
          </CardContent>
        </Card>
      )}

      <Card data-design-id="fan-chart-card">
        <CardHeader>
          <CardTitle data-design-id="fan-chart-title">Portfolio-Projektion — Monte-Carlo-Fächerdiagramm</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={420}>
            <AreaChart data={fanData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="age"
                tick={{ fontSize: 11 }}
                label={{ value: "Alter", position: "insideBottom", offset: -5, fontSize: 12 }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                label={{ value: "Portfoliowert (€)", angle: -90, position: "insideLeft", offset: 0, fontSize: 12 }}
              />
              <Tooltip
                formatter={(value: number) => fmtEur(value)}
                labelFormatter={(l) => `Alter ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <ReferenceLine
                x={client.retirementAge}
                stroke="#6366f1"
                strokeDasharray="5 5"
                label={{ value: "Pension", fontSize: 10, fill: "#6366f1" }}
              />
              <Area type="monotone" dataKey="p90" stackId="1" stroke="none" fill="#dbeafe" name="90. Perzentil" />
              <Area type="monotone" dataKey="p75" stackId="2" stroke="none" fill="#bfdbfe" name="75. Perzentil" />
              <Area type="monotone" dataKey="median" stackId="3" stroke="#3b82f6" strokeWidth={2} fill="#93c5fd" name="Median" />
              <Area type="monotone" dataKey="p25" stackId="4" stroke="none" fill="#bfdbfe" name="25. Perzentil" />
              <Area type="monotone" dataKey="p10" stackId="5" stroke="none" fill="#dbeafe" name="10. Perzentil" />
              <Area type="monotone" dataKey="worst" stroke="#ef4444" strokeWidth={1} fill="none" strokeDasharray="4 4" name="Schlechtester Fall" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-design-id="percentile-table-card">
          <CardHeader>
            <CardTitle data-design-id="percentile-table-title">Endvermögen nach Perzentilen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { label: "95. Perzentil", value: result.percentiles.p95, color: "bg-blue-100 text-blue-700" },
                { label: "90. Perzentil", value: result.percentiles.p90, color: "bg-blue-100 text-blue-700" },
                { label: "75. Perzentil", value: result.percentiles.p75, color: "bg-sky-100 text-sky-700" },
                { label: "50. (Median)", value: result.percentiles.p50, color: "bg-indigo-100 text-indigo-700" },
                { label: "25. Perzentil", value: result.percentiles.p25, color: "bg-amber-100 text-amber-700" },
                { label: "10. Perzentil", value: result.percentiles.p10, color: "bg-orange-100 text-orange-700" },
                { label: "5. Perzentil", value: result.percentiles.p5, color: "bg-rose-100 text-rose-700" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-slate-50">
                  <span className="text-sm text-slate-600">{row.label}</span>
                  <span className={`text-sm font-semibold px-3 py-0.5 rounded-full ${row.color}`}>
                    {fmtEur(row.value)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card data-design-id="portfolio-metrics-card">
          <CardHeader>
            <CardTitle data-design-id="portfolio-metrics-title">Portfolio- & Risikokennzahlen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: "Erwartete Rendite (p.a.)", value: fmtPct(result.portfolioReturn) },
                { label: "Volatilität (p.a.)", value: fmtPct(result.portfolioVolatility) },
                { label: "Sharpe Ratio", value: result.sharpeRatio.toFixed(2) },
                { label: "Max. Drawdown (Median)", value: fmtPct(result.maxDrawdown) },
                { label: "Kapital bei Pensionierung (Median)", value: fmtEur(capitalAtRet) },
                { label: "Anfängliche Entnahmerate", value: fmtPct(withdrawalRate) },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-slate-500">{row.label}</span>
                  <span className="text-sm font-bold text-slate-800">{row.value}</span>
                </div>
              ))}

              {result.failureYear && (
                <div className="mt-3 p-3 bg-rose-50 rounded-lg border border-rose-200">
                  <div className="text-xs text-rose-500">Frühestes Versagensalter</div>
                  <div className="text-lg font-bold text-rose-600">
                    {Math.round(result.failureYear)}
                  </div>
                  {result.medianFailureYear && (
                    <div className="text-xs text-rose-400 mt-1">
                      Medianes Versagensalter: {Math.round(result.medianFailureYear)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {heatmapData.length > 0 && (
        <Card data-design-id="heatmap-card">
          <CardHeader>
            <CardTitle data-design-id="heatmap-title">Entnahme vs. Erfolgsquote</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={heatmapData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="withdrawal"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`}
                  label={{ value: "Monatliche Entnahme (€)", position: "insideBottom", offset: -5, fontSize: 12 }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  label={{ value: "Erfolgsquote", angle: -90, position: "insideLeft", offset: 0, fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                  labelFormatter={(l) => `€${Number(l).toLocaleString("de-AT")}/Monat`}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <ReferenceLine y={95} stroke="#16a34a" strokeDasharray="3 3" label={{ value: "95%", fontSize: 10 }} />
                <Bar dataKey="successRate" name="Erfolgsquote" radius={[4, 4, 0, 0]}>
                  {heatmapData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        entry.successRate >= 95
                          ? "#16a34a"
                          : entry.successRate >= 80
                            ? "#eab308"
                            : entry.successRate >= 60
                              ? "#f97316"
                              : "#ef4444"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}