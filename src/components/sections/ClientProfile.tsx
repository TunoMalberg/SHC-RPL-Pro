"use client";

import { useAppState } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ClientProfileSection() {
  const { state, dispatch } = useAppState();
  const { client } = state;

  const update = (field: string, value: string | number) => {
    dispatch({ type: "SET_CLIENT", payload: { [field]: value } });
  };

  return (
    <div className="space-y-6" data-design-id="client-profile-section">
      <div data-design-id="client-profile-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="client-profile-title">Client Profile</h2>
        <p className="text-slate-500 mt-1" data-design-id="client-profile-subtitle">
          Enter the client&apos;s personal information and planning horizon.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-design-id="client-personal-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" data-design-id="personal-info-title">
              <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">P</span>
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="client-name-field">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={client.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Max Mustermann"
              />
            </div>
            <div data-design-id="client-birth-year-field">
              <Label htmlFor="birthYear">Birth Year</Label>
              <Input
                id="birthYear"
                type="number"
                value={client.birthYear}
                onChange={(e) => {
                  const birthYear = parseInt(e.target.value) || 1980;
                  const currentAge = new Date().getFullYear() - birthYear;
                  dispatch({
                    type: "SET_CLIENT",
                    payload: { birthYear, currentAge },
                  });
                }}
              />
            </div>
            <div data-design-id="client-current-age-field">
              <Label htmlFor="currentAge">Current Age</Label>
              <Input
                id="currentAge"
                type="number"
                value={client.currentAge}
                onChange={(e) => update("currentAge", parseInt(e.target.value) || 0)}
              />
            </div>
            <div data-design-id="client-currency-field">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={client.currency}
                onChange={(e) => update("currency", e.target.value)}
                disabled
              />
            </div>
          </CardContent>
        </Card>

        <Card data-design-id="client-horizon-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" data-design-id="horizon-title">
              <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center text-sm font-bold">H</span>
              Planning Horizon
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="client-retirement-age-field">
              <Label htmlFor="retirementAge">Retirement Age</Label>
              <Input
                id="retirementAge"
                type="number"
                value={client.retirementAge}
                onChange={(e) => update("retirementAge", parseInt(e.target.value) || 65)}
              />
              <p className="text-xs text-slate-400 mt-1">
                Years to retirement: {Math.max(0, client.retirementAge - client.currentAge)}
              </p>
            </div>
            <div data-design-id="client-life-expectancy-field">
              <Label htmlFor="lifeExpectancy">Life Expectancy</Label>
              <Input
                id="lifeExpectancy"
                type="number"
                value={client.lifeExpectancy}
                onChange={(e) => update("lifeExpectancy", parseInt(e.target.value) || 90)}
              />
              <p className="text-xs text-slate-400 mt-1">
                Withdrawal period: {Math.max(0, client.lifeExpectancy - client.retirementAge)} years
              </p>
            </div>
            <div data-design-id="client-notes-field">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={client.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Additional notes about the client..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-indigo-200 bg-indigo-50/30" data-design-id="client-summary-card">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div data-design-id="summary-current-age">
              <div className="text-2xl font-bold text-indigo-600">{client.currentAge}</div>
              <div className="text-xs text-slate-500">Current Age</div>
            </div>
            <div data-design-id="summary-retirement-age">
              <div className="text-2xl font-bold text-amber-600">{client.retirementAge}</div>
              <div className="text-xs text-slate-500">Retirement Age</div>
            </div>
            <div data-design-id="summary-accumulation">
              <div className="text-2xl font-bold text-emerald-600">
                {Math.max(0, client.retirementAge - client.currentAge)}
              </div>
              <div className="text-xs text-slate-500">Accumulation Years</div>
            </div>
            <div data-design-id="summary-withdrawal">
              <div className="text-2xl font-bold text-rose-600">
                {Math.max(0, client.lifeExpectancy - client.retirementAge)}
              </div>
              <div className="text-xs text-slate-500">Withdrawal Years</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}