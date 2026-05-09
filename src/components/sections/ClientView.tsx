"use client";

import { useState } from "react";
import { useAppState } from "@/lib/store";
import { useI18n, type Locale } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { safeFilename } from "@/lib/export/sanitize";
import { AdvisorSettings } from "./AdvisorSettings";

export function ClientView() {
  const { state } = useAppState();
  const { client, advisor, inputs, portfolio, result, historicalResult, liquidityEvents, scenarios, detailedTrace } = state;
  const { t } = useI18n();

  const [locale, setLocale] = useState<Locale>("de");
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pin, setPin] = useState("");
  const [includeHistorical, setIncludeHistorical] = useState(true);
  const [includeScenarios, setIncludeScenarios] = useState(true);
  const [includeSavedScenarios, setIncludeSavedScenarios] = useState(true);
  const [includeDetailedPath, setIncludeDetailedPath] = useState(true);
  const [includeMifid, setIncludeMifid] = useState(true);
  const [busy, setBusy] = useState<"html" | "pdf" | null>(null);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const pinError = pinEnabled && pin.length > 0 && !/^\d{6}$/.test(pin);
  const canExport = !!result && !!advisor.name && !pinError && (!pinEnabled || /^\d{6}$/.test(pin));

  const exportHtml = async () => {
    if (!result) return;
    setBusy("html");
    try {
      const { generateClientHtmlReport } = await import("@/lib/export/clientReport/html");
      const blob = await generateClientHtmlReport(
        client,
        advisor,
        inputs,
        portfolio,
        result,
        historicalResult,
        liquidityEvents,
        {
          locale,
          pin: pinEnabled ? pin : undefined,
          includeHistorical,
          includeLiquidityEvents: includeScenarios,
          includeSavedScenarios,
          includeDetailedPath,
          includeMifid,
          scenarios,
          detailedTrace,
        },
      );
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `Ruhestandsplan_${safeFilename(client.name, "Kunde")}_${date}.html`);
    } catch (err) {
      console.error("HTML export error:", err);
      alert("HTML-Export fehlgeschlagen: " + (err as Error).message);
    }
    setBusy(null);
  };

  const exportPdf = async () => {
    if (!result) return;
    setBusy("pdf");
    try {
      const { generateClientPdfReport } = await import("@/lib/export/clientReport/pdf");
      const blob = await generateClientPdfReport(
        client,
        advisor,
        inputs,
        portfolio,
        result,
        historicalResult,
        liquidityEvents,
        locale,
      );
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `Ruhestandsplan_${safeFilename(client.name, "Kunde")}_${date}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      alert("PDF-Export fehlgeschlagen: " + (err as Error).message);
    }
    setBusy(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("clientview.section")}</h2>
        <p className="text-slate-500 mt-1">{t("clientview.desc")}</p>
      </div>

      {!result && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-center">
            <p className="text-amber-700 font-medium">{t("clientview.noResultWarn")}</p>
          </CardContent>
        </Card>
      )}

      <AdvisorSettings />

      {!advisor.name && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-center">
            <p className="text-amber-700 text-sm">{t("clientview.noAdvisorWarn")}</p>
          </CardContent>
        </Card>
      )}

      {/* Settings card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-[#D31220]/10 text-[#D31220] flex items-center justify-center text-sm font-bold">⚙</span>
            {locale === "de" ? "Optionen für den Kundenreport" : "Client report options"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t("clientview.language")}</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  variant={locale === "de" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLocale("de")}
                  className={locale === "de" ? "bg-[#D31220] hover:bg-[#a80e19]" : ""}
                >
                  🇦🇹 Deutsch
                </Button>
                <Button
                  variant={locale === "en" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLocale("en")}
                  className={locale === "en" ? "bg-[#D31220] hover:bg-[#a80e19]" : ""}
                >
                  🇬🇧 English
                </Button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="pin-enable">{t("clientview.pinEnable")}</Label>
                <Switch id="pin-enable" checked={pinEnabled} onCheckedChange={setPinEnabled} />
              </div>
              {pinEnabled && (
                <div className="mt-2 space-y-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={t("clientview.pinPh")}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    className={pinError ? "border-red-500" : ""}
                  />
                  <p className={`text-xs ${pinError ? "text-red-600" : "text-slate-500"}`}>
                    {pinError ? t("clientview.pinShort") : t("clientview.pinHint")}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="inc-hist">{t("clientview.includeHistorical")}</Label>
              <Switch
                id="inc-hist"
                checked={includeHistorical}
                onCheckedChange={setIncludeHistorical}
                disabled={!historicalResult}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="inc-liq">
                {locale === "de" ? "Liquiditätsereignisse zeigen" : "Show liquidity events"}
              </Label>
              <Switch
                id="inc-liq"
                checked={includeScenarios}
                onCheckedChange={setIncludeScenarios}
                disabled={liquidityEvents.length === 0}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="inc-mifid">
                {locale === "de" ? "MiFID II Risikoprofil im Kundentext" : "MiFID II risk profile in client text"}
              </Label>
              <Switch
                id="inc-mifid"
                checked={includeMifid}
                onCheckedChange={setIncludeMifid}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="inc-scen">
                {locale === "de"
                  ? `Gespeicherte Szenarien zeigen${scenarios.length > 0 ? ` (${scenarios.length})` : ""}`
                  : `Show saved scenarios${scenarios.length > 0 ? ` (${scenarios.length})` : ""}`}
              </Label>
              <Switch
                id="inc-scen"
                checked={includeSavedScenarios}
                onCheckedChange={setIncludeSavedScenarios}
                disabled={scenarios.length === 0}
              />
            </div>
            <div className="flex items-center justify-between md:col-span-2">
              <Label htmlFor="inc-trace">
                {locale === "de"
                  ? "Generierten Einzelpfad zeigen (Jahr-für-Jahr-Tabelle)"
                  : "Show generated individual path (year-by-year table)"}
              </Label>
              <Switch
                id="inc-trace"
                checked={includeDetailedPath}
                onCheckedChange={setIncludeDetailedPath}
                disabled={!detailedTrace}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* HTML card */}
        <Card className="border-[#D31220]/40">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg bg-[#D31220]/10 text-[#D31220] flex items-center justify-center font-bold text-sm">HTML</span>
              {t("clientview.downloadHtml")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">{t("clientview.downloadHtmlDesc")}</p>
            <ul className="text-xs text-slate-500 space-y-1">
              <li>• {locale === "de" ? "Interaktive Charts mit Hover-Crosshair & Werte-Tooltip" : "Interactive charts with hover crosshair & value tooltips"}</li>
              <li>• {locale === "de" ? "Gespeicherte Szenarien & Einzelpfad-Tabelle (optional)" : "Saved scenarios & individual-path table (optional)"}</li>
              <li>• {locale === "de" ? "Optionaler PIN-Schutz (SHA-256)" : "Optional PIN protection (SHA-256)"}</li>
              <li>• {locale === "de" ? "\"Details einblenden\" für Methodik und Portfolio-Tabelle" : "\"Show details\" for methodology and portfolio table"}</li>
              <li>• {locale === "de" ? "Druckbar (Browser-Druck)" : "Printable (browser print)"}</li>
              <li>• {locale === "de" ? "Offline-fähig, ohne Internet" : "Offline-capable, no internet required"}</li>
            </ul>
            <Button
              onClick={exportHtml}
              disabled={!canExport || busy !== null}
              className="w-full bg-[#D31220] hover:bg-[#a80e19]"
            >
              {busy === "html" ? t("clientview.generating") : `↓ ${t("clientview.downloadHtml")}`}
            </Button>
          </CardContent>
        </Card>

        {/* PDF card */}
        <Card className="border-neutral-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg bg-neutral-100 text-[#4D4A47] flex items-center justify-center font-bold text-sm">PDF</span>
              {t("clientview.downloadPdf")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">{t("clientview.downloadPdfDesc")}</p>
            <ul className="text-xs text-slate-500 space-y-1">
              <li>• {locale === "de" ? "Seite 1: Cover mit Ihrem Briefkopf + Kernaussage" : "Page 1: Cover with your letterhead + key takeaway"}</li>
              <li>• {locale === "de" ? "Seite 2: Zahlen auf einen Blick" : "Page 2: Numbers at a glance"}</li>
              <li>• {locale === "de" ? "Seite 3: Portfolio-Donut + Kosten/Rendite" : "Page 3: Portfolio donut + cost/return"}</li>
              <li>• {locale === "de" ? "Seite 4: Monte-Carlo-Fächer" : "Page 4: Monte-Carlo fan chart"}</li>
              <li>• {locale === "de" ? "Seite 5: Historischer Rückblick + Disclaimer" : "Page 5: Historical lookback + disclaimer"}</li>
            </ul>
            <Button
              onClick={exportPdf}
              disabled={!canExport || busy !== null}
              variant="outline"
              className="w-full border-slate-900 text-slate-900"
            >
              {busy === "pdf" ? t("clientview.generating") : `↓ ${t("clientview.downloadPdf")}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}