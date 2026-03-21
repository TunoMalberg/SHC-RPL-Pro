"use client";

import { useState } from "react";
import { useAppState } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { fmtEur } from "@/lib/format";
import type { LiquidityEvent } from "@/lib/types";

export function FinancialInputsSection() {
  const { state, dispatch } = useAppState();
  const { inputs, client, liquidityEvents } = state;

  const update = (field: string, value: number | boolean) => {
    dispatch({ type: "SET_INPUTS", payload: { [field]: value } });
  };

  const yearsToRet = Math.max(0, client.retirementAge - client.currentAge);
  const totalContrib = inputs.initialCapital + inputs.monthlySavings * 12 * yearsToRet;
  const annualWithdrawal = inputs.desiredMonthlyWithdrawal * 12;
  const netWithdrawal = (inputs.desiredMonthlyWithdrawal - inputs.monthlyPension) * 12;

  return (
    <div className="space-y-6" data-design-id="financial-inputs-section">
      <div data-design-id="financial-inputs-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="financial-inputs-title">Finanzielle Eingaben</h2>
        <p className="text-slate-500 mt-1" data-design-id="financial-inputs-subtitle">
          Definieren Sie Kapital, Sparplan, Entnahmebedarf und Inflationsannahmen.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-design-id="capital-savings-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" data-design-id="capital-title">
              <span className="w-8 h-8 rounded-lg bg-[#8FB687]/15 text-[#5a8a50] flex items-center justify-center text-sm font-bold">€</span>
              Kapital & Sparen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="initial-capital-field">
              <Label htmlFor="initialCapital">Anfangskapital (€)</Label>
              <Input
                id="initialCapital"
                type="number"
                value={inputs.initialCapital}
                onChange={(e) => update("initialCapital", parseFloat(e.target.value) || 0)}
                step={10000}
              />
              <p className="text-xs text-slate-400 mt-1">Aktuell investierbares Vermögen</p>
            </div>
            <div data-design-id="monthly-savings-field">
              <Label htmlFor="monthlySavings">Monatliche Sparrate (€)</Label>
              <Input
                id="monthlySavings"
                type="number"
                value={inputs.monthlySavings}
                onChange={(e) => update("monthlySavings", parseFloat(e.target.value) || 0)}
                step={100}
              />
            </div>
            <div data-design-id="annual-increase-field">
              <Label htmlFor="annualIncrease">Jährliche Sparsteigerung (%)</Label>
              <Input
                id="annualIncrease"
                type="number"
                value={inputs.annualSavingsIncrease}
                onChange={(e) => update("annualSavingsIncrease", parseFloat(e.target.value) || 0)}
                step={0.5}
              />
              <p className="text-xs text-slate-400 mt-1">Jährliche gehaltsgebundene Sparsteigerung</p>
            </div>
          </CardContent>
        </Card>

        <Card data-design-id="withdrawal-pension-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" data-design-id="withdrawal-title">
              <span className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center text-sm font-bold">E</span>
              Entnahmen & Pension
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="monthly-withdrawal-field">
              <Label htmlFor="withdrawal">Gewünschte monatliche Entnahme (€)</Label>
              <Input
                id="withdrawal"
                type="number"
                value={inputs.desiredMonthlyWithdrawal}
                onChange={(e) => update("desiredMonthlyWithdrawal", parseFloat(e.target.value) || 0)}
                step={100}
              />
              <p className="text-xs text-slate-400 mt-1">
                Jährlich: {fmtEur(annualWithdrawal)}
              </p>
            </div>
            <div data-design-id="pension-income-field">
              <Label htmlFor="pension">Monatliches Pensionseinkommen (€)</Label>
              <Input
                id="pension"
                type="number"
                value={inputs.monthlyPension}
                onChange={(e) => update("monthlyPension", parseFloat(e.target.value) || 0)}
                step={100}
              />
              <p className="text-xs text-slate-400 mt-1">Staatliche Pension</p>
            </div>
            <div data-design-id="pension-start-age-field">
              <Label htmlFor="pensionAge">Pensionsbeginn (Alter)</Label>
              <Input
                id="pensionAge"
                type="number"
                value={inputs.pensionStartAge}
                onChange={(e) => update("pensionStartAge", parseInt(e.target.value) || 65)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-design-id="inflation-settings-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2" data-design-id="inflation-title">
            <span className="w-8 h-8 rounded-lg bg-neutral-100 text-[#4D4A47] flex items-center justify-center text-sm font-bold">%</span>
            Inflation & Wertbasis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div data-design-id="inflation-rate-field">
              <Label htmlFor="inflation">Inflationsrate (% p.a.)</Label>
              <Input
                id="inflation"
                type="number"
                value={inputs.inflationRate}
                onChange={(e) => update("inflationRate", parseFloat(e.target.value) || 0)}
                step={0.1}
              />
              <p className="text-xs text-slate-400 mt-1">
                EZB-Ziel: 2,0% | Österreich Ø (2000–2024): ~2,3%
              </p>
            </div>
            <div className="flex items-center gap-3 pt-6" data-design-id="real-values-toggle">
              <Switch
                id="realValues"
                checked={inputs.useRealValues}
                onCheckedChange={(checked) => update("useRealValues", checked)}
              />
              <div>
                <Label htmlFor="realValues" className="cursor-pointer">
                  Reale (inflationsbereinigte) Werte verwenden
                </Label>
                <p className="text-xs text-slate-400">
                  {inputs.useRealValues
                    ? "Entnahmen steigen mit der Inflation"
                    : "Entnahmen bleiben nominal (konstant)"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <LiquidityEventsCard
        events={liquidityEvents}
        dispatch={dispatch}
        minAge={client.currentAge}
        maxAge={client.lifeExpectancy}
      />

      <Card className="border-[#8FB687]/40 bg-[#8FB687]/10" data-design-id="financial-summary-card">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div data-design-id="summary-initial-capital">
              <div className="text-xl font-bold text-[#5a8a50]">{fmtEur(inputs.initialCapital)}</div>
              <div className="text-xs text-slate-500">Anfangskapital</div>
            </div>
            <div data-design-id="summary-total-contrib">
              <div className="text-xl font-bold text-[#4D4A47]">{fmtEur(totalContrib)}</div>
              <div className="text-xs text-slate-500">Gesamteinzahlungen</div>
            </div>
            <div data-design-id="summary-net-withdrawal">
              <div className="text-xl font-bold text-rose-600">{fmtEur(netWithdrawal)}</div>
              <div className="text-xs text-slate-500">Netto-Jahresentnahme</div>
            </div>
            <div data-design-id="summary-pension">
              <div className="text-xl font-bold text-[#FAC075]">{fmtEur(inputs.monthlyPension * 12)}</div>
              <div className="text-xs text-slate-500">Jährliche Pension</div>
            </div>
            <div data-design-id="summary-liquidity-events">
              <div className="text-xl font-bold text-[#8A83BE]">
                {liquidityEvents.length > 0
                  ? fmtEur(liquidityEvents.reduce((s, e) => s + e.amount, 0))
                  : "—"}
              </div>
              <div className="text-xs text-slate-500">
                Liquiditätsereignisse ({liquidityEvents.length})
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LiquidityEventsCard({
  events,
  dispatch,
  minAge,
  maxAge,
}: {
  events: LiquidityEvent[];
  dispatch: React.Dispatch<any>;
  minAge: number;
  maxAge: number;
}) {
  const [newAge, setNewAge] = useState(minAge + 5);
  const [newDesc, setNewDesc] = useState("");
  const [newAmount, setNewAmount] = useState(0);

  const addEvent = () => {
    if (!newDesc.trim() || newAmount === 0) return;
    const event: LiquidityEvent = {
      id: crypto.randomUUID(),
      age: newAge,
      description: newDesc.trim(),
      amount: newAmount,
    };
    dispatch({ type: "ADD_LIQUIDITY_EVENT", payload: event });
    setNewDesc("");
    setNewAmount(0);
  };

  const removeEvent = (id: string) => {
    dispatch({ type: "REMOVE_LIQUIDITY_EVENT", payload: id });
  };

  const sortedEvents = [...events].sort((a, b) => a.age - b.age);

  return (
    <Card data-design-id="liquidity-events-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2" data-design-id="liquidity-events-title">
          <span className="w-8 h-8 rounded-lg bg-[#8A83BE]/15 text-[#8A83BE] flex items-center justify-center text-sm font-bold">
            ⇄
          </span>
          Liquiditätsereignisse
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-400">
          Definieren Sie zukünftige Ein- oder Auszahlungen (z.B. Erbschaft, Immobilienverkauf, Ablöse eines Kredits).
          Positive Beträge = Einzahlung, negative Beträge = Auszahlung.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr_140px_auto] gap-2 items-end">
          <div>
            <Label htmlFor="le-age" className="text-xs">Alter</Label>
            <Input
              id="le-age"
              type="number"
              value={newAge}
              onChange={(e) => setNewAge(parseInt(e.target.value) || minAge)}
              min={minAge}
              max={maxAge}
              className="h-9"
            />
          </div>
          <div>
            <Label htmlFor="le-desc" className="text-xs">Beschreibung</Label>
            <Input
              id="le-desc"
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="z.B. Erbschaft, Immobilienverkauf"
              className="h-9"
            />
          </div>
          <div>
            <Label htmlFor="le-amount" className="text-xs">Betrag (€)</Label>
            <Input
              id="le-amount"
              type="number"
              value={newAmount || ""}
              onChange={(e) => setNewAmount(parseFloat(e.target.value) || 0)}
              placeholder="±50.000"
              step={5000}
              className="h-9"
            />
          </div>
          <Button
            onClick={addEvent}
            disabled={!newDesc.trim() || newAmount === 0}
            size="sm"
            className="h-9 bg-[#8A83BE] hover:bg-[#7570a8]"
            data-design-id="add-liquidity-event-button"
          >
            + Hinzufügen
          </Button>
        </div>

        {sortedEvents.length > 0 && (
          <div className="border rounded-lg overflow-hidden" data-design-id="liquidity-events-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">Alter</th>
                  <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">Beschreibung</th>
                  <th className="py-2 px-3 text-right text-xs font-semibold text-slate-500">Betrag</th>
                  <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500">Typ</th>
                  <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map((ev) => (
                  <tr key={ev.id} className="border-b last:border-0 hover:bg-slate-50/60">
                    <td className="py-2 px-3 font-mono font-semibold text-slate-700">{ev.age}</td>
                    <td className="py-2 px-3 text-slate-700">{ev.description}</td>
                    <td className={`py-2 px-3 text-right font-semibold tabular-nums ${ev.amount >= 0 ? "text-[#5a8a50]" : "text-rose-600"}`}>
                      {ev.amount >= 0 ? "+" : ""}{fmtEur(ev.amount)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ev.amount >= 0
                          ? "bg-green-50 text-[#5a8a50]"
                          : "bg-rose-50 text-rose-600"
                      }`}>
                        {ev.amount >= 0 ? "Einzahlung" : "Auszahlung"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => removeEvent(ev.id)}
                        className="text-slate-400 hover:text-rose-600 transition-colors text-lg leading-none"
                        title="Entfernen"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sortedEvents.length === 0 && (
          <div className="text-center py-4 text-sm text-slate-400">
            Keine Liquiditätsereignisse definiert. Fügen Sie Ereignisse hinzu, um Ihren Plan zu verfeinern.
          </div>
        )}
      </CardContent>
    </Card>
  );
}