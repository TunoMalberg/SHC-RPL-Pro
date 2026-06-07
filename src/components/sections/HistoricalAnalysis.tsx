"use client";

import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
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
import { getLocalizedCrisis } from "@/lib/engine/historicalCrises";

export function HistoricalAnalysisSection() {
  const { state } = useAppState();
  const { historicalResult, client } = state;
  const { t, locale } = useI18n();

  if (!historicalResult) {
    return (
      <EmptyState
        icon="📈"
        title={t("empty.historical.title")}
        description={t("empty.historical.desc")}
        designId="no-historical"
      />
    );
  }

  const { scenarios, overallSuccessRate, averageFinalWealth, medianFinalWealth, worstScenario, bestScenario } = historicalResult;

  const scenarioBarData = scenarios.map((s) => ({
    startYear: s.startYear,
    finalWealth: Math.round(s.finalWealth),
    success: s.success,
  }));

  // ──────────────────────────────────────────
  // Stresstest-Daten
  // ──────────────────────────────────────────
  // Pro Startjahr: Portfolio-Verlust (= maxDrawdown, negativ) plus die
  // Krise, in deren Kalenderjahr der schlimmste Einzelpunkt fiel.
  // `worstYear` kommt aus der Engine (`historical.ts`) — Jahr mit dem
  // niedrigsten Portfolio-Return innerhalb des Pfads.
  const stressData = scenarios.map((s) => {
    const crisis = getLocalizedCrisis(s.worstYear, locale);
    const dd = -Math.round(s.maxDrawdown * 100 * 10) / 10;
    return {
      startYear: s.startYear,
      maxDrawdown: dd,
      worstYear: s.worstYear,
      worstReturnPct: Math.round(s.worstReturn * 10) / 10,
      crisisName: crisis?.name ?? t("hist.crisis.normalDecline"),
      crisisDesc: crisis?.description ?? t("hist.crisis.normalDeclineDesc"),
      // Farbintensität: tiefere Drawdowns kräftiger.
      severity: Math.abs(dd) >= 30 ? "deep" : Math.abs(dd) >= 15 ? "mid" : "shallow",
    };
  });

  // Eigener Tooltip für den Stresstest: Krisenname + Beschreibung +
  // Portfolio-Verlust + schlechtestes Einzeljahr im Pfad.
  // Wird unten an die `Tooltip`-Komponente von Recharts als `content` übergeben.
  type StressDatum = (typeof stressData)[number];
  function StressTooltip({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: StressDatum }>;
  }) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div
        className="rounded-md border border-slate-200 bg-white shadow-md p-3 max-w-xs text-[12px] leading-snug"
        data-design-id="stress-tooltip"
      >
        <div className="font-semibold text-slate-900">
          {t("hist.stress.startYearLabel")}: {d.startYear}
        </div>
        <div className="mt-1 text-rose-700 font-bold text-base">
          {d.maxDrawdown.toFixed(1)} %
        </div>
        <div className="mt-2 text-slate-700">
          <span className="font-semibold">{d.crisisName}</span>
          <span className="text-slate-400"> · {d.worstYear}</span>
        </div>
        <div className="mt-1 text-slate-500">{d.crisisDesc}</div>
        {Number.isFinite(d.worstReturnPct) && (
          <div className="mt-2 text-slate-400 text-[11px]">
            {t("hist.stress.worstYearReturn")}: {d.worstReturnPct.toFixed(1)} %
          </div>
        )}
      </div>
    );
  }

  // Bar-Farbe je nach Drawdown-Tiefe — visuelle Heatmap-Funktion.
  const barColor = (severity: string) => {
    if (severity === "deep") return "#A60B16";   // tiefes Bordeaux
    if (severity === "mid") return "#D31220";    // SHC-Rot
    return "#F08A92";                            // helles Rosa
  };

  const successColor = overallSuccessRate >= 90
    ? "text-[#5a8a50]"
    : overallSuccessRate >= 70
      ? "text-[#FAC075]"
      : "text-rose-600";

  /* ──────────────────────────────────────────
     Path chart data — one row per age, one column per scenario.
     Same visualisation as in the HTML client report ("Historischer Rückblick").
     ────────────────────────────────────────── */
  const worstYear = worstScenario?.startYear;
  const bestYear = bestScenario?.startYear;
  const pathLen = scenarios.length > 0 ? scenarios[0].path.length : 0;
  const pathChartData = Array.from({ length: pathLen }, (_, i) => {
    const row: Record<string, number> = { age: client.currentAge + i };
    for (const s of scenarios) {
      row[`y_${s.startYear}`] = Math.round(s.path[i] ?? 0);
    }
    return row;
  });
  const sortedScenarios = [...scenarios].sort((a, b) => {
    // Render highlighted lines last so they sit on top.
    const score = (sy: number) => (sy === worstYear ? 2 : sy === bestYear ? 1 : 0);
    return score(a.startYear) - score(b.startYear);
  });

  return (
    <div className="space-y-6" data-design-id="historical-analysis-section">
      <div data-design-id="historical-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="historical-title">{t("hist.title")}</h2>
        <p className="text-slate-500 mt-1" data-design-id="historical-subtitle">
          {t("hist.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
        <Card data-design-id="hist-kpi-median-wealth">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-[#4D4A47]">{fmtEur(medianFinalWealth)}</div>
            <div className="text-xs text-slate-500 mt-1">{t("hist.medianWealth")}</div>
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

      {/* Path chart per starting cohort — same visualisation as HTML client report */}
      {pathLen > 0 && (
        <Card data-design-id="hist-paths-chart-card">
          <CardHeader>
            <CardTitle data-design-id="hist-paths-chart-title">{t("hist.pathsTitle")}</CardTitle>
            <p className="text-sm text-slate-500 mt-1">{t("hist.pathsSubtitle")}</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart
                data={pathChartData}
                margin={{ top: 10, right: 20, left: 20, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="age"
                  tick={{ fontSize: 11 }}
                  label={{
                    value: t("hist.axisAge"),
                    position: "insideBottom",
                    offset: -5,
                    fontSize: 12,
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                  label={{
                    value: t("hist.axisWealth"),
                    angle: -90,
                    position: "insideLeft",
                    offset: 0,
                    fontSize: 12,
                    style: { textAnchor: "middle" },
                  }}
                />
                <Tooltip
                  formatter={(value, name) => [fmtEur(Number(value) || 0), String(name).replace(/^y_/, "")]}
                  labelFormatter={(l) => `${t("hist.axisAge")}: ${l}`}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                {sortedScenarios.map((s) => {
                  const isWorst = s.startYear === worstYear;
                  const isBest = s.startYear === bestYear;
                  const stroke = isWorst
                    ? "#D31220"
                    : isBest
                      ? "#5a8a50"
                      : s.success
                        ? "rgba(143, 182, 135, 0.55)"
                        : "rgba(211, 18, 32, 0.45)";
                  return (
                    <Line
                      key={s.startYear}
                      type="monotone"
                      dataKey={`y_${s.startYear}`}
                      name={String(s.startYear)}
                      stroke={stroke}
                      strokeWidth={isWorst || isBest ? 2.4 : 1}
                      dot={false}
                      isAnimationActive={false}
                      opacity={isWorst || isBest ? 1 : 0.85}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
            {/* Static legend (Recharts auto-legend would clutter with ~50 entries) */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600 mt-3 pl-2">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-0.5 bg-[#D31220]" />
                {t("hist.legendWorst")} {worstYear ? `(${worstYear})` : ""}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-0.5 bg-[#5a8a50]" />
                {t("hist.legendBest")} {bestYear ? `(${bestYear})` : ""}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-0.5" style={{ background: "rgba(143,182,135,0.55)" }} />
                {t("hist.legendOther")}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

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
                formatter={(value) => fmtEur(Number(value) || 0)}
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

      <Card data-design-id="hist-stress-chart-card">
        <CardHeader>
          <CardTitle data-design-id="hist-stress-chart-title">{t("hist.stressByStart")}</CardTitle>
          <p className="text-xs text-slate-500 mt-1" data-design-id="hist-stress-chart-subtitle">
            {t("hist.stressByStartSubtitle")}
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={stressData}
              margin={{ top: 10, right: 20, left: 20, bottom: 10 }}
              data-design-id="hist-stress-chart"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="startYear"
                tick={{ fontSize: 10 }}
                label={{
                  value: t("hist.stress.startYearLabel"),
                  position: "insideBottom",
                  offset: -2,
                  style: { fontSize: 11, fill: "#64748b" },
                }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
                domain={["auto", 0]}
                label={{
                  value: t("hist.stress.lossLabel"),
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11, fill: "#64748b" },
                }}
              />
              <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} />
              <Tooltip content={<StressTooltip />} cursor={{ fill: "rgba(211,18,32,0.06)" }} />
              <Bar dataKey="maxDrawdown" name={t("hist.stress.lossLabel")} radius={[0, 0, 3, 3]}>
                {stressData.map((d, idx) => (
                  <Cell key={`stress-${idx}`} fill={barColor(d.severity)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legende: erklärt Farbcodierung der Balken */}
          <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-slate-600" data-design-id="stress-legend">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#F08A92" }} />
              {t("hist.stress.legendShallow")}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#D31220" }} />
              {t("hist.stress.legendMid")}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#A60B16" }} />
              {t("hist.stress.legendDeep")}
            </div>
          </div>
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
                    <td className="py-1.5 px-3 text-right text-rose-600">{fmtPct(-s.maxDrawdown * 100)}</td>
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