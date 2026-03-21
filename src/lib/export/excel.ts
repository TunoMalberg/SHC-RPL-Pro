import ExcelJS from "exceljs";
import type {
  ClientProfile,
  FinancialInputs,
  PortfolioConfig,
  SimulationResult,
  HistoricalAnalysis,
} from "../types";

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1B2A4A" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
  name: "Calibri",
};
const SECTION_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EDF3" },
};
const SECTION_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  size: 11,
  name: "Calibri",
  color: { argb: "FF1B2A4A" },
};
const NUM_FMT_EUR = '#,##0 "€"';
const NUM_FMT_PCT = "0.0%";

function styleHeaderRow(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF8899AA" } },
    };
  }
}

function styleSectionRow(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = SECTION_FILL;
    cell.font = SECTION_FONT;
  }
}

export async function generateExcelReport(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  result: SimulationResult,
  historical: HistoricalAnalysis | null
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Retirement Planner Pro";
  wb.created = new Date();

  createInputsSheet(wb, client, inputs);
  createPortfolioSheet(wb, portfolio);
  createMonteCarloSummary(wb, result);
  createPathsSheet(wb, result);
  createWithdrawalSheet(wb, result);
  if (historical) {
    createHistoricalSheet(wb, historical);
  }
  createMetricsSheet(wb, client, inputs, portfolio, result);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function createInputsSheet(
  wb: ExcelJS.Workbook,
  client: ClientProfile,
  inputs: FinancialInputs
) {
  const ws = wb.addWorksheet("Eingaben & Annahmen");
  ws.columns = [
    { width: 32 },
    { width: 20 },
    { width: 15 },
  ];

  let row = 1;
  ws.getCell(row, 1).value = "RUHESTANDSPLANUNG — EINGABEN & ANNAHMEN";
  ws.getCell(row, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FF1B2A4A" } };
  ws.mergeCells(row, 1, row, 3);

  row = 3;
  ws.getCell(row, 1).value = "Kundendaten";
  styleSectionRow(ws, row, 3);

  const clientData = [
    ["Name", client.name],
    ["Geburtsjahr", client.birthYear],
    ["Aktuelles Alter", client.currentAge],
    ["Pensionsalter", client.retirementAge],
    ["Lebenserwartung", client.lifeExpectancy],
    ["Ansparjahre", client.retirementAge - client.currentAge],
    ["Entnahmejahre", client.lifeExpectancy - client.retirementAge],
  ];

  row = 4;
  for (const [label, value] of clientData) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { name: "Calibri", size: 10 };
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).font = { name: "Calibri", size: 10, bold: true };
    row++;
  }

  row++;
  ws.getCell(row, 1).value = "Finanzielle Annahmen";
  styleSectionRow(ws, row, 3);
  row++;

  const finData: [string, number | string, string][] = [
    ["Anfangskapital", inputs.initialCapital, NUM_FMT_EUR],
    ["Monatliche Sparrate", inputs.monthlySavings, NUM_FMT_EUR],
    ["Jährliche Sparsteigerung", inputs.annualSavingsIncrease / 100, NUM_FMT_PCT],
    ["Gewünschte monatl. Entnahme", inputs.desiredMonthlyWithdrawal, NUM_FMT_EUR],
    ["Monatl. Pensionseinkommen", inputs.monthlyPension, NUM_FMT_EUR],
    ["Pensionsbeginn (Alter)", inputs.pensionStartAge, "0"],
    ["Inflationsrate", inputs.inflationRate / 100, NUM_FMT_PCT],
    ["Werte in Realwerten", inputs.useRealValues ? "Ja" : "Nein", ""],
  ];

  for (const [label, value, fmt] of finData) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { name: "Calibri", size: 10 };
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).font = { name: "Calibri", size: 10, bold: true };
    if (fmt) ws.getCell(row, 2).numFmt = fmt;
    row++;
  }

  ws.getCell(row + 1, 1).value = `Bericht erstellt am: ${new Date().toLocaleDateString("de-AT")}`;
  ws.getCell(row + 1, 1).font = { italic: true, size: 9, color: { argb: "FF888888" }, name: "Calibri" };
}

function createPortfolioSheet(wb: ExcelJS.Workbook, portfolio: PortfolioConfig) {
  const ws = wb.addWorksheet("Portfoliostruktur");
  ws.columns = [
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ];

  ws.getCell(1, 1).value = "DREI-TOPF-PORTFOLIOMODELL";
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FF1B2A4A" } };
  ws.mergeCells(1, 1, 1, 7);

  const headers = ["Anlageklasse", "Allokation", "Bruttorendite", "Volatilität", "Kosten", "Steuerbelast.", "Nettorendite"];
  let row = 3;
  for (let c = 0; c < headers.length; c++) {
    ws.getCell(row, c + 1).value = headers[c];
  }
  styleHeaderRow(ws, row, 7);

  row = 4;
  for (const bucket of portfolio.buckets) {
    ws.getCell(row, 1).value = bucket.label;
    ws.getCell(row, 1).font = { bold: true, name: "Calibri", size: 10 };
    ws.getCell(row, 2).value = bucket.allocation / 100;
    ws.getCell(row, 2).numFmt = NUM_FMT_PCT;
    ws.getCell(row, 3).value = bucket.expectedReturn / 100;
    ws.getCell(row, 3).numFmt = NUM_FMT_PCT;
    ws.getCell(row, 4).value = bucket.volatility / 100;
    ws.getCell(row, 4).numFmt = NUM_FMT_PCT;
    ws.getCell(row, 5).value = bucket.costs / 100;
    ws.getCell(row, 5).numFmt = NUM_FMT_PCT;
    ws.getCell(row, 6).value = bucket.taxDrag / 100;
    ws.getCell(row, 6).numFmt = NUM_FMT_PCT;
    ws.getCell(row, 7).value = bucket.netReturn / 100;
    ws.getCell(row, 7).numFmt = NUM_FMT_PCT;
    row++;
  }

  row += 2;
  ws.getCell(row, 1).value = "Korrelationsmatrix";
  styleSectionRow(ws, row, 4);
  row++;
  ws.getCell(row, 2).value = "Bargeld";
  ws.getCell(row, 3).value = "Anleihen";
  ws.getCell(row, 4).value = "Aktien";
  styleHeaderRow(ws, row, 4);

  const labels = ["Bargeld", "Anleihen", "Aktien"];
  for (let i = 0; i < 3; i++) {
    row++;
    ws.getCell(row, 1).value = labels[i];
    ws.getCell(row, 1).font = { bold: true, name: "Calibri", size: 10 };
    for (let j = 0; j < 3; j++) {
      ws.getCell(row, j + 2).value = portfolio.correlationMatrix[i][j];
      ws.getCell(row, j + 2).numFmt = "0.00";
    }
  }

  row += 2;
  ws.getCell(row, 1).value = `Rebalancing: ${portfolio.rebalancingFrequency} (Schwellenwert: ${portfolio.rebalancingThreshold}%)`;
  ws.getCell(row, 1).font = { italic: true, size: 10, name: "Calibri" };
}

function createMonteCarloSummary(wb: ExcelJS.Workbook, result: SimulationResult) {
  const ws = wb.addWorksheet("Monte-Carlo-Zusammenfassung");
  ws.columns = [{ width: 32 }, { width: 22 }];

  ws.getCell(1, 1).value = "MONTE-CARLO-SIMULATIONSERGEBNISSE";
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FF1B2A4A" } };
  ws.mergeCells(1, 1, 1, 2);

  let row = 3;
  ws.getCell(row, 1).value = "Kernergebnisse";
  styleSectionRow(ws, row, 2);

  const metrics: [string, number | string, string?][] = [
    ["Erfolgswahrscheinlichkeit", result.successRate / 100, NUM_FMT_PCT],
    ["Median Endvermögen", result.medianFinalWealth, NUM_FMT_EUR],
    ["Mittelwert Endvermögen", result.meanFinalWealth, NUM_FMT_EUR],
    ["Portfoliorendite (p.a.)", result.portfolioReturn / 100, NUM_FMT_PCT],
    ["Portfoliovolatilität (p.a.)", result.portfolioVolatility / 100, NUM_FMT_PCT],
    ["Sharpe Ratio", result.sharpeRatio, "0.00"],
    ["Max. Drawdown (Median)", result.maxDrawdown / 100, NUM_FMT_PCT],
  ];

  row = 4;
  for (const [label, value, fmt] of metrics) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { name: "Calibri", size: 10 };
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).font = { name: "Calibri", size: 10, bold: true };
    if (fmt) ws.getCell(row, 2).numFmt = fmt;
    row++;
  }

  row += 1;
  ws.getCell(row, 1).value = "Endvermögen nach Perzentilen";
  styleSectionRow(ws, row, 2);
  row++;

  const pctiles = [
    ["5. Perzentil", result.percentiles.p5],
    ["10. Perzentil", result.percentiles.p10],
    ["25. Perzentil", result.percentiles.p25],
    ["Median (50.)", result.percentiles.p50],
    ["75. Perzentil", result.percentiles.p75],
    ["90. Perzentil", result.percentiles.p90],
    ["95. Perzentil", result.percentiles.p95],
  ];

  for (const [label, value] of pctiles) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { name: "Calibri", size: 10 };
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 2).font = { name: "Calibri", size: 10, bold: true };
    row++;
  }

  if (result.failureYear) {
    row += 1;
    ws.getCell(row, 1).value = "Versagensanalyse";
    styleSectionRow(ws, row, 2);
    row++;
    ws.getCell(row, 1).value = "Frühestes Versagensalter";
    ws.getCell(row, 2).value = Math.round(result.failureYear);
    row++;
    if (result.medianFailureYear) {
      ws.getCell(row, 1).value = "Medianes Versagensalter";
      ws.getCell(row, 2).value = Math.round(result.medianFailureYear);
    }
  }
}

function createPathsSheet(wb: ExcelJS.Workbook, result: SimulationResult) {
  const ws = wb.addWorksheet("Simulationspfade");

  const headers = ["Alter", "Schlechtester", "10. Perz.", "25. Perz.", "Median", "75. Perz.", "90. Perz.", "Bester"];
  ws.columns = headers.map(() => ({ width: 16 }));

  ws.getCell(1, 1).value = "PORTFOLIOWERT-PFADE (PERZENTILE)";
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FF1B2A4A" } };
  ws.mergeCells(1, 1, 1, 8);

  let row = 3;
  for (let c = 0; c < headers.length; c++) {
    ws.getCell(row, c + 1).value = headers[c];
  }
  styleHeaderRow(ws, row, 8);

  const step = Math.max(1, Math.floor(result.yearLabels.length / 100));
  for (let i = 0; i < result.yearLabels.length; i += step) {
    row++;
    ws.getCell(row, 1).value = Math.round(result.yearLabels[i] * 10) / 10;
    ws.getCell(row, 2).value = Math.round(result.worstPath[i]);
    ws.getCell(row, 2).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 3).value = Math.round(result.p10Path[i]);
    ws.getCell(row, 3).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 4).value = Math.round(result.p25Path[i]);
    ws.getCell(row, 4).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 5).value = Math.round(result.medianPath[i]);
    ws.getCell(row, 5).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 6).value = Math.round(result.p75Path[i]);
    ws.getCell(row, 6).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 7).value = Math.round(result.p90Path[i]);
    ws.getCell(row, 7).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 8).value = Math.round(result.bestPath[i]);
    ws.getCell(row, 8).numFmt = NUM_FMT_EUR;
  }
}

function createWithdrawalSheet(
  wb: ExcelJS.Workbook,
  result: SimulationResult
) {
  const ws = wb.addWorksheet("Entnahmeanalyse");
  ws.columns = [{ width: 20 }, { width: 20 }];

  ws.getCell(1, 1).value = "ENTNAHME-NACHHALTIGKEITSANALYSE";
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FF1B2A4A" } };
  ws.mergeCells(1, 1, 1, 2);

  let row = 3;
  ws.getCell(row, 1).value = "Monatliche Entnahme";
  ws.getCell(row, 2).value = "Erfolgsquote";
  styleHeaderRow(ws, row, 2);

  if (result.withdrawalHeatmap) {
    for (const item of result.withdrawalHeatmap) {
      row++;
      ws.getCell(row, 1).value = item.withdrawal;
      ws.getCell(row, 1).numFmt = NUM_FMT_EUR;
      ws.getCell(row, 2).value = item.successRate / 100;
      ws.getCell(row, 2).numFmt = NUM_FMT_PCT;
    }
  }

  if (result.sustainableWithdrawal) {
    row += 2;
    ws.getCell(row, 1).value = "Nachhaltige Entnahme (95% Konfidenz)";
    ws.getCell(row, 1).font = { bold: true, name: "Calibri", size: 10 };
    ws.getCell(row, 2).value = result.sustainableWithdrawal;
    ws.getCell(row, 2).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 2).font = { bold: true, name: "Calibri", size: 12, color: { argb: "FF2E7D32" } };
  }
}

function createHistoricalSheet(
  wb: ExcelJS.Workbook,
  historical: HistoricalAnalysis
) {
  const ws = wb.addWorksheet("Historischer Backtest");
  ws.columns = [
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 18 },
    { width: 16 },
    { width: 14 },
    { width: 16 },
  ];

  ws.getCell(1, 1).value = "HISTORISCHE BACKTEST-ERGEBNISSE";
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FF1B2A4A" } };
  ws.mergeCells(1, 1, 1, 7);

  let row = 3;
  ws.getCell(row, 1).value = "Zusammenfassung";
  styleSectionRow(ws, row, 7);
  row++;

  ws.getCell(row, 1).value = "Gesamterfolgsquote";
  ws.getCell(row, 2).value = historical.overallSuccessRate / 100;
  ws.getCell(row, 2).numFmt = NUM_FMT_PCT;
  ws.getCell(row, 2).font = { bold: true, name: "Calibri", size: 12 };
  row++;
  ws.getCell(row, 1).value = "Ø Endvermögen";
  ws.getCell(row, 2).value = Math.round(historical.averageFinalWealth);
  ws.getCell(row, 2).numFmt = NUM_FMT_EUR;
  row += 2;

  const headers = ["Startjahr", "Endjahr", "Erfolg", "Endvermögen", "Max. Drawdown", "Schlecht. Jahr", "Schlecht. Rendite"];
  for (let c = 0; c < headers.length; c++) {
    ws.getCell(row, c + 1).value = headers[c];
  }
  styleHeaderRow(ws, row, 7);

  for (const scenario of historical.scenarios) {
    row++;
    ws.getCell(row, 1).value = scenario.startYear;
    ws.getCell(row, 2).value = scenario.endYear;
    ws.getCell(row, 3).value = scenario.success ? "✓" : "✗";
    ws.getCell(row, 3).font = {
      color: { argb: scenario.success ? "FF2E7D32" : "FFC62828" },
      bold: true,
      name: "Calibri",
    };
    ws.getCell(row, 4).value = Math.round(scenario.finalWealth);
    ws.getCell(row, 4).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 5).value = scenario.maxDrawdown / 100;
    ws.getCell(row, 5).numFmt = NUM_FMT_PCT;
    ws.getCell(row, 6).value = scenario.worstYear;
    ws.getCell(row, 7).value = scenario.worstReturn / 100;
    ws.getCell(row, 7).numFmt = NUM_FMT_PCT;
  }
}

function createMetricsSheet(
  wb: ExcelJS.Workbook,
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  result: SimulationResult
) {
  const ws = wb.addWorksheet("Kennzahlen");
  ws.columns = [{ width: 36 }, { width: 22 }];

  ws.getCell(1, 1).value = "KENNZAHLEN-ZUSAMMENFASSUNG";
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FF1B2A4A" } };
  ws.mergeCells(1, 1, 1, 2);

  let row = 3;
  ws.getCell(row, 1).value = "Planungshorizont";
  styleSectionRow(ws, row, 2);
  row++;

  const horizonData: [string, number | string][] = [
    ["Jahre bis zur Pension", client.retirementAge - client.currentAge],
    ["Jahre im Ruhestand", client.lifeExpectancy - client.retirementAge],
    ["Gesamtplanungshorizont", client.lifeExpectancy - client.currentAge],
  ];

  for (const [label, value] of horizonData) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).font = { bold: true, name: "Calibri", size: 10 };
    row++;
  }

  row++;
  ws.getCell(row, 1).value = "Kapital bei Pensionierung (Median)";
  styleSectionRow(ws, row, 2);
  row++;

  const accSteps = (client.retirementAge - client.currentAge);
  const retIdx = Math.min(accSteps, result.medianPath.length - 1);
  ws.getCell(row, 1).value = "Prognostiziertes Portfolio bei Pensionierung";
  ws.getCell(row, 2).value = Math.round(result.medianPath[retIdx]);
  ws.getCell(row, 2).numFmt = NUM_FMT_EUR;
  ws.getCell(row, 2).font = { bold: true, name: "Calibri", size: 12, color: { argb: "FF1565C0" } };

  row += 2;
  ws.getCell(row, 1).value = "Entnahmeratenanalyse";
  styleSectionRow(ws, row, 2);
  row++;

  const annualWithdrawal = inputs.desiredMonthlyWithdrawal * 12;
  const capitalAtRet = result.medianPath[retIdx];
  const withdrawalRate = capitalAtRet > 0 ? annualWithdrawal / capitalAtRet : 0;

  ws.getCell(row, 1).value = "Jährliche Entnahme";
  ws.getCell(row, 2).value = annualWithdrawal;
  ws.getCell(row, 2).numFmt = NUM_FMT_EUR;
  row++;
  ws.getCell(row, 1).value = "Anfängliche Entnahmerate";
  ws.getCell(row, 2).value = withdrawalRate;
  ws.getCell(row, 2).numFmt = NUM_FMT_PCT;
  ws.getCell(row, 2).font = {
    bold: true,
    name: "Calibri",
    size: 12,
    color: { argb: withdrawalRate <= 0.04 ? "FF2E7D32" : "FFC62828" },
  };

  row += 2;
  ws.getCell(row, 1).value = "Risikokennzahlen";
  styleSectionRow(ws, row, 2);
  row++;

  const riskData: [string, number, string][] = [
    ["Portfoliovolatilität", result.portfolioVolatility / 100, NUM_FMT_PCT],
    ["Sharpe Ratio", result.sharpeRatio, "0.00"],
    ["Max. Drawdown (Median)", result.maxDrawdown / 100, NUM_FMT_PCT],
    ["Erfolgswahrscheinlichkeit", result.successRate / 100, NUM_FMT_PCT],
  ];

  for (const [label, value, fmt] of riskData) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).numFmt = fmt;
    ws.getCell(row, 2).font = { bold: true, name: "Calibri", size: 10 };
    row++;
  }
}