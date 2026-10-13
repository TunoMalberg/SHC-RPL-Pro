"use client";

import { useMemo, useState } from "react";
import {
  Area,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  makeDefaultPEProgram,
  PE_DEFAULT_MGMT_FEE,
  PE_DEFAULT_POSTPERIOD_FEE,
  PE_DEFAULT_SETUP_COST,
} from "@/lib/defaults";
import { planProgramVintagesDeterministic } from "@/lib/engine/peProgram";
import type { PEProgram } from "@/lib/types";
import { fmtEur } from "@/lib/format";
import { PE_COLOR, PE_ACCENT } from "./peStyles";

/**
 * Karte für das rollierende PE-Programm (Zielquote).
 *
 * Das Programm erzeugt Vintages zur Laufzeit der Engine (pfadabhängig,
 * Pacing + Guards in peProgram.ts). Die Vorschau hier zeigt den
 * deterministischen Erwartungspfad: geplante Vintages, Ist-Quote vs.
 * Zielquote und den PE-NAV-Verlauf inkl. Pensionsantritts-Marker.
 */
export function PEProgramCard() {
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
