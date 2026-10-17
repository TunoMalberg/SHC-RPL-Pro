/**
 * Excel-Export, Blatt „Einzelpfad-Beispiel": Produkt-Zahlungen sichtbar
 * (Kauf, Zinsen der Wohnbauanleihe, Tilgung, Wert) — nur wenn vorhanden.
 */

import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { defaultClient, defaultInputs, defaultPortfolio, defaultSettings } from "../defaults";
import { runDetailedSingleSimulation, runMonteCarloSimulation } from "../engine/montecarlo";
import { generateExcelReport } from "./excel";

const inputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3000 };
const settings = { ...defaultSettings, numSimulations: 100 };

async function traceSheet(portfolio: typeof defaultPortfolio) {
  const result = runMonteCarloSimulation(defaultClient, inputs, portfolio, settings, []);
  const trace = runDetailedSingleSimulation(defaultClient, inputs, portfolio, settings, 0, []);
  const blob = await generateExcelReport(defaultClient, inputs, portfolio, result, null, trace, []);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  const ws = wb.getWorksheet("Einzelpfad-Beispiel");
  if (!ws) throw new Error("Blatt fehlt");
  const headers = (ws.getRow(4).values as unknown[]).slice(1).map(String);
  return { ws, headers };
}

describe("Excel Einzelpfad: Produkt-Zahlungen", () => {
  test("Wohnbauanleihe: Kauf, 11 Zinszahlungen und Tilgung", async () => {
    const portfolio = {
      ...defaultPortfolio,
      wohnbauanleihen: [{ id: "w", name: "WBA", purchaseAge: 45, amount: 50_000, couponPct: 3, termYears: 11 }],
    };
    const { ws, headers } = await traceSheet(portfolio);
    const col = (h: string) => headers.indexOf(h) + 1;
    expect(col("WBA-Zinsen")).toBeGreaterThan(0);
    const row = (age: number) => {
      for (let r = 5; r < 60; r++) if (ws.getRow(r).getCell(2).value === age) return ws.getRow(r);
      throw new Error(`Alter ${age} fehlt`);
    };
    expect(row(45).getCell(col("Kauf Produkte")).value).toBe(-50_000);
    let coupons = 0;
    for (let age = 45; age <= 57; age++) coupons += Number(row(age).getCell(col("WBA-Zinsen")).value || 0);
    expect(coupons).toBe(11 * 1_500);
    expect(row(56).getCell(col("Tilgung/Auszahlung")).value).toBe(50_000);
  });

  test("ohne Produkte keine zusätzlichen Spalten", async () => {
    const { headers } = await traceSheet({ ...defaultPortfolio, wohnbauanleihen: [], lebensversicherungen: [] });
    expect(headers).not.toContain("WBA-Zinsen");
    expect(headers[headers.length - 1]).toBe("Ende Gesamt");
  });
});
