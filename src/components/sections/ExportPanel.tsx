"use client";

import { useState } from "react";
import { useAppState } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateExcelReport } from "@/lib/export/excel";
import { generatePowerPointReport } from "@/lib/export/powerpoint";

export function ExportPanel() {
  const { state } = useAppState();
  const { client, inputs, portfolio, result, historicalResult } = state;
  const [exporting, setExporting] = useState<string | null>(null);

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

  const exportExcel = async () => {
    if (!result) return;
    setExporting("excel");
    try {
      const blob = await generateExcelReport(
        client, inputs, portfolio, result, historicalResult
      );
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `Retirement_Plan_${client.name.replace(/\s+/g, "_")}_${date}.xlsx`);
    } catch (err) {
      console.error("Excel export error:", err);
    }
    setExporting(null);
  };

  const exportPowerPoint = async () => {
    if (!result) return;
    setExporting("pptx");
    try {
      const blob = await generatePowerPointReport(
        client, inputs, portfolio, result, historicalResult
      );
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `Retirement_Plan_${client.name.replace(/\s+/g, "_")}_${date}.pptx`);
    } catch (err) {
      console.error("PowerPoint export error:", err);
    }
    setExporting(null);
  };

  const hasResults = result !== null;

  return (
    <div className="space-y-6" data-design-id="export-panel-section">
      <div data-design-id="export-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="export-title">Bericht-Export</h2>
        <p className="text-slate-500 mt-1" data-design-id="export-subtitle">
          Erstellen Sie professionelle Berichte für Kunden und Berater.
        </p>
      </div>

      {!hasResults && (
        <Card className="border-amber-200 bg-amber-50" data-design-id="export-warning">
          <CardContent className="pt-6 text-center">
            <p className="text-amber-700 font-medium">
              Führen Sie zuerst eine Simulation durch, um Exporte zu aktivieren.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-[#8FB687]/40" data-design-id="excel-export-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-3" data-design-id="excel-export-title">
              <span className="w-10 h-10 rounded-lg bg-[#8FB687]/15 text-[#5a8a50] flex items-center justify-center font-bold text-sm">XLS</span>
              Excel-Bericht
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-600 space-y-1.5" data-design-id="excel-sheets-list">
              <p className="font-medium text-slate-800">Enthaltene Tabellenblätter:</p>
              <ul className="list-none space-y-1">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />Eingaben & Annahmen</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />Portfoliostruktur (3 Töpfe)</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />Monte-Carlo-Zusammenfassung</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />Simulationspfade (Perzentile)</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />Entnahmeanalyse</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />Historische Backtest-Ergebnisse</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />Kennzahlen-Zusammenfassung</li>
              </ul>
            </div>
            <Button
              onClick={exportExcel}
              disabled={!hasResults || exporting === "excel"}
              className="w-full bg-[#5a8a50] hover:bg-[#4a7640]"
              data-design-id="excel-download-button"
            >
              {exporting === "excel" ? "Wird erstellt..." : "📊 Excel-Bericht herunterladen"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-neutral-200" data-design-id="pptx-export-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-3" data-design-id="pptx-export-title">
              <span className="w-10 h-10 rounded-lg bg-neutral-100 text-[#4D4A47] flex items-center justify-center font-bold text-sm">PPT</span>
              PowerPoint-Präsentation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-600 space-y-1.5" data-design-id="pptx-slides-list">
              <p className="font-medium text-slate-800">Enthaltene Folien:</p>
              <ul className="list-none space-y-1">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />Titelfolie (Kunde & Datum)</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />Finanzielle Übersicht</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />Drei-Topf-Portfoliomodell</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />Annahmen & Kennzahlen</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />Monte-Carlo-Ergebnisse</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />Erfolgswahrscheinlichkeit erklärt</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />Entnahmerate & 4%-Regel</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />Risikoanalyse & SoR-Risiko</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />Historische Backtest-Ergebnisse</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />Wissenswertes (MPT, Risiken)</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />Empfehlungen</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />Anhang (Methodik)</li>
              </ul>
            </div>
            <Button
              onClick={exportPowerPoint}
              disabled={!hasResults || exporting === "pptx"}
              className="w-full bg-[#D31220] hover:bg-[#a80e19]"
              data-design-id="pptx-download-button"
            >
              {exporting === "pptx" ? "Wird erstellt..." : "📝 PowerPoint-Präsentation herunterladen"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-50" data-design-id="export-notes-card">
        <CardContent className="pt-6">
          <h3 className="font-semibold text-slate-800 mb-2" data-design-id="export-notes-title">Hinweise zum Export</h3>
          <ul className="text-sm text-slate-600 space-y-1.5">
            <li>• Excel-Berichte enthalten formatierte Datentabellen mit klarer Struktur für Finanzberater</li>
            <li>• PowerPoint-Präsentationen beinhalten Erklärungen zu Monte Carlo, SoR-Risiko und der 4%-Regel</li>
            <li>• Alle Werte verwenden EUR-Formatierung entsprechend dem DACH-Markt</li>
            <li>• Berichte enthalten sowohl Simulationsergebnisse als auch historische Backtest-Daten</li>
            <li>• Der Anhang erläutert die vollständige Methodik für regulatorische und Compliance-Anforderungen</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}