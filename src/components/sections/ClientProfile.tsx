"use client";

import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export function ClientProfileSection() {
  const { state, dispatch } = useAppState();
  const { client } = state;
  const { t } = useI18n();

  const update = (field: string, value: string | number | boolean) => {
    dispatch({ type: "SET_CLIENT", payload: { [field]: value } });
  };

  return (
    <div className="space-y-6" data-design-id="client-profile-section">
      <div data-design-id="client-profile-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="client-profile-title">{t("client.title")}</h2>
        <p className="text-slate-500 mt-1" data-design-id="client-profile-subtitle">{t("client.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-design-id="client-personal-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" data-design-id="personal-info-title">
              <span className="w-8 h-8 rounded-lg bg-red-50 text-[#D31220] flex items-center justify-center text-sm font-bold">P</span>
              {t("client.personal")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="client-name-field">
              <Label htmlFor="name">{t("client.name")}</Label>
              <Input id="name" value={client.name} onChange={(e) => update("name", e.target.value)} placeholder={t("client.namePlaceholder")} />
            </div>
            <div data-design-id="client-birth-year-field">
              <Label htmlFor="birthYear">{t("client.birthYear")}</Label>
              <Input id="birthYear" type="number" value={client.birthYear} onChange={(e) => { const birthYear = parseInt(e.target.value) || 1980; const currentAge = new Date().getFullYear() - birthYear; dispatch({ type: "SET_CLIENT", payload: { birthYear, currentAge } }); }} />
            </div>
            <div data-design-id="client-current-age-field">
              <Label htmlFor="currentAge">{t("client.currentAge")}</Label>
              <Input
                id="currentAge"
                type="number"
                value={client.currentAge}
                onChange={(e) => {
                  const currentAge = parseInt(e.target.value) || 0;
                  // Bidirektionaler Sync: Wenn das Alter geändert wird,
                  // ziehen wir das Geburtsjahr nach (Jahr - Alter), analog
                  // zum Sync-Verhalten beim Geburtsjahr-Feld oben.
                  const birthYear = new Date().getFullYear() - currentAge;
                  dispatch({ type: "SET_CLIENT", payload: { currentAge, birthYear } });
                }}
              />
            </div>
            <div data-design-id="client-currency-field">
              <Label htmlFor="currency">{t("client.currency")}</Label>
              <Input id="currency" value={client.currency} onChange={(e) => update("currency", e.target.value)} disabled />
            </div>
          </CardContent>
        </Card>

        <Card data-design-id="client-horizon-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" data-design-id="horizon-title">
              <span className="w-8 h-8 rounded-lg bg-amber-100 text-[#FAC075] flex items-center justify-center text-sm font-bold">H</span>
              {t("client.horizon")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="client-retirement-age-field">
              <Label htmlFor="retirementAge">{t("client.retirementAge")}</Label>
              <Input id="retirementAge" type="number" value={client.retirementAge} onChange={(e) => update("retirementAge", parseInt(e.target.value) || 65)} />
              <p className="text-xs text-slate-400 mt-1">
                {t("client.yearsToRetirement")}: {Math.max(0, client.retirementAge - client.currentAge)}
              </p>
              {/* Plausibilitätsguard: Pensionsantritt vor heute oder nach
                  Lebenserwartung verhindern. (Iter 2 — kein Hard-Block, nur
                  visueller Hinweis; Engine clamped intern bereits.) */}
              {client.retirementAge <= client.currentAge && (
                <p className="text-[11px] text-rose-700 mt-1" data-design-id="retirement-before-current-warn">
                  {t("client.retirementBeforeCurrentWarn")}
                </p>
              )}
              {client.retirementAge >= client.lifeExpectancy && (
                <p className="text-[11px] text-rose-700 mt-1" data-design-id="retirement-after-life-warn">
                  {t("client.retirementAfterLifeWarn")}
                </p>
              )}
            </div>
            <div data-design-id="client-life-expectancy-field">
              <Label htmlFor="lifeExpectancy">{t("client.lifeExpectancy")}</Label>
              <Input id="lifeExpectancy" type="number" value={client.lifeExpectancy} onChange={(e) => update("lifeExpectancy", parseInt(e.target.value) || 90)} />
              <p className="text-xs text-slate-400 mt-1">
                {t("client.withdrawalPeriod")}: {Math.max(0, client.lifeExpectancy - client.retirementAge)} {t("client.years")}
              </p>
              {client.lifeExpectancy <= client.currentAge && (
                <p className="text-[11px] text-rose-700 mt-1" data-design-id="life-before-current-warn">
                  {t("client.lifeBeforeCurrentWarn")}
                </p>
              )}
            </div>
            <div data-design-id="client-notes-field">
              <Label htmlFor="notes">{t("client.notes")}</Label>
              <Textarea id="notes" value={client.notes} onChange={(e) => update("notes", e.target.value)} placeholder={t("client.notesPlaceholder")} rows={4} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Beratungsprotokoll */}
      <Card className="border-slate-200" data-design-id="advisory-protocol-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2" data-design-id="advisory-title">
            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold">📋</span>
            {t("client.advisoryTitle")}
          </CardTitle>
          <p className="text-xs text-slate-500">{t("client.advisorySubtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div data-design-id="advisory-date-field">
              <Label htmlFor="advisoryDate">{t("client.advisoryDate")}</Label>
              <Input
                id="advisoryDate"
                type="date"
                value={client.advisoryDate ?? ""}
                onChange={(e) => update("advisoryDate", e.target.value)}
              />
            </div>
            <div data-design-id="advisory-meeting-type-field">
              <Label>{t("client.advisoryMeetingType")}</Label>
              <Select
                value={client.advisoryMeetingType ?? "in_person"}
                onValueChange={(v) => update("advisoryMeetingType", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_person">👤 {t("client.advisoryMeetingInPerson")}</SelectItem>
                  <SelectItem value="phone">📞 {t("client.advisoryMeetingPhone")}</SelectItem>
                  <SelectItem value="video">💻 {t("client.advisoryMeetingVideo")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div data-design-id="advisory-notes-field">
            <Label htmlFor="advisoryNotes">{t("client.advisoryNotes")}</Label>
            <Textarea
              id="advisoryNotes"
              value={client.advisoryNotes ?? ""}
              onChange={(e) => update("advisoryNotes", e.target.value)}
              placeholder={t("client.advisoryNotesPlaceholder")}
              rows={4}
            />
          </div>

          <div data-design-id="advisory-next-steps-field">
            <Label htmlFor="advisoryNextSteps">{t("client.advisoryNextSteps")}</Label>
            <Textarea
              id="advisoryNextSteps"
              value={client.advisoryNextSteps ?? ""}
              onChange={(e) => update("advisoryNextSteps", e.target.value)}
              placeholder={t("client.advisoryNextStepsPlaceholder")}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2" data-design-id="advisory-risk-checkbox">
              <Checkbox
                id="riskDisclosed"
                checked={client.advisoryRiskDisclosed ?? false}
                onCheckedChange={(checked) => update("advisoryRiskDisclosed", checked as boolean)}
              />
              <Label htmlFor="riskDisclosed" className="text-sm cursor-pointer">
                ✓ {t("client.advisoryRiskDisclosed")}
              </Label>
            </div>
            <div className="flex items-center gap-2" data-design-id="advisory-mifid-checkbox">
              <Checkbox
                id="mifidConfirmed"
                checked={client.advisoryMifidConfirmed ?? false}
                onCheckedChange={(checked) => update("advisoryMifidConfirmed", checked as boolean)}
              />
              <Label htmlFor="mifidConfirmed" className="text-sm cursor-pointer">
                § {t("client.advisoryMifidConfirmed")}
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-200 bg-red-50/30" data-design-id="client-summary-card">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div data-design-id="summary-current-age">
              <div className="text-2xl font-bold text-[#D31220]">{client.currentAge}</div>
              <div className="text-xs text-slate-500">{t("client.summaryCurrentAge")}</div>
            </div>
            <div data-design-id="summary-retirement-age">
              <div className="text-2xl font-bold text-[#FAC075]">{client.retirementAge}</div>
              <div className="text-xs text-slate-500">{t("client.summaryRetirementAge")}</div>
            </div>
            <div data-design-id="summary-accumulation">
              <div className="text-2xl font-bold text-[#5a8a50]">{Math.max(0, client.retirementAge - client.currentAge)}</div>
              <div className="text-xs text-slate-500">{t("client.summaryAccumulation")}</div>
            </div>
            <div data-design-id="summary-withdrawal">
              <div className="text-2xl font-bold text-rose-600">{Math.max(0, client.lifeExpectancy - client.retirementAge)}</div>
              <div className="text-xs text-slate-500">{t("client.summaryWithdrawal")}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}