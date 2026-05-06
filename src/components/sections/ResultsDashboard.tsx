"use client";

import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
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
  const { result, client, inputs, liquidityEvents } = state;
  const { t } = useI18n();

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400" data-design-id="no-results">
        <div className="text-center">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-lg font-medium">{t("results.noResults")}</p>
          <p className="text-sm">{t("results.noResultsHint")}</p>
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
      ? "text-[#5a8a50]"
      : result.successRate >= 70
        ? "text-[#FAC075]"
        : "text-rose-600";

  const successBg =
    result.successRate >= 90
      ? "bg-[#8FB687]/10 border-[#8FB687]/40"
      : result.successRate >= 70
        ? "bg-amber-50 border-amber-200"
        : "bg-rose-50 border-rose-200";

  return (
    <div className="space-y-6" data-design-id="results-dashboard">
      <div data-design-id="results-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="results-title">{t("results.title")}</h2>
        <p className="text-slate-500 mt-1" data-design-id="results-subtitle">
          {t("results.subtitle")} {result.yearLabels.length > 0 ? Math.round(result.yearLabels[result.yearLabels.length - 1] - result.yearLabels[0]) : 0} {t("results.subtitleSuffix")}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={`${successBg}`} data-design-id="kpi-success-rate">
          <CardContent className="pt-4 pb-4 text-center">
            <div className={`text-3xl font-bold ${successColor}`}>
              {fmtPct(result.successRate)}
            </div>
            <div className="text-xs text-slate-500 mt-1">{t("results.successRate")}</div>
          </CardContent>
        </Card>
        <Card data-design-id="kpi-median-wealth">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-[#4D4A47]">
              {fmtEur(result.medianFinalWealth)}
            </div>
            <div className="text-xs text-slate-500 mt-1">{t("results.medianWealth")}</div>
          </CardContent>
        </Card>
        <Card data-design-id="kpi-withdrawal-rate">
          <CardContent className="pt-4 pb-4 text-center">
            <div className={`text-2xl font-bold ${withdrawalRate <= 4 ? "text-[#5a8a50]" : "text-rose-600"}`}>
              {fmtPct(withdrawalRate)}
            </div>
            <div className="text-xs text-slate-500 mt-1">{t("results.withdrawalRate")}</div>
          </CardContent>
        </Card>
        <Card data-design-id="kpi-max-drawdown">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-rose-600">
              {fmtPct(result.maxDrawdown)}
            </div>
            <div className="text-xs text-slate-500 mt-1">{t("results.maxDrawdown")}</div>
          </CardContent>
        </Card>
      </div>

      {result.sustainableWithdrawal !== undefined && (
        <Card className="border-[#8FB687]/40 bg-[#8FB687]/10/50" data-design-id="sustainable-withdrawal-card">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">{t("results.sustainableMonthly")}</div>
                <div className="text-3xl font-bold text-[#5a8a50]">{fmtEur(result.sustainableWithdrawal)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500">{t("results.annualy")}</div>
                <div className="text-xl font-bold text-[#5a8a50]">{fmtEur(result.sustainableWithdrawal * 12)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {result.requiredCapital !== undefined && (
        <Card className="border-neutral-200 bg-neutral-50/50" data-design-id="required-capital-card">
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-slate-500">{t("results.requiredCapital")}</div>
            <div className="text-3xl font-bold text-[#4D4A47]">{fmtEur(result.requiredCapital)}</div>
          </CardContent>
        </Card>
      )}

      {result.requiredSavings !== undefined && (
        <Card className="border-red-200 bg-red-50/50" data-design-id="required-savings-card">
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-slate-500">{t("results.requiredSavings")}</div>
            <div className="text-3xl font-bold text-[#D31220]">{fmtEur(result.requiredSavings)}</div>
          </CardContent>
        </Card>
      )}

      <Card data-design-id="fan-chart-card">
        <CardHeader>
          <CardTitle data-design-id="fan-chart-title">{t("results.fanChartTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={420}>
            <AreaChart data={fanData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="age"
                tick={{ fontSize: 11 }}
                label={{ value: t("results.ageAxis"), position: "insideBottom", offset: -5, fontSize: 12 }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                label={{ value: t("results.portfolioValue"), angle: -90, position: "insideLeft", offset: 0, fontSize: 12 }}
              />
              <Tooltip
                formatter={(value: number) => fmtEur(value)}
                labelFormatter={(l) => `${t("results.ageAxis")} ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <ReferenceLine
                x={client.retirementAge}
                stroke="#D31220"
                strokeDasharray="5 5"
                label={{ value: t("results.pension"), fontSize: 10, fill: "#D31220" }}
              />
              {liquidityEvents.map((ev) => (
                <ReferenceLine
                  key={`le-fan-${ev.id}`}
                  x={ev.age}
                  stroke="#8A83BE"
                  strokeDasharray="4 2"
                  strokeWidth={1.5}
                  label={{
                    value: `${ev.amount >= 0 ? "+" : ""}€${Math.round(ev.amount / 1000)}k`,
                    fontSize: 9,
                    fill: "#8A83BE",
                    position: "top",
                  }}
                />
              ))}
              <Area type="monotone" dataKey="p90" stackId="1" stroke="none" fill="#F7D8CD" name={t("results.percentile90")} />
              <Area type="monotone" dataKey="p75" stackId="2" stroke="none" fill="#EDAC98" name={t("results.percentile75")} />
              <Area type="monotone" dataKey="median" stackId="3" stroke="#D31220" strokeWidth={2} fill="#E37E67" name={t("results.median")} />
              <Area type="monotone" dataKey="p25" stackId="4" stroke="none" fill="#EDAC98" name={t("results.percentile25")} />
              <Area type="monotone" dataKey="p10" stackId="5" stroke="none" fill="#F7D8CD" name={t("results.percentile10")} />
              <Area type="monotone" dataKey="worst" stroke="#D31220" strokeWidth={1} fill="none" strokeDasharray="4 4" name={t("results.worstCase")} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-design-id="percentile-table-card">
          <CardHeader>
            <CardTitle data-design-id="percentile-table-title">{t("results.endWealthPercentiles")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { label: t("results.percentile95"), value: result.percentiles.p95, color: "bg-neutral-100 text-[#20201E]" },
                { label: t("results.percentile90"), value: result.percentiles.p90, color: "bg-neutral-100 text-[#20201E]" },
                { label: t("results.percentile75"), value: result.percentiles.p75, color: "bg-sky-100 text-sky-700" },
                { label: t("results.percentile50"), value: result.percentiles.p50, color: "bg-red-50 text-[#D31220]" },
                { label: t("results.percentile25"), value: result.percentiles.p25, color: "bg-amber-100 text-amber-700" },
                { label: t("results.percentile10"), value: result.percentiles.p10, color: "bg-orange-100 text-orange-700" },
                { label: t("results.percentile5"), value: result.percentiles.p5, color: "bg-rose-100 text-rose-700" },
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
            <CardTitle data-design-id="portfolio-metrics-title">{t("results.portfolioMetrics")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: t("results.expectedReturnPA"), value: fmtPct(result.portfolioReturn) },
                { label: t("results.volatilityPA"), value: fmtPct(result.portfolioVolatility) },
                { label: t("results.sharpeRatio"), value: result.sharpeRatio.toFixed(2) },
                { label: t("results.maxDrawdownMedian"), value: fmtPct(result.maxDrawdown) },
                { label: t("results.capitalAtRetirement"), value: fmtEur(capitalAtRet) },
                { label: t("results.initialWithdrawalRate"), value: fmtPct(withdrawalRate) },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-slate-500">{row.label}</span>
                  <span className="text-sm font-bold text-slate-800">{row.value}</span>
                </div>
              ))}

              {result.failureYear && (
                <div className="mt-3 p-3 bg-rose-50 rounded-lg border border-rose-200">
                  <div className="text-xs text-rose-500">{t("results.earliestFailure")}</div>
                  <div className="text-lg font-bold text-rose-600">
                    {Math.round(result.failureYear)}
                  </div>
                  {result.medianFailureYear && (
                    <div className="text-xs text-rose-400 mt-1">
                      {t("results.medianFailure")}: {Math.round(result.medianFailureYear)}
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
            <CardTitle data-design-id="heatmap-title">{t("results.heatmapTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={heatmapData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="withdrawal"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`}
                  label={{ value: t("results.monthlyWithdrawal"), position: "insideBottom", offset: -5, fontSize: 12 }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  label={{ value: t("results.successRate"), angle: -90, position: "insideLeft", offset: 0, fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                  labelFormatter={(l) => `€${Number(l).toLocaleString("de-AT")}/Monat`}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <ReferenceLine y={95} stroke="#5a8a50" strokeDasharray="3 3" label={{ value: "95%", fontSize: 10 }} />
                <Bar dataKey="successRate" name={t("results.successRate")} radius={[4, 4, 0, 0]}>
                  {heatmapData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        entry.successRate >= 95
                          ? "#5a8a50"
                          : entry.successRate >= 80
                            ? "#eab308"
                            : entry.successRate >= 60
                              ? "#f97316"
                              : "#D31220"
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