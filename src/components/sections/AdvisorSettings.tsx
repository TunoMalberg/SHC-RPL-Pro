"use client";

import { useRef } from "react";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function AdvisorSettings() {
  const { state, dispatch } = useAppState();
  const { advisor } = state;
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (field: keyof typeof advisor, value: string) => {
    dispatch({ type: "SET_ADVISOR", payload: { [field]: value } });
  };

  const onLogoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200_000) {
      alert("Logo > 200 KB — bitte kleineres Bild wählen.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("logoDataUrl", String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-bold">B</span>
          {t("advisor.title")}
        </CardTitle>
        <p className="text-sm text-slate-500 mt-1">{t("advisor.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="adv-name">{t("advisor.name")}</Label>
            <Input id="adv-name" value={advisor.name} placeholder={t("advisor.namePh")} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="adv-role">{t("advisor.role")}</Label>
            <Input id="adv-role" value={advisor.title} placeholder={t("advisor.rolePh")} onChange={(e) => update("title", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="adv-email">{t("advisor.email")}</Label>
            <Input id="adv-email" type="email" value={advisor.email} placeholder={t("advisor.emailPh")} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="adv-phone">{t("advisor.phone")}</Label>
            <Input id="adv-phone" value={advisor.phone} placeholder={t("advisor.phonePh")} onChange={(e) => update("phone", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="adv-bank">{t("advisor.bank")}</Label>
            <Input id="adv-bank" value={advisor.bankName} onChange={(e) => update("bankName", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="adv-branch">{t("advisor.branch")}</Label>
            <Input id="adv-branch" value={advisor.branch} placeholder={t("advisor.branchPh")} onChange={(e) => update("branch", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="adv-address">{t("advisor.address")}</Label>
            <Textarea id="adv-address" rows={2} value={advisor.address} onChange={(e) => update("address", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="adv-website">{t("advisor.website")}</Label>
            <Input id="adv-website" value={advisor.website} onChange={(e) => update("website", e.target.value)} />
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <Label>{t("advisor.logo")}</Label>
          <div className="flex items-center gap-3 mt-2">
            {advisor.logoDataUrl && (
              <img src={advisor.logoDataUrl} alt="Logo" className="h-12 w-auto border border-slate-200 rounded bg-white p-1" />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              className="hidden"
              onChange={onLogoPick}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              {advisor.logoDataUrl ? "Ersetzen" : "Hochladen"}
            </Button>
            {advisor.logoDataUrl && (
              <Button variant="ghost" size="sm" onClick={() => update("logoDataUrl", "")}>
                {t("advisor.logoRemove")}
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">{t("advisor.logoHint")}</p>
        </div>

        <p className="text-xs text-slate-400 italic">{t("advisor.saveHint")}</p>
      </CardContent>
    </Card>
  );
}