/**
 * Excel-Vorlage Generator für Bestandsportfolio-Import.
 *
 * Liefert ein Buffer mit zwei Worksheets:
 *   1) "Positionen" — die eigentliche Tabelle mit Header + Beispielzeile
 *   2) "Hilfslisten" — Drop-Down-Werte (Anlageklasse, Region, Währung)
 *
 * Server-side (Next.js Route Handler) erzeugt die Datei on-the-fly.
 */

import ExcelJS from "exceljs";
import type { HoldingAssetClass, HoldingCurrency } from "./types";

export const ASSET_CLASSES: HoldingAssetClass[] = [
  "Aktien Welt",
  "Aktien USA",
  "Aktien Europa",
  "Aktien Schwellenländer",
  "Aktien Sektor",
  "Anleihen Staat",
  "Anleihen Unternehmen",
  "Anleihen High Yield",
  "Geldmarkt / Cash",
  "Rohstoffe / Gold",
  "Immobilien (REIT)",
  "Alternatives / PE",
  "Mischfonds",
  "Sonstiges",
];

export const CURRENCIES: HoldingCurrency[] = ["EUR", "USD", "CHF", "GBP", "JPY", "CAD", "AUD"];

export const REGIONS = [
  "Welt / DM",
  "Welt / DM+EM",
  "USA",
  "Europa",
  "Eurozone",
  "Deutschland",
  "Österreich",
  "Schweiz",
  "UK",
  "Japan",
  "Schwellenländer",
  "Asien",
  "global",
];

export async function buildHoldingsTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SHC Ruhestandsplaner Pro";
  wb.created = new Date();

  // Sheet 1 — Positionen
  const ws = wb.addWorksheet("Positionen", {
    properties: { defaultColWidth: 18 },
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { header: "ISIN", key: "isin", width: 16 },
    { header: "Ticker", key: "ticker", width: 12 },
    { header: "Bezeichnung", key: "name", width: 36 },
    { header: "Stückzahl", key: "quantity", width: 12 },
    { header: "Einstandskurs", key: "costPrice", width: 14 },
    { header: "Aktueller Kurs", key: "currentPrice", width: 14 },
    { header: "Währung", key: "currency", width: 10 },
    { header: "Anlageklasse", key: "assetClass", width: 22 },
    { header: "Region", key: "region", width: 14 },
    { header: "Sektor", key: "sector", width: 16 },
    { header: "Notiz", key: "note", width: 24 },
  ];

  // Header style
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1A1A2E" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 22;

  // Example rows
  ws.addRow({
    isin: "IE00B4L5Y983",
    ticker: "EUNL.DE",
    name: "iShares Core MSCI World UCITS ETF",
    quantity: 1250,
    costPrice: 78.4,
    currentPrice: 102.15,
    currency: "EUR",
    assetClass: "Aktien Welt",
    region: "Welt / DM",
    sector: "diversifiziert",
    note: "Kerninvestment",
  });
  ws.addRow({
    isin: "US0378331005",
    ticker: "AAPL",
    name: "Apple Inc.",
    quantity: 50,
    costPrice: 145.0,
    currentPrice: 220.5,
    currency: "USD",
    assetClass: "Aktien USA",
    region: "USA",
    sector: "Technology",
    note: "",
  });
  ws.addRow({
    isin: "DE000A1EWWW0",
    ticker: "EXS1.DE",
    name: "iShares Core DAX UCITS ETF",
    quantity: 200,
    costPrice: 110.0,
    currentPrice: 152.4,
    currency: "EUR",
    assetClass: "Aktien Europa",
    region: "Deutschland",
    sector: "diversifiziert",
    note: "",
  });

  // Numeric formats
  for (const colKey of ["quantity", "costPrice", "currentPrice"] as const) {
    const col = ws.getColumn(colKey);
    col.numFmt = colKey === "quantity" ? "#,##0.####" : "#,##0.00";
  }

  // Sheet 2 — Hilfslisten
  const helper = wb.addWorksheet("Hilfslisten", { state: "visible" });
  helper.getCell("A1").value = "Anlageklasse";
  helper.getCell("B1").value = "Währung";
  helper.getCell("C1").value = "Region";
  for (const c of ["A1", "B1", "C1"]) {
    helper.getCell(c).font = { bold: true };
  }
  ASSET_CLASSES.forEach((v, i) => {
    helper.getCell(`A${i + 2}`).value = v;
  });
  CURRENCIES.forEach((v, i) => {
    helper.getCell(`B${i + 2}`).value = v;
  });
  REGIONS.forEach((v, i) => {
    helper.getCell(`C${i + 2}`).value = v;
  });

  // Add Excel data validation referencing Hilfslisten ranges
  const acRange = `Hilfslisten!$A$2:$A$${ASSET_CLASSES.length + 1}`;
  const ccRange = `Hilfslisten!$B$2:$B$${CURRENCIES.length + 1}`;
  const rgRange = `Hilfslisten!$C$2:$C$${REGIONS.length + 1}`;
  for (let r = 2; r <= 1000; r++) {
    ws.getCell(`G${r}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`=${ccRange}`],
    };
    ws.getCell(`H${r}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`=${acRange}`],
    };
    ws.getCell(`I${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`=${rgRange}`],
    };
  }

  // Sheet 3 — Anleitung
  const doc = wb.addWorksheet("Anleitung");
  const lines = [
    "Bestandsportfolio — Import-Vorlage",
    "",
    "Trage je Position eine Zeile in 'Positionen' ein.",
    "",
    "Pflichtfelder:",
    "  • ISIN ODER Ticker (mindestens eines)",
    "  • Bezeichnung",
    "  • Stückzahl",
    "  • Aktueller Kurs",
    "  • Währung",
    "  • Anlageklasse",
    "",
    "Tipp Ticker:",
    "  • US-Aktien:        AAPL, MSFT, GOOGL",
    "  • DE-ETFs/Aktien:   EUNL.DE, EXS1.DE, SAP.DE",
    "  • UK-ETFs:          SWDA.L, VWRL.L",
    "  • Indizes:          ^GSPC (S&P 500), ^GDAXI (DAX), ^STOXX50E (EuroStoxx 50)",
    "",
    "Datenquellen für historischen Backtest:",
    "  • OpenFIGI         (ISIN → Ticker, kostenfrei)",
    "  • Yahoo Finance    (Tageskurse, kostenfrei)",
    "  • Frankfurter/EZB  (FX-Historie, kostenfrei)",
    "",
    "Hinweis: Alle Marktdaten-Aufrufe erfolgen serverseitig in Vercel.",
    "Keine ISIN-/Kunden-Daten werden im Browser an Drittanbieter geleakt.",
  ];
  lines.forEach((l, i) => {
    const cell = doc.getCell(`A${i + 1}`);
    cell.value = l;
    if (i === 0) {
      cell.font = { bold: true, size: 14, color: { argb: "FFD31220" } };
    } else if (l.endsWith(":")) {
      cell.font = { bold: true };
    }
  });
  doc.getColumn(1).width = 80;

  // Buffer
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}