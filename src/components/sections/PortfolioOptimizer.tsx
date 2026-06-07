"use client";

/**
 * Portfolio-Optimizer-Tab (Pro-Mode).
 *
 * Berater wählt:
 *   - Zielfunktion (success / success_dd / success_wealth)
 *   - Suchstrategie (Schnell / Standard / Genau) — bestimmt pathsPerEval &
 *     Refinement-N
 *
 * Nach Klick auf „Optimieren":
 *   - `optimizePortfolio` läuft asynchron (chunked via setTimeout), Progress-
 *     Bar wird live aktualisiert.
 *   - Top-10 werden in einer Tabelle angezeigt mit Apply-Button pro Zeile.
 *   - Effizienzgrenze: Streupunkte (Drawdown vs. Erfolgsquote), gefärbt
 *     nach PE-Anteil. Aktuelles Berater-Portfolio als großer schwarzer
 *     Punkt. Top-1 als großer goldener Stern.
 *   - Apply schreibt die Bucket-Allokationen + ggf. einen synthetischen
 *     PE-Fonds in den Store. Berater kann danach im normalen Flow eine
 *     volle 5000-Pfade-Simulation laufen lassen.
 *
 * Nicht im Optimizer:
 *   - Korrelationsmatrix-Tuning (separate Pro-Funktionalität)
 *   - Gleitende Allokationen über die Zeit (out of scope)
 *   - Nicht-konvexe Constraints (z. B. „mindestens 20 % Aktien")
 */

import { useCallback, useState } from "react";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fmtEur, fmtPct } from "@/lib/format";
import { logger } from "@/lib/logger";
import { validatePlanInputs } from "@/lib/validation";
import { toast } from "sonner";
import {
  optimizePortfolio,
  type AllocationResult,
  type OptimizerObjective,
  type OptimizerResult,
} from "@/lib/engine/optimizer";
import type { PEFund } from "@/lib/types";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  ReferenceLine,
} from "recharts";

// Pfade fest verdrahtet — wissenschaftliche Standardkonfiguration:
// Phase 1+2: 1000 Pfade (SE ≈ 1.6 Pp bei p=0.5)
// Phase 3 (Re-Eval Top-10): 5000 Pfade (defeats Winner's Curse)
const PATHS_PHASE12 = 1000;
const PATHS_PHASE3 = 5000;

export function PortfolioOptimizerSection() {
  const { state, dispatch } = useAppState();
  const { client, inputs, portfolio, settings, liquidityEvents } = state;
  const { t } = useI18n();

  const [objective, setObjective] = useState<OptimizerObjective>("success_wealth");
  const [running, setRunning] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<OptimizerResult | null>(null);

  const peColor = (pe: number): string => {
    if (pe >= 20) return "#8A83BE";   // PE-Lila intensiv
    if (pe >= 10) return "#B5AED6";
    if (pe > 0) return "#D9D5E8";
    return "#94a3b8"; // Grau für 0 % PE
  };

  const runOptimization = useCallback(async () => {
    // Eingaben validieren — gleicher Aggregator wie SimulationPanel.
    const validation = validatePlanInputs(client, inputs, portfolio, liquidityEvents);
    const errors = validation.errors.filter((e) => e.severity === "error");
    if (errors.length > 0) {
      toast.error(t("opt.validationFailed") || "Eingaben prüfen", {
        description: errors.slice(0, 3).map((e) => e.message).join("\n"),
      });
      return;
    }
    if (inputs.initialCapital <= 0) {
      toast.error(t("opt.noCapital") || "Startkapital erforderlich");
      return;
    }

    setRunning(true);
    setResult(null);
    setProgressPct(2);
    setProgressLabel(t("opt.progress.starting"));

    // setTimeout(0)-Zwischenstop, damit der Spinner sichtbar wird, bevor die
    // synchrone Optimierungsschleife den Hauptthread blockiert.
    await new Promise((r) => setTimeout(r, 30));

    try {
      const r = optimizePortfolio(
        client,
        inputs,
        portfolio,
        settings,
        liquidityEvents,
        {
          objective,
          pathsPhase12: PATHS_PHASE12,
          pathsPhase3: PATHS_PHASE3,
          refinementTopN: 3,
          reEvalTopN: 10,
          randomSeed: settings.randomSeed ?? 42,
          minCashPct: 5,
          peStepsCoarse: [0, 10, 20],
          onProgress: (pct, label) => {
            setProgressPct(Math.round(pct * 100));
            setProgressLabel(t(`opt.progress.${label}`) || label);
          },
        },
      );

      setProgressPct(100);
      setProgressLabel(t("opt.progress.done"));
      setResult(r);

      logger.info("Portfolio optimization completed", {
        scope: "PortfolioOptimizer",
        evaluations: r.evaluations,
        durationMs: r.durationMs,
        topScore: r.ranked[0]?.score,
        baselineScore: r.baseline.score,
      });

      toast.success(
        t("opt.completed") ||
          `${r.evaluations} Allokationen geprüft in ${(r.durationMs / 1000).toFixed(1)} s`,
      );
    } catch (err) {
      logger.error("Optimizer failed", { scope: "PortfolioOptimizer", error: String(err) });
      toast.error(t("opt.failed") || "Optimierung fehlgeschlagen", {
        description: String(err),
      });
    } finally {
      setRunning(false);
    }
  }, [client, inputs, portfolio, settings, liquidityEvents, objective, t]);

  const applyAllocation = useCallback(
    (alloc: AllocationResult) => {
      const newBuckets = [
        { ...portfolio.buckets[0], allocation: alloc.cash },
        { ...portfolio.buckets[1], allocation: alloc.bonds },
        { ...portfolio.buckets[2], allocation: alloc.equities },
      ] as typeof portfolio.buckets;

      const peFunds: PEFund[] =
        alloc.pe > 0
          ? [
              {
                id: "optimizer-pe",
                name: t("opt.peFundName") || "Optimierter PE-Fonds",
                commitment: Math.max(0, inputs.initialCapital * alloc.pe / 100),
                callRatio: 80,
                irr: 10,
                tvpi: 1.7,
                investmentPeriod: 5,
                fundDuration: 14,
                startAge: client.currentAge,
                mgmtFeeRate: 2.0,
                postPeriodFeeRate: 1.5,
                setupCostPct: 1.0,
              },
            ]
          : [];

      dispatch({
        type: "SET_PORTFOLIO",
        payload: { buckets: newBuckets, peFunds },
      });

      toast.success(
        t("opt.applied") ||
          `Allokation übernommen: ${alloc.cash}/${alloc.bonds}/${alloc.equities}/${alloc.pe} %`,
        { description: t("opt.appliedHint") || "Wechseln Sie zur Simulation für eine volle Analyse." },
      );
    },
    [portfolio, client.currentAge, inputs.initialCapital, dispatch, t],
  );

  // Scatter-Daten für Effizienzgrenze
  const scatterData =
    result?.ranked.map((r) => ({
      x: Math.round(r.maxDrawdown * 1000) / 10, // % mit 1 Dezimal
      y: r.successRate,
      pe: r.pe,
      cash: r.cash,
      bonds: r.bonds,
      equities: r.equities,
      score: r.score,
      mw: r.medianFinalWealth,
      isTop: r === result.ranked[0],
    })) ?? [];

  const baselinePoint = result
    ? {
        x: Math.round(result.baseline.maxDrawdown * 1000) / 10,
        y: result.baseline.successRate,
        cash: result.baseline.cash,
        bonds: result.baseline.bonds,
        equities: result.baseline.equities,
        pe: result.baseline.pe,
        mw: result.baseline.medianFinalWealth,
      }
    : null;

  return (
    <div className="space-y-6" data-design-id="portfolio-optimizer-section">
      <div data-design-id="opt-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="opt-title">
          {t("opt.title")}
        </h2>
        <p className="text-slate-500 mt-1" data-design-id="opt-subtitle">
          {t("opt.subtitle")}
        </p>
      </div>

      {/* Konfigurations-Karte */}
      <Card data-design-id="opt-config-card">
        <CardHeader>
          <CardTitle className="text-lg">{t("opt.configTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div data-design-id="opt-objective-field">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("opt.objective")}
            </label>
            <Select value={objective} onValueChange={(v) => setObjective(v as OptimizerObjective)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="success_wealth">{t("opt.obj.successWealth")}</SelectItem>
                <SelectItem value="success">{t("opt.obj.success")}</SelectItem>
                <SelectItem value="success_dd">{t("opt.obj.successDd")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400 mt-1">
              {objective === "success" && t("opt.obj.successHint")}
              {objective === "success_dd" && t("opt.obj.successDdHint")}
              {objective === "success_wealth" && t("opt.obj.successWealthHint")}
            </p>
          </div>

          {/* Wissenschaftliche Methodik (kompakt) */}
          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 leading-relaxed" data-design-id="opt-methodology">
            <span className="font-semibold text-slate-700">{t("opt.methodTitle")}:</span>{" "}
            {t("opt.methodBody")}
          </div>

          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">{t("opt.fixedInputs")}:</span>{" "}
            <span className="tabular-nums">
              {t("opt.fi.capital")}: {fmtEur(inputs.initialCapital)}
              {" · "}
              {t("opt.fi.savings")}: {fmtEur(inputs.monthlySavings)}/{t("opt.fi.month")}
              {" · "}
              {t("opt.fi.withdrawal")}: {fmtEur(inputs.desiredMonthlyWithdrawal)}/{t("opt.fi.month")}
            </span>
          </div>

          <Button
            onClick={runOptimization}
            disabled={running}
            className="w-full bg-[#D31220] hover:bg-[#a80e19]"
            data-design-id="opt-run-button"
          >
            {running ? t("opt.running") : t("opt.runButton")}
          </Button>

          {running && (
            <div className="space-y-2" data-design-id="opt-progress">
              <Progress value={progressPct} />
              <p className="text-xs text-slate-500 text-center">{progressLabel} ({progressPct}%)</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ergebnisse */}
      {result && (
        <>
          {/* KPI-Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-design-id="opt-kpis">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-slate-500">{t("opt.kpi.evaluations")}</p>
                <p className="text-2xl font-bold text-slate-900">{result.evaluations}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-slate-500">{t("opt.kpi.duration")}</p>
                <p className="text-2xl font-bold text-slate-900">{(result.durationMs / 1000).toFixed(1)} s</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-slate-500">{t("opt.kpi.bestSuccess")}</p>
                <p className="text-2xl font-bold text-[#5a8a50]">{fmtPct(result.ranked[0]?.successRate ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-slate-500">{t("opt.kpi.baselineSuccess")}</p>
                <p className="text-2xl font-bold text-slate-700">{fmtPct(result.baseline.successRate)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {t("opt.kpi.gap")}: {(result.ranked[0].successRate - result.baseline.successRate).toFixed(1)} Pp
                </p>
                {/* Signifikanz-Indikator: überlappen die 95 %-CIs? */}
                {result.ranked[0].successRateCiLow <= result.baseline.successRateCiHigh ? (
                  <p className="text-[10px] text-amber-700 mt-0.5">{t("opt.kpi.notSig")}</p>
                ) : (
                  <p className="text-[10px] text-emerald-700 mt-0.5">{t("opt.kpi.sig")}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Effizienzgrenze (Scatter) */}
          <Card data-design-id="opt-efficient-frontier-card">
            <CardHeader>
              <CardTitle className="text-lg">{t("opt.frontierTitle")}</CardTitle>
              <p className="text-xs text-slate-500 mt-1">{t("opt.frontierSubtitle")}</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={340}>
                <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={t("opt.frontierXAxis")}
                    unit="%"
                    tick={{ fontSize: 11 }}
                    label={{ value: t("opt.frontierXAxis"), position: "insideBottom", offset: -10, style: { fontSize: 11, fill: "#64748b" } }}
                    domain={["auto", "auto"]}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={t("opt.frontierYAxis")}
                    unit="%"
                    tick={{ fontSize: 11 }}
                    label={{ value: t("opt.frontierYAxis"), angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#64748b" } }}
                    domain={[0, 100]}
                  />
                  <ZAxis range={[40, 200]} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as typeof scatterData[number];
                      return (
                        <div className="rounded-md border border-slate-200 bg-white shadow-md p-3 text-[12px] leading-snug max-w-[240px]">
                          <div className="font-semibold text-slate-800 mb-1">
                            {d.cash}/{d.bonds}/{d.equities}/{d.pe} %
                          </div>
                          <div className="text-slate-600">
                            {t("opt.tooltip.success")}: <span className="font-semibold text-[#5a8a50]">{d.y.toFixed(1)} %</span>
                          </div>
                          <div className="text-slate-600">
                            {t("opt.tooltip.dd")}: <span className="font-semibold text-rose-700">−{d.x.toFixed(1)} %</span>
                          </div>
                          <div className="text-slate-600">
                            {t("opt.tooltip.median")}: <span className="font-semibold">{fmtEur(d.mw)}</span>
                          </div>
                          <div className="text-slate-600">
                            {t("opt.tooltip.pe")}: {d.pe} %
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="4 4" />
                  <ReferenceLine y={80} stroke="#86efac" strokeDasharray="4 4" />
                  <Scatter
                    name="Allokationen"
                    data={scatterData.map((d) => ({ ...d, fill: peColor(d.pe), z: 80 }))}
                  />
                  {result.ranked[0] && (
                    <Scatter
                      name="Optimum"
                      data={[{ ...scatterData[0], fill: "#FAC075", z: 200 }]}
                      shape="star"
                    />
                  )}
                  {baselinePoint && (
                    <Scatter
                      name={t("opt.frontierBaseline")}
                      data={[{ ...baselinePoint, fill: "#20201E", z: 200 }]}
                      shape="diamond"
                    />
                  )}
                </ScatterChart>
              </ResponsiveContainer>

              <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-slate-600" data-design-id="opt-frontier-legend">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#FAC075" }} />
                  {t("opt.legend.optimum")}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rotate-45" style={{ background: "#20201E" }} />
                  {t("opt.legend.baseline")}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#94a3b8" }} />
                  {t("opt.legend.noPe")}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#B5AED6" }} />
                  {t("opt.legend.midPe")}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#8A83BE" }} />
                  {t("opt.legend.highPe")}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top-10 Tabelle */}
          <Card data-design-id="opt-ranked-table-card">
            <CardHeader>
              <CardTitle className="text-lg">{t("opt.tableTitle")}</CardTitle>
              <p className="text-xs text-slate-500 mt-1">{t("opt.tableSubtitle")}</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-design-id="opt-ranked-table">
                  <thead className="border-b-2 border-slate-200">
                    <tr>
                      <th className="text-left py-2 px-2 font-semibold text-slate-600">#</th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-600">{t("opt.col.cash")}</th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-600">{t("opt.col.bonds")}</th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-600">{t("opt.col.equities")}</th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-600">{t("opt.col.pe")}</th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-600">
                        {t("opt.col.success")}
                        <span className="block text-[10px] font-normal text-slate-400">{t("opt.col.successCi")}</span>
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-600">{t("opt.col.dd")}</th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-600">{t("opt.col.median")}</th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-600"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* ── Section header: Top 5 ──────────────────────── */}
                    <tr className="bg-emerald-50 border-y border-emerald-200">
                      <td colSpan={9} className="py-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                        ▲ {t("opt.topBadge")}
                      </td>
                    </tr>

                    {/* Top 5 – beste Allokationen, alle mit 5.000 Pfaden re-evaluiert */}
                    {result.ranked.slice(0, 5).map((r, idx) => (
                      <tr
                        key={`top-${r.cash}-${r.bonds}-${r.equities}-${r.pe}`}
                        className={
                          idx === 0
                            ? "bg-amber-50 border-b border-amber-100"
                            : "border-b border-slate-100 hover:bg-slate-50"
                        }
                      >
                        <td className="py-2 px-2 font-bold align-top">
                          <div>{idx === 0 ? "🏆 1" : idx + 1}</div>
                          {r.pathsUsed >= PATHS_PHASE3 && (
                            <div className="text-[9px] font-normal text-emerald-700 leading-none mt-1">
                              ✓ {(r.pathsUsed / 1000).toFixed(0)}k
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.cash}%</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.bonds}%</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.equities}%</td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {r.pe > 0 ? <Badge variant="outline" className="border-[#8A83BE] text-[#8A83BE]">{r.pe}%</Badge> : <span className="text-slate-300">–</span>}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          <div className="font-semibold text-[#5a8a50]">{r.successRate.toFixed(1)}%</div>
                          <div className="text-[10px] text-slate-400 leading-none mt-0.5">
                            [{r.successRateCiLow.toFixed(1)}–{r.successRateCiHigh.toFixed(1)}]
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-rose-700">
                          −{(r.maxDrawdown * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtEur(r.medianFinalWealth)}</td>
                        <td className="py-2 px-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => applyAllocation(r)}
                            data-design-id={`opt-apply-${idx}`}
                          >
                            {t("opt.apply")}
                          </Button>
                        </td>
                      </tr>
                    ))}

                    {/* ── Baseline-Zeile (Trenner) ───────────────────── */}
                    <tr className="bg-slate-100 border-y-2 border-slate-300 italic">
                      <td className="py-2 px-2 text-slate-700 align-top">
                        <div className="not-italic font-semibold text-[11px] uppercase tracking-wide text-slate-500">
                          ◆ {t("opt.col.baseline")}
                        </div>
                        <div className="text-[9px] not-italic font-normal text-emerald-700 leading-none mt-1">
                          ✓ {(result.baseline.pathsUsed / 1000).toFixed(0)}k
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{result.baseline.cash}%</td>
                      <td className="py-2 px-2 text-right tabular-nums">{result.baseline.bonds}%</td>
                      <td className="py-2 px-2 text-right tabular-nums">{result.baseline.equities}%</td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {result.baseline.pe > 0 ? `${result.baseline.pe}%` : "–"}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        <div className="font-semibold">{result.baseline.successRate.toFixed(1)}%</div>
                        <div className="text-[10px] text-slate-400 leading-none mt-0.5 not-italic">
                          [{result.baseline.successRateCiLow.toFixed(1)}–{result.baseline.successRateCiHigh.toFixed(1)}]
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-rose-700">
                        −{(result.baseline.maxDrawdown * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtEur(result.baseline.medianFinalWealth)}</td>
                      <td></td>
                    </tr>

                    {/* ── Section header: Flop 5 ─────────────────────── */}
                    <tr className="bg-rose-50 border-y border-rose-200">
                      <td colSpan={9} className="py-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-rose-800">
                        ▼ {t("opt.flopBadge")}
                      </td>
                    </tr>

                    {/* Flop 5 – schlechteste Allokationen, ranked.length−5 ... ranked.length−1 */}
                    {result.ranked.slice(-5).map((r, idx) => {
                      const absoluteRank = result.ranked.length - 5 + idx + 1;
                      return (
                        <tr
                          key={`flop-${r.cash}-${r.bonds}-${r.equities}-${r.pe}`}
                          className="border-b border-slate-100 bg-rose-50/40 hover:bg-rose-50"
                        >
                          <td className="py-2 px-2 font-bold align-top text-rose-700">
                            <div>{absoluteRank}</div>
                            {r.pathsUsed >= PATHS_PHASE3 && (
                              <div className="text-[9px] font-normal text-emerald-700 leading-none mt-1">
                                ✓ {(r.pathsUsed / 1000).toFixed(0)}k
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{r.cash}%</td>
                          <td className="py-2 px-2 text-right tabular-nums">{r.bonds}%</td>
                          <td className="py-2 px-2 text-right tabular-nums">{r.equities}%</td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {r.pe > 0 ? <Badge variant="outline" className="border-[#8A83BE] text-[#8A83BE]">{r.pe}%</Badge> : <span className="text-slate-300">–</span>}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            <div className="font-semibold text-rose-700">{r.successRate.toFixed(1)}%</div>
                            <div className="text-[10px] text-slate-400 leading-none mt-0.5">
                              [{r.successRateCiLow.toFixed(1)}–{r.successRateCiHigh.toFixed(1)}]
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-rose-700">
                            −{(r.maxDrawdown * 100).toFixed(1)}%
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{fmtEur(r.medianFinalWealth)}</td>
                          <td className="py-2 px-2 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-slate-400 hover:text-slate-600"
                              onClick={() => applyAllocation(r)}
                              data-design-id={`opt-apply-flop-${idx}`}
                            >
                              {t("opt.apply")}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 italic">
                {t("opt.disclaimer")}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}