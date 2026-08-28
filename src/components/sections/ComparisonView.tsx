"use client";

import { useState, useCallback } from "react";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MIFID_ORDER,
  MIFID_PRESETS,
  buildTargetPortfolio,
  computeMcVariant,
  computeNoInvestVariant,
  assembleComparison,
  type ComparisonTargetSpec,
} from "@/lib/engine/comparison";
import type {
  ComparisonVariantResult,
  CorridorRanking,
  MifidProfile,
} from "@/lib/types";
import { fmtEur, fmtPct } from "@/lib/format";
import { validatePlanInputs } from "@/lib/validation";
import { toast } from "sonner";

/**
 * Vergleichsansicht (CR 15/17): „Nicht investieren" vs. bestehende
 * Veranlagung vs. Zielstrategie (MiFID-Profil oder Optimizer-Ergebnis).
 *
 * Beratungsorientierte Standardansicht: alle Kennzahlen je Variante ohne
 * Ansichtswechsel — Ertragserwartung, nominaler Endwert (mit Jahr), Wert
 * in heutiger Kaufkraft, Monatsentnahme in heutiger Kaufkraft,
 * Planungskorridor, Einordnung bzw. „was möglich ist", Konsequenz, CTA.
 */
export function ComparisonView() {
  const { state, dispatch } = useAppState();
  const { client, inputs, portfolio, settings, liquidityEvents } = state;
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStep, setProgressStep] = useState("");
  const [targetChoice, setTargetChoice] = useState<string>("balanced");

  const isReal = state.valuationMode === "real";
  const comparison = state.comparisonResult;
  const hasOptimizer = state.optimizerBestAllocation !== null;
  const hasWish = inputs.desiredMonthlyWithdrawal !== null;

  const mifidLabel = (p: MifidProfile) =>
    t(`portfolio.mifid${p.charAt(0).toUpperCase() + p.slice(1)}`);

  const runComparison = useCallback(async () => {
    const validation = validatePlanInputs(client, inputs, portfolio, liquidityEvents);
    const errors = validation.errors.filter((e) => e.severity === "error");
    if (errors.length > 0) {
      toast.error(t("sim.validationFailed") || "Eingaben prüfen", {
        description: errors.slice(0, 3).map((e) => e.message).join("\n"),
      });
      return;
    }

    setRunning(true);
    setProgressPct(5);
    setProgressStep(t("compare.progressBaseline"));
    await new Promise((r) => setTimeout(r, 30));

    try {
      // Variante 1: Nicht investieren (deterministisch, 0 % nominal).
      const variants: ComparisonVariantResult[] = [
        computeNoInvestVariant(client, inputs, liquidityEvents, t("compare.variantNoInvest")),
      ];
      setProgressPct(15);
      setProgressStep(t("compare.progressCurrent"));
      await new Promise((r) => setTimeout(r, 30));

      // Variante 2: bestehende Veranlagung (aktuelles Portfolio).
      variants.push(
        computeMcVariant(
          "current",
          t("compare.variantCurrent"),
          client, inputs, portfolio, settings, liquidityEvents,
          (e) => setProgressPct(15 + Math.round((e.done / e.total) * 35)),
        ),
      );
      setProgressPct(55);
      setProgressStep(t("compare.progressTarget"));
      await new Promise((r) => setTimeout(r, 30));

      // Variante 3: Zielstrategie (MiFID-Profil oder Optimizer-Ergebnis).
      let targetSource: { type: "mifid" | "optimizer"; id: string; label: string } | undefined;
      let targetSpec: ComparisonTargetSpec | null = null;
      if (targetChoice === "optimizer" && state.optimizerBestAllocation) {
        const a = state.optimizerBestAllocation;
        targetSpec = { type: "optimizer", alloc: { cash: a.cash, bonds: a.bonds, equities: a.equities, pe: a.pe } };
        targetSource = { type: "optimizer", id: "optimizer", label: t("compare.targetSourceOptimizer") };
      } else if (MIFID_ORDER.includes(targetChoice as MifidProfile)) {
        targetSpec = { type: "mifid", profile: targetChoice as MifidProfile };
        targetSource = {
          type: "mifid",
          id: targetChoice,
          // t() direkt statt mifidLabel — hält die useCallback-Deps minimal.
          label: t(`portfolio.mifid${targetChoice.charAt(0).toUpperCase() + targetChoice.slice(1)}`),
        };
      }
      if (targetSpec && targetSource) {
        const targetPortfolio = buildTargetPortfolio(
          portfolio, targetSpec, inputs.initialCapital, client.currentAge,
        );
        variants.push(
          computeMcVariant(
            "target",
            `${t("compare.variantTarget")}: ${targetSource.label}`,
            client, inputs, targetPortfolio, settings, liquidityEvents,
            (e) => setProgressPct(55 + Math.round((e.done / e.total) * 40)),
          ),
        );
      }

      dispatch({
        type: "SET_COMPARISON_RESULT",
        payload: assembleComparison(variants, targetSource),
      });
      setProgressPct(100);
      setProgressStep("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [client, inputs, portfolio, settings, liquidityEvents, targetChoice, state.optimizerBestAllocation, dispatch, t]);

  /** Fallabhängiger CTA (CR 15/17) — keine Pauschalaussagen. */
  const pickCta = (ranking: CorridorRanking | null | undefined): string => {
    if (!hasWish) return t("compare.cta.possibleMode");
    if (ranking === "above_favorable") return t("compare.cta.overCorridor");
    if (ranking === "below_difficult") return t("compare.cta.underCorridor");
    return t("compare.cta.inCorridor");
  };

  const reference = comparison
    ? comparison.variants.find((v) => v.kind === "target") ??
      comparison.variants.find((v) => v.kind === "current")
    : undefined;

  return (
    <div className="space-y-6" data-design-id="comparison-section">
      <div data-design-id="comparison-header">
        <h2 className="text-2xl font-bold text-slate-900">{t("compare.viewTitle")}</h2>
        <p className="text-slate-500 mt-1">{t("compare.viewSubtitle")}</p>
      </div>

      {/* Konfiguration + Start */}
      <Card data-design-id="comparison-config-card">
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1">
              <Label>{t("compare.targetLabel")}</Label>
              <Select value={targetChoice} onValueChange={setTargetChoice}>
                <SelectTrigger data-design-id="comparison-target-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MIFID_ORDER.map((p) => (
                    <SelectItem key={p} value={p}>
                      {mifidLabel(p)} ({MIFID_PRESETS[p][0]}/{MIFID_PRESETS[p][1]}/{MIFID_PRESETS[p][2]})
                    </SelectItem>
                  ))}
                  {hasOptimizer && (
                    <SelectItem value="optimizer">
                      {t("compare.targetSourceOptimizer")}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {!hasOptimizer && (
                <p className="text-[11px] text-slate-400 mt-1">{t("compare.optimizerHint")}</p>
              )}
            </div>
            <Button
              onClick={runComparison}
              disabled={running}
              className="h-11 px-6 font-semibold bg-[#D31220] hover:bg-[#a80e19]"
              data-design-id="run-comparison-button"
            >
              {running ? `⟳ ${progressStep || "…"}` : t("compare.run")}
            </Button>
          </div>
          {running && <Progress value={progressPct} className="h-2 mt-4" />}
        </CardContent>
      </Card>

      {/* dataCompletenessNotice (CR 18) */}
      {!state.dataCompletenessConfirmed && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800" data-design-id="comparison-completeness-notice">
          ℹ️ {t("notice.dataCompleteness")}
        </div>
      )}

      {!comparison && !running && (
        <div className="text-center py-10 text-sm text-slate-400" data-design-id="comparison-empty">
          {t("compare.empty")}
        </div>
      )}

      {comparison && (
        <>
          {/* Varianten-Karten (CR 15) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-design-id="comparison-variants">
            {comparison.variants.map((v) => {
              const accent =
                v.kind === "no_invest"
                  ? { border: "border-slate-300", chip: "bg-slate-200 text-slate-600" }
                  : v.kind === "current"
                    ? { border: "border-[#87BBE6]/60", chip: "bg-[#87BBE6]/20 text-[#3a7cb8]" }
                    : { border: "border-[#8FB687]/60", chip: "bg-[#8FB687]/20 text-[#5a8a50]" };
              const monthly = isReal
                ? v.sustainableMonthlyReal
                : v.corridor
                  ? v.corridor.scenarios.typical.fromWealthMonthlyNominalAtRetirement
                  : Math.round(
                      v.sustainableMonthlyReal *
                        Math.pow(1 + inputs.inflationRate / 100, Math.max(0, client.retirementAge - client.currentAge)),
                    );
              return (
                <Card key={v.kind} className={`${accent.border}`} data-design-id={`variant-card-${v.kind}`}>
                  <CardHeader className="pb-2">
                    <span className={`self-start text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${accent.chip}`}>
                      {v.kind === "no_invest"
                        ? t("compare.kindNoInvest")
                        : v.kind === "current"
                          ? t("compare.kindCurrent")
                          : t("compare.kindTarget")}
                    </span>
                    <CardTitle className="text-base leading-snug">{v.label}</CardTitle>
                    {v.deterministic && (
                      <p className="text-[10px] text-slate-400">{t("compare.deterministicNote")}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {/* Zentrale Kennzahl (CR 7/10) */}
                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
                      <div className="text-[11px] text-slate-500">
                        {isReal
                          ? t("compare.monthlyReal")
                          : t("compare.monthlyNominal").replace(
                              "{year}",
                              String(v.corridor?.retirementYear ?? client.birthYear + client.retirementAge),
                            )}
                      </div>
                      <div className="text-2xl font-bold text-[#D31220] tabular-nums">
                        {fmtEur(monthly)}
                        <span className="text-xs text-slate-400 font-normal"> / {t("inputs.month")}</span>
                      </div>
                      {v.corridor && (
                        <div className="text-[10px] text-slate-400 mt-1">
                          {t("compare.corridorRange")
                            .replace("{low}", fmtEur(isReal ? v.corridor.scenarios.difficult.fromWealthMonthly : v.corridor.scenarios.difficult.fromWealthMonthlyNominalAtRetirement))
                            .replace("{high}", fmtEur(isReal ? v.corridor.scenarios.favorable.fromWealthMonthly : v.corridor.scenarios.favorable.fromWealthMonthlyNominalAtRetirement))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">{t("compare.expectedReturn")}</span>
                        <span className="font-semibold tabular-nums">
                          {fmtPct(v.expectedReturnNominalPct)} {t("trace.nominalShort")} / {fmtPct(v.expectedReturnRealPct)} {t("trace.realShort")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">
                          {t("compare.finalNominal").replace("{year}", String(v.horizonYear))}
                        </span>
                        <span className="font-semibold tabular-nums">{fmtEur(v.finalWealthNominalMedian)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">{t("compare.finalReal")}</span>
                        <span className="font-semibold tabular-nums">{fmtEur(v.finalWealthRealMedian)}</span>
                      </div>
                      {v.successRate !== null && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">{t("compare.successRate")}</span>
                          <span className="font-semibold tabular-nums">{fmtPct(v.successRate)}</span>
                        </div>
                      )}
                      {v.goalReached !== undefined && v.goalReached !== null && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">{t("compare.goalReached")}</span>
                          <span className={`font-semibold ${v.goalReached ? "text-[#5a8a50]" : "text-rose-600"}`}>
                            {v.goalReached ? t("compare.goalYes") : t("compare.goalNo")}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Einordnung (CR 10) bzw. „was möglich ist" (CR 4) */}
                    {hasWish && v.ranking && (
                      <div
                        className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium ${
                          v.ranking === "below_difficult"
                            ? "bg-[#8FB687]/15 text-[#3d5c38]"
                            : v.ranking === "within_corridor"
                              ? "bg-amber-50 text-amber-800"
                              : "bg-rose-50 text-rose-700"
                        }`}
                        data-design-id={`variant-ranking-${v.kind}`}
                      >
                        {t(
                          v.ranking === "below_difficult"
                            ? "results.rankingBelow"
                            : v.ranking === "within_corridor"
                              ? "results.rankingWithin"
                              : "results.rankingAbove",
                        )}
                      </div>
                    )}
                    {!hasWish && (
                      <div className="rounded-md px-2.5 py-1.5 text-[11px] font-medium bg-[#8FB687]/15 text-[#3d5c38]">
                        {t("compare.possibleModeChip")}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Automatischer „Nicht investieren"-Vergleich (CR 17) */}
          {comparison.diffVsNoInvest && reference && (
            <Card className="border-[#FAC075]/50 bg-[#FAC075]/10" data-design-id="no-invest-diff-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("compare.consequenceTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                  <div className="bg-white/70 rounded-lg p-3 border border-[#FAC075]/40">
                    <div className="text-[11px] text-slate-500">
                      {t("compare.diffNominal").replace("{year}", String(comparison.diffVsNoInvest.horizonYear))}
                    </div>
                    <div className={`text-xl font-bold tabular-nums ${comparison.diffVsNoInvest.nominal >= 0 ? "text-[#5a8a50]" : "text-rose-600"}`}>
                      {comparison.diffVsNoInvest.nominal >= 0 ? "+" : ""}{fmtEur(comparison.diffVsNoInvest.nominal)}
                    </div>
                  </div>
                  <div className="bg-white/70 rounded-lg p-3 border border-[#FAC075]/40">
                    <div className="text-[11px] text-slate-500">{t("compare.diffReal")}</div>
                    <div className={`text-xl font-bold tabular-nums ${comparison.diffVsNoInvest.real >= 0 ? "text-[#5a8a50]" : "text-rose-600"}`}>
                      {comparison.diffVsNoInvest.real >= 0 ? "+" : ""}{fmtEur(comparison.diffVsNoInvest.real)}
                    </div>
                  </div>
                  <div className="bg-white/70 rounded-lg p-3 border border-[#FAC075]/40">
                    <div className="text-[11px] text-slate-500">{t("compare.diffMonthly")}</div>
                    <div className={`text-xl font-bold tabular-nums ${comparison.diffVsNoInvest.monthlyReal >= 0 ? "text-[#5a8a50]" : "text-rose-600"}`}>
                      {comparison.diffVsNoInvest.monthlyReal >= 0 ? "+" : ""}{fmtEur(comparison.diffVsNoInvest.monthlyReal)}
                      <span className="text-xs text-slate-400 font-normal"> / {t("inputs.month")}</span>
                    </div>
                  </div>
                </div>
                {hasWish && reference.successRate !== null && (
                  <p className="text-xs text-slate-600">
                    {t("compare.goalImpact")
                      .replace("{rate}", fmtPct(reference.successRate))
                      .replace(
                        "{baseline}",
                        comparison.variants.find((v) => v.kind === "no_invest")?.goalReached
                          ? t("compare.goalYes")
                          : t("compare.goalNo"),
                      )}
                  </p>
                )}
                {/* Keine Pauschalaussage: Hinweis, dass der Vergleich modell-
                    basiert ist und schwierige Verläufe schlechter liegen können. */}
                <p className="text-[11px] text-slate-500 italic">{t("compare.noBlanketClaim")}</p>
                <div className="rounded-lg bg-white border border-[#FAC075]/50 p-3 text-sm text-slate-700" data-design-id="comparison-cta">
                  <span className="font-semibold">{t("compare.ctaLabel")}:</span>{" "}
                  {pickCta(reference.ranking)}
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-[10px] text-slate-400" data-design-id="comparison-stichtag">
            {t("compare.stichtagLine").replace(
              "{date}",
              new Date(comparison.stichtag).toLocaleString("de-AT"),
            )}
          </p>
        </>
      )}
    </div>
  );
}
