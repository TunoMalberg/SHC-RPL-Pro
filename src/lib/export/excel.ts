import ExcelJS from "exceljs";
import type {
  ClientProfile,
  FinancialInputs,
  PortfolioConfig,
  SimulationResult,
  HistoricalAnalysis,
  DetailedSimTrace,
  LiquidityEvent,
} from "../types";
import { historicalData } from "../engine/historical";

/* Schelhammer Capital Corporate Design Colors */
const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF20201E" },  // Mattschwarz
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
  fgColor: { argb: "FFF5F3F0" },  // SHC warm light
};
const SECTION_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  size: 11,
  name: "Calibri",
  color: { argb: "FFD31220" },  // Feuerrot
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
  historical: HistoricalAnalysis | null,
  detailedTrace?: DetailedSimTrace | null,
  liquidityEvents?: LiquidityEvent[]
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Retirement Planner Pro";
  wb.created = new Date();

  createInputsSheet(wb, client, inputs, liquidityEvents ?? []);
  createPortfolioSheet(wb, portfolio);
  createMonteCarloSummary(wb, result);
  createPathsSheet(wb, result);
  createWithdrawalSheet(wb, result);
  if (historical) {
    createHistoricalSheet(wb, historical);
  }
  if (detailedTrace) {
    createDetailedTraceSheet(wb, detailedTrace, portfolio);
  }
  createMetricsSheet(wb, client, inputs, portfolio, result);

  // Raw data sheets — enable full chart reconstruction in Excel
  createRawPathsSheet(wb, result);
  createRawAnnualsSheet(wb, result);
  createRawFinalsSheet(wb, result);
  createRawWithdrawalHeatmapSheet(wb, result);
  if (historical) {
    createRawHistoricalPathsSheet(wb, historical);
    createRawHistoricalReturnsSheet(wb);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function createInputsSheet(
  wb: ExcelJS.Workbook,
  client: ClientProfile,
  inputs: FinancialInputs,
  liquidityEvents: LiquidityEvent[] = []
) {
  const ws = wb.addWorksheet("Eingaben & Annahmen");
  ws.columns = [
    { width: 32 },
    { width: 20 },
    { width: 15 },
  ];

  let row = 1;
  ws.getCell(row, 1).value = "RUHESTANDSPLANUNG — EINGABEN & ANNAHMEN";
  ws.getCell(row, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FFD31220" } };
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

  if (liquidityEvents.length > 0) {
    row += 2;
    ws.getCell(row, 1).value = "Liquiditätsereignisse";
    styleSectionRow(ws, row, 3);
    row++;

    ws.getCell(row, 1).value = "Alter";
    ws.getCell(row, 2).value = "Beschreibung";
    ws.getCell(row, 3).value = "Betrag";
    styleHeaderRow(ws, row, 3);
    row++;

    const sorted = [...liquidityEvents].sort((a, b) => a.age - b.age);
    for (const ev of sorted) {
      ws.getCell(row, 1).value = ev.age;
      ws.getCell(row, 1).font = { name: "Calibri", size: 10, bold: true };
      ws.getCell(row, 2).value = ev.description;
      ws.getCell(row, 2).font = { name: "Calibri", size: 10 };
      ws.getCell(row, 3).value = ev.amount;
      ws.getCell(row, 3).numFmt = NUM_FMT_EUR;
      ws.getCell(row, 3).font = {
        name: "Calibri",
        size: 10,
        bold: true,
        color: { argb: ev.amount >= 0 ? "FF2E7D32" : "FFC62828" },
      };
      row++;
    }
  }

  row++;
  ws.getCell(row, 1).value = `Bericht erstellt am: ${new Date().toLocaleDateString("de-AT")}`;
  ws.getCell(row, 1).font = { italic: true, size: 9, color: { argb: "FF888888" }, name: "Calibri" };
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
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FFD31220" } };
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

  row++;
  ws.getCell(row, 1).value = `KESt (Kapitalertragsteuer): ${(portfolio.kestRate ?? 27.5).toFixed(2)} % — angewandt auf (Rendite − Kosten) je Topf`;
  ws.getCell(row, 1).font = { italic: true, size: 10, name: "Calibri", color: { argb: "FFD31220" } };
}

function createMonteCarloSummary(wb: ExcelJS.Workbook, result: SimulationResult) {
  const ws = wb.addWorksheet("Monte-Carlo-Zusammenfassung");
  ws.columns = [{ width: 32 }, { width: 22 }];

  ws.getCell(1, 1).value = "MONTE-CARLO-SIMULATIONSERGEBNISSE";
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FFD31220" } };
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
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FFD31220" } };
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
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FFD31220" } };
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
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FFD31220" } };
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
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FFD31220" } };
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

const REBAL_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF8E1" },
};

function createDetailedTraceSheet(
  wb: ExcelJS.Workbook,
  trace: DetailedSimTrace,
  portfolio: PortfolioConfig
) {
  const ws = wb.addWorksheet("Einzelpfad-Beispiel");

  const colWidths = [10, 8, 10, 16, 14, 14, 14, 10, 10, 10, 16, 16, 10, 18, 14, 14, 14, 16];
  ws.columns = colWidths.map((w) => ({ width: w }));

  ws.getCell(1, 1).value = "MONTE-CARLO EINZELPFAD — DETAILLIERTES BEISPIEL";
  ws.getCell(1, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FFD31220" } };
  ws.mergeCells(1, 1, 1, 18);

  let row = 2;
  ws.getCell(row, 1).value = `Simulation #${trace.simulationIndex + 1} (Seed: ${trace.seed})`;
  ws.getCell(row, 1).font = { italic: true, size: 10, name: "Calibri", color: { argb: "FF888888" } };
  ws.mergeCells(row, 1, row, 8);

  ws.getCell(row, 9).value = `Ergebnis: ${trace.success ? "Erfolgreich" : "Kapital aufgebraucht"}`;
  ws.getCell(row, 9).font = {
    bold: true, size: 10, name: "Calibri",
    color: { argb: trace.success ? "FF2E7D32" : "FFC62828" },
  };
  ws.mergeCells(row, 9, row, 12);

  ws.getCell(row, 13).value = `Endvermögen: € ${Math.round(trace.finalWealth).toLocaleString("de-AT")}`;
  ws.getCell(row, 13).font = { bold: true, size: 10, name: "Calibri" };
  ws.mergeCells(row, 13, row, 16);

  row = 4;
  const headers = [
    "Jahr", "Alter", "Phase",
    "Start Gesamt",
    "Bargeld", "Anleihen", "Aktien",
    "Rend.% B", "Rend.% A", "Rend.% Akt",
    "Cashflow", "Liquidität", "Umsch.",
    "Quelle",
    "Umsch.Δ Barg.", "Umsch.Δ Anl.", "Umsch.Δ Akt.",
    "Ende Gesamt",
  ];

  for (let c = 0; c < headers.length; c++) {
    ws.getCell(row, c + 1).value = headers[c];
  }
  styleHeaderRow(ws, row, headers.length);

  for (const r of trace.rows) {
    row++;

    ws.getCell(row, 1).value = r.year;
    ws.getCell(row, 2).value = r.age;
    ws.getCell(row, 3).value = r.phase;
    ws.getCell(row, 3).font = {
      name: "Calibri", size: 9, bold: true,
      color: { argb: r.phase === "Anspar" ? "FF1565C0" : "FFE65100" },
    };

    ws.getCell(row, 4).value = Math.round(r.startTotal);
    ws.getCell(row, 4).numFmt = NUM_FMT_EUR;

    ws.getCell(row, 5).value = Math.round(r.startCash);
    ws.getCell(row, 5).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 6).value = Math.round(r.startBonds);
    ws.getCell(row, 6).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 7).value = Math.round(r.startEquities);
    ws.getCell(row, 7).numFmt = NUM_FMT_EUR;

    ws.getCell(row, 8).value = r.returnCashPct / 100;
    ws.getCell(row, 8).numFmt = NUM_FMT_PCT;
    ws.getCell(row, 8).font = {
      name: "Calibri", size: 9,
      color: { argb: r.returnCashPct >= 0 ? "FF2E7D32" : "FFC62828" },
    };

    ws.getCell(row, 9).value = r.returnBondsPct / 100;
    ws.getCell(row, 9).numFmt = NUM_FMT_PCT;
    ws.getCell(row, 9).font = {
      name: "Calibri", size: 9,
      color: { argb: r.returnBondsPct >= 0 ? "FF1565C0" : "FFC62828" },
    };

    ws.getCell(row, 10).value = r.returnEquitiesPct / 100;
    ws.getCell(row, 10).numFmt = NUM_FMT_PCT;
    ws.getCell(row, 10).font = {
      name: "Calibri", size: 9,
      color: { argb: r.returnEquitiesPct >= 0 ? "FFD31220" : "FFC62828" },
    };

    ws.getCell(row, 11).value = Math.round(r.cashflow);
    ws.getCell(row, 11).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 11).font = {
      name: "Calibri", size: 9,
      color: { argb: r.cashflow >= 0 ? "FF2E7D32" : "FFE65100" },
    };

    ws.getCell(row, 12).value = r.liquidityEvent !== 0 ? Math.round(r.liquidityEvent) : "";
    if (r.liquidityEvent !== 0) {
      ws.getCell(row, 12).numFmt = NUM_FMT_EUR;
      ws.getCell(row, 12).font = {
        name: "Calibri", size: 9, bold: true,
        color: { argb: r.liquidityEvent >= 0 ? "FF2E7D32" : "FFC62828" },
      };
      ws.getCell(row, 12).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F0FF" },
      };
    }

    ws.getCell(row, 13).value = r.rebalanced ? "Ja" : "";
    ws.getCell(row, 13).font = {
      name: "Calibri", size: 9, bold: r.rebalanced,
      color: { argb: r.rebalanced ? "FFE65100" : "FFCCCCCC" },
    };

    ws.getCell(row, 14).value = r.rebalanced && r.rebalSource ? r.rebalSource : "";
    ws.getCell(row, 14).font = {
      name: "Calibri", size: 8, italic: true,
      color: { argb: r.rebalSource?.includes("Verlustschutz") ? "FFE65100" : "FF666666" },
    };

    if (r.rebalanced) {
      ws.getCell(row, 15).value = Math.round(r.rebalCashDelta);
      ws.getCell(row, 15).numFmt = NUM_FMT_EUR;
      ws.getCell(row, 16).value = Math.round(r.rebalBondsDelta);
      ws.getCell(row, 16).numFmt = NUM_FMT_EUR;
      ws.getCell(row, 17).value = Math.round(r.rebalEquitiesDelta);
      ws.getCell(row, 17).numFmt = NUM_FMT_EUR;

      for (let c = 1; c <= headers.length; c++) {
        ws.getCell(row, c).fill = REBAL_FILL;
      }
    }

    ws.getCell(row, 18).value = Math.round(r.endTotal);
    ws.getCell(row, 18).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 18).font = { bold: true, name: "Calibri", size: 9 };
  }

  row += 2;
  ws.getCell(row, 1).value = "Legende";
  styleSectionRow(ws, row, 6);
  row++;
  ws.getCell(row, 1).value = "Rend.% B/A/Akt = Jahresrendite je Topf (Bargeld/Anleihen/Aktien)";
  ws.getCell(row, 1).font = { italic: true, size: 9, name: "Calibri", color: { argb: "FF888888" } };
  ws.mergeCells(row, 1, row, 8);
  row++;
  ws.getCell(row, 1).value = "Liquidität = Sonder-Ein-/Auszahlungen (Erbschaft, Immobilienverkauf, etc.)";
  ws.getCell(row, 1).font = { italic: true, size: 9, name: "Calibri", color: { argb: "FF8A83BE" } };
  ws.mergeCells(row, 1, row, 8);
  row++;
  ws.getCell(row, 1).value = "Quelle = Woher der Liquiditätspuffer aufgefüllt wird (Aktien bei Gewinnen, Anleihen bei Verlusten)";
  ws.getCell(row, 1).font = { italic: true, size: 9, name: "Calibri", color: { argb: "FFE65100" } };
  ws.mergeCells(row, 1, row, 10);
  row++;
  ws.getCell(row, 1).value = "Umsch.Δ = Umschichtungsbetrag bei Rebalancing (positiv = Zufluss, negativ = Abfluss)";
  ws.getCell(row, 1).font = { italic: true, size: 9, name: "Calibri", color: { argb: "FF888888" } };
  ws.mergeCells(row, 1, row, 8);
  row++;
  ws.getCell(row, 1).value = "Gelb hinterlegte Zeilen = Rebalancing wurde ausgelöst";
  ws.getCell(row, 1).font = { italic: true, size: 9, name: "Calibri", color: { argb: "FFE65100" } };
  ws.mergeCells(row, 1, row, 8);
  row++;
  ws.getCell(row, 1).value = `3-Töpfe-Strategie: Liquiditätspuffer = ${portfolio.cashYearsTarget} Jahre der jährlichen Entnahme`;
  ws.getCell(row, 1).font = { italic: true, size: 9, name: "Calibri", color: { argb: "FF1565C0" } };
  ws.mergeCells(row, 1, row, 10);
}

/* ============================================================================
 * RAW DATA SHEETS
 * Full, unrounded numeric series so that all charts can be rebuilt in Excel.
 * ============================================================================ */

function createRawPathsSheet(wb: ExcelJS.Workbook, result: SimulationResult) {
  const ws = wb.addWorksheet("Rohdaten_MC_Pfade");

  ws.getCell(1, 1).value = "ROHDATEN — Monte-Carlo-Pfade (Perzentile, vollständig)";
  ws.getCell(1, 1).font = { bold: true, size: 13, name: "Calibri", color: { argb: "FFD31220" } };
  ws.mergeCells(1, 1, 1, 10);
  ws.getCell(2, 1).value = "Jede Zeile = ein Simulations-Zeitschritt. Beträge in EUR, nicht gerundet.";
  ws.getCell(2, 1).font = { italic: true, size: 9, name: "Calibri", color: { argb: "FF666666" } };
  ws.mergeCells(2, 1, 2, 10);

  const headers = ["Schritt", "Alter", "Jahr (rel.)", "Schlechtester", "P10", "P25", "Median", "P75", "P90", "Bester"];
  ws.columns = headers.map(() => ({ width: 16 }));
  let row = 4;
  for (let c = 0; c < headers.length; c++) ws.getCell(row, c + 1).value = headers[c];
  styleHeaderRow(ws, row, headers.length);

  const n = result.yearLabels.length;
  const a0 = result.yearLabels[0] ?? 0;
  for (let i = 0; i < n; i++) {
    row++;
    ws.getCell(row, 1).value = i;
    ws.getCell(row, 2).value = result.yearLabels[i];
    ws.getCell(row, 2).numFmt = "0.00";
    ws.getCell(row, 3).value = result.yearLabels[i] - a0;
    ws.getCell(row, 3).numFmt = "0.00";
    ws.getCell(row, 4).value = result.worstPath[i];
    ws.getCell(row, 4).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 5).value = result.p10Path[i];
    ws.getCell(row, 5).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 6).value = result.p25Path[i];
    ws.getCell(row, 6).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 7).value = result.medianPath[i];
    ws.getCell(row, 7).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 8).value = result.p75Path[i];
    ws.getCell(row, 8).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 9).value = result.p90Path[i];
    ws.getCell(row, 9).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 10).value = result.bestPath[i];
    ws.getCell(row, 10).numFmt = NUM_FMT_EUR;
  }
}

function createRawAnnualsSheet(wb: ExcelJS.Workbook, result: SimulationResult) {
  const ws = wb.addWorksheet("Rohdaten_Jahreswerte");

  ws.getCell(1, 1).value = "ROHDATEN — Jährliche Median-Portfoliowerte & Entnahmen";
  ws.getCell(1, 1).font = { bold: true, size: 13, name: "Calibri", color: { argb: "FFD31220" } };
  ws.mergeCells(1, 1, 1, 4);

  const headers = ["Jahr (rel.)", "Portfoliowert (Median)", "Jährliche Entnahme", "Entnahme kumuliert"];
  ws.columns = headers.map(() => ({ width: 22 }));
  let row = 3;
  for (let c = 0; c < headers.length; c++) ws.getCell(row, c + 1).value = headers[c];
  styleHeaderRow(ws, row, headers.length);

  let cum = 0;
  for (let i = 0; i < result.annualPortfolioValues.length; i++) {
    row++;
    ws.getCell(row, 1).value = i;
    ws.getCell(row, 2).value = result.annualPortfolioValues[i];
    ws.getCell(row, 2).numFmt = NUM_FMT_EUR;
    ws.getCell(row, 3).value = result.annualWithdrawals[i] ?? 0;
    ws.getCell(row, 3).numFmt = NUM_FMT_EUR;
    cum += result.annualWithdrawals[i] ?? 0;
    ws.getCell(row, 4).value = cum;
    ws.getCell(row, 4).numFmt = NUM_FMT_EUR;
  }
}

function createRawFinalsSheet(wb: ExcelJS.Workbook, result: SimulationResult) {
  const ws = wb.addWorksheet("Rohdaten_Endwerte_Perz");

  ws.getCell(1, 1).value = "ROHDATEN — Endvermögen nach Perzentilen";
  ws.getCell(1, 1).font = { bold: true, size: 13, name: "Calibri", color: { argb: "FFD31220" } };
  ws.mergeCells(1, 1, 1, 2);

  const headers = ["Perzentil", "Endvermögen (EUR)"];
  ws.columns = [{ width: 14 }, { width: 22 }];
  let row = 3;
  for (let c = 0; c < headers.length; c++) ws.getCell(row, c + 1).value = headers[c];
  styleHeaderRow(ws, row, headers.length);

  const entries: [number, number][] = [
    [5, result.percentiles.p5],
    [10, result.percentiles.p10],
    [25, result.percentiles.p25],
    [50, result.percentiles.p50],
    [75, result.percentiles.p75],
    [90, result.percentiles.p90],
    [95, result.percentiles.p95],
  ];
  for (const [p, v] of entries) {
    row++;
    ws.getCell(row, 1).value = p;
    ws.getCell(row, 1).numFmt = "0";
    ws.getCell(row, 2).value = v;
    ws.getCell(row, 2).numFmt = NUM_FMT_EUR;
  }

  row += 2;
  ws.getCell(row, 1).value = "Median";
  ws.getCell(row, 2).value = result.medianFinalWealth;
  ws.getCell(row, 2).numFmt = NUM_FMT_EUR;
  row++;
  ws.getCell(row, 1).value = "Mittelwert";
  ws.getCell(row, 2).value = result.meanFinalWealth;
  ws.getCell(row, 2).numFmt = NUM_FMT_EUR;
}

function createRawWithdrawalHeatmapSheet(wb: ExcelJS.Workbook, result: SimulationResult) {
  const ws = wb.addWorksheet("Rohdaten_Heatmap");

  ws.getCell(1, 1).value = "ROHDATEN — Entnahme-Heatmap (monatl. Entnahme vs. Erfolgsquote)";
  ws.getCell(1, 1).font = { bold: true, size: 13, name: "Calibri", color: { argb: "FFD31220" } };
  ws.mergeCells(1, 1, 1, 3);

  const headers = ["Monatl. Entnahme (EUR)", "Jährl. Entnahme (EUR)", "Erfolgsquote"];
  ws.columns = [{ width: 24 }, { width: 22 }, { width: 16 }];
  let row = 3;
  for (let c = 0; c < headers.length; c++) ws.getCell(row, c + 1).value = headers[c];
  styleHeaderRow(ws, row, headers.length);

  if (result.withdrawalHeatmap) {
    for (const it of result.withdrawalHeatmap) {
      row++;
      ws.getCell(row, 1).value = it.withdrawal;
      ws.getCell(row, 1).numFmt = NUM_FMT_EUR;
      ws.getCell(row, 2).value = it.withdrawal * 12;
      ws.getCell(row, 2).numFmt = NUM_FMT_EUR;
      ws.getCell(row, 3).value = it.successRate / 100;
      ws.getCell(row, 3).numFmt = NUM_FMT_PCT;
    }
  }
}

function createRawHistoricalPathsSheet(
  wb: ExcelJS.Workbook,
  historical: HistoricalAnalysis
) {
  const ws = wb.addWorksheet("Rohdaten_Backtest_Pfade");

  ws.getCell(1, 1).value = "ROHDATEN — Historische Backtest-Pfade (alle Startjahre)";
  ws.getCell(1, 1).font = { bold: true, size: 13, name: "Calibri", color: { argb: "FFD31220" } };
  ws.mergeCells(1, 1, 1, 6);
  ws.getCell(2, 1).value =
    "Spalte A: Jahr (relativ zum Planstart). Weitere Spalten: Portfoliowert je rollierendem Startjahr.";
  ws.getCell(2, 1).font = { italic: true, size: 9, name: "Calibri", color: { argb: "FF666666" } };
  ws.mergeCells(2, 1, 2, 10);

  const scenarios = historical.scenarios;
  if (scenarios.length === 0) return;

  const maxLen = Math.max(...scenarios.map((s) => s.path.length));

  ws.columns = [{ width: 12 }, ...scenarios.map(() => ({ width: 14 }))];

  // Header row
  const headerRow = 4;
  ws.getCell(headerRow, 1).value = "Jahr (rel.)";
  for (let i = 0; i < scenarios.length; i++) {
    ws.getCell(headerRow, i + 2).value = `Start ${scenarios[i].startYear}`;
  }
  styleHeaderRow(ws, headerRow, scenarios.length + 1);

  for (let t = 0; t < maxLen; t++) {
    const row = headerRow + 1 + t;
    ws.getCell(row, 1).value = t;
    for (let s = 0; s < scenarios.length; s++) {
      const v = scenarios[s].path[t];
      if (v !== undefined) {
        ws.getCell(row, s + 2).value = v;
        ws.getCell(row, s + 2).numFmt = NUM_FMT_EUR;
      }
    }
  }
}

function createRawHistoricalReturnsSheet(wb: ExcelJS.Workbook) {
  const data = historicalData;

  const ws = wb.addWorksheet("Rohdaten_Marktrenditen");

  ws.getCell(1, 1).value = "ROHDATEN — Historische Jahresrenditen (Quelle: OeNB, MSCI, Bundesbank, Statistik Austria)";
  ws.getCell(1, 1).font = { bold: true, size: 13, name: "Calibri", color: { argb: "FFD31220" } };
  ws.mergeCells(1, 1, 1, 5);

  const headers = ["Jahr", "Aktien (%)", "Anleihen (%)", "Cash (%)", "Inflation (%)"];
  ws.columns = headers.map(() => ({ width: 16 }));
  let row = 3;
  for (let c = 0; c < headers.length; c++) ws.getCell(row, c + 1).value = headers[c];
  styleHeaderRow(ws, row, headers.length);

  for (const d of data) {
    row++;
    ws.getCell(row, 1).value = d.year;
    ws.getCell(row, 2).value = d.equityReturn / 100;
    ws.getCell(row, 2).numFmt = NUM_FMT_PCT;
    ws.getCell(row, 3).value = d.bondReturn / 100;
    ws.getCell(row, 3).numFmt = NUM_FMT_PCT;
    ws.getCell(row, 4).value = d.cashReturn / 100;
    ws.getCell(row, 4).numFmt = NUM_FMT_PCT;
    ws.getCell(row, 5).value = d.inflation / 100;
    ws.getCell(row, 5).numFmt = NUM_FMT_PCT;
  }
}
