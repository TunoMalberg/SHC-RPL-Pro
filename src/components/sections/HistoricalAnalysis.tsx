"use client";

import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtEur, fmtPct } from "@/lib/format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import { Badge } from "@/components/ui/badge";

export function HistoricalAnalysisSection() {
  const { state } = useAppState();
  const { historicalResult } = state;
  const { t } = useI18n();

  if (!historicalResult) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400" data-design-id="no-historical">
        <div className="text-center">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-lg font-medium">{t("hist.noData")}</p>
          <p className="text-sm">{t("hist.noDataHint")}</p>
        </div>
      </div>
    );
  }

  const { scenarios, overallSuccessRate, averageFinalWealth, worstScenario, bestScenario } = historicalResult;

  const scenarioBarData = scenarios.map((s) => ({
    startYear: s.startYear,
    finalWealth: Math.round(s.finalWealth),
    success: s.success,
  }));

  const drawdownData = scenarios.map((s) => ({
    startYear: s.startYear,
    maxDrawdown: Math.round(s.maxDrawdown * 100 * 10) / 10,
  }));

  const successColor = overallSuccessRate >= 90
    ? "text-[#5a8a50]"
    : overallSuccessRate >= 70
      ? "text-[#FAC075]"
      : "text-rose-600";

  return (
    <div className="space-y-6" data-design-id="historical-analysis-section">
      <div data-design-id="historical-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="historical-title">{t("hist.title")}</h2>
        <p className="text-slate-500 mt-1" data-design-id="historical-subtitle">
          {t("hist.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-design-id="hist-kpi-success">
          <CardContent className="pt-4 pb-4 text-center">
            <div className={`text-3xl font-bold ${successColor}`}>
              {fmtPct(overallSuccessRate)}
            </div>
            <div className="text-xs text-slate-500 mt-1">{t("hist.successRate")}</div>
          </CardContent>
        </Card>
        <Card data-design-id="hist-kpi-scenarios">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-3xl font-bold text-[#4D4A47]">{scenarios.length}</div>
            <div className="text-xs text-slate-500 mt-1">{t("hist.scenariosTested")}</div>
          </CardContent>
        </Card>
        <Card data-design-id="hist-kpi-avg-wealth">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-[#D31220]">{fmtEur(averageFinalWealth)}</div>
            <div className="text-xs text-slate-500 mt-1">{t("hist.avgWealth")}</div>
          </CardContent>
        </Card>
        <Card data-design-id="hist-kpi-worst">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-rose-600">
              {worstScenario ? worstScenario.startYear : "k. A."}
            </div>
            <div className="text-xs text-slate-500 mt-1">{t("hist.worstStart")}</div>
          </CardContent>
        </Card>
      </div>

      <Card data-design-id="hist-wealth-chart-card">
        <CardHeader>
          <CardTitle data-design-id="hist-wealth-chart-title">{t("hist.wealthByStart")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={scenarioBarData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="startYear"
                tick={{ fontSize: 10 }}
                label={{ value: t("hist.startYear"), position: "insideBottom", offset: -5, fontSize: 12 }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value: number) => fmtEur(value)}
                labelFormatter={(l) => `${t("hist.start")}: ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <ReferenceLine y={0} stroke="#D31220" strokeWidth={2} />
              <Bar dataKey="finalWealth" name={t("hist.finalWealth")} radius={[2, 2, 0, 0]}>
                {scenarioBarData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.success ? "#8FB687" : "#D31220"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card data-design-id="hist-drawdown-chart-card">
        <CardHeader>
          <CardTitle data-design-id="hist-drawdown-chart-title">{t("hist.drawdownByStart")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={drawdownData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="startYear"
                tick={{ fontSize: 10 }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
                domain={[0, "auto"]}
              />
              <Tooltip
                formatter={(value: number) => `${value.toFixed(1)}%`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Line
                type="monotone"
                dataKey="maxDrawdown"
                stroke="#D31220"
                strokeWidth={2}
                dot={{ r: 3, fill: "#D31220" }}
                name={t("hist.maxDD")}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card data-design-id="hist-detail-table-card">
        <CardHeader>
          <CardTitle data-design-id="hist-detail-table-title">{t("hist.scenarioDetails")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">{t("hist.start")}</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">{t("hist.end")}</th>
                  <th className="text-center py-2 px-3 font-semibold text-slate-600">{t("hist.result")}</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">{t("hist.finalWealth")}</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">{t("hist.maxDD")}</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">{t("hist.worstYear")}</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">{t("hist.worstReturn")}</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.startYear} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-1.5 px-3">{s.startYear}</td>
                    <td className="py-1.5 px-3">{s.endYear}</td>
                    <td className="py-1.5 px-3 text-center">
                      <Badge variant={s.success ? "default" : "destructive"} className="text-xs">
                        {s.success ? t("hist.passed") : t("hist.failed")}
                      </Badge>
                    </td>
                    <td className="py-1.5 px-3 text-right font-medium">{fmtEur(s.finalWealth)}</td>
                    <td className="py-1.5 px-3 text-right text-rose-600">{fmtPct(s.maxDrawdown * 100)}</td>
                    <td className="py-1.5 px-3 text-right">{s.worstYear}</td>
                    <td className="py-1.5 px-3 text-right text-rose-600">{fmtPct(s.worstReturn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}