"use client";

import { useState, useMemo } from "react";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtEur, fmtPct, fmtNum } from "@/lib/format";
import { runDetailedSingleSimulation } from "@/lib/engine/montecarlo";
import type { DetailedSimTrace } from "@/lib/types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

const COLORS = {
  cash: "#8FB687",
  bonds: "#87BBE6",
  equities: "#D31220",
  total: "#20201E",
  rebalance: "#FAC075",
};

export function DetailedExampleSection() {
  const { state, dispatch } = useAppState();
  const { client, inputs, portfolio, settings, result, detailedTrace, liquidityEvents } = state;
  const { t } = useI18n();
  const [simIndex, setSimIndex] = useState(0);

  const generateTrace = () => {
    const trace = runDetailedSingleSimulation(
      client, inputs, portfolio, settings, simIndex, liquidityEvents
    );
    dispatch({ type: "SET_DETAILED_TRACE", payload: trace });
  };

  // Nutzer-definierte Topf-Bezeichnungen (fällt auf Übersetzung zurück)
  const bucketName = (i: 0 | 1 | 2, fallbackKey: string) =>
    portfolio.buckets[i]?.label?.trim() ? portfolio.buckets[i].label : t(fallbackKey);
  const cashLabel = bucketName(0, "detailed.cash");
  const bondsLabel = bucketName(1, "detailed.bonds");
  const equitiesLabel = bucketName(2, "detailed.equities");

  const chartData = useMemo(() => {
    if (!detailedTrace) return [];
    return detailedTrace.rows.map((r) => ({
      age: r.age,
      year: r.year,
      [cashLabel]: Math.round(r.endCash),
      [bondsLabel]: Math.round(r.endBonds),
      [equitiesLabel]: Math.round(r.endEquities),
      [t("detailed.total")]: Math.round(r.endTotal),
      liquidityEvent: r.liquidityEvent || 0,
    }));
  }, [detailedTrace, cashLabel, bondsLabel, equitiesLabel, t]);

  const liquidityEventYears = useMemo(() => {
    if (!detailedTrace) return [];
    return detailedTrace.rows
      .filter((r) => r.liquidityEvent !== 0)
      .map((r) => ({ age: r.age, amount: r.liquidityEvent, label: r.liquidityEventLabel }));
  }, [detailedTrace]);

  const rebalanceYears = useMemo(() => {
    if (!detailedTrace) return [];
    return detailedTrace.rows.filter((r) => r.rebalanced).map((r) => r.age);
  }, [detailedTrace]);

  const hasResults = result !== null;

  return (
    <div className="space-y-6" data-design-id="detailed-example-section">
      <div data-design-id="detailed-example-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="detailed-example-title">
          {t("detailed.title")}
        </h2>
        <p className="text-slate-500 mt-1" data-design-id="detailed-example-subtitle">
          {t("detailed.subtitle")}
        </p>
      </div>

      {!hasResults && (
        <Card className="border-amber-200 bg-amber-50" data-design-id="detailed-no-results">
          <CardContent className="pt-6 text-center">
            <p className="text-amber-700 font-medium">
              {t("detailed.noResults")}
            </p>
          </CardContent>
        </Card>
      )}

      {hasResults && (
        <Card data-design-id="detailed-generate-card">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t("detailed.simNumber")}
                </label>
                <div className="flex gap-2 items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSimIndex(Math.max(0, simIndex - 1))}
                    disabled={simIndex === 0}
                  >
                    ←
                  </Button>
                  <span className="w-16 text-center font-mono text-sm font-bold tabular-nums">
                    #{simIndex + 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSimIndex(simIndex + 1)}
                  >
                    →
                  </Button>
                </div>
              </div>
              <Button
                onClick={generateTrace}
                className="bg-[#D31220] hover:bg-[#a80e19]"
                data-design-id="generate-trace-button"
              >
                🔍 Einzelpfad generieren
              </Button>
              {detailedTrace && (
                <div className="ml-auto flex items-center gap-4 text-sm">
                  <span className={`font-bold ${detailedTrace.success ? "text-[#5a8a50]" : "text-rose-600"}`}>
                    {detailedTrace.success ? t("detailed.success") : t("detailed.depleted")}
                  </span>
                  <span className="text-slate-500">
                    {t("detailed.finalWealth")}: <span className="font-semibold text-slate-800">{fmtEur(detailedTrace.finalWealth)}</span>
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {t("detailed.hint")}
            </p>
          </CardContent>
        </Card>
      )}

      {detailedTrace && (
        <>
          <Card data-design-id="detailed-chart-card">
            <CardHeader>
              <CardTitle data-design-id="detailed-chart-title">
                {t("detailed.chartTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={420}>
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="age"
                    tick={{ fontSize: 11 }}
                    label={{ value: t("results.ageAxis"), position: "insideBottom", offset: -5, fontSize: 12 }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `€${(Number(v) / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value, name) => [fmtEur(Number(value) || 0), String(name)]}
                    labelFormatter={(l) => `${t("results.ageAxis")} ${l}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend />
                  <ReferenceLine
                    x={client.retirementAge}
                    stroke="#D31220"
                    strokeDasharray="6 3"
                    label={{ value: t("results.pension"), fill: "#D31220", fontSize: 11, position: "top" }}
                  />
                  {rebalanceYears.map((age) => (
                    <ReferenceLine
                      key={`reb-${age}`}
                      x={age}
                      stroke={COLORS.rebalance}
                      strokeDasharray="2 4"
                      strokeWidth={1}
                    />
                  ))}
                  {liquidityEventYears.map((ev) => (
                    <ReferenceLine
                      key={`le-${ev.age}`}
                      x={ev.age}
                      stroke="#8A83BE"
                      strokeDasharray="4 2"
                      strokeWidth={2}
                      label={{
                        value: `${ev.amount >= 0 ? "+" : ""}€${Math.round(ev.amount / 1000)}k`,
                        fill: "#8A83BE",
                        fontSize: 9,
                        position: "top",
                      }}
                    />
                  ))}
                  <Area
                    type="monotone"
                    dataKey={cashLabel}
                    stackId="1"
                    fill={COLORS.cash}
                    stroke={COLORS.cash}
                    fillOpacity={0.7}
                  />
                  <Area
                    type="monotone"
                    dataKey={bondsLabel}
                    stackId="1"
                    fill={COLORS.bonds}
                    stroke={COLORS.bonds}
                    fillOpacity={0.7}
                  />
                  <Area
                    type="monotone"
                    dataKey={equitiesLabel}
                    stackId="1"
                    fill={COLORS.equities}
                    stroke={COLORS.equities}
                    fillOpacity={0.7}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 justify-center flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-[#D31220] inline-block" style={{ borderTop: "2px dashed #D31220" }} />
                  Pensionsbeginn
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 inline-block" style={{ borderTop: "2px dashed #FAC075" }} />
                  Umschichtung
                </span>
                {liquidityEventYears.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 inline-block" style={{ borderTop: "2px dashed #8A83BE" }} />
                    Liquiditätsereignis
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-design-id="detailed-table-card">
            <CardHeader>
              <CardTitle data-design-id="detailed-table-title">
                {t("detailed.tableTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[1400px]">
                  <thead>
                    <tr className="bg-[#20201E] text-white">
                      <th className="py-2 px-2 text-left font-semibold sticky left-0 bg-[#20201E] z-10">{t("detailed.colYear")}</th>
                      <th className="py-2 px-2 text-center font-semibold">{t("detailed.colAge")}</th>
                      <th className="py-2 px-2 text-center font-semibold">{t("detailed.colPhase")}</th>
                      <th className="py-2 px-2 text-right font-semibold" colSpan={1}>{t("detailed.colStartTotal")}</th>
                      <th className="py-2 px-2 text-right font-semibold bg-[#5a8a50]/20" style={{ color: "#d4edda" }}>
                        {cashLabel}
                      </th>
                      <th className="py-2 px-2 text-right font-semibold bg-[#1a6eb0]/20" style={{ color: "#cce5ff" }}>
                        {bondsLabel}
                      </th>
                      <th className="py-2 px-2 text-right font-semibold bg-[#D31220]/20" style={{ color: "#f8d7da" }}>
                        {equitiesLabel}
                      </th>
                      <th className="py-2 px-2 text-right font-semibold bg-[#5a8a50]/20" style={{ color: "#d4edda" }}>
                        {t("detailed.colReturnPct")}
                      </th>
                      <th className="py-2 px-2 text-right font-semibold bg-[#1a6eb0]/20" style={{ color: "#cce5ff" }}>
                        {t("detailed.colReturnPct")}
                      </th>
                      <th className="py-2 px-2 text-right font-semibold bg-[#D31220]/20" style={{ color: "#f8d7da" }}>
                        {t("detailed.colReturnPct")}
                      </th>
                      <th className="py-2 px-2 text-right font-semibold">{t("detailed.colCashflow")}</th>
                      <th className="py-2 px-2 text-right font-semibold bg-[#8A83BE]/20" style={{ color: "#e0ddf5" }}>{t("detailed.colLiquidity")}</th>
                      <th className="py-2 px-2 text-center font-semibold">{t("detailed.colRebal")}</th>
                      <th className="py-2 px-2 text-left font-semibold">{t("detailed.colSource")}</th>
                      <th className="py-2 px-2 text-right font-semibold bg-[#5a8a50]/20" style={{ color: "#d4edda" }}>
                        {t("detailed.colRebalDelta")}
                      </th>
                      <th className="py-2 px-2 text-right font-semibold bg-[#1a6eb0]/20" style={{ color: "#cce5ff" }}>
                        {t("detailed.colRebalDelta")}
                      </th>
                      <th className="py-2 px-2 text-right font-semibold bg-[#D31220]/20" style={{ color: "#f8d7da" }}>
                        {t("detailed.colRebalDelta")}
                      </th>
                      <th className="py-2 px-2 text-right font-semibold">{t("detailed.colEndTotal")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailedTrace.rows.map((row, idx) => {
                      const isRetirementStart = row.age === client.retirementAge;
                      const bgClass = isRetirementStart
                        ? "bg-red-50 border-t-2 border-[#D31220]"
                        : idx % 2 === 0
                        ? "bg-white"
                        : "bg-slate-50/60";

                      return (
                        <tr key={row.year} className={`${bgClass} hover:bg-amber-50/40 border-b border-slate-100`}>
                          <td className={`py-1.5 px-2 font-mono font-semibold text-slate-700 sticky left-0 z-10 ${isRetirementStart ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                            {row.year}
                          </td>
                          <td className="py-1.5 px-2 text-center text-slate-600">{row.age}</td>
                          <td className="py-1.5 px-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              row.phase === "Anspar"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-orange-50 text-orange-700"
                            }`}>
                              {row.phase}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-medium text-slate-800 tabular-nums">
                            {fmtEur(row.startTotal)}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-[#5a8a50]">
                            {fmtEur(row.startCash)}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-[#1a6eb0]">
                            {fmtEur(row.startBonds)}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-[#D31220]">
                            {fmtEur(row.startEquities)}
                          </td>
                          <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${row.returnCashPct >= 0 ? "text-[#5a8a50]" : "text-rose-600"}`}>
                            {row.returnCashPct >= 0 ? "+" : ""}{fmtNum(row.returnCashPct, 1)}%
                          </td>
                          <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${row.returnBondsPct >= 0 ? "text-[#1a6eb0]" : "text-rose-600"}`}>
                            {row.returnBondsPct >= 0 ? "+" : ""}{fmtNum(row.returnBondsPct, 1)}%
                          </td>
                          <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${row.returnEquitiesPct >= 0 ? "text-[#D31220]" : "text-rose-600"}`}>
                            {row.returnEquitiesPct >= 0 ? "+" : ""}{fmtNum(row.returnEquitiesPct, 1)}%
                          </td>
                          <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${row.cashflow >= 0 ? "text-[#5a8a50]" : "text-orange-700"}`}>
                            {row.cashflow >= 0 ? "+" : ""}{fmtEur(row.cashflow)}
                          </td>
                          <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${
                            row.liquidityEvent > 0
                              ? "text-[#5a8a50] bg-purple-50/40"
                              : row.liquidityEvent < 0
                              ? "text-rose-600 bg-purple-50/40"
                              : "text-slate-300"
                          }`}>
                            {row.liquidityEvent !== 0
                              ? (row.liquidityEvent >= 0 ? "+" : "") + fmtEur(row.liquidityEvent)
                              : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            {row.rebalanced ? (
                              <span className="inline-block w-5 h-5 rounded-full bg-[#FAC075] text-[10px] font-bold text-white leading-5">
                                ⟳
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-left text-[10px] max-w-[120px] truncate" title={row.rebalSource || ""}>
                            {row.rebalanced && row.rebalSource ? (
                              <span className={`font-medium ${row.rebalSource.includes("Verlustschutz") ? "text-amber-600" : "text-slate-600"}`}>
                                {row.rebalSource}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className={`py-1.5 px-2 text-right tabular-nums ${row.rebalCashDelta > 0 ? "text-[#5a8a50]" : row.rebalCashDelta < 0 ? "text-rose-500" : "text-slate-300"}`}>
                            {row.rebalanced ? (row.rebalCashDelta >= 0 ? "+" : "") + fmtEur(row.rebalCashDelta) : "—"}
                          </td>
                          <td className={`py-1.5 px-2 text-right tabular-nums ${row.rebalBondsDelta > 0 ? "text-[#1a6eb0]" : row.rebalBondsDelta < 0 ? "text-rose-500" : "text-slate-300"}`}>
                            {row.rebalanced ? (row.rebalBondsDelta >= 0 ? "+" : "") + fmtEur(row.rebalBondsDelta) : "—"}
                          </td>
                          <td className={`py-1.5 px-2 text-right tabular-nums ${row.rebalEquitiesDelta > 0 ? "text-[#D31220]" : row.rebalEquitiesDelta < 0 ? "text-rose-500" : "text-slate-300"}`}>
                            {row.rebalanced ? (row.rebalEquitiesDelta >= 0 ? "+" : "") + fmtEur(row.rebalEquitiesDelta) : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold text-slate-900 tabular-nums">
                            {fmtEur(row.endTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-50" data-design-id="detailed-legend-card">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-slate-800 mb-2" data-design-id="detailed-legend-title">{t("detailed.legendTitle")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-600">
                <div>
                  <p><span className="inline-block w-3 h-3 rounded-sm bg-[#8FB687] mr-2" />
                    <strong>{cashLabel}</strong> — {t("detailed.legendCash").split(" — ")[1]}
                  </p>
                  <p><span className="inline-block w-3 h-3 rounded-sm bg-[#87BBE6] mr-2" />
                    <strong>{bondsLabel}</strong> — {t("detailed.legendBonds").split(" — ")[1]}
                  </p>
                  <p><span className="inline-block w-3 h-3 rounded-sm bg-[#D31220] mr-2" />
                    <strong>{equitiesLabel}</strong> — {t("detailed.legendEquities").split(" — ")[1]}
                  </p>
                </div>
                <div>
                  <p><strong>{t("detailed.colReturnPct")}</strong> — {t("detailed.legendReturn").split(" — ")[1]}</p>
                  <p><strong>{t("detailed.colCashflow")}</strong> — {t("detailed.legendCashflow").split(" — ")[1]}</p>
                  <p><span className="inline-block w-3 h-3 rounded-sm bg-[#8A83BE] mr-2" />
                    <strong>{t("detailed.colLiquidity")}</strong> — {t("detailed.legendLiquidity").split(" — ")[1]}</p>
                  <p><strong>{t("detailed.colRebalDelta")}</strong> — {t("detailed.legendRebal").split(" — ")[1]}</p>
                  <p><strong>{t("detailed.colSource")}</strong> — {t("detailed.legendSource").split(" — ")[1]}</p>
                  <p><strong>{t("detailed.phaseAccumulation")}</strong> vs. <strong>{t("detailed.phaseWithdrawal")}</strong> — {t("detailed.legendPhase").split(" — ")[1]}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}