"use client";

import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssetBucket, PortfolioConfig, MifidProfile } from "@/lib/types";
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

  const updateAllocation = (index: number, newValue: number) => {
    const newBuckets = [...portfolio.buckets] as PortfolioConfig["buckets"];
    const diff = newValue - newBuckets[index].allocation;
    newBuckets[index] = { ...newBuckets[index], allocation: newValue };
    const otherIndices = [0, 1, 2].filter((i) => i !== index);
    const otherTotal = otherIndices.reduce((s, i) => s + newBuckets[i].allocation, 0);
    if (otherTotal > 0) {
      for (const i of otherIndices) {
        const ratio = newBuckets[i].allocation / otherTotal;
        newBuckets[i] = { ...newBuckets[i], allocation: Math.max(0, Math.round(newBuckets[i].allocation - diff * ratio)) };
      }
    }
    const total = newBuckets.reduce((s, b) => s + b.allocation, 0);
    if (total !== 100) {
      const adjust = 100 - total;
      for (const i of otherIndices) {
        if (newBuckets[i].allocation + adjust >= 0) {
          newBuckets[i] = { ...newBuckets[i], allocation: newBuckets[i].allocation + adjust };
          break;
        }
      }
    }
    dispatch({ type: "SET_PORTFOLIO", payload: { buckets: newBuckets } });
  };

  const updateCorrelation = (i: number, j: number, value: number) => {
    const newMatrix = portfolio.correlationMatrix.map((row) => [...row]);
    newMatrix[i][j] = value;
    newMatrix[j][i] = value;
    dispatch({ type: "SET_PORTFOLIO", payload: { correlationMatrix: newMatrix } });
  };

  const applyMifidPreset = (profile: MifidProfile) => {
    const [cashAlloc, bondsAlloc, eqAlloc] = MIFID_PRESETS[profile];
    const newBuckets = portfolio.buckets.map((b, i) => {
      const alloc = [cashAlloc, bondsAlloc, eqAlloc][i];
      return { ...b, allocation: alloc };
    }) as PortfolioConfig["buckets"];
    dispatch({ type: "SET_PORTFOLIO", payload: { buckets: newBuckets, mifidProfile: profile } });
  };

  const portReturn = computePortfolioReturn(portfolio) * 100;
  const portVol = computePortfolioVolatility(portfolio) * 100;
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
          <div className="flex h-8 rounded-lg overflow-hidden mb-3" data-design-id="allocation-bar">
            {portfolio.buckets.map((b, i) => (
              <div key={b.name} className={`${BUCKET_COLORS[i].fill} flex items-center justify-center text-white text-xs font-bold transition-all`} style={{ width: `${b.allocation}%` }}>
                {b.allocation > 8 && `${b.allocation}%`}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            {portfolio.buckets.map((b, i) => (
              <span key={b.name} className={BUCKET_COLORS[i].accent}>{bucketLabel(i)}: {b.allocation}%</span>
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
                <Label className="text-xs">{t("portfolio.allocation")}</Label>
                <Slider value={[bucket.allocation]} onValueChange={([val]) => updateAllocation(index, val)} max={100} min={0} step={1} className="my-2" />
                <div className="text-right text-sm font-bold">{bucket.allocation}%</div>
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
                <p><strong>{t("portfolio.strategyWithdrawal")}</strong> {portfolio.cashYearsTarget} {t("portfolio.strategyWithdrawalDesc")}</p>
                <p><strong>{t("portfolio.strategyRefill")}</strong> {t("portfolio.strategyRefillDesc")}</p>
              </div>
            </div>
            )}

            <div data-design-id="cash-years-target-field">
              <Label>{t("portfolio.cashYearsLabel")}</Label>
              <Slider value={[portfolio.cashYearsTarget]} onValueChange={([val]) => dispatch({ type: "SET_PORTFOLIO", payload: { cashYearsTarget: val } })} max={5} min={1} step={1} />
              <div className="flex justify-between text-xs text-slate-500">
                <span>{t("portfolio.cashYearsOffensive")}</span>
                <span className="font-bold text-[#5a8a50]">{portfolio.cashYearsTarget} {portfolio.cashYearsTarget === 1 ? t("portfolio.year") : t("portfolio.yearsPlural")}</span>
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
              <Select value={portfolio.rebalancingFrequency} onValueChange={(v) => dispatch({ type: "SET_PORTFOLIO", payload: { rebalancingFrequency: v as PortfolioConfig["rebalancingFrequency"] } })}>
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
              <Slider value={[portfolio.rebalancingThreshold]} onValueChange={([val]) => dispatch({ type: "SET_PORTFOLIO", payload: { rebalancingThreshold: val } })} max={20} min={1} step={1} />
              <div className="text-right text-sm text-slate-500">{t("portfolio.rebalThresholdHint")} {portfolio.rebalancingThreshold}%</div>
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
