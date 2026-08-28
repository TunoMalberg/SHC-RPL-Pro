"use client";

import { useState } from "react";
import { useAppState, type Action } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { fmtEur } from "@/lib/format";
import type { LiquidityEvent } from "@/lib/types";

export function FinancialInputsSection() {
  const { state, dispatch } = useAppState();
  const { inputs, client, liquidityEvents } = state;
  const { t } = useI18n();
  const isPro = state.uiMode === "pro";
  const [expertOpen, setExpertOpen] = useState(false);

  const switchToPro = () => {
    dispatch({ type: "SET_UI_MODE", payload: "pro" });
    dispatch({ type: "SET_TAB", payload: "holdings" });
  };

  const update = (field: string, value: number | boolean | null) => {
    dispatch({ type: "SET_INPUTS", payload: { [field]: value } });
  };

  const yearsToRet = Math.max(0, client.retirementAge - client.currentAge);
  const totalContrib = inputs.initialCapital + inputs.monthlySavings * 12 * yearsToRet;
  const hasWish = inputs.desiredMonthlyWithdrawal !== null;
  const annualWithdrawal = (inputs.desiredMonthlyWithdrawal ?? 0) * 12;
  // Benötigt aus dem Vermögen (heutige Kaufkraft): Gesamtbetrag − Pension, ≥ 0.
  const neededFromWealthMonthly = hasWish
    ? Math.max(0, (inputs.desiredMonthlyWithdrawal ?? 0) - inputs.monthlyPension)
    : null;
  // Eingabebasis: Standard heutige Kaufkraft (Experten-Toggle Default ON).
  const purchasingPowerEntry = inputs.inflateWithdrawalToRetirement !== false;

  return (
    <div className="space-y-6" data-design-id="financial-inputs-section">
      <div data-design-id="financial-inputs-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="financial-inputs-title">{t("inputs.title")}</h2>
        <p className="text-slate-500 mt-1" data-design-id="financial-inputs-subtitle">{t("inputs.subtitle")}</p>
      </div>

      {/* Kaufkraft-Hinweis (CR 3) — sichtbar in der Eingabemaske. Bei
          deaktivierter Experten-Inflationierung stattdessen Nominal-Warnung. */}
      {purchasingPowerEntry ? (
        <div
          className="rounded-xl border border-[#8FB687]/50 bg-[#8FB687]/10 px-4 py-3 text-sm text-[#3d5c38]"
          data-design-id="purchasing-power-hint"
        >
          💡 {t("inputs.purchasingPowerHint")}
        </div>
      ) : (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          data-design-id="nominal-entry-warning"
        >
          ⚠️ {t("inputs.nominalEntryWarning")}
        </div>
      )}

      {/* Pro-Hint im Klassik-Modus: weist auf Bestandsportfolio-Funktion hin */}
      {!isPro && (
        <div
          className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
          data-design-id="classic-pro-hint-holdings"
        >
          <p className="text-xs text-[#4D4A47] leading-relaxed">
            {t("classic.proHint.holdings")}
          </p>
          <button
            type="button"
            onClick={switchToPro}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md bg-[#20201E] text-white hover:bg-[#3a3935] transition-colors"
            data-design-id="classic-pro-hint-cta"
          >
            {t("classic.proHint.cta")} →
          </button>
        </div>
      )}

      {/* Klassik-Erklärbox zu Kapital & Entnahme */}
      {!isPro && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-design-id="classic-help-inputs">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
            <div className="text-xs font-semibold text-[#20201E]">
              {t("classic.help.inputsCapitalTitle")}
            </div>
            <p className="text-xs text-[#4D4A47] leading-relaxed mt-1">
              {t("classic.help.inputsCapitalBody")}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
            <div className="text-xs font-semibold text-[#20201E]">
              {t("classic.help.inputsWithdrawalTitle")}
            </div>
            <p className="text-xs text-[#4D4A47] leading-relaxed mt-1">
              {t("classic.help.inputsWithdrawalBody")}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-design-id="capital-savings-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" data-design-id="capital-title">
              <span className="w-8 h-8 rounded-lg bg-[#8FB687]/15 text-[#5a8a50] flex items-center justify-center text-sm font-bold">€</span>
              {t("inputs.capitalSavings")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="initial-capital-field">
              <Label htmlFor="initialCapital">{t("inputs.initialCapital")}</Label>
              <FormattedNumberInput id="initialCapital" value={inputs.initialCapital} onChange={(v) => update("initialCapital", v)} prefix="€ " />
              <p className="text-xs text-slate-400 mt-1">{t("inputs.initialCapitalHint")}</p>
            </div>
            <div data-design-id="monthly-savings-field">
              <Label htmlFor="monthlySavings">{t("inputs.monthlySavings")}</Label>
              <FormattedNumberInput id="monthlySavings" value={inputs.monthlySavings} onChange={(v) => update("monthlySavings", v)} prefix="€ " />
            </div>
            <div data-design-id="annual-increase-field">
              <Label htmlFor="annualIncrease">{t("inputs.annualIncrease")}</Label>
              <Input id="annualIncrease" type="number" value={inputs.annualSavingsIncrease} onChange={(e) => update("annualSavingsIncrease", parseFloat(e.target.value) || 0)} step={0.5} />
              <p className="text-xs text-slate-400 mt-1">{t("inputs.annualIncreaseHint")}</p>
            </div>
          </CardContent>
        </Card>

        <Card data-design-id="withdrawal-pension-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" data-design-id="withdrawal-title">
              <span className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center text-sm font-bold">E</span>
              {t("inputs.withdrawalPension")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="monthly-withdrawal-field">
              <Label htmlFor="withdrawal">{t("inputs.monthlyWithdrawal")}</Label>
              <FormattedNumberInput
                id="withdrawal"
                value={inputs.desiredMonthlyWithdrawal}
                nullable
                onChangeNullable={(v) => update("desiredMonthlyWithdrawal", v)}
                prefix="€ "
                placeholder={t("inputs.withdrawalPlaceholder")}
              />
              {hasWish ? (
                <p className="text-xs text-slate-400 mt-1">{t("inputs.yearly")}: {fmtEur(annualWithdrawal)}</p>
              ) : (
                <p className="text-xs text-[#5a8a50] mt-1" data-design-id="withdrawal-optional-hint">
                  {t("inputs.withdrawalOptionalHint")}
                </p>
              )}
            </div>
            <div data-design-id="pension-income-field">
              <Label htmlFor="pension">{t("inputs.monthlyPension")}</Label>
              <FormattedNumberInput id="pension" value={inputs.monthlyPension} onChange={(v) => update("monthlyPension", v)} prefix="€ " />
              <p className="text-xs text-slate-400 mt-1">{t("inputs.monthlyPensionHint")}</p>
            </div>
            {/* Abgeleitetes Feld (CR 3): Benötigt aus dem Vermögen in heutiger
                Kaufkraft = max(0, Gesamtbetrag − Pensionseinkünfte). Read-only —
                bewusst KEIN zweites Eingabefeld (CR 2). */}
            <div
              className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5"
              data-design-id="needed-from-wealth-field"
            >
              <div className="text-xs font-medium text-slate-500">{t("inputs.neededFromWealth")}</div>
              <div className="text-lg font-bold text-rose-600 tabular-nums">
                {neededFromWealthMonthly !== null ? `${fmtEur(neededFromWealthMonthly)} / ${t("inputs.month")}` : "—"}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {neededFromWealthMonthly !== null
                  ? t("inputs.neededFromWealthHint")
                  : t("inputs.neededFromWealthEmptyHint")}
              </p>
            </div>
            <div data-design-id="pension-start-age-field">
              <Label htmlFor="pensionAge">{t("inputs.pensionStartAge")}</Label>
              <Input id="pensionAge" type="number" value={inputs.pensionStartAge} onChange={(e) => update("pensionStartAge", parseInt(e.target.value) || 65)} />
              {/* Plausibilitäts-Hinweis (Iter 2): Pensionsantritt vor
                  Pensionsbeginn-Alter ist möglich (Frühpension), aber sollte
                  bewusst sein. Engine respektiert Reihenfolge bereits korrekt. */}
              {inputs.pensionStartAge < client.retirementAge && (
                <p className="text-[11px] text-amber-700 mt-1" data-design-id="pension-before-retirement-warn">
                  {t("inputs.pensionBeforeRetirementWarn")}
                </p>
              )}
              {inputs.pensionStartAge > client.lifeExpectancy && (
                <p className="text-[11px] text-rose-700 mt-1" data-design-id="pension-after-life-warn">
                  {t("inputs.pensionAfterLifeWarn")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-design-id="inflation-settings-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2" data-design-id="inflation-title">
            <span className="w-8 h-8 rounded-lg bg-neutral-100 text-[#4D4A47] flex items-center justify-center text-sm font-bold">%</span>
            {t("inputs.inflationTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div data-design-id="inflation-rate-field">
              <Label htmlFor="inflation">{t("inputs.inflationRate")}</Label>
              <Input id="inflation" type="number" value={inputs.inflationRate} onChange={(e) => update("inflationRate", parseFloat(e.target.value) || 0)} step={0.1} />
              <p className="text-xs text-slate-400 mt-1">{t("inputs.inflationHint")}</p>
            </div>
            <div className="flex items-center gap-3 pt-6" data-design-id="real-values-toggle">
              <Switch id="realValues" checked={inputs.useRealValues} onCheckedChange={(checked) => update("useRealValues", checked)} />
              <div>
                <Label htmlFor="realValues" className="cursor-pointer">{t("inputs.useRealValues")}</Label>
                <p className="text-xs text-slate-400">{inputs.useRealValues ? t("inputs.realValuesOn") : t("inputs.realValuesOff")}</p>
              </div>
            </div>
          </div>

          {/* Experten-Bereich (Freigabe CR): Der Schalter „Entnahmewunsch bis
              Pensionsantritt inflationieren" bleibt als Experteneinstellung
              erhalten — zugeklappt, damit die Standardstrecke eindeutig in
              heutiger Kaufkraft erfasst (CR 3). Bei OFF ersetzt oben eine
              Nominal-Warnung den Kaufkraft-Hinweis. */}
          <div className="mt-5 pt-5 border-t border-slate-100" data-design-id="expert-section">
            <button
              type="button"
              onClick={() => setExpertOpen((o) => !o)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1.5"
              data-design-id="expert-section-toggle"
            >
              <span className={`inline-block transition-transform ${expertOpen ? "rotate-90" : ""}`}>▸</span>
              {t("inputs.expertSection")}
            </button>
            {expertOpen && (
              <div
                className="mt-3 flex flex-col md:flex-row md:items-start gap-3"
                data-design-id="inflate-to-retirement-toggle"
              >
                <div className="flex items-center gap-3 md:pt-1">
                  <Switch
                    id="inflateToRet"
                    checked={!!inputs.inflateWithdrawalToRetirement}
                    onCheckedChange={(checked) => update("inflateWithdrawalToRetirement", checked)}
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="inflateToRet" className="cursor-pointer font-medium">
                    {t("inputs.inflateToRetTitle")}
                  </Label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {inputs.inflateWithdrawalToRetirement
                      ? t("inputs.inflateToRetOn")
                      : t("inputs.inflateToRetOff")}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    {t("inputs.inflateToRetHint")}
                  </p>
                  {inputs.inflateWithdrawalToRetirement && hasWish && (() => {
                    const accYears = Math.max(0, client.retirementAge - client.currentAge);
                    const factor = Math.pow(1 + (inputs.inflationRate || 0) / 100, accYears);
                    const yearly = (inputs.desiredMonthlyWithdrawal ?? 0) * 12 * factor;
                    const monthly = (inputs.desiredMonthlyWithdrawal ?? 0) * factor;
                    return (
                      <div
                        className="mt-2 inline-flex items-center gap-2 rounded-md bg-[#FAC075]/15 border border-[#FAC075]/40 px-2.5 py-1"
                        data-design-id="inflate-to-retirement-preview"
                      >
                        <span className="text-[11px] font-semibold text-[#5d4a1f]">↗</span>
                        <span className="text-[11px] text-[#5d4a1f]">
                          {t("inputs.inflateToRetPreview")
                            .replace("{amount}", fmtEur(yearly))
                            .replace("{months}", fmtEur(monthly))}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <LiquidityEventsCard events={liquidityEvents} dispatch={dispatch} minAge={client.currentAge} maxAge={client.lifeExpectancy} />

      {/* dataCompletenessNotice (CR 18) */}
      <div
        className={`rounded-xl border px-4 py-3 text-sm ${state.dataCompletenessConfirmed ? "border-[#8FB687]/50 bg-[#8FB687]/10 text-[#3d5c38]" : "border-amber-300 bg-amber-50 text-amber-800"}`}
        data-design-id="data-completeness-notice"
      >
        {state.dataCompletenessConfirmed ? (
          <p>✓ {t("notice.dataCompletenessConfirmed")}</p>
        ) : (
          <p>ℹ️ {t("notice.dataCompleteness")}</p>
        )}
        <label className="mt-2 flex items-center gap-2 cursor-pointer text-xs font-medium">
          <input
            type="checkbox"
            checked={state.dataCompletenessConfirmed}
            onChange={(e) =>
              dispatch({ type: "SET_DATA_COMPLETENESS_CONFIRMED", payload: e.target.checked })
            }
            className="h-4 w-4 rounded border-slate-300"
            data-design-id="data-completeness-checkbox"
          />
          {t("notice.dataCompletenessConfirm")}
        </label>
      </div>

      <Card className="border-[#8FB687]/40 bg-[#8FB687]/10" data-design-id="financial-summary-card">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div data-design-id="summary-initial-capital">
              <div className="text-xl font-bold text-[#5a8a50]">{fmtEur(inputs.initialCapital)}</div>
              <div className="text-xs text-slate-500">{t("inputs.summaryInitialCapital")}</div>
            </div>
            <div data-design-id="summary-total-contrib">
              <div className="text-xl font-bold text-[#4D4A47]">{fmtEur(totalContrib)}</div>
              <div className="text-xs text-slate-500">{t("inputs.summaryTotalContrib")}</div>
            </div>
            <div data-design-id="summary-net-withdrawal">
              <div className="text-xl font-bold text-rose-600">
                {neededFromWealthMonthly !== null ? fmtEur(neededFromWealthMonthly * 12) : "—"}
              </div>
              <div className="text-xs text-slate-500">{t("inputs.summaryNetWithdrawal")}</div>
            </div>
            <div data-design-id="summary-pension">
              <div className="text-xl font-bold text-[#FAC075]">{fmtEur(inputs.monthlyPension * 12)}</div>
              <div className="text-xs text-slate-500">{t("inputs.summaryPension")}</div>
            </div>
            <div data-design-id="summary-liquidity-events">
              <div className="text-xl font-bold text-[#8A83BE]">
                {liquidityEvents.length > 0 ? fmtEur(liquidityEvents.reduce((s, e) => s + e.amount, 0)) : "—"}
              </div>
              <div className="text-xs text-slate-500">{t("inputs.summaryLiquidityEvents")} ({liquidityEvents.length})</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Liquiditätsereignisse (CR 5): klare Trennung „Zusätzliche Einnahmen"
 * vs. „Zusätzliche Ausgaben". Datenmodell unverändert vorzeichenbasiert
 * (Einnahme ≥ 0, Ausgabe < 0) — Ausgaben werden positiv eingegeben und
 * negativ gespeichert.
 */
function LiquidityEventsCard({ events, dispatch, minAge, maxAge }: { events: LiquidityEvent[]; dispatch: React.Dispatch<Action>; minAge: number; maxAge: number; }) {
  const { t } = useI18n();

  const removeEvent = (id: string) => { dispatch({ type: "REMOVE_LIQUIDITY_EVENT", payload: id }); };
  const incomes = [...events].filter((e) => e.amount >= 0).sort((a, b) => a.age - b.age);
  const expenses = [...events].filter((e) => e.amount < 0).sort((a, b) => a.age - b.age);

  return (
    <Card data-design-id="liquidity-events-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2" data-design-id="liquidity-events-title">
          <span className="w-8 h-8 rounded-lg bg-[#8A83BE]/15 text-[#8A83BE] flex items-center justify-center text-sm font-bold">⇄</span>
          {t("liquidity.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-xs text-slate-400">{t("liquidity.description")}</p>

        <LiquidityEventGroup
          kind="income"
          title={t("liquidity.incomeTitle")}
          examples={t("liquidity.incomeExamples")}
          events={incomes}
          dispatch={dispatch}
          minAge={minAge}
          maxAge={maxAge}
          onRemove={removeEvent}
        />

        <LiquidityEventGroup
          kind="expense"
          title={t("liquidity.expenseTitle")}
          examples={t("liquidity.expenseExamples")}
          events={expenses}
          dispatch={dispatch}
          minAge={minAge}
          maxAge={maxAge}
          onRemove={removeEvent}
        />
      </CardContent>
    </Card>
  );
}

function LiquidityEventGroup({
  kind,
  title,
  examples,
  events,
  dispatch,
  minAge,
  maxAge,
  onRemove,
}: {
  kind: "income" | "expense";
  title: string;
  examples: string;
  events: LiquidityEvent[];
  dispatch: React.Dispatch<Action>;
  minAge: number;
  maxAge: number;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  const [newAge, setNewAge] = useState(minAge + 5);
  const [newDesc, setNewDesc] = useState("");
  const [newAmount, setNewAmount] = useState(0);
  const isIncome = kind === "income";
  const accent = isIncome ? "#5a8a50" : "#be123c";

  const addEvent = () => {
    if (!newDesc.trim() || newAmount <= 0) return;
    const event: LiquidityEvent = {
      id: crypto.randomUUID(),
      age: newAge,
      description: newDesc.trim(),
      // Ausgaben werden positiv eingegeben, aber negativ gespeichert
      // (Datenmodell bleibt vorzeichenbasiert — keine Doppelstruktur).
      amount: isIncome ? Math.abs(newAmount) : -Math.abs(newAmount),
    };
    dispatch({ type: "ADD_LIQUIDITY_EVENT", payload: event });
    setNewDesc("");
    setNewAmount(0);
  };

  return (
    <div
      className={`rounded-lg border p-3 ${isIncome ? "border-[#8FB687]/40 bg-[#8FB687]/5" : "border-rose-200 bg-rose-50/40"}`}
      data-design-id={`liquidity-group-${kind}`}
    >
      <div className="text-sm font-semibold" style={{ color: accent }}>
        {isIncome ? "＋" : "－"} {title}
      </div>
      <p className="text-[11px] text-slate-400 mt-0.5 mb-3">{examples}</p>

      <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr_140px_auto] gap-2 items-end">
        <div>
          <Label htmlFor={`le-age-${kind}`} className="text-xs">{t("liquidity.age")}</Label>
          <Input id={`le-age-${kind}`} type="number" value={newAge} onChange={(e) => setNewAge(parseInt(e.target.value) || minAge)} min={minAge} max={maxAge} className="h-9" />
        </div>
        <div>
          <Label htmlFor={`le-desc-${kind}`} className="text-xs">{t("liquidity.desc")}</Label>
          <Input
            id={`le-desc-${kind}`}
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder={isIncome ? t("liquidity.incomePlaceholder") : t("liquidity.expensePlaceholder")}
            className="h-9"
          />
        </div>
        <div>
          <Label htmlFor={`le-amount-${kind}`} className="text-xs">{t("liquidity.amount")}</Label>
          <FormattedNumberInput id={`le-amount-${kind}`} value={newAmount} onChange={setNewAmount} prefix="€ " className="h-9" />
        </div>
        <Button
          onClick={addEvent}
          disabled={!newDesc.trim() || newAmount <= 0}
          size="sm"
          className={`h-9 ${isIncome ? "bg-[#5a8a50] hover:bg-[#4a7342]" : "bg-rose-600 hover:bg-rose-700"}`}
          data-design-id={`add-liquidity-${kind}-button`}
        >
          {isIncome ? t("liquidity.addIncome") : t("liquidity.addExpense")}
        </Button>
      </div>

      {events.length > 0 ? (
        <div className="border rounded-lg overflow-hidden mt-3 bg-white" data-design-id={`liquidity-table-${kind}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">{t("liquidity.age")}</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">{t("liquidity.desc")}</th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-slate-500">{t("liquidity.amount")}</th>
                <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-b last:border-0 hover:bg-slate-50/60">
                  <td className="py-2 px-3 font-mono font-semibold text-slate-700">{ev.age}</td>
                  <td className="py-2 px-3 text-slate-700">{ev.description}</td>
                  <td className={`py-2 px-3 text-right font-semibold tabular-nums ${ev.amount >= 0 ? "text-[#5a8a50]" : "text-rose-600"}`}>
                    {ev.amount >= 0 ? "+" : ""}{fmtEur(ev.amount)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button onClick={() => onRemove(ev.id)} className="text-slate-400 hover:text-rose-600 transition-colors text-lg leading-none" title={t("liquidity.remove")}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-3 text-xs text-slate-400">
          {isIncome ? t("liquidity.emptyIncome") : t("liquidity.emptyExpense")}
        </div>
      )}
    </div>
  );
}
