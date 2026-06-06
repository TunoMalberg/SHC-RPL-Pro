"use client";

import { useState } from "react";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateExcelReport } from "@/lib/export/excel";
import { generatePowerPointReport } from "@/lib/export/powerpoint";
import { safeFilename } from "@/lib/export/sanitize";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export function ExportPanel() {
  const { state } = useAppState();
  const { client, inputs, portfolio, result, historicalResult, detailedTrace, liquidityEvents } = state;
  const { t } = useI18n();
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
        client, inputs, portfolio, result, historicalResult, detailedTrace, liquidityEvents
      );
      const date = new Date().toISOString().slice(0, 10);
      // F-06: strict filename whitelist + length cap (safeFilename)
      downloadBlob(blob, `Retirement_Plan_${safeFilename(client.name, "Kunde")}_${date}.xlsx`);
    } catch (err) {
      logger.error("Excel export failed", { scope: "ExportPanel" }, err);
      toast.error("Excel-Export fehlgeschlagen", {
        description: (err as Error).message,
      });
    }
    setExporting(null);
  };

  const exportPowerPoint = async () => {
    if (!result) return;
    setExporting("pptx");
    try {
      const blob = await generatePowerPointReport(
        client, inputs, portfolio, result, historicalResult, detailedTrace, liquidityEvents
      );
      const date = new Date().toISOString().slice(0, 10);
      // F-06: strict filename whitelist + length cap (safeFilename)
      downloadBlob(blob, `Retirement_Plan_${safeFilename(client.name, "Kunde")}_${date}.pptx`);
    } catch (err) {
      logger.error("PowerPoint export failed", { scope: "ExportPanel" }, err);
      toast.error("PowerPoint-Export fehlgeschlagen", {
        description: (err as Error).message,
      });
    }
    setExporting(null);
  };

  const hasResults = result !== null;

  return (
    <div className="space-y-6" data-design-id="export-panel-section">
      <div data-design-id="export-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="export-title">{t("export.title")}</h2>
        <p className="text-slate-500 mt-1" data-design-id="export-subtitle">
          {t("export.subtitle")}
        </p>
      </div>

      {!hasResults && (
        <Card className="border-amber-200 bg-amber-50" data-design-id="export-warning">
          <CardContent className="pt-6 text-center">
            <p className="text-amber-700 font-medium">
              {t("export.noResults")}
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
              <p className="font-medium text-slate-800">{t("export.excelSheets")}</p>
              <ul className="list-none space-y-1">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />{t("export.excelSheet1")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />{t("export.excelSheet2")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />{t("export.excelSheet3")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />{t("export.excelSheet4")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />{t("export.excelSheet5")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />{t("export.excelSheet6")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />{t("export.excelSheet7")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB687]" />{t("export.excelSheet8")}</li>
              </ul>
            </div>
            <Button
              onClick={exportExcel}
              disabled={!hasResults || exporting === "excel"}
              className="w-full bg-[#5a8a50] hover:bg-[#4a7640]"
              data-design-id="excel-download-button"
            >
              {exporting === "excel" ? t("export.excelExporting") : t("export.excelDownload")}
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
              <p className="font-medium text-slate-800">{t("export.pptxSlides")}</p>
              <ul className="list-none space-y-1">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.pptxSlide1")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.pptxSlide2")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.pptxSlide3")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.pptxSlide4")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.pptxSlide5")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.pptxSlide6")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.pptxSlide7")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.pptxSlide8")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.excelSheet7")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.excelSheet6")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.pptxSlide11")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.pptxSlide12")}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#D31220]" />{t("export.pptxSlide13")}</li>
              </ul>
            </div>
            <Button
              onClick={exportPowerPoint}
              disabled={!hasResults || exporting === "pptx"}
              className="w-full bg-[#D31220] hover:bg-[#a80e19]"
              data-design-id="pptx-download-button"
            >
              {exporting === "pptx" ? t("export.pptxExporting") : t("export.pptxDownload")}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-50" data-design-id="export-notes-card">
        <CardContent className="pt-6">
          <h3 className="font-semibold text-slate-800 mb-2" data-design-id="export-notes-title">{t("export.notesTitle")}</h3>
          <ul className="text-sm text-slate-600 space-y-1.5">
            <li>• {t("export.note1")}</li>
            <li>• {t("export.note2")}</li>
            <li>• {t("export.note3")}</li>
            <li>• {t("export.note4")}</li>
            <li>• {t("export.note5")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}