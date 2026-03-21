"use client";

import { useAppState } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fmtEur } from "@/lib/format";

export function FinancialInputsSection() {
  const { state, dispatch } = useAppState();
  const { inputs, client } = state;

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

      <Card className="border-[#8FB687]/40 bg-[#8FB687]/10" data-design-id="financial-summary-card">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}