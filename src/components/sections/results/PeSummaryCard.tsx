"use client";

import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtEur, fmtPct, fmtNum } from "@/lib/format";
import { computePETimeline } from "@/lib/engine/privateEquity";
import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  ReferenceLine,
  Line,
} from "recharts";
import type { ClientProfile, PortfolioConfig, SimulationResult } from "@/lib/types";

/** Private Equity (Topf 4): Zusammenfassung der Bestandsfonds auf der Ergebnisseite. */
export function PeSummaryCard({
  result,
  portfolio,
  client,
}: {
  result: SimulationResult;
  portfolio: PortfolioConfig;
  client: ClientProfile;
}) {
  const { t } = useI18n();
  const hasPE = (result.pePath?.length ?? 0) > 0;
    const peMode = portfolio.peModelingMode ?? "realistic";
    const peSummary = useMemo(() => {
      const peFunds = portfolio.peFunds ?? [];
      if (peFunds.length === 0) return null;
      const totalYears = Math.max(1, client.lifeExpectancy - client.currentAge);
      // AP6-Fix: KESt-Satz aus der Konfiguration statt fest verdrahtet 0.275 —
      // sonst ignoriert die PE-Karte eine geänderte (z. B. 0 %) KESt.
      const timeline = computePETimeline(
  peFunds,
  client.currentAge,
  totalYears,
  (portfolio.kestRate ?? 27.5) / 100,
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
    }, [portfolio.peFunds, portfolio.kestRate, client.currentAge, client.lifeExpectancy, peMode]);

  return (
    <>
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
                    ? `${fmtPct((peSummary.totalCalled / peSummary.totalCommitment) * 100)} of commit.`
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
    </>
  );
}
