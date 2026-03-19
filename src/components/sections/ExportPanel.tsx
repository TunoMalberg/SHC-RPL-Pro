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
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="export-title">Report Export</h2>
        <p className="text-slate-500 mt-1" data-design-id="export-subtitle">
          Generate professional reports for clients and advisors.
        </p>
      </div>

      {!hasResults && (
        <Card className="border-amber-200 bg-amber-50" data-design-id="export-warning">
          <CardContent className="pt-6 text-center">
            <p className="text-amber-700 font-medium">
              Run a simulation first to enable exports.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-emerald-200" data-design-id="excel-export-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-3" data-design-id="excel-export-title">
              <span className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">XLS</span>
              Excel Report
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-600 space-y-1.5" data-design-id="excel-sheets-list">
              <p className="font-medium text-slate-800">Included Sheets:</p>
              <ul className="list-none space-y-1">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Inputs & Assumptions</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Portfolio Structure (3 Buckets)</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Monte Carlo Summary</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Simulation Paths (Percentiles)</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Withdrawal Analysis</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Historical Backtest Results</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Key Metrics Summary</li>
              </ul>
            </div>
            <Button
              onClick={exportExcel}
              disabled={!hasResults || exporting === "excel"}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              data-design-id="excel-download-button"
            >
              {exporting === "excel" ? "Generating..." : "📊 Download Excel Report"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-blue-200" data-design-id="pptx-export-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-3" data-design-id="pptx-export-title">
              <span className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">PPT</span>
              PowerPoint Presentation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-600 space-y-1.5" data-design-id="pptx-slides-list">
              <p className="font-medium text-slate-800">Included Slides:</p>
              <ul className="list-none space-y-1">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Title Slide (Client & Date)</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Financial Situation Summary</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Three-Bucket Portfolio Model</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Key Assumptions & Metrics</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Monte Carlo Results</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Success Probability Explanation</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Withdrawal Rate & 4% Rule</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Risk Analysis & SoR Risk</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Historical Backtest Results</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Educational Content (MPT, Risks)</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Recommendations</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Appendix (Methodology)</li>
              </ul>
            </div>
            <Button
              onClick={exportPowerPoint}
              disabled={!hasResults || exporting === "pptx"}
              className="w-full bg-blue-600 hover:bg-blue-700"
              data-design-id="pptx-download-button"
            >
              {exporting === "pptx" ? "Generating..." : "📝 Download PowerPoint Presentation"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-50" data-design-id="export-notes-card">
        <CardContent className="pt-6">
          <h3 className="font-semibold text-slate-800 mb-2" data-design-id="export-notes-title">Export Notes</h3>
          <ul className="text-sm text-slate-600 space-y-1.5">
            <li>• Excel reports include formatted data tables with clean structure for financial advisors</li>
            <li>• PowerPoint presentations contain educational content about Monte Carlo, SoR risk, and the 4% rule</li>
            <li>• All values use EUR formatting consistent with the DACH market</li>
            <li>• Reports include both simulation results and historical backtest data</li>
            <li>• The appendix explains the full methodology for regulatory and compliance needs</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}