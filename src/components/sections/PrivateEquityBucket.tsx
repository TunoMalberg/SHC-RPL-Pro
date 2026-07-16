"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  MAX_PE_FUNDS,
  makeDefaultPEFund,
  makeDefaultPEProgram,
  PE_DEFAULT_MGMT_FEE,
  PE_DEFAULT_POSTPERIOD_FEE,
  PE_DEFAULT_SETUP_COST,
  PE_DEFAULT_IRR_VOL,
  PE_DEFAULT_TVPI_VOL,
  PE_DEFAULT_LOSS_PROB,
} from "@/lib/defaults";
import {
  computePETimeline,
  computePESchedule,
  buildStochasticEnsemble,
} from "@/lib/engine/privateEquity";
import { planProgramVintagesDeterministic } from "@/lib/engine/peProgram";
import type { PEFund, PEModelingMode, PEProgram } from "@/lib/types";
import { fmtEur } from "@/lib/format";

const PE_COLOR = "#7B5BB6"; // Lila — abgegrenzt von den 3 Liquid-Töpfen.
const PE_BG = "bg-[#7B5BB6]/5";
const PE_BORDER = "border-[#7B5BB6]/40";
const PE_ACCENT = "text-[#5A3F94]";

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

/**
 * Karte für das rollierende PE-Programm (Zielquote).
 *
 * Das Programm erzeugt Vintages zur Laufzeit der Engine (pfadabhängig,
 * Pacing + Guards in peProgram.ts). Die Vorschau hier zeigt den
 * deterministischen Erwartungspfad: geplante Vintages, Ist-Quote vs.
 * Zielquote und den PE-NAV-Verlauf inkl. Pensionsantritts-Marker.
 */
function PEProgramCard() {
  const { state, dispatch } = useAppState();
  const { portfolio, client, inputs } = state;
  const { t } = useI18n();
  const [templateOpen, setTemplateOpen] = useState(false);
  const program = portfolio.peProgram;
  const enabled = program?.enabled === true;

  const setProgram = (next: PEProgram | undefined) => {
    dispatch({ type: "SET_PORTFOLIO", payload: { peProgram: next } });
  };

  const toggle = (on: boolean) => {
    if (on) {
      setProgram(program ? { ...program, enabled: true } : makeDefaultPEProgram());
    } else if (program) {
      setProgram({ ...program, enabled: false });
    }
  };

  const patch = (partial: Partial<PEProgram>) => {
    if (!program) return;
    setProgram({ ...program, ...partial });
  };

  const patchTemplate = (partial: Partial<PEProgram["fundTemplate"]>) => {
    if (!program) return;
    setProgram({
      ...program,
      fundTemplate: { ...program.fundTemplate, ...partial },
    });
  };

  const num =
    (apply: (v: number) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number.parseFloat(e.target.value);
      apply(Number.isFinite(v) ? v : 0);
    };

  // Deterministische Vorschau (Erwartungspfad).
  const preview = useMemo(() => {
    if (!enabled || !program) return null;
    return planProgramVintagesDeterministic(program, client, inputs, portfolio);
  }, [enabled, program, client, inputs, portfolio]);

  const previewChart = useMemo(
    () =>
      (preview?.quotaPath ?? []).map((q) => ({
        age: q.age,
        quota: Math.round(q.quotaPct * 10) / 10,
        nav: Math.round(q.nav),
        committed: Math.round(q.committed),
      })),
    [preview],
  );

  const plannedCommitments = useMemo(
    () => (preview?.vintages ?? []).reduce((s, v) => s + v.commitment, 0),
    [preview],
  );

  return (
    <div
      className="bg-white/70 rounded-lg p-3 border border-[#7B5BB6]/20 space-y-3"
      data-design-id="pe-program-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-700">
            {t("portfolio.peProgramTitle")}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 max-w-2xl">
            {t("portfolio.peProgramSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-slate-500">
            {t("portfolio.peProgramEnable")}
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={toggle}
            data-design-id="pe-program-toggle"
          />
        </div>
      </div>

      {enabled && program && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div>
              <Label className="text-[11px]">{t("portfolio.peProgramTargetQuota")}</Label>
              <Input
                type="number"
                value={program.targetQuotaPct}
                onChange={num((v) => patch({ targetQuotaPct: v }))}
                step={1}
                min={1}
                max={40}
                className="h-8 text-sm"
                data-design-id="pe-program-target-quota"
              />
            </div>
            <div>
              <Label className="text-[11px]">{t("portfolio.peProgramCadence")}</Label>
              <Input
                type="number"
                value={program.vintageCadenceYears}
                onChange={num((v) => patch({ vintageCadenceYears: v }))}
                step={1}
                min={1}
                max={3}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px]">{t("portfolio.peProgramBuffer")}</Label>
              <Input
                type="number"
                value={program.liquidityBufferYears}
                onChange={num((v) => patch({ liquidityBufferYears: v }))}
                step={1}
                min={0}
                max={10}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px]">{t("portfolio.peProgramCoverage")}</Label>
              <Input
                type="number"
                value={program.withdrawalCoveragePct}
                onChange={num((v) => patch({ withdrawalCoveragePct: v }))}
                step={10}
                min={0}
                max={300}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px]">{t("portfolio.peProgramMaxVintage")}</Label>
              <Input
                type="number"
                value={program.maxVintageQuotaPct}
                onChange={num((v) => patch({ maxVintageQuotaPct: v }))}
                step={1}
                min={1}
                max={40}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Fonds-Template (gilt für alle Vintages) */}
          <div className="border-t border-[#7B5BB6]/10 pt-2">
            <button
              type="button"
              onClick={() => setTemplateOpen(!templateOpen)}
              className="text-[11px] text-slate-600 hover:text-[#5A3F94] flex items-center gap-1"
              data-design-id="pe-program-template-toggle"
            >
              <span>{templateOpen ? "▾" : "▸"}</span>
              <span className="font-medium">{t("portfolio.peProgramTemplateTitle")}</span>
              <span className="text-slate-400">
                (IRR {program.fundTemplate.irr}% · TVPI{" "}
                {program.fundTemplate.tvpi.toFixed(1)}× ·{" "}
                {program.fundTemplate.investmentPeriod}/
                {program.fundTemplate.fundDuration}y)
              </span>
            </button>
            {templateOpen && (
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <Label className="text-[11px]">{t("portfolio.peIrr")}</Label>
                  <Input
                    type="number"
                    value={program.fundTemplate.irr}
                    onChange={num((v) => patchTemplate({ irr: v }))}
                    step={0.5}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">{t("portfolio.peTvpi")}</Label>
                  <Input
                    type="number"
                    value={program.fundTemplate.tvpi}
                    onChange={num((v) => patchTemplate({ tvpi: v }))}
                    step={0.1}
                    min={0}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">{t("portfolio.peCallRatio")}</Label>
                  <Input
                    type="number"
                    value={program.fundTemplate.callRatio}
                    onChange={num((v) => patchTemplate({ callRatio: v }))}
                    step={5}
                    min={0}
                    max={100}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">{t("portfolio.peInvPeriod")}</Label>
                  <Input
                    type="number"
                    value={program.fundTemplate.investmentPeriod}
                    onChange={num((v) => patchTemplate({ investmentPeriod: v }))}
                    step={1}
                    min={1}
                    max={20}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">{t("portfolio.peDuration")}</Label>
                  <Input
                    type="number"
                    value={program.fundTemplate.fundDuration}
                    onChange={num((v) => patchTemplate({ fundDuration: v }))}
                    step={1}
                    min={2}
                    max={30}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">{t("portfolio.peMgmtFee")}</Label>
                  <Input
                    type="number"
                    value={program.fundTemplate.mgmtFeeRate ?? PE_DEFAULT_MGMT_FEE}
                    onChange={num((v) => patchTemplate({ mgmtFeeRate: v }))}
                    step={0.1}
                    min={0}
                    max={5}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">{t("portfolio.pePostPeriodFee")}</Label>
                  <Input
                    type="number"
                    value={program.fundTemplate.postPeriodFeeRate ?? PE_DEFAULT_POSTPERIOD_FEE}
                    onChange={num((v) => patchTemplate({ postPeriodFeeRate: v }))}
                    step={0.1}
                    min={0}
                    max={5}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">{t("portfolio.peSetupCost")}</Label>
                  <Input
                    type="number"
                    value={program.fundTemplate.setupCostPct ?? PE_DEFAULT_SETUP_COST}
                    onChange={num((v) => patchTemplate({ setupCostPct: v }))}
                    step={0.1}
                    min={0}
                    max={5}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Vorschau: Ist-Quote vs. Ziel + NAV (Erwartungspfad) */}
          {preview && previewChart.length > 0 && (
            <div data-design-id="pe-program-preview">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-semibold text-slate-700">
                  {t("portfolio.peProgramPreviewTitle")}
                </h4>
                <span className="text-[10px] text-slate-400">
                  {t("portfolio.peProgramPreviewHint")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-[11px] mb-2">
                <div className="bg-white rounded p-2 border border-[#7B5BB6]/20">
                  <div className="text-slate-400 text-[10px]">
                    {t("portfolio.peProgramVintages")}
                  </div>
                  <div className={`font-bold ${PE_ACCENT}`}>
                    {preview.vintages.length}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-[#7B5BB6]/20">
                  <div className="text-slate-400 text-[10px]">
                    {t("portfolio.peProgramSumCommit")}
                  </div>
                  <div className={`font-bold ${PE_ACCENT}`}>
                    {fmtEur(plannedCommitments)}
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart
                  data={previewChart}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="age" tick={{ fontSize: 10 }} />
                  <YAxis
                    yAxisId="nav"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    yAxisId="quota"
                    orientation="right"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, Math.max(25, program.targetQuotaPct + 10)]}
                  />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === t("portfolio.peProgramQuota")) {
                        return `${Number(value).toFixed(1)} %`;
                      }
                      return fmtEur(Number(value) || 0);
                    }}
                    labelFormatter={(label) => `${t("portfolio.peChartAge")}: ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    yAxisId="nav"
                    type="monotone"
                    dataKey="nav"
                    name={t("portfolio.peProgramNav")}
                    stroke={PE_COLOR}
                    fill={PE_COLOR}
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="quota"
                    type="monotone"
                    dataKey="quota"
                    name={t("portfolio.peProgramQuota")}
                    stroke="#B8860B"
                    strokeWidth={2}
                    dot={false}
                  />
                  <ReferenceLine
                    yAxisId="quota"
                    y={program.targetQuotaPct}
                    stroke="#B8860B"
                    strokeDasharray="4 4"
                    label={{
                      value: t("portfolio.peProgramTarget"),
                      fontSize: 10,
                      fill: "#B8860B",
                      position: "insideTopRight",
                    }}
                  />
                  <ReferenceLine
                    yAxisId="quota"
                    x={client.retirementAge}
                    stroke="#64748b"
                    strokeDasharray="4 4"
                    label={{
                      value: t("portfolio.peProgramRetirement"),
                      fontSize: 10,
                      fill: "#64748b",
                      position: "insideTopLeft",
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface PEFundRowProps {
  fund: PEFund;
  idx: number;
}

function PEFundRow({ fund, idx }: PEFundRowProps) {
  const { dispatch, state } = useAppState();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(idx === 0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const kestRate = (state.portfolio.kestRate ?? 27.5) / 100;
  const peMode: PEModelingMode = state.portfolio.peModelingMode ?? "realistic";
  const schedule = useMemo(
    () => computePESchedule(fund, kestRate, peMode),
    [fund, kestRate, peMode],
  );
  const isStochastic = peMode === "full";
  const showFeeFields = peMode !== "simple";

  const update = <K extends keyof PEFund>(key: K, value: PEFund[K]) => {
    dispatch({ type: "UPDATE_PE_FUND", payload: { ...fund, [key]: value } });
  };

  const remove = () => {
    dispatch({ type: "REMOVE_PE_FUND", payload: fund.id });
  };

  const numChange =
    (key: keyof PEFund) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      update(key, (Number.isFinite(v) ? v : 0) as PEFund[typeof key]);
    };

  return (
    <div className="bg-white rounded-lg border border-[#7B5BB6]/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-[#7B5BB6]/5 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded bg-[#7B5BB6]/20 text-[#5A3F94] text-[10px] font-bold flex items-center justify-center shrink-0">
            {idx + 1}
          </span>
          <span className="text-sm font-medium truncate">{fund.name}</span>
          <span className="text-[10px] text-slate-400 hidden md:inline">
            · {fmtEur(fund.commitment)} · {fund.callRatio}% · IRR {fund.irr}% ·
            TVPI {fund.tvpi.toFixed(1)}× · {fund.investmentPeriod}/{fund.fundDuration}y
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-slate-400">
            {t("portfolio.peStartAge")} {fund.startAge}
          </span>
          <span className="text-slate-300">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[#7B5BB6]/10 bg-white/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("portfolio.peName")}</Label>
              <Input
                type="text"
                value={fund.name}
                onChange={(e) => update("name", e.target.value)}
                maxLength={40}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peCommitment")}</Label>
              <Input
                type="number"
                value={fund.commitment}
                onChange={numChange("commitment")}
                step={10000}
                min={0}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peCallRatio")}</Label>
              <Input
                type="number"
                value={fund.callRatio}
                onChange={numChange("callRatio")}
                step={5}
                min={0}
                max={100}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peIrr")}</Label>
              <Input
                type="number"
                value={fund.irr}
                onChange={numChange("irr")}
                step={0.5}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peTvpi")}</Label>
              <Input
                type="number"
                value={fund.tvpi}
                onChange={numChange("tvpi")}
                step={0.1}
                min={0}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peStartAge")}</Label>
              <Input
                type="number"
                value={fund.startAge}
                onChange={numChange("startAge")}
                step={1}
                min={18}
                max={100}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peInvPeriod")}</Label>
              <Input
                type="number"
                value={fund.investmentPeriod}
                onChange={numChange("investmentPeriod")}
                step={1}
                min={1}
                max={20}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peDuration")}</Label>
              <Input
                type="number"
                value={fund.fundDuration}
                onChange={numChange("fundDuration")}
                step={1}
                min={2}
                max={30}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="text-[11px] text-slate-500 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <span className="text-slate-400">
                {t("portfolio.peFundCalled")}:
              </span>{" "}
              <strong>{fmtEur(schedule.totalCalled)}</strong>
            </div>
            <div>
              <span className="text-slate-400">
                {t("portfolio.peFundDistGross")}:
              </span>{" "}
              <strong>{fmtEur(schedule.totalDistributionsGross)}</strong>
            </div>
            <div>
              <span className="text-slate-400">
                {t("portfolio.peFundIrrAchieved")}:
              </span>{" "}
              <strong>{(schedule.achievedIRR * 100).toFixed(2)}%</strong>
            </div>
            <div>
              <span className="text-slate-400">
                {t("portfolio.peFundEndAge")}:
              </span>{" "}
              <strong>{fund.startAge + fund.fundDuration}</strong>
            </div>
          </div>

          {/* Erweiterte Parameter (J-Curve & Stochastik) */}
          {showFeeFields && (
            <div className="border-t border-[#7B5BB6]/10 pt-2">
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="text-[11px] text-slate-600 hover:text-[#5A3F94] flex items-center gap-1"
              >
                <span>{advancedOpen ? "▾" : "▸"}</span>
                <span className="font-medium">{t("portfolio.peAdvancedTitle")}</span>
                <span className="text-slate-400">
                  ({isStochastic
                    ? t("portfolio.peAdvancedHintFull")
                    : t("portfolio.peAdvancedHintRealistic")})
                </span>
              </button>
              {advancedOpen && (
                <div className="mt-2 space-y-3">
                  {/* J-Curve / Fee-Drag */}
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                      {t("portfolio.peAdvancedJCurve")}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[11px]">{t("portfolio.peMgmtFee")}</Label>
                        <Input
                          type="number"
                          value={fund.mgmtFeeRate ?? PE_DEFAULT_MGMT_FEE}
                          onChange={numChange("mgmtFeeRate")}
                          step={0.1}
                          min={0}
                          max={5}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">{t("portfolio.pePostPeriodFee")}</Label>
                        <Input
                          type="number"
                          value={fund.postPeriodFeeRate ?? PE_DEFAULT_POSTPERIOD_FEE}
                          onChange={numChange("postPeriodFeeRate")}
                          step={0.1}
                          min={0}
                          max={5}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">{t("portfolio.peSetupCost")}</Label>
                        <Input
                          type="number"
                          value={fund.setupCostPct ?? PE_DEFAULT_SETUP_COST}
                          onChange={numChange("setupCostPct")}
                          step={0.1}
                          min={0}
                          max={5}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                  {/* Stochastik */}
                  {isStochastic && (
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                        {t("portfolio.peAdvancedStoch")}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[11px]">{t("portfolio.peIrrVol")}</Label>
                          <Input
                            type="number"
                            value={fund.irrVolatility ?? PE_DEFAULT_IRR_VOL}
                            onChange={numChange("irrVolatility")}
                            step={0.5}
                            min={0}
                            max={20}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px]">{t("portfolio.peTvpiVol")}</Label>
                          <Input
                            type="number"
                            value={fund.tvpiVolatility ?? PE_DEFAULT_TVPI_VOL}
                            onChange={numChange("tvpiVolatility")}
                            step={0.05}
                            min={0}
                            max={2}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px]">{t("portfolio.peLossProb")}</Label>
                          <Input
                            type="number"
                            value={fund.lossProbability ?? PE_DEFAULT_LOSS_PROB}
                            onChange={numChange("lossProbability")}
                            step={0.01}
                            min={0}
                            max={0.5}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={remove}
              className="text-[11px] text-rose-500 hover:text-rose-700 hover:underline"
            >
              {t("portfolio.peRemove")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}