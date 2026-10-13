"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MAX_PE_FUNDS, makeDefaultPEFund } from "@/lib/defaults";
import { computePETimeline, computePESchedule, buildStochasticEnsemble } from "@/lib/engine/privateEquity";
import type { PEModelingMode } from "@/lib/types";
import { fmtEur } from "@/lib/format";
import { PE_COLOR, PE_BG, PE_BORDER, PE_ACCENT } from "./peStyles";
import { PEProgramCard } from "./PEProgramCard";
import { PEFundRow } from "./PEFundRow";

export function PrivateEquityBucket() {
  const { state, dispatch } = useAppState();
  const { portfolio, client } = state;
  const { t } = useI18n();
  // useMemo: identische Referenz, solange portfolio.peFunds nicht wechselt.
  const peFunds = useMemo(() => portfolio.peFunds ?? [], [portfolio.peFunds]);

  const kestRate = (portfolio.kestRate ?? 27.5) / 100;
  const peMode: PEModelingMode = portfolio.peModelingMode ?? "realistic";

  // Aggregate timeline für Diagramm: vom heutigen Alter bis Lebenserwartung.
  const totalYears = Math.max(0, client.lifeExpectancy - client.currentAge);
  const timeline = useMemo(
    () => computePETimeline(peFunds, client.currentAge, totalYears, kestRate, peMode),
    [peFunds, client.currentAge, totalYears, kestRate, peMode],
  );

  // Stochastik-Ensemble nur im Modus 'full' — liefert p25/p75-Bänder.
  const ensemble = useMemo(() => {
    if (peMode !== "full" || peFunds.length === 0) return null;
    return buildStochasticEnsemble(peFunds, client.currentAge, totalYears, kestRate, 100, 12345);
  }, [peMode, peFunds, client.currentAge, totalYears, kestRate]);

  // Pro Fonds Schedule (für Tabelle / Validierung)
  const schedules = useMemo(
    () => peFunds.map((f) => computePESchedule(f, kestRate, peMode)),
    [peFunds, kestRate, peMode],
  );

  const chartData = useMemo(
    () =>
      timeline.map((e, i) => ({
        age: e.age,
        nav: Math.round(e.totalNav),
        navP25: ensemble ? Math.round(ensemble.navP25[i] ?? 0) : undefined,
        navP75: ensemble ? Math.round(ensemble.navP75[i] ?? 0) : undefined,
        navBand: ensemble
          ? Math.max(0, Math.round((ensemble.navP75[i] ?? 0) - (ensemble.navP25[i] ?? 0)))
          : undefined,
        call: Math.round(e.totalCall),
        distGross: Math.round(e.totalDistGross),
        distNet: Math.round(e.totalDistNet),
      })),
    [timeline, ensemble],
  );

  const totalCommitment = peFunds.reduce((s, f) => s + f.commitment, 0);
  const totalCalled = schedules.reduce((s, sc) => s + sc.totalCalled, 0);
  const totalDistGross = schedules.reduce(
    (s, sc) => s + sc.totalDistributionsGross,
    0,
  );
  const peakNav = Math.max(0, ...timeline.map((e) => e.totalNav));

  const handleAdd = () => {
    if (peFunds.length >= MAX_PE_FUNDS) return;
    const fund = makeDefaultPEFund(client.currentAge, peFunds.length);
    dispatch({ type: "ADD_PE_FUND", payload: fund });
  };

  const setMode = (mode: PEModelingMode) => {
    dispatch({ type: "SET_PORTFOLIO", payload: { peModelingMode: mode } });
  };

  const modeOptions: { value: PEModelingMode; labelKey: string; descKey: string }[] = [
    { value: "simple", labelKey: "portfolio.peModeSimple", descKey: "portfolio.peModeSimpleDesc" },
    { value: "realistic", labelKey: "portfolio.peModeRealistic", descKey: "portfolio.peModeRealisticDesc" },
    { value: "full", labelKey: "portfolio.peModeFull", descKey: "portfolio.peModeFullDesc" },
  ];

  return (
    <Card
      className={`${PE_BORDER} ${PE_BG}`}
      data-design-id="pe-bucket-card"
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle
              className={`text-base ${PE_ACCENT} flex items-center gap-2`}
              data-design-id="pe-bucket-title"
            >
              <span className="shrink-0 opacity-70">
                {t("portfolio.bucket")} 4:
              </span>
              <span className="flex-1">{t("portfolio.peTitle")}</span>
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              {t("portfolio.peSubtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">
              {peFunds.length} / {MAX_PE_FUNDS}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleAdd}
              disabled={peFunds.length >= MAX_PE_FUNDS}
              className={`border-[#7B5BB6]/50 ${PE_ACCENT} hover:bg-[#7B5BB6]/10`}
              data-design-id="pe-add-button"
            >
              + {t("portfolio.peAddFund")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Modus-Toggle: Einfach / Realistisch / Vollständig */}
        <div
          className="bg-white/70 rounded-lg p-3 border border-[#7B5BB6]/20"
          data-design-id="pe-mode-toggle"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-700">
                {t("portfolio.peModeTitle")}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5">
                {t(`portfolio.peMode${peMode === "simple" ? "Simple" : peMode === "realistic" ? "Realistic" : "Full"}Desc`)}
              </span>
            </div>
            <div className="flex rounded-md border border-[#7B5BB6]/30 overflow-hidden">
              {modeOptions.map((opt) => {
                const active = peMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMode(opt.value)}
                    className={`text-[11px] px-3 py-1.5 transition ${
                      active
                        ? "bg-[#7B5BB6] text-white font-semibold"
                        : "bg-white text-slate-600 hover:bg-[#7B5BB6]/10"
                    }`}
                    data-design-id={`pe-mode-${opt.value}`}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rollierendes PE-Programm (Zielquote via wiederkehrende Vintages) */}
        <PEProgramCard />

        {peFunds.length === 0 ? (
          <div
            className="text-sm text-slate-500 text-center py-6 bg-white/60 rounded-lg border border-dashed border-[#7B5BB6]/30"
            data-design-id="pe-empty-state"
          >
            {t("portfolio.peEmpty")}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-white/70 rounded-md p-2">
                <div className="text-slate-500">
                  {t("portfolio.peSummaryCommitment")}
                </div>
                <div className={`font-bold ${PE_ACCENT}`}>
                  {fmtEur(totalCommitment)}
                </div>
              </div>
              <div className="bg-white/70 rounded-md p-2">
                <div className="text-slate-500">
                  {t("portfolio.peSummaryCalled")}
                </div>
                <div className={`font-bold ${PE_ACCENT}`}>
                  {fmtEur(totalCalled)}
                </div>
              </div>
              <div className="bg-white/70 rounded-md p-2">
                <div className="text-slate-500">
                  {t("portfolio.peSummaryDistGross")}
                </div>
                <div className={`font-bold ${PE_ACCENT}`}>
                  {fmtEur(totalDistGross)}
                </div>
              </div>
              <div className="bg-white/70 rounded-md p-2">
                <div className="text-slate-500">
                  {t("portfolio.peSummaryPeakNav")}
                </div>
                <div className={`font-bold ${PE_ACCENT}`}>{fmtEur(peakNav)}</div>
              </div>
            </div>

            <div className="space-y-3">
              {portfolio.peProgram?.enabled && (
                <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  {t("portfolio.peProgramBestandTitle")}
                </div>
              )}
              {peFunds.map((fund, idx) => (
                <PEFundRow key={fund.id} fund={fund} idx={idx} />
              ))}
            </div>

            <div
              className="bg-white/70 rounded-lg p-3 border border-[#7B5BB6]/20"
              data-design-id="pe-chart-card"
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-700">
                  {t("portfolio.peChartTitle")}
                </h4>
                <span className="text-[10px] text-slate-400">
                  {t("portfolio.peChartHint")}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="age" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value, name) => {
                      // navP25 ist der Boden des Stacks → für Tooltip echten Wert anzeigen
                      if (name === t("portfolio.peChartNavBand")) return fmtEur(Number(value) || 0);
                      return fmtEur(Number(value) || 0);
                    }}
                    labelFormatter={(label) => `${t("portfolio.peChartAge")}: ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {/* Stochastik-Band (p25-p75) — als gestackte Areas:
                      navP25 unsichtbar, navBand transparent darüber. */}
                  {ensemble && (
                    <>
                      <Area
                        type="monotone"
                        dataKey="navP25"
                        name=""
                        stackId="band"
                        stroke="none"
                        fill="transparent"
                        legendType="none"
                      />
                      <Area
                        type="monotone"
                        dataKey="navBand"
                        name={t("portfolio.peChartNavBand")}
                        stackId="band"
                        stroke="none"
                        fill={PE_COLOR}
                        fillOpacity={0.18}
                      />
                    </>
                  )}
                  <Area
                    type="monotone"
                    dataKey="nav"
                    name={ensemble ? t("portfolio.peChartNavMedian") : t("portfolio.peChartNav")}
                    stroke={PE_COLOR}
                    fill={PE_COLOR}
                    fillOpacity={ensemble ? 0.05 : 0.25}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="call"
                    name={t("portfolio.peChartCalls")}
                    stroke="#D31220"
                    fill="#D31220"
                    fillOpacity={0.15}
                  />
                  <Area
                    type="monotone"
                    dataKey="distNet"
                    name={t("portfolio.peChartDistNet")}
                    stroke="#5a8a50"
                    fill="#5a8a50"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
              {ensemble && (
                <div
                  className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] mt-2"
                  data-design-id="pe-ensemble-stats"
                >
                  <div className="bg-white rounded p-2 border border-[#7B5BB6]/20">
                    <div className="text-slate-400 text-[10px]">{t("portfolio.peEnsembleSuccess")}</div>
                    <div className={`font-bold ${PE_ACCENT}`}>
                      {(ensemble.successRate * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-white rounded p-2 border border-[#7B5BB6]/20">
                    <div className="text-slate-400 text-[10px]">{t("portfolio.peEnsembleMedianIRR")}</div>
                    <div className={`font-bold ${PE_ACCENT}`}>
                      {ensemble.medianIRRPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-white rounded p-2 border border-[#7B5BB6]/20">
                    <div className="text-slate-400 text-[10px]">{t("portfolio.peEnsembleMedianTVPI")}</div>
                    <div className={`font-bold ${PE_ACCENT}`}>
                      {ensemble.medianTVPI.toFixed(2)}×
                    </div>
                  </div>
                  <div className="bg-white rounded p-2 border border-[#7B5BB6]/20">
                    <div className="text-slate-400 text-[10px]">{t("portfolio.peEnsembleSize")}</div>
                    <div className={`font-bold ${PE_ACCENT}`}>{ensemble.scenarios.length}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-500 leading-snug bg-white/60 rounded p-2 border border-[#7B5BB6]/15">
              <strong>{t("portfolio.peNoteTitle")}:</strong>{" "}
              {t("portfolio.peNoteBody")}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
