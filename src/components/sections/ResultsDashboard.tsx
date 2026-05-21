"use client";

import { useState, useMemo } from "react";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtEur, fmtPct, fmtNum } from "@/lib/format";
import { computePETimeline } from "@/lib/engine/privateEquity";
import { computeHistoricalGrossReturns } from "@/lib/engine/historical";
import {
  ComposedChart,
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
  Line,
  LineChart,
  Legend,
} from "recharts";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// AT Sterbetafel 2022/23 – combined m/f survival probabilities
const AT_LIFE_TABLE = [
  { age: 60, q: 1.000 }, { age: 65, q: 0.960 }, { age: 70, q: 0.910 },
  { age: 75, q: 0.840 }, { age: 80, q: 0.720 }, { age: 85, q: 0.540 },
  { age: 90, q: 0.330 }, { age: 95, q: 0.150 }, { age: 100, q: 0.045 },
  { age: 105, q: 0.008 },
];

function atSurvivalConditional(age: number, condAge: number): number {
  const lerp = (table: { age: number; q: number }[], a: number) => {
    if (a <= table[0].age) return table[0].q;
    if (a >= table[table.length - 1].age) return table[table.length - 1].q;
    for (let i = 0; i < table.length - 1; i++) {
      if (a >= table[i].age && a <= table[i + 1].age) {
        const t = (a - table[i].age) / (table[i + 1].age - table[i].age);
        return table[i].q + t * (table[i + 1].q - table[i].q);
      }
    }
    return 0;
  };
  const base = lerp(AT_LIFE_TABLE, condAge);
  const atAge = lerp(AT_LIFE_TABLE, age);
  return base > 0 ? Math.round((atAge / base) * 1000) / 10 : 0;
}

function KpiTooltip({ content }: { content: string }) {
  return (
    <TooltipProvider>
      <UITooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold hover:bg-slate-300 ml-1 cursor-help"
          >
            ⓘ
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">
          {content}
        </TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}

export function ResultsDashboard() {
  const { state } = useAppState();
  const { result, client, inputs, liquidityEvents, historicalResult, portfolio } = state;
  const { t } = useI18n();
  const [showLongevity, setShowLongevity] = useState(false);
  const [showPENav, setShowPENav] = useState(true);

  // PE-Aggregate (deterministisch oder Median über Stochastik) ─────────────
  const peMode = portfolio.peModelingMode ?? "realistic";
  const peSummary = useMemo(() => {
    const peFunds = portfolio.peFunds ?? [];
    if (peFunds.length === 0) return null;
    const totalYears = Math.max(1, client.lifeExpectancy - client.currentAge);
    const timeline = computePETimeline(
      peFunds,
      client.currentAge,
      totalYears,
      0.275,
      peMode,
    );
    const totalCommitment = peFunds.reduce((s, f) => s + f.commitment, 0);
    const totalCalled = timeline.reduce((s, e) => s + e.totalCall, 0);
    const totalDistGross = timeline.reduce((s, e) => s + e.totalDistGross, 0);
    const totalDistNet = timeline.reduce((s, e) => s + e.totalDistNet, 0);
    const totalKestPaid = totalDistGross - totalDistNet;
    const navAtLifeEnd = timeline.length > 0 ? timeline[timeline.length - 1].totalNav : 0;
    const navPeak = timeline.reduce((m, e) => Math.max(m, e.totalNav), 0);
    const activeFunds = peFunds.length;
    const avgIRR = peFunds.reduce((s, f) => s + f.irr, 0) / peFunds.length;
    const avgTVPI = peFunds.reduce((s, f) => s + f.tvpi, 0) / peFunds.length;
    return {
      totalCommitment,
      totalCalled,
      totalDistGross,
      totalDistNet,
      totalKestPaid,
      navAtLifeEnd,
      navPeak,
      activeFunds,
      avgIRR,
      avgTVPI,
      timeline,
    };
  }, [portfolio.peFunds, client.currentAge, client.lifeExpectancy, peMode]);

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

  // Sampling exakt an Jahresgrenzen, damit Alter eindeutig ist (keine
  // 0.5-Jahr-Rundungs-Doppelungen bei monatlichem Zeitschritt).
  // FIX (2026-05-16): Vorher wurde mit step=Math.floor(N/80) sub-jährlich
  // gesampled und das Alter via Math.round bestimmt — daraus entstanden
  // Duplikate (z. B. 45.5 → "46" und 46.0 → "46") und der angezeigte
  // Wert für "Alter 46" stammte teils aus Mitte-45.
  const totalYears = Math.max(1, client.lifeExpectancy - client.currentAge);
  const stepsPerYear = Math.max(
    1,
    Math.round((result.yearLabels.length - 1) / totalYears),
  );
  const fanData: Array<{
    age: number;
    worst: number;
    p10: number;
    p25: number;
    median: number;
    p75: number;
    p90: number;
    best: number;
    peNav: number;
    peNavP25?: number;
    peNavP75?: number;
    peBandLow: number;
    peBandRange: number;
  }> = [];
  for (let y = 0; y <= totalYears; y++) {
    const i = Math.min(y * stepsPerYear, result.yearLabels.length - 1);
    const peNavMid = result.pePath ? Math.round(result.pePath[i] ?? 0) : 0;
    const peNavP25 = result.pePathP25 ? Math.round(result.pePathP25[i] ?? 0) : undefined;
    const peNavP75 = result.pePathP75 ? Math.round(result.pePathP75[i] ?? 0) : undefined;
    fanData.push({
      age: client.currentAge + y,
      worst: Math.round(result.worstPath[i]),
      p10: Math.round(result.p10Path[i]),
      p25: Math.round(result.p25Path[i]),
      median: Math.round(result.medianPath[i]),
      p75: Math.round(result.p75Path[i]),
      p90: Math.round(result.p90Path[i]),
      best: Math.round(result.bestPath[i]),
      peNav: peNavMid,
      peNavP25,
      peNavP75,
      // Für Recharts Stacked-Area-Trick: Boden + Range-Höhe.
      peBandLow: peNavP25 ?? 0,
      peBandRange:
        peNavP25 !== undefined && peNavP75 !== undefined
          ? Math.max(0, peNavP75 - peNavP25)
          : 0,
    });
  }

  const hasPE = peSummary !== null && (result.pePath?.length ?? 0) > 0;
  const hasPEStoch =
    hasPE && (result.pePathP25?.length ?? 0) > 0 && (result.pePathP75?.length ?? 0) > 0;

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

      {/* KPI Cards with Tooltips – Item 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={`${successBg}`} data-design-id="kpi-success-rate">
          <CardContent className="pt-4 pb-4 text-center">
            <div className={`text-3xl font-bold ${successColor}`}>
              {fmtPct(result.successRate)}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-0.5">
              {t("results.successRate")}
              <KpiTooltip content={t("results.tooltipSuccess").replace("{n}", result.yearLabels.length > 0 ? String(state.settings.numSimulations) : "5000").replace("{age}", String(client.lifeExpectancy))} />
            </div>
          </CardContent>
        </Card>
        <Card data-design-id="kpi-median-wealth">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-[#4D4A47]">
              {fmtEur(result.medianFinalWealth)}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-0.5">
              {t("results.medianWealth")}
              <KpiTooltip content={t("results.tooltipMedianWealth")} />
            </div>
          </CardContent>
        </Card>
        <Card data-design-id="kpi-withdrawal-rate">
          <CardContent className="pt-4 pb-4 text-center">
            <div className={`text-2xl font-bold ${withdrawalRate <= 4 ? "text-[#5a8a50]" : "text-rose-600"}`}>
              {fmtPct(withdrawalRate)}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-0.5">
              {t("results.withdrawalRate")}
              <KpiTooltip content={t("results.tooltipWithdrawal").replace("{rate}", fmtPct(withdrawalRate))} />
            </div>
          </CardContent>
        </Card>
        <Card data-design-id="kpi-max-drawdown">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-rose-600">
              {fmtPct(result.maxDrawdown)}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-0.5">
              {t("results.maxDrawdown")}
              <KpiTooltip content={t("results.tooltipDrawdown")} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer language interpretation – Item 9 */}
      <Card className={`${successBg} border-l-4 ${result.successRate >= 90 ? "border-l-[#5a8a50]" : result.successRate >= 70 ? "border-l-amber-400" : "border-l-rose-500"}`} data-design-id="customer-language-card">
        <CardContent className="pt-4 pb-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{t("results.customerLanguageTitle")}</div>
          <p className={`text-sm font-medium leading-relaxed ${successColor}`}>
            {result.successRate >= 90
              ? t("results.customerSuccess90").replace("{age}", String(client.lifeExpectancy))
              : result.successRate >= 70
                ? t("results.customerSuccess70").replace("{pct}", fmtPct(result.successRate)).replace("{age}", String(client.lifeExpectancy))
                : t("results.customerSuccess50").replace("{age}", String(client.lifeExpectancy))
            }
          </p>
        </CardContent>
      </Card>

      {/* Private Equity Summary – 4th bucket contribution (deterministic) */}
      {hasPE && peSummary && (
        <Card
          className="border-[#8A83BE]/40 bg-gradient-to-br from-[#8A83BE]/5 to-white"
          data-design-id="pe-summary-card"
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-lg flex items-center gap-2" data-design-id="pe-summary-title">
                  <span className="inline-block w-3 h-3 rounded-full bg-[#8A83BE]" />
                  {t("results.peCardTitle")}
                </CardTitle>
                <p className="text-xs text-slate-500 mt-1">{t("results.peCardSubtitle")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide ${
                    peMode === "full"
                      ? "bg-[#5d568f] text-white"
                      : peMode === "realistic"
                        ? "bg-[#8A83BE]/30 text-[#3f3a66]"
                        : "bg-slate-200 text-slate-600"
                  }`}
                  title={t(
                    peMode === "full"
                      ? "portfolio.peModeFullDesc"
                      : peMode === "realistic"
                        ? "portfolio.peModeRealisticDesc"
                        : "portfolio.peModeSimpleDesc",
                  )}
                  data-design-id="pe-mode-badge"
                >
                  {t(
                    peMode === "full"
                      ? "portfolio.peModeFull"
                      : peMode === "realistic"
                        ? "portfolio.peModeRealistic"
                        : "portfolio.peModeSimple",
                  )}
                </span>
                <div className="text-xs px-2.5 py-1 rounded-full bg-[#8A83BE]/15 text-[#5d568f] font-semibold">
                  {peSummary.activeFunds} {t("results.peKpiActiveFunds")}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Commitments */}
              <div className="rounded-lg bg-white border border-[#8A83BE]/20 p-3">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  {t("results.peKpiCommitment")}
                </div>
                <div className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums">
                  {fmtEur(peSummary.totalCommitment)}
                </div>
              </div>
              {/* Called Capital */}
              <div className="rounded-lg bg-white border border-[#8A83BE]/20 p-3">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  {t("results.peKpiCalled")}
                </div>
                <div className="text-lg font-bold text-rose-600 mt-0.5 tabular-nums">
                  −{fmtEur(peSummary.totalCalled)}
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">
                  {peSummary.totalCommitment > 0
                    ? fmtPct((peSummary.totalCalled / peSummary.totalCommitment) * 100) + " of commit."
                    : ""}
                </div>
              </div>
              {/* Distributions Net */}
              <div className="rounded-lg bg-white border border-[#8A83BE]/20 p-3">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  {t("results.peKpiDistNet")}
                </div>
                <div className="text-lg font-bold text-[#5a8a50] mt-0.5 tabular-nums">
                  +{fmtEur(peSummary.totalDistNet)}
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">
                  {t("results.peKpiDistGross")}: {fmtEur(peSummary.totalDistGross)}
                </div>
              </div>
              {/* NAV at Life End */}
              <div className="rounded-lg bg-[#8A83BE]/10 border border-[#8A83BE]/40 p-3">
                <div className="text-[10px] font-semibold text-[#5d568f] uppercase tracking-wide">
                  {t("results.peKpiNavLifeEnd")}
                </div>
                <div className="text-lg font-bold text-[#5d568f] mt-0.5 tabular-nums">
                  {fmtEur(peSummary.navAtLifeEnd)}
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5">
                  {t("results.peKpiNavLifeEndHint")}
                </div>
              </div>
            </div>

            {/* Sekundäre Kennzahlen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  {t("results.peKpiTaxesPaid")}
                </div>
                <div className="text-sm font-bold text-slate-700 mt-0.5 tabular-nums">
                  {fmtEur(peSummary.totalKestPaid)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Σ Net Cashflow
                </div>
                <div
                  className={`text-sm font-bold mt-0.5 tabular-nums ${
                    peSummary.totalDistNet - peSummary.totalCalled >= 0 ? "text-[#5a8a50]" : "text-rose-600"
                  }`}
                >
                  {peSummary.totalDistNet - peSummary.totalCalled >= 0 ? "+" : ""}
                  {fmtEur(peSummary.totalDistNet - peSummary.totalCalled)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  {t("results.peKpiAvgIrr")}
                </div>
                <div className="text-sm font-bold text-[#5a8a50] mt-0.5 tabular-nums">
                  {fmtPct(peSummary.avgIRR)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  {t("results.peKpiAvgTvpi")}
                </div>
                <div className="text-sm font-bold text-slate-700 mt-0.5 tabular-nums">
                  {fmtNum(peSummary.avgTVPI, 2)}×
                </div>
              </div>
            </div>

            {/* Stochastik-Stats — nur im Modus „Vollständig" */}
            {peMode === "full" && result.peSuccessRate !== undefined && (
              <div
                className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 p-3 rounded-lg bg-[#8A83BE]/8 border border-[#8A83BE]/30"
                data-design-id="pe-stoch-stats"
              >
                <div>
                  <div className="text-[10px] font-semibold text-[#5d568f] uppercase tracking-wide">
                    {t("portfolio.peEnsembleSuccess")}
                  </div>
                  <div
                    className={`text-base font-bold mt-0.5 tabular-nums ${
                      result.peSuccessRate >= 0.9
                        ? "text-[#5a8a50]"
                        : result.peSuccessRate >= 0.7
                          ? "text-[#FAC075]"
                          : "text-rose-600"
                    }`}
                  >
                    {fmtPct(result.peSuccessRate * 100)}
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5">
                    {peSummary.activeFunds} {t("results.peKpiActiveFunds")}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-[#5d568f] uppercase tracking-wide">
                    {t("portfolio.peEnsembleMedianIRR")}
                  </div>
                  <div className="text-base font-bold text-slate-800 mt-0.5 tabular-nums">
                    {fmtPct(result.peMedianIRR ?? 0)}
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5">
                    Ziel: {fmtPct(peSummary.avgIRR)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-[#5d568f] uppercase tracking-wide">
                    {t("portfolio.peEnsembleMedianTVPI")}
                  </div>
                  <div className="text-base font-bold text-slate-800 mt-0.5 tabular-nums">
                    {fmtNum(result.peMedianTVPI ?? 0, 2)}×
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5">
                    Ziel: {fmtNum(peSummary.avgTVPI, 2)}×
                  </div>
                </div>
              </div>
            )}

            {/* Mini-Verlauf: PE-NAV-Kurve über Zeit */}
            <div className="mt-4 rounded-lg bg-white border border-slate-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  {t("results.peLegendTitle")} — {t("results.peOverlayLabel")}
                </div>
                <div className="text-[10px] text-slate-400">
                  Peak NAV: <span className="font-semibold text-[#8A83BE]">{fmtEur(peSummary.navPeak)}</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart
                  data={peSummary.timeline.map((e) => ({
                    age: e.age,
                    nav: Math.round(e.totalNav),
                    call: -Math.round(e.totalCall),
                    distNet: Math.round(e.totalDistNet),
                  }))}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
                  <XAxis dataKey="age" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${(Number(v) / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value, name) => [fmtEur(Number(value) || 0), String(name)]}
                    labelFormatter={(l) => `${t("results.ageAxis")} ${l}`}
                    contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  />
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  <Bar dataKey="call" fill="#D31220" name={t("portfolio.peChartCalls")} opacity={0.55} />
                  <Bar dataKey="distNet" fill="#5a8a50" name={t("portfolio.peChartDistNet")} opacity={0.7} />
                  <Line
                    type="monotone"
                    dataKey="nav"
                    stroke="#8A83BE"
                    strokeWidth={2.2}
                    dot={false}
                    name={t("portfolio.peChartNav")}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-slate-400 mt-1 text-center italic">
                {t("results.peSuccessNote")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MC vs Historical side-by-side comparison – Fix D (2025-11-11) */}
      {historicalResult && (
        <Card data-design-id="mc-vs-hist-comparison-card" className="border-[#8FB687]/40">
          <CardHeader>
            <CardTitle data-design-id="mc-vs-hist-title" className="text-lg">
              {t("compare.title")}
            </CardTitle>
            <p className="text-sm text-slate-500 mt-1">{t("compare.subtitle")}</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" data-design-id="mc-vs-hist-mc">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {t("compare.mcLabel")}
                </div>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-500">{t("compare.median")}</span>
                  <span className="text-2xl font-bold text-[#4D4A47]">{fmtEur(result.medianFinalWealth)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-500">{t("compare.success")}</span>
                  <span className={`text-lg font-bold ${successColor}`}>{fmtPct(result.successRate)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-slate-500">{t("compare.scenarios")}</span>
                  <span className="text-sm text-slate-700">{state.settings.numSimulations.toLocaleString()}</span>
                </div>
              </div>
              <div className="rounded-lg border border-[#8FB687]/40 bg-[#8FB687]/10 p-4" data-design-id="mc-vs-hist-hist">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {t("compare.histLabel")}
                </div>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-500">{t("compare.median")}</span>
                  <span className="text-2xl font-bold text-[#4D4A47]">{fmtEur(historicalResult.medianFinalWealth)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-500">{t("compare.success")}</span>
                  <span className={`text-lg font-bold ${historicalResult.overallSuccessRate >= 90 ? "text-[#5a8a50]" : historicalResult.overallSuccessRate >= 70 ? "text-[#FAC075]" : "text-rose-600"}`}>
                    {fmtPct(historicalResult.overallSuccessRate)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-slate-500">{t("compare.scenarios")}</span>
                  <span className="text-sm text-slate-700">{historicalResult.scenarios.length}</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3 leading-relaxed">
              {t("compare.note")
                .replace("{n}", state.settings.numSimulations.toLocaleString())
                .replace("{eq}", String(portfolio.buckets[2].expectedReturn))
                .replace("{b}", String(portfolio.buckets[1].expectedReturn))
                .replace("{c}", String(portfolio.buckets[0].expectedReturn))}
            </p>

            {/* Historical gross returns per bucket (1970–2024, geometric p.a.) */}
            {(() => {
              const hgr = computeHistoricalGrossReturns();
              const rows = [
                {
                  key: "cash",
                  label: portfolio.buckets[0]?.label ?? "Topf 1",
                  assumed: portfolio.buckets[0]?.expectedReturn ?? 0,
                  hist: hgr.cash,
                },
                {
                  key: "bonds",
                  label: portfolio.buckets[1]?.label ?? "Topf 2",
                  assumed: portfolio.buckets[1]?.expectedReturn ?? 0,
                  hist: hgr.bonds,
                },
                {
                  key: "equities",
                  label: portfolio.buckets[2]?.label ?? "Topf 3",
                  assumed: portfolio.buckets[2]?.expectedReturn ?? 0,
                  hist: hgr.equities,
                },
              ];
              return (
                <div className="mt-5 pt-4 border-t border-slate-200" data-design-id="hist-gross-returns-block">
                  <div className="text-sm font-semibold text-slate-700 mb-1">
                    {t("compare.histReturnsTitle")}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3">
                    {t("compare.histReturnsSubtitle")}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th className="text-left py-2 pr-3 font-semibold">{t("compare.colBucket")}</th>
                          <th className="text-right py-2 px-3 font-semibold">{t("compare.colAssumed")}</th>
                          <th className="text-right py-2 px-3 font-semibold">{t("compare.colHistorical")}</th>
                          <th className="text-right py-2 pl-3 font-semibold">{t("compare.colDelta")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const delta = r.assumed - r.hist;
                          const deltaColor =
                            Math.abs(delta) < 0.25
                              ? "text-slate-500"
                              : delta > 0
                                ? "text-rose-600"
                                : "text-[#5a8a50]";
                          return (
                            <tr key={r.key} className="border-b border-slate-100">
                              <td className="py-1.5 pr-3 text-slate-700">{r.label}</td>
                              <td className="py-1.5 px-3 text-right font-medium tabular-nums">
                                {r.assumed.toFixed(1).replace(".", ",")} %
                              </td>
                              <td className="py-1.5 px-3 text-right font-medium tabular-nums">
                                {r.hist.toFixed(1).replace(".", ",")} %
                              </td>
                              <td className={`py-1.5 pl-3 text-right tabular-nums font-medium ${deltaColor}`}>
                                {delta > 0 ? "+" : ""}
                                {delta.toFixed(1).replace(".", ",")} pp
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="text-xs text-slate-400">
                          <td className="py-1.5 pr-3 italic">
                            Inflation ({hgr.startYear}–{hgr.endYear})
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums">—</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">
                            {hgr.inflation.toFixed(1).replace(".", ",")} %
                          </td>
                          <td className="py-1.5 pl-3 text-right tabular-nums">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

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

      {/* Gap Analysis – Item 4 */}
      {(() => {
        const heatmap = result.withdrawalHeatmap ?? [];
        const entry90 = [...heatmap].reverse().find((h) => h.successRate >= 90);
        const sustainable90 = entry90?.withdrawal;
        const gap = sustainable90 ? inputs.desiredMonthlyWithdrawal - sustainable90 : 0;
        const onTrack = result.successRate >= 90;
        const capitalPctNeeded = gap > 0 && capitalAtRet > 0
          ? Math.round((gap * 12 / result.portfolioReturn) / capitalAtRet * 100)
          : 0;
        return (
          <Card className={onTrack ? "border-[#8FB687]/40 bg-[#8FB687]/5" : "border-amber-200 bg-amber-50/50"} data-design-id="gap-analysis-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base" data-design-id="gap-title">{t("results.gapTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {onTrack ? (
                <div className="space-y-1">
                  <p className="text-[#5a8a50] font-bold text-lg">{t("results.gapOnTrack")}</p>
                  <p className="text-sm text-slate-500">{t("results.gapOnTrackDesc")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg p-3 border border-amber-200">
                      <div className="text-xs text-slate-500 mb-0.5">{t("results.gapCurrentWithdrawal")}</div>
                      <div className="text-xl font-bold text-rose-600">{fmtEur(inputs.desiredMonthlyWithdrawal)}<span className="text-xs text-slate-400">/Mo.</span></div>
                    </div>
                    {sustainable90 && (
                      <div className="bg-white rounded-lg p-3 border border-[#8FB687]/40">
                        <div className="text-xs text-slate-500 mb-0.5">{t("results.gapSustainable90")}</div>
                        <div className="text-xl font-bold text-[#5a8a50]">{fmtEur(sustainable90)}<span className="text-xs text-slate-400">/Mo.</span></div>
                      </div>
                    )}
                  </div>
                  {gap > 0 && (
                    <div className="bg-white border border-amber-200 rounded-lg p-3">
                      <div className="text-xs font-semibold text-amber-700 mb-2">{t("results.gapOrAlternatives")}</div>
                      <ul className="space-y-1 text-xs text-slate-600">
                        <li className="flex items-center gap-2">
                          <span className="text-amber-500">▸</span>
                          <span><strong>{t("results.gapReduceBy")} {fmtEur(gap)}/Mo.</strong> ({fmtEur(gap * 12)}/Jahr)</span>
                        </li>
                        {capitalPctNeeded > 0 && (
                          <li className="flex items-center gap-2">
                            <span className="text-amber-500">▸</span>
                            <span>{t("results.gapIncreaseCapital").replace("{pct}", String(capitalPctNeeded))}</span>
                          </li>
                        )}
                        <li className="flex items-center gap-2">
                          <span className="text-amber-500">▸</span>
                          <span>{t("results.gapDelayRetirement")}</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-amber-500">▸</span>
                          <span>{t("results.gapIncreaseSavings")}</span>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Fan Chart – Items 2 + 14 */}
      <Card data-design-id="fan-chart-card">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle data-design-id="fan-chart-title">{t("results.fanChartTitle")}</CardTitle>
            <div className="flex flex-wrap gap-2">
              {hasPE && (
                <button
                  type="button"
                  onClick={() => setShowPENav((v) => !v)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    showPENav
                      ? "bg-[#8A83BE]/20 border-[#8A83BE]/40 text-[#5d568f] font-medium"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                  data-design-id="toggle-pe-overlay"
                >
                  <span>{showPENav ? "✓" : "○"}</span>
                  {t("results.peOverlayToggle")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowLongevity((v) => !v)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  showLongevity
                    ? "bg-[#8A83BE]/20 border-[#8A83BE]/40 text-[#8A83BE] font-medium"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <span>{showLongevity ? "✓" : "○"}</span>
                {t("results.longevityOverlay")}
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <ResponsiveContainer width="100%" height={420}>
            <ComposedChart data={fanData.map((d) => ({
              ...d,
              survival: showLongevity ? atSurvivalConditional(d.age, client.retirementAge) : undefined,
            }))} margin={{ top: 10, right: showLongevity ? 50 : 30, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="age"
                tick={{ fontSize: 11 }}
                label={{ value: t("results.ageAxis"), position: "insideBottom", offset: -5, fontSize: 12 }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                label={{ value: t("results.portfolioValue"), angle: -90, position: "insideLeft", offset: 0, fontSize: 12 }}
              />
              {showLongevity && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, 100]}
                  label={{ value: t("results.longevityLabel"), angle: 90, position: "insideRight", offset: 10, fontSize: 10 }}
                />
              )}
              <Tooltip
                formatter={(value, name) => {
                  if (name === t("results.longevityLabel")) return [`${Number(value).toFixed(1)}%`, name];
                  return [fmtEur(Number(value) || 0), name];
                }}
                labelFormatter={(l) => `${t("results.ageAxis")} ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <ReferenceLine
                yAxisId="left"
                x={client.retirementAge}
                stroke="#D31220"
                strokeDasharray="5 5"
                label={{ value: t("results.pension"), fontSize: 10, fill: "#D31220" }}
              />
              {liquidityEvents.map((ev) => (
                <ReferenceLine
                  key={`le-fan-${ev.id}`}
                  yAxisId="left"
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
              <Area yAxisId="left" type="monotone" dataKey="p90" stackId="1" stroke="none" fill="#F7D8CD" name={t("results.percentile90")} />
              <Area yAxisId="left" type="monotone" dataKey="p75" stackId="2" stroke="none" fill="#EDAC98" name={t("results.percentile75")} />
              <Area yAxisId="left" type="monotone" dataKey="median" stackId="3" stroke="#D31220" strokeWidth={2} fill="#E37E67" name={t("results.median")} />
              <Area yAxisId="left" type="monotone" dataKey="p25" stackId="4" stroke="none" fill="#EDAC98" name={t("results.percentile25")} />
              <Area yAxisId="left" type="monotone" dataKey="p10" stackId="5" stroke="none" fill="#F7D8CD" name={t("results.percentile10")} />
              <Area yAxisId="left" type="monotone" dataKey="worst" stroke="#D31220" strokeWidth={1} fill="none" strokeDasharray="4 4" name={t("results.worstCase")} />
              {hasPE && showPENav && hasPEStoch && (
                <>
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="peBandLow"
                    stackId="peBand"
                    stroke="none"
                    fill="transparent"
                    legendType="none"
                    name="__pe_band_floor"
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="peBandRange"
                    stackId="peBand"
                    stroke="none"
                    fill="#8A83BE"
                    fillOpacity={0.18}
                    name={t("results.peBandLabel")}
                  />
                </>
              )}
              {hasPE && showPENav && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="peNav"
                  stroke="#8A83BE"
                  strokeWidth={2.5}
                  dot={false}
                  name={t("results.peOverlayLabel")}
                />
              )}
              {showLongevity && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="survival"
                  stroke="#8A83BE"
                  strokeWidth={2.5}
                  dot={false}
                  name={t("results.longevityLabel")}
                  strokeDasharray="6 3"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Fan Chart Legend – Item 2 */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">{t("results.fanLegendTitle")}</div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              {[
                { color: "#F7D8CD", label: t("results.fanLegendBest10"), border: false },
                { color: "#EDAC98", label: t("results.fanLegendMid50"), border: false },
                { color: "#D31220", label: t("results.fanLegendMedian"), border: false, thick: true },
                { color: "#EDAC98", label: t("results.fanLegendWorst10"), border: false },
                { color: "#D31220", label: t("results.fanLegendWorstLine"), dashed: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  {item.dashed ? (
                    <div className="h-0 w-8 border-t-2 border-dashed flex-shrink-0" style={{ borderColor: item.color }} />
                  ) : (
                    <div className="w-6 h-3 rounded flex-shrink-0" style={{ backgroundColor: item.color, outline: item.thick ? `2px solid ${item.color}` : "none", outlineOffset: 1 }} />
                  )}
                  <span className="text-[10px] text-slate-600 leading-tight">{item.label}</span>
                </div>
              ))}
              {showLongevity && (
                <div className="flex items-center gap-1.5">
                  <div className="h-0 w-8 border-t-2 border-dashed flex-shrink-0" style={{ borderColor: "#8A83BE" }} />
                  <span className="text-[10px] text-slate-600 leading-tight">{t("results.longevityLabel")}</span>
                </div>
              )}
              {hasPE && showPENav && (
                <div className="flex items-center gap-1.5">
                  <div className="h-0 w-8 border-t-2 flex-shrink-0" style={{ borderColor: "#8A83BE" }} />
                  <span className="text-[10px] text-slate-600 leading-tight">{t("results.peOverlayLabel")}</span>
                </div>
              )}
            </div>
            {showLongevity && (
              <p className="text-[9px] text-slate-400 mt-2">{t("results.longevitySource").replace("{age}", String(client.retirementAge))}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sequence-of-Returns Risk Visualization – Item 5 */}
      {(() => {
        const retYears = Math.max(5, client.lifeExpectancy - client.retirementAge);
        // FIX: portfolioReturn / portfolioVolatility sind in PROZENT gespeichert
        // (montecarlo.ts Z.267: portfolioReturn * 100). Für (1 + ret)-Formeln
        // müssen wir sie in Dezimalwerte umrechnen.
        const avgReturnPct = result.portfolioReturn;
        const volPct = result.portfolioVolatility;
        const avgReturn = avgReturnPct / 100;
        const vol = volPct / 100;
        // ±1 Standardabweichung = realistische "gute" vs. "schlechte" Jahre
        const badReturn = avgReturn - vol;
        const goodReturn = avgReturn + vol;

        // FIX: Portfolio trägt nur den NETTOBEDARF nach Pension, nicht den vollen Entnahmewunsch
        const netMonthlyNeed = Math.max(0, inputs.desiredMonthlyWithdrawal - inputs.monthlyPension);
        const annualWithdrawal = netMonthlyNeed * 12;

        // FIX: IDENTISCHE Rendite-Mengen, nur andere Reihenfolge (kanonische SoR-Demo)
        // Beide Pfade bekommen: N_SHOCK gute + N_SHOCK schlechte + (retYears - 2*N_SHOCK) avg
        // Pfad "Bad first":  [bad × N, good × N, avg × rest]
        // Pfad "Good first": [good × N, bad × N, avg × rest]
        // → Summe der Renditen und Set der Renditen sind IDENTISCH, nur die Reihenfolge differiert.
        const N_SHOCK = Math.min(5, Math.floor(retYears / 3));
        const goodFirstSeq: number[] = [];
        const badFirstSeq: number[] = [];
        for (let y = 0; y < retYears; y++) {
          if (y < N_SHOCK) {
            goodFirstSeq.push(goodReturn);
            badFirstSeq.push(badReturn);
          } else if (y < 2 * N_SHOCK) {
            goodFirstSeq.push(badReturn);
            badFirstSeq.push(goodReturn);
          } else {
            goodFirstSeq.push(avgReturn);
            badFirstSeq.push(avgReturn);
          }
        }

        const paths: { year: number; good: number; bad: number }[] = [
          { year: 0, good: capitalAtRet, bad: capitalAtRet },
        ];
        let capGood = capitalAtRet;
        let capBad = capitalAtRet;
        let badDepleteYear: number | null = null;
        for (let y = 0; y < retYears; y++) {
          capGood = Math.max(0, capGood * (1 + goodFirstSeq[y]) - annualWithdrawal);
          capBad = Math.max(0, capBad * (1 + badFirstSeq[y]) - annualWithdrawal);
          if (capBad === 0 && badDepleteYear === null) badDepleteYear = y + 1;
          paths.push({ year: y + 1, good: Math.round(capGood), bad: Math.round(capBad) });
        }

        // Plausibilitäts-Summen (beide müssen identisch sein)
        const sumGood = goodFirstSeq.reduce((a, b) => a + b, 0);
        const sumBad = badFirstSeq.reduce((a, b) => a + b, 0);
        const sequencesEqual = Math.abs(sumGood - sumBad) < 1e-9;

        const deltaEnd = (paths[paths.length - 1]?.good ?? 0) - (paths[paths.length - 1]?.bad ?? 0);

        return (
          <Card className="border-amber-200 bg-amber-50/30" data-design-id="sor-risk-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base" data-design-id="sor-title">{t("results.sorTitle")}</CardTitle>
              <p className="text-xs text-slate-500">{t("results.sorDesc")}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Assumption box – vollständige Transparenz */}
              <div className="bg-white/60 border border-amber-100 rounded-lg p-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500">Startkapital:</span>{" "}
                  <span className="font-semibold text-slate-700">{fmtEur(capitalAtRet)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Netto-Entnahme:</span>{" "}
                  <span className="font-semibold text-slate-700">{fmtEur(annualWithdrawal)}/J</span>
                </div>
                <div>
                  <span className="text-slate-500">Ø-Rendite:</span>{" "}
                  <span className="font-semibold text-slate-700">{fmtPct(avgReturnPct)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Vol:</span>{" "}
                  <span className="font-semibold text-slate-700">{fmtPct(volPct)}</span>
                </div>
                <div className="col-span-2 md:col-span-4 text-[10px] text-slate-400 border-t border-amber-100 pt-1 mt-1">
                  {N_SHOCK} schlechte Jahre ({fmtPct(badReturn * 100)}) + {N_SHOCK} gute Jahre ({fmtPct(goodReturn * 100)}) + {retYears - 2 * N_SHOCK} Durchschnittsjahre — in beiden Szenarien identisch, nur die Reihenfolge differiert.
                  {sequencesEqual && (
                    <span className="ml-1 text-[#5a8a50]">✓ Rendite-Summen identisch ({(sumGood * 100).toFixed(2)}%)</span>
                  )}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={paths} margin={{ top: 5, right: 20, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 10 }}
                    label={{ value: "Jahre nach Pensionsbeginn", position: "insideBottom", offset: -8, fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                    label={{ value: "Portfoliowert", angle: -90, position: "insideLeft", offset: 5, fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value) => fmtEur(Number(value) || 0)}
                    labelFormatter={(l) => `Jahr ${l} (Alter ${client.retirementAge + Number(l)})`}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  />
                  <ReferenceLine y={0} stroke="#D31220" strokeWidth={1.5} />
                  {/* Marker für Ende der ersten Schock-Phase */}
                  <ReferenceLine
                    x={N_SHOCK}
                    stroke="#94a3b8"
                    strokeDasharray="2 2"
                    label={{ value: `Ende Schock-Phase`, fontSize: 9, fill: "#94a3b8", position: "top" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="good"
                    stroke="#5a8a50"
                    strokeWidth={2.5}
                    dot={false}
                    name={t("results.sorGoodStart")}
                  />
                  <Line
                    type="monotone"
                    dataKey="bad"
                    stroke="#D31220"
                    strokeWidth={2.5}
                    dot={false}
                    name={t("results.sorBadStart")}
                    strokeDasharray="5 3"
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>}
                  />
                </LineChart>
              </ResponsiveContainer>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#8FB687]/10 border border-[#8FB687]/30 rounded-lg p-2 text-center">
                  <div className="text-xs text-slate-500">{t("results.sorGoodStart")}</div>
                  <div className="text-lg font-bold text-[#5a8a50]">
                    {fmtEur(paths[paths.length - 1]?.good ?? 0)}
                  </div>
                  <div className="text-[10px] text-slate-400">nach {retYears} Jahren</div>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-center">
                  <div className="text-xs text-slate-500">{t("results.sorBadStart")}</div>
                  <div className="text-lg font-bold text-rose-600">
                    {fmtEur(paths[paths.length - 1]?.bad ?? 0)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {badDepleteYear !== null
                      ? `Kapital erschöpft nach Jahr ${badDepleteYear}`
                      : `nach ${retYears} Jahren`}
                  </div>
                </div>
              </div>

              {deltaEnd > 0 && (
                <div className="bg-[#FAC075]/20 border border-[#FAC075]/40 rounded-lg p-2 text-center">
                  <span className="text-xs text-slate-600">Differenz am Ende: </span>
                  <span className="text-sm font-bold text-[#D31220]">{fmtEur(deltaEnd)}</span>
                  <span className="text-xs text-slate-500"> — allein durch die Reihenfolge derselben Renditen.</span>
                </div>
              )}

              <p className="text-xs text-slate-500 italic">{t("results.sorFinalCaption")}</p>
              <div className="bg-amber-100 border border-amber-200 rounded-lg p-2 text-xs text-amber-700 font-medium">
                {t("results.sorWarning")}
              </div>
            </CardContent>
          </Card>
        );
      })()}

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
          <CardContent className="space-y-4">
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
                  formatter={(value) => `${(Number(value) || 0).toFixed(1)}%`}
                  labelFormatter={(l) => `€${Number(l).toLocaleString("de-AT")}/Monat`}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <ReferenceLine y={95} stroke="#5a8a50" strokeDasharray="3 3" label={{ value: "95%", fontSize: 10 }} />
                <ReferenceLine y={90} stroke="#FAC075" strokeDasharray="3 3" label={{ value: "90%", fontSize: 10 }} />
                {/* 4% rule reference line on X axis – Item 10 */}
                {capitalAtRet > 0 && (
                  <ReferenceLine
                    x={capitalAtRet * 0.04 / 12}
                    stroke="#3a7cb8"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    label={{ value: "4%-Regel", fontSize: 10, fill: "#3a7cb8", position: "top" }}
                  />
                )}
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

            {/* 4% rule explanation – Item 10 */}
            <div className="bg-[#87BBE6]/10 border border-[#87BBE6]/30 rounded-xl p-3 space-y-1">
              <div className="font-semibold text-[#3a7cb8] text-sm">{t("results.fourPctTitle")}</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {t("results.fourPctExplain").replace("{rate}", fmtPct(withdrawalRate))}
              </p>
              <div className={`text-xs font-medium mt-1 ${withdrawalRate <= 4 ? "text-[#5a8a50]" : "text-rose-600"}`}>
                {withdrawalRate <= 4 ? t("results.fourPctBelow") : t("results.fourPctAbove")}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Advisor Insights – Item 16 */}
      <Card className="border-slate-300 bg-slate-50" data-design-id="advisor-insights-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base" data-design-id="advisor-insights-title">{t("results.advisorInsightsTitle")}</CardTitle>
          <p className="text-xs text-slate-500">{t("results.advisorInsightsDesc")}</p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {result.successRate >= 90 ? (
              <li className="flex items-start gap-2 text-sm">
                <span className="text-[#5a8a50] font-bold mt-0.5">✓</span>
                <span className="text-slate-700">{t("results.insightGoodSuccess").replace("{rate}", fmtPct(result.successRate))}</span>
              </li>
            ) : (
              <li className="flex items-start gap-2 text-sm">
                <span className="text-amber-500 font-bold mt-0.5">▲</span>
                <span className="text-slate-700">{t("results.insightLowSuccess").replace("{rate}", fmtPct(result.successRate))}</span>
              </li>
            )}
            {withdrawalRate > 4 ? (
              <li className="flex items-start gap-2 text-sm">
                <span className="text-rose-500 font-bold mt-0.5">!</span>
                <span className="text-slate-700">{t("results.insightWithdrawalAbove4").replace("{rate}", fmtPct(withdrawalRate))}</span>
              </li>
            ) : (
              <li className="flex items-start gap-2 text-sm">
                <span className="text-[#5a8a50] font-bold mt-0.5">✓</span>
                <span className="text-slate-700">{t("results.insightWithdrawalBelow4").replace("{rate}", fmtPct(withdrawalRate))}</span>
              </li>
            )}
            {result.sharpeRatio >= 0.5 ? (
              <li className="flex items-start gap-2 text-sm">
                <span className="text-[#5a8a50] font-bold mt-0.5">✓</span>
                <span className="text-slate-700">{t("results.insightHighSharpe").replace("{sr}", result.sharpeRatio.toFixed(2))}</span>
              </li>
            ) : (
              <li className="flex items-start gap-2 text-sm">
                <span className="text-amber-500 font-bold mt-0.5">▲</span>
                <span className="text-slate-700">{t("results.insightLowSharpe").replace("{sr}", result.sharpeRatio.toFixed(2))}</span>
              </li>
            )}
            {result.maxDrawdown > 40 && (
              <li className="flex items-start gap-2 text-sm">
                <span className="text-rose-500 font-bold mt-0.5">!</span>
                <span className="text-slate-700">{t("results.insightHighDrawdown").replace("{dd}", fmtPct(result.maxDrawdown))}</span>
              </li>
            )}
            <li className="flex items-start gap-2 text-sm">
              <span className="text-[#4D4A47] font-bold mt-0.5">→</span>
              <span className="text-slate-700">{t("results.insightCapitalAtRet").replace("{cap}", fmtEur(capitalAtRet))}</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}