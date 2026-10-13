"use client";

import { useI18n } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtEur, fmtPct, formatAT } from "@/lib/format";
import { computeHistoricalGrossReturns } from "@/lib/engine/historical";
import type { HistoricalAnalysis, PortfolioConfig, SimulationResult } from "@/lib/types";

/** Gegenüberstellung Monte-Carlo vs. historischer Backtest (gleiche Bewertungsbasis). */
export function McVsHistCard({
  result,
  historicalResult,
  portfolio,
  numSimulations,
  isReal,
  deflators,
  endIdx,
  endValueSuffix,
  successColor,
}: {
  result: SimulationResult;
  historicalResult: HistoricalAnalysis | null;
  portfolio: PortfolioConfig;
  numSimulations: number;
  isReal: boolean;
  deflators: number[];
  endIdx: number;
  endValueSuffix: string;
  successColor: string;
}) {
  const { t } = useI18n();
  return (
    <>
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
                  <span className="text-xs text-slate-500">{t("compare.median")} {endValueSuffix}</span>
                  <span className="text-2xl font-bold text-[#4D4A47]">
                    {fmtEur(
                      isReal
                        ? result.valuation?.medianFinalWealthReal ?? result.medianFinalWealth * (deflators[endIdx] ?? 1)
                        : result.medianFinalWealth,
                    )}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-500">{t("compare.success")}</span>
                  <span className={`text-lg font-bold ${successColor}`}>{fmtPct(result.successRate)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-slate-500">{t("compare.scenarios")}</span>
                  <span className="text-sm text-slate-700">{formatAT(numSimulations)}</span>
                </div>
              </div>
              <div className="rounded-lg border border-[#8FB687]/40 bg-[#8FB687]/10 p-4" data-design-id="mc-vs-hist-hist">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {t("compare.histLabel")}
                </div>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-500">
                    {t("compare.median")} {isReal ? t("valuation.suffixReal") : t("valuation.badgeNominal").toLowerCase()}
                  </span>
                  <span className="text-2xl font-bold text-[#4D4A47]">
                    {fmtEur(isReal ? historicalResult.medianFinalWealthReal : historicalResult.medianFinalWealth)}
                  </span>
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
                .replace("{n}", formatAT(numSimulations))
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
    </>
  );
}
