"use client";

import { useState } from "react";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssetBucket, PortfolioConfig, MifidProfile, WithdrawalPhaseOverride } from "@/lib/types";
import { computePortfolioReturn, computePortfolioVolatility, computeSharpeRatio } from "@/lib/engine/portfolio";
import { fmtPct } from "@/lib/format";
import { PrivateEquityBucket } from "./PrivateEquityBucket";

// MiFID II presets: [cash%, bonds%, equities%]
const MIFID_PRESETS: Record<MifidProfile, [number, number, number]> = {
  conservative: [30, 55, 15],
  balanced:     [15, 35, 50],
  growth:       [10, 20, 70],
  speculative:  [ 5, 15, 80],
};

const BUCKET_COLORS = [
  { bg: "bg-[#8FB687]/10", border: "border-[#8FB687]/40", accent: "text-[#5a8a50]", fill: "bg-[#8FB687]" },
  { bg: "bg-[#87BBE6]/10", border: "border-[#87BBE6]/40", accent: "text-[#3a7cb8]", fill: "bg-[#87BBE6]" },
  { bg: "bg-[#D31220]/5", border: "border-[#D31220]/30", accent: "text-[#D31220]", fill: "bg-[#D31220]" },
];

export function PortfolioBuilderSection() {
  const { state, dispatch } = useAppState();
  const { portfolio } = state;
  const { t } = useI18n();
  const isPro = state.uiMode === "pro";

  // ── Zwei-Phasen-Portfolio ─────────────────────────────────────────
  // `editPhase` steuert nur die UI (welche Phase gerade editiert wird);
  // die Datenhaltung liegt in `portfolio.buckets` (Ansparphase) bzw.
  // `portfolio.withdrawalPhase` (Entnahmephase).
  const wd = portfolio.withdrawalPhase;
  const twoPhase = !!wd;
  const [editPhase, setEditPhase] = useState<"accumulation" | "withdrawal">(
    "accumulation",
  );
  const editingWithdrawal = twoPhase && editPhase === "withdrawal";

  // Gewichte der aktuell editierten Phase.
  const accAllocations: [number, number, number] = [
    portfolio.buckets[0].allocation,
    portfolio.buckets[1].allocation,
    portfolio.buckets[2].allocation,
  ];
  const activeAllocations: [number, number, number] = editingWithdrawal
    ? [...wd!.allocations]
    : accAllocations;

  // Aktive Rebalancing-Parameter (Anspar- vs. Entnahmephase).
  const activeCashYears = editingWithdrawal ? wd!.cashYearsTarget : portfolio.cashYearsTarget;
  const activeRebalFreq = editingWithdrawal ? wd!.rebalancingFrequency : portfolio.rebalancingFrequency;
  const activeRebalThreshold = editingWithdrawal ? wd!.rebalancingThreshold : portfolio.rebalancingThreshold;

  const patchWithdrawal = (patch: Partial<WithdrawalPhaseOverride>) => {
    if (!wd) return;
    dispatch({ type: "SET_PORTFOLIO", payload: { withdrawalPhase: { ...wd, ...patch } } });
  };

  // Rebalancing-Parameter der aktiven Phase setzen.
  const setActiveCashYears = (v: number) =>
    editingWithdrawal
      ? patchWithdrawal({ cashYearsTarget: v })
      : dispatch({ type: "SET_PORTFOLIO", payload: { cashYearsTarget: v } });
  const setActiveRebalFreq = (v: PortfolioConfig["rebalancingFrequency"]) =>
    editingWithdrawal
      ? patchWithdrawal({ rebalancingFrequency: v })
      : dispatch({ type: "SET_PORTFOLIO", payload: { rebalancingFrequency: v } });
  const setActiveRebalThreshold = (v: number) =>
    editingWithdrawal
      ? patchWithdrawal({ rebalancingThreshold: v })
      : dispatch({ type: "SET_PORTFOLIO", payload: { rebalancingThreshold: v } });

  const toggleTwoPhase = (on: boolean) => {
    if (on) {
      // Entnahme-Portfolio mit den aktuellen Anspar-Werten vorbefüllen,
      // dann direkt zum Editieren der Entnahmephase springen.
      dispatch({
        type: "SET_PORTFOLIO",
        payload: {
          withdrawalPhase: {
            allocations: [...accAllocations],
            rebalancingFrequency: portfolio.rebalancingFrequency,
            rebalancingThreshold: portfolio.rebalancingThreshold,
            cashYearsTarget: portfolio.cashYearsTarget,
          },
        },
      });
      setEditPhase("withdrawal");
    } else {
      dispatch({ type: "SET_PORTFOLIO", payload: { withdrawalPhase: undefined } });
      setEditPhase("accumulation");
    }
  };

  const updateBucket = (index: number, field: keyof AssetBucket, value: number | string) => {
    const newBuckets = [...portfolio.buckets] as PortfolioConfig["buckets"];
    const bucket = { ...newBuckets[index] };
    if (field === "name" || field === "label") {
      (bucket as Record<string, unknown>)[field] = value;
    } else {
      (bucket as Record<string, unknown>)[field] = typeof value === "string" ? parseFloat(value) || 0 : value;
    }
    // When gross return or costs change, auto-recalculate taxDrag as
    //   taxDrag = max(0, (expectedReturn − costs) × kestRate / 100)
    // Direct taxDrag edits are respected and override this default.
    if (field === "expectedReturn" || field === "costs") {
      const kest = portfolio.kestRate ?? 27.5;
      const base = bucket.expectedReturn - bucket.costs;
      bucket.taxDrag = +Math.max(0, base * (kest / 100)).toFixed(2);
    }
    bucket.netReturn = +(bucket.expectedReturn - bucket.costs - bucket.taxDrag).toFixed(2);
    newBuckets[index] = bucket;
    dispatch({ type: "SET_PORTFOLIO", payload: { buckets: newBuckets } });
  };

  const updateKestRate = (newRate: number) => {
    // Recompute taxDrag for all buckets with the new KESt rate
    const newBuckets = portfolio.buckets.map((b) => {
      const base = b.expectedReturn - b.costs;
      const taxDrag = +Math.max(0, base * (newRate / 100)).toFixed(2);
      return {
        ...b,
        taxDrag,
        netReturn: +(b.expectedReturn - b.costs - taxDrag).toFixed(2),
      };
    }) as PortfolioConfig["buckets"];
    dispatch({
      type: "SET_PORTFOLIO",
      payload: { kestRate: newRate, buckets: newBuckets },
    });
  };

  // Re-normalisiert drei Gewichte auf 100 %, nachdem `index` auf `newValue`
  // gesetzt wurde (proportionale Verteilung der Differenz auf die anderen).
  const renormalize = (
    current: [number, number, number],
    index: number,
    newValue: number,
  ): [number, number, number] => {
    const out: [number, number, number] = [...current];
    const diff = newValue - out[index];
    out[index] = newValue;
    const others = [0, 1, 2].filter((i) => i !== index);
    const otherTotal = others.reduce((s, i) => s + out[i], 0);
    if (otherTotal > 0) {
      for (const i of others) {
        const ratio = out[i] / otherTotal;
        out[i] = Math.max(0, Math.round(out[i] - diff * ratio));
      }
    }
    const total = out.reduce((s, a) => s + a, 0);
    if (total !== 100) {
      const adjust = 100 - total;
      for (const i of others) {
        if (out[i] + adjust >= 0) {
          out[i] += adjust;
          break;
        }
      }
    }
    return out;
  };

  const updateAllocation = (index: number, newValue: number) => {
    if (editingWithdrawal && wd) {
      const allocs = renormalize([...wd.allocations], index, newValue);
      dispatch({ type: "SET_PORTFOLIO", payload: { withdrawalPhase: { ...wd, allocations: allocs } } });
      return;
    }
    const allocs = renormalize(accAllocations, index, newValue);
    const newBuckets = portfolio.buckets.map((b, i) => ({ ...b, allocation: allocs[i] })) as PortfolioConfig["buckets"];
    dispatch({ type: "SET_PORTFOLIO", payload: { buckets: newBuckets } });
  };

  const updateCorrelation = (i: number, j: number, value: number) => {
    const newMatrix = portfolio.correlationMatrix.map((row) => [...row]);
    newMatrix[i][j] = value;
    newMatrix[j][i] = value;
    dispatch({ type: "SET_PORTFOLIO", payload: { correlationMatrix: newMatrix } });
  };

  const applyMifidPreset = (profile: MifidProfile) => {
    const preset = MIFID_PRESETS[profile];
    // Preset wirkt auf die gerade editierte Phase.
    if (editingWithdrawal && wd) {
      patchWithdrawal({ allocations: [...preset] });
      return;
    }
    const newBuckets = portfolio.buckets.map((b, i) => ({ ...b, allocation: preset[i] })) as PortfolioConfig["buckets"];
    dispatch({ type: "SET_PORTFOLIO", payload: { buckets: newBuckets, mifidProfile: profile } });
  };

  // Kennzahlen für die aktuell editierte Phase berechnen (bei Entnahme-
  // Editierung mit den Entnahme-Gewichten, gleiche Rendite-/Vola-Annahmen).
  const metricPortfolio: PortfolioConfig = editingWithdrawal
    ? {
        ...portfolio,
        buckets: portfolio.buckets.map((b, i) => ({ ...b, allocation: activeAllocations[i] })) as PortfolioConfig["buckets"],
      }
    : portfolio;
  const portReturn = computePortfolioReturn(metricPortfolio) * 100;
  const portVol = computePortfolioVolatility(metricPortfolio) * 100;
  const riskFree = portfolio.buckets[0].netReturn / 100;
  const sharpe = computeSharpeRatio(portReturn / 100, portVol / 100, riskFree);

  // Fallback-Labels, falls der Nutzer den Topf-Namen leer lässt
  const bucketLabelKeys = ["portfolio.cash", "portfolio.bonds", "portfolio.equities"];
  const bucketLabel = (i: number) =>
    portfolio.buckets[i].label?.trim() ? portfolio.buckets[i].label : t(bucketLabelKeys[i]);

  const resetBucketLabel = (index: number) => {
    const newBuckets = [...portfolio.buckets] as PortfolioConfig["buckets"];
    newBuckets[index] = { ...newBuckets[index], label: t(bucketLabelKeys[index]) };
    dispatch({ type: "SET_PORTFOLIO", payload: { buckets: newBuckets } });
  };

  const mifidProfiles: MifidProfile[] = ["conservative", "balanced", "growth", "speculative"];
  const mifidColors: Record<MifidProfile, string> = {
    conservative: "border-[#8FB687] bg-[#8FB687]/10 text-[#5a8a50]",
    balanced:     "border-[#87BBE6] bg-[#87BBE6]/10 text-[#3a7cb8]",
    growth:       "border-amber-300 bg-amber-50 text-amber-700",
    speculative:  "border-[#D31220]/40 bg-[#D31220]/5 text-[#D31220]",
  };
  const mifidActive = portfolio.mifidProfile;

  return (
    <div className="space-y-6" data-design-id="portfolio-builder-section">
      <div data-design-id="portfolio-builder-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="portfolio-builder-title">{t("portfolio.title")}</h2>
        <p className="text-slate-500 mt-1" data-design-id="portfolio-builder-subtitle">{t("portfolio.subtitle")}</p>
      </div>

      {/* Zwei-Phasen-Portfolio: Schalter + Phasen-Umschalter */}
      <Card className="border-[#8A83BE]/40 bg-[#8A83BE]/5" data-design-id="two-phase-card">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start gap-3">
            <Switch
              id="twoPhaseSwitch"
              checked={twoPhase}
              onCheckedChange={toggleTwoPhase}
              data-design-id="two-phase-switch"
            />
            <div className="flex-1">
              <Label htmlFor="twoPhaseSwitch" className="cursor-pointer font-semibold text-[#4a4483]">
                {t("portfolio.twoPhaseTitle")}
              </Label>
              <p className="text-xs text-slate-500 mt-0.5">{t("portfolio.twoPhaseDesc")}</p>
            </div>
          </div>

          {twoPhase && (
            <>
              {/* Segmentierter Phasen-Umschalter */}
              <div
                className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
                data-design-id="phase-switcher"
              >
                <button
                  type="button"
                  onClick={() => setEditPhase("accumulation")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                    editPhase === "accumulation"
                      ? "bg-white text-[#3a7cb8] shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  data-design-id="phase-tab-accumulation"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>📈</span>
                    <span>{t("portfolio.phaseAccumulation")}</span>
                  </div>
                  <div className="text-[10px] font-normal opacity-70 mt-0.5">
                    {t("portfolio.phaseAccumulationSub").replace("{age}", String(state.client.retirementAge))}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setEditPhase("withdrawal")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                    editPhase === "withdrawal"
                      ? "bg-white text-[#5a8a50] shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  data-design-id="phase-tab-withdrawal"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>🏖️</span>
                    <span>{t("portfolio.phaseWithdrawal")}</span>
                  </div>
                  <div className="text-[10px] font-normal opacity-70 mt-0.5">
                    {t("portfolio.phaseWithdrawalSub").replace("{age}", String(state.client.retirementAge))}
                  </div>
                </button>
              </div>

              {/* Vergleichs-Balken beider Phasen */}
              <div className="space-y-2" data-design-id="phase-comparison">
                {([
                  { label: t("portfolio.phaseAccumulation"), allocs: accAllocations, active: editPhase === "accumulation" },
                  { label: t("portfolio.phaseWithdrawal"), allocs: [...wd!.allocations] as [number, number, number], active: editPhase === "withdrawal" },
                ]).map((row) => (
                  <div key={row.label} className={`rounded-lg p-2 transition-all ${row.active ? "bg-white ring-1 ring-slate-200" : "opacity-70"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-slate-600">{row.label}</span>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {row.allocs[0]}% / {row.allocs[1]}% / {row.allocs[2]}%
                      </span>
                    </div>
                    <div className="flex h-3 rounded overflow-hidden">
                      {row.allocs.map((a, i) => (
                        <div key={i} className={BUCKET_COLORS[i].fill} style={{ width: `${a}%` }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Hinweis: KESt beim Umschichten */}
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <span className="text-sm">ℹ️</span>
                <p className="text-[11px] text-amber-800 leading-relaxed">{t("portfolio.twoPhaseSwitchTaxHint")}</p>
              </div>

              {/* Kontext-Banner: welche Phase gerade editiert wird */}
              <div
                className={`rounded-lg px-3 py-2 text-xs font-medium ${
                  editingWithdrawal ? "bg-[#8FB687]/15 text-[#5a8a50]" : "bg-[#87BBE6]/15 text-[#3a7cb8]"
                }`}
                data-design-id="phase-edit-banner"
              >
                {editingWithdrawal ? t("portfolio.editingWithdrawal") : t("portfolio.editingAccumulation")}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* MiFID II Risk Profile Selector */}
      <Card className="border-[#87BBE6]/40 bg-[#87BBE6]/5" data-design-id="mifid-selector-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2" data-design-id="mifid-title">
            <span className="w-8 h-8 rounded-lg bg-[#87BBE6]/20 text-[#3a7cb8] flex items-center justify-center text-sm font-bold">§</span>
            {t("portfolio.mifidTitle")}
          </CardTitle>
          <p className="text-xs text-slate-500 mt-1">{t("portfolio.mifidDesc")}</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {mifidProfiles.map((profile) => (
              <button
                key={profile}
                type="button"
                onClick={() => applyMifidPreset(profile)}
                className={`rounded-xl border-2 p-3 text-left transition-all hover:shadow-md ${
                  mifidActive === profile
                    ? `${mifidColors[profile]} shadow-md ring-2 ring-offset-1`
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="text-sm font-bold mb-1">{t(`portfolio.mifid${profile.charAt(0).toUpperCase() + profile.slice(1)}`)}</div>
                <div className="text-[10px] text-slate-500 leading-snug">{t(`portfolio.mifid${profile.charAt(0).toUpperCase() + profile.slice(1)}Desc`)}</div>
                <div className="mt-2 flex gap-1">
                  {MIFID_PRESETS[profile].map((alloc, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full ${["bg-[#8FB687]","bg-[#87BBE6]","bg-[#D31220]"][i]}`}
                      style={{ width: `${alloc}%`, flex: "none" }}
                    />
                  ))}
                </div>
                <div className="text-[9px] text-slate-400 mt-1">
                  {MIFID_PRESETS[profile][0]}% / {MIFID_PRESETS[profile][1]}% / {MIFID_PRESETS[profile][2]}%
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200" data-design-id="allocation-bar-card">
        <CardContent className="pt-6">
          {twoPhase && (
            <div className="mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              {editingWithdrawal ? t("portfolio.phaseWithdrawal") : t("portfolio.phaseAccumulation")}
            </div>
          )}
          <div className="flex h-8 rounded-lg overflow-hidden mb-3" data-design-id="allocation-bar">
            {portfolio.buckets.map((b, i) => (
              <div key={b.name} className={`${BUCKET_COLORS[i].fill} flex items-center justify-center text-white text-xs font-bold transition-all`} style={{ width: `${activeAllocations[i]}%` }}>
                {activeAllocations[i] > 8 && `${activeAllocations[i]}%`}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            {portfolio.buckets.map((b, i) => (
              <span key={b.name} className={BUCKET_COLORS[i].accent}>{bucketLabel(i)}: {activeAllocations[i]}%</span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-design-id="three-bucket-grid">
        {portfolio.buckets.map((bucket, index) => (
          <Card key={bucket.name} className={`${BUCKET_COLORS[index].border} ${BUCKET_COLORS[index].bg}`} data-design-id={`bucket-card-${index}`}>
            <CardHeader className="pb-3">
              <CardTitle className={`text-base ${BUCKET_COLORS[index].accent} flex items-center gap-2`} data-design-id={`bucket-title-${index}`}>
                <span className="shrink-0 opacity-70">{t("portfolio.bucket")} {index + 1}:</span>
                <span className="flex-1 truncate">{bucketLabel(index)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div data-design-id={`bucket-label-${index}`}>
                <Label className="text-xs flex items-center justify-between">
                  <span>{t("portfolio.bucketLabelField")}</span>
                  {bucket.label?.trim() && bucket.label !== t(bucketLabelKeys[index]) && (
                    <button
                      type="button"
                      onClick={() => resetBucketLabel(index)}
                      className="text-[10px] text-slate-400 hover:text-slate-600 underline"
                    >
                      {t("portfolio.bucketLabelReset")}
                    </button>
                  )}
                </Label>
                <Input
                  type="text"
                  value={bucket.label ?? ""}
                  onChange={(e) => updateBucket(index, "label", e.target.value)}
                  placeholder={t(bucketLabelKeys[index])}
                  maxLength={40}
                  className="h-8 text-sm font-medium"
                />
              </div>
              <div data-design-id={`bucket-allocation-${index}`}>
                <Label className="text-xs flex items-center justify-between">
                  <span>{t("portfolio.allocation")}</span>
                  {editingWithdrawal && (
                    <span className="text-[9px] text-[#5a8a50] font-semibold">{t("portfolio.phaseWithdrawal")}</span>
                  )}
                </Label>
                <Slider value={[activeAllocations[index]]} onValueChange={([val]) => updateAllocation(index, val)} max={100} min={0} step={1} className="my-2" />
                <div className="text-right text-sm font-bold">{activeAllocations[index]}%</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div data-design-id={`bucket-return-${index}`}>
                  <Label className="text-xs">{t("portfolio.expectedReturn")}</Label>
                  <Input type="number" value={bucket.expectedReturn} onChange={(e) => updateBucket(index, "expectedReturn", e.target.value)} step={0.1} className="h-8 text-sm" />
                </div>
                <div data-design-id={`bucket-vol-${index}`}>
                  <Label className="text-xs">{t("portfolio.volatility")}</Label>
                  <Input type="number" value={bucket.volatility} onChange={(e) => updateBucket(index, "volatility", e.target.value)} step={0.5} className="h-8 text-sm" />
                </div>
                <div data-design-id={`bucket-costs-${index}`}>
                  <Label className="text-xs">{t("portfolio.costs")}</Label>
                  <Input type="number" value={bucket.costs} onChange={(e) => updateBucket(index, "costs", e.target.value)} step={0.1} className="h-8 text-sm" />
                </div>
                <div data-design-id={`bucket-tax-${index}`}>
                  <Label className="text-xs flex items-center gap-1" title={t("portfolio.taxDragAutoHint")}>
                    {t("portfolio.taxDrag")}
                    <span className="text-[9px] text-slate-400">({t("portfolio.auto")})</span>
                  </Label>
                  <Input type="number" value={bucket.taxDrag} onChange={(e) => updateBucket(index, "taxDrag", e.target.value)} step={0.1} className="h-8 text-sm" />
                </div>
              </div>
              {editingWithdrawal && (
                <p className="text-[10px] text-slate-400 leading-snug border-t border-slate-100 pt-2">
                  {t("portfolio.sharedAssumptionsHint")}
                </p>
              )}
              <div className={`text-center py-2 rounded ${BUCKET_COLORS[index].border} bg-white/60`} data-design-id={`bucket-net-return-${index}`}>
                <div className="text-xs text-slate-500">{t("portfolio.netReturn")}</div>
                <div className={`text-lg font-bold ${BUCKET_COLORS[index].accent}`}>{fmtPct(bucket.netReturn)}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Topf 4: Private Equity (deterministisch, optional) — nur Pro-Modus */}
      {isPro && <PrivateEquityBucket />}

      {/* Klassik-Erklärbox zur Allokation (nur in Klassik) */}
      {!isPro && (
        <Card className="border-neutral-200 bg-neutral-50/60" data-design-id="classic-help-allocation">
          <CardContent className="py-3">
            <div className="text-xs font-semibold text-[#20201E] mb-1">
              {t("classic.help.allocationTitle")}
            </div>
            <p className="text-xs text-[#4D4A47] leading-relaxed">
              {t("classic.help.allocationBody")}
            </p>
          </CardContent>
        </Card>
      )}

      <div className={`grid grid-cols-1 ${isPro ? "lg:grid-cols-2" : ""} gap-6`}>
        {isPro && (
        <Card data-design-id="correlation-matrix-card">
          <CardHeader>
            <CardTitle className="text-lg" data-design-id="correlation-title">{t("portfolio.correlationTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-3 text-slate-500 font-medium"></th>
                    <th className="py-2 px-2 text-center text-[#5a8a50] font-medium">{bucketLabel(0)}</th>
                    <th className="py-2 px-2 text-center text-[#4D4A47] font-medium">{bucketLabel(1)}</th>
                    <th className="py-2 px-2 text-center text-[#D31220] font-medium">{bucketLabel(2)}</th>
                  </tr>
                </thead>
                <tbody>
                  {[bucketLabel(0), bucketLabel(1), bucketLabel(2)].map((label, i) => (
                    <tr key={label}>
                      <td className="py-2 pr-3 font-medium text-slate-700">{label}</td>
                      {[0, 1, 2].map((j) => (
                        <td key={j} className="py-1 px-1">
                          {i === j ? (
                            <div className="text-center font-bold text-slate-400 bg-slate-50 rounded px-2 py-1">1.00</div>
                          ) : i < j ? (
                            <Input type="number" value={portfolio.correlationMatrix[i][j]} onChange={(e) => updateCorrelation(i, j, parseFloat(e.target.value) || 0)} step={0.05} min={-1} max={1} className="h-8 text-sm text-center" />
                          ) : (
                            <div className="text-center text-slate-400 bg-slate-50 rounded px-2 py-1">{portfolio.correlationMatrix[i][j].toFixed(2)}</div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        )}

        <Card data-design-id="rebalancing-card">
          <CardHeader>
            <CardTitle className="text-lg" data-design-id="rebalancing-title">
              {isPro ? t("portfolio.rebalancingTitle") : t("portfolio.cashYearsLabel")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPro && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm space-y-3" data-design-id="three-bucket-info">
              <div className="font-semibold text-amber-800">{t("portfolio.strategyTitle")}</div>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex gap-2 items-start">
                  <span className="text-base">🟢</span>
                  <div>
                    <div className="font-semibold text-amber-800 text-xs">{bucketLabel(0)} — {t("portfolio.threeBucketCash")}</div>
                    <div className="text-amber-700 text-[11px]">{t("portfolio.threeBucketCashDesc")}</div>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-base">🔵</span>
                  <div>
                    <div className="font-semibold text-amber-800 text-xs">{bucketLabel(1)} — {t("portfolio.threeBucketBonds")}</div>
                    <div className="text-amber-700 text-[11px]">{t("portfolio.threeBucketBondsDesc")}</div>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-base">🔴</span>
                  <div>
                    <div className="font-semibold text-amber-800 text-xs">{bucketLabel(2)} — {t("portfolio.threeBucketEquities")}</div>
                    <div className="text-amber-700 text-[11px]">{t("portfolio.threeBucketEquitiesDesc")}</div>
                  </div>
                </div>
              </div>
              <div className="border-t border-amber-200 pt-2">
                <div className="font-semibold text-amber-800 text-[11px] mb-1">{t("portfolio.threeBucketDeepTitle")}</div>
                <p className="text-amber-700 text-[11px] leading-relaxed">{t("portfolio.threeBucketDeepBody")}</p>
              </div>
              <div className="text-amber-700 text-xs space-y-0.5 border-t border-amber-200 pt-2">
                <p><strong>{t("portfolio.strategyAccumulation")}</strong> {t("portfolio.strategyAccumulationDesc")}</p>
                <p><strong>{t("portfolio.strategyWithdrawal")}</strong> {activeCashYears} {t("portfolio.strategyWithdrawalDesc")}</p>
                <p><strong>{t("portfolio.strategyRefill")}</strong> {t("portfolio.strategyRefillDesc")}</p>
              </div>
            </div>
            )}

            {twoPhase && (
              <div className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${editingWithdrawal ? "bg-[#8FB687]/15 text-[#5a8a50]" : "bg-[#87BBE6]/15 text-[#3a7cb8]"}`}>
                {editingWithdrawal ? t("portfolio.phaseWithdrawal") : t("portfolio.phaseAccumulation")}
              </div>
            )}

            <div data-design-id="cash-years-target-field">
              <Label>{t("portfolio.cashYearsLabel")}</Label>
              <Slider value={[activeCashYears]} onValueChange={([val]) => setActiveCashYears(val)} max={5} min={1} step={1} />
              <div className="flex justify-between text-xs text-slate-500">
                <span>{t("portfolio.cashYearsOffensive")}</span>
                <span className="font-bold text-[#5a8a50]">{activeCashYears} {activeCashYears === 1 ? t("portfolio.year") : t("portfolio.yearsPlural")}</span>
                <span>{t("portfolio.cashYearsConservative")}</span>
              </div>
              {!isPro && (
                <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50/60 p-2">
                  <div className="text-[11px] font-semibold text-[#20201E]">
                    {t("classic.help.cashYearsTitle")}
                  </div>
                  <p className="text-[11px] text-[#4D4A47] leading-relaxed">
                    {t("classic.help.cashYearsBody")}
                  </p>
                </div>
              )}
            </div>

            {isPro && (
            <div data-design-id="rebalancing-frequency-field">
              <Label>{t("portfolio.rebalFreq")}</Label>
              <Select value={activeRebalFreq} onValueChange={(v) => setActiveRebalFreq(v as PortfolioConfig["rebalancingFrequency"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t("portfolio.rebalMonthly")}</SelectItem>
                  <SelectItem value="quarterly">{t("portfolio.rebalQuarterly")}</SelectItem>
                  <SelectItem value="annually">{t("portfolio.rebalAnnually")}</SelectItem>
                  <SelectItem value="none">{t("portfolio.rebalNone")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            )}
            {isPro && (
            <div data-design-id="rebalancing-threshold-field">
              <Label>{t("portfolio.rebalThreshold")}</Label>
              <Slider value={[activeRebalThreshold]} onValueChange={([val]) => setActiveRebalThreshold(val)} max={20} min={1} step={1} />
              <div className="text-right text-sm text-slate-500">{t("portfolio.rebalThresholdHint")} {activeRebalThreshold}%</div>
            </div>
            )}

            <div className="border-t pt-3" data-design-id="kest-rate-field">
              <Label htmlFor="kestRate" className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-[#D31220]/10 text-[#D31220] flex items-center justify-center text-[10px] font-bold">€st</span>
                {t("portfolio.kestLabel")}
              </Label>
              <Input
                id="kestRate"
                type="number"
                value={portfolio.kestRate ?? 27.5}
                onChange={(e) => updateKestRate(parseFloat(e.target.value) || 0)}
                step={0.5}
                min={0}
                max={100}
                className="mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">{t("portfolio.kestHint")}</p>
              {!isPro && (
                <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50/60 p-2">
                  <div className="text-[11px] font-semibold text-[#20201E]">
                    {t("classic.help.kestTitle")}
                  </div>
                  <p className="text-[11px] text-[#4D4A47] leading-relaxed">
                    {t("classic.help.kestBody")}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t" data-design-id="portfolio-metrics">
              <div className="text-center" data-design-id="metric-return">
                <div className="text-lg font-bold text-[#5a8a50]">{fmtPct(portReturn)}</div>
                <div className="text-xs text-slate-500">{t("portfolio.metricReturn")}</div>
              </div>
              <div className="text-center" data-design-id="metric-volatility">
                <div className="text-lg font-bold text-rose-600">{fmtPct(portVol)}</div>
                <div className="text-xs text-slate-500">{t("portfolio.metricVol")}</div>
              </div>
              <div className="text-center" data-design-id="metric-sharpe">
                <div className="text-lg font-bold text-[#4D4A47]">{sharpe.toFixed(2)}</div>
                <div className="text-xs text-slate-500">{t("portfolio.metricSharpe")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
