/**
 * Erzeugt die Excel-Arbeitsmappe für die fachliche Gegenrechnung
 * (Paket 2, Punkt 5): drei schwankungsfreie Referenzfälle, Jahr für Jahr
 * mit offenen Excel-Formeln nachgerechnet und den App-Werten
 * gegenübergestellt.
 *
 * Aufruf (im Projektordner):  bun scripts/gegenrechnung/generate.ts
 * Ergebnis:                   docs/Gegenrechnung_Referenzfaelle.xlsx
 *
 * Nur fiktive Beispieldaten.
 */

import ExcelJS from "exceljs";
import { runDetailedSingleSimulation } from "../../src/lib/engine/montecarlo";
import { defaultClient, defaultInputs, defaultPortfolio } from "../../src/lib/defaults";
import type {
  ClientProfile,
  FinancialInputs,
  LiquidityEvent,
  PortfolioConfig,
  SimulationSettings,
} from "../../src/lib/types";

interface ExcelCase {
  sheet: string;
  title: string;
  description: string;
  client: ClientProfile;
  inputs: FinancialInputs;
  portfolio: PortfolioConfig;
  events: LiquidityEvent[];
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function portfolio(alloc: [number, number, number]): PortfolioConfig {
  const p = clone(defaultPortfolio);
  p.buckets.forEach((b, i) => {
    b.allocation = alloc[i];
    b.volatility = 0; // schwankungsfrei → eindeutig nachrechenbar
  });
  p.rebalancingFrequency = "none";
  return p;
}

const client: ClientProfile = {
  ...clone(defaultClient),
  name: "Gegenrechnung",
  birthYear: 1971,
  currentAge: 55,
  retirementAge: 65,
  lifeExpectancy: 85,
};

const CASES: ExcelCase[] = [
  {
    sheet: "Fall 1",
    title: "Ausgewogen: Ansparen, Entnehmen, Pension, Steuern",
    description:
      "15/35/50, 300.000 € Start, 1.000 €/Monat Sparrate (wächst mit Inflation), 3.000 €/Monat Wunsch, " +
      "1.200 €/Monat Pension ab 65, Inflation 2,5 %, Beträge in heutiger Kaufkraft, KESt 27,5 % / Bankeinlagen 25 %.",
    client,
    inputs: {
      ...clone(defaultInputs),
      initialCapital: 300_000,
      monthlySavings: 1000,
      desiredMonthlyWithdrawal: 3000,
      monthlyPension: 1200,
      pensionStartAge: 65,
      inflationRate: 2.5,
      useRealValues: true,
      inflateWithdrawalToRetirement: true,
    },
    portfolio: portfolio([15, 35, 50]),
    events: [],
  },
  {
    sheet: "Fall 2",
    title: "Nur Aktien mit Einnahme und Ausgabe (Höchststand-KESt)",
    description:
      "0/0/100, 250.000 € Start, keine Sparrate, 1.200 €/Monat Wunsch, keine Pension, " +
      "Erbschaft +30.000 € mit 60, Ausgabe −50.000 € mit 70, Inflation 2 %.",
    client,
    inputs: {
      ...clone(defaultInputs),
      initialCapital: 250_000,
      monthlySavings: 0,
      desiredMonthlyWithdrawal: 1200,
      monthlyPension: 0,
      pensionStartAge: 65,
      inflationRate: 2,
      useRealValues: true,
      inflateWithdrawalToRetirement: true,
    },
    portfolio: portfolio([0, 0, 100]),
    events: [
      { id: "e1", age: 60, description: "Erbschaft", amount: 30_000 },
      { id: "e2", age: 70, description: "Ausgabe", amount: -50_000 },
    ],
  },
  {
    sheet: "Fall 3",
    title: "Nominale Beträge, Sparsteigerung, Pension ab 62",
    description:
      "30/40/30, 250.000 € Start, 800 €/Monat Sparrate +3 % p.a., 2.500 €/Monat Wunsch NOMINAL (ohne Inflation), " +
      "1.000 €/Monat Pension ab 62 (vor Pensionsantritt 65 — wird erst ab 65 verrechnet).",
    client,
    inputs: {
      ...clone(defaultInputs),
      initialCapital: 250_000,
      monthlySavings: 800,
      annualSavingsIncrease: 3,
      desiredMonthlyWithdrawal: 2500,
      monthlyPension: 1000,
      pensionStartAge: 62,
      inflationRate: 2.5,
      useRealValues: false,
      inflateWithdrawalToRetirement: false,
    },
    portfolio: portfolio([30, 40, 30]),
    events: [],
  },
];

const SETTINGS: SimulationSettings = {
  numSimulations: 1,
  timeStepMonths: 12,
  mode: "fixed_withdrawal",
  randomSeed: 1,
};

// ── Formatierung ───────────────────────────────────────────────────
const EUR = '#,##0.00 "€"';
const PCT = "0.0000%";
const RED = "FFD31220";
const HEAD = { type: "pattern", pattern: "solid", fgColor: { argb: "FF20201E" } } as const;
const INPUT = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4D6" } } as const;
const APP = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F1E4" } } as const;

function col(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Spaltenplan der Jahrestabelle (Name → Überschrift). */
const COLS = [
  ["jahr", "Jahr"],
  ["alter", "Alter"],
  ["phase", "Phase (A=Anspar, E=Entnahme)"],
  ["sC", "Start Liquidität"],
  ["sB", "Start Anleihen"],
  ["sE", "Start Aktien"],
  ["hw0", "Höchststand Start"],
  ["rC", "Rendite Liquidität"],
  ["rB", "Rendite Anleihen"],
  ["rE", "Rendite Aktien"],
  ["zins", "Zins Liquidität (brutto)"],
  ["est", "KESt Bankeinlagen"],
  ["c1", "Liquidität n. Rendite"],
  ["b1", "Anleihen n. Rendite"],
  ["e1", "Aktien n. Rendite"],
  ["hw1", "Höchststand n. Zins"],
  ["infl", "Inflationsindex"],
  ["spar", "Sparrate (Jahr)"],
  ["entn", "Entnahme brutto (Jahr)"],
  ["pens", "Pension (Jahr)"],
  ["netto", "Netto-Entnahme"],
  ["c2", "Liquidität n. Cashflow"],
  ["ratio", "Verkaufsquote Anl./Akt."],
  ["b2", "Anleihen n. Cashflow"],
  ["e2", "Aktien n. Cashflow"],
  ["hw2", "Höchststand n. Cashflow"],
  ["ev", "Liquiditätsereignis"],
  ["c3", "Liquidität n. Ereignis"],
  ["b3", "Anleihen n. Ereignis"],
  ["e3", "Aktien n. Ereignis"],
  ["hw3", "Höchststand n. Ereignis"],
  ["sum3", "Summe vor KESt"],
  ["kest", "KESt Wertpapiere (Höchststand)"],
  ["c4", "Ende Liquidität"],
  ["b4", "Ende Anleihen"],
  ["e4", "Ende Aktien"],
  ["hw4", "Höchststand Ende"],
  ["ende", "Ende Gesamt (Excel)"],
  ["app", "Ende Gesamt (App)"],
  ["diff", "Abweichung"],
] as const;
type ColKey = (typeof COLS)[number][0];
const C: Record<ColKey, string> = Object.fromEntries(
  COLS.map(([k], i) => [k, col(i + 1)]),
) as Record<ColKey, string>;

function buildCaseSheet(wb: ExcelJS.Workbook, c: ExcelCase): { finalExcel: string; finalApp: number } {
  const ws = wb.addWorksheet(c.sheet);
  const trace = runDetailedSingleSimulation(c.client, c.inputs, c.portfolio, SETTINGS, 0, c.events);

  ws.getCell("A1").value = c.title;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = c.description;
  ws.getCell("A2").font = { italic: true };

  // ── Eingaben (gelb) ──────────────────────────────────────────────
  const p = c.portfolio;
  const inputsList: [string, number | string, string][] = [
    ["Startkapital", c.inputs.initialCapital, EUR],
    ["Gewicht Liquidität", p.buckets[0].allocation / 100, "0.00%"],
    ["Gewicht Anleihen", p.buckets[1].allocation / 100, "0.00%"],
    ["Gewicht Aktien", p.buckets[2].allocation / 100, "0.00%"],
    ["Rendite Liquidität brutto", p.buckets[0].expectedReturn / 100, "0.00%"],
    ["Kosten Liquidität", p.buckets[0].costs / 100, "0.00%"],
    ["Rendite Anleihen brutto", p.buckets[1].expectedReturn / 100, "0.00%"],
    ["Kosten Anleihen", p.buckets[1].costs / 100, "0.00%"],
    ["Rendite Aktien brutto", p.buckets[2].expectedReturn / 100, "0.00%"],
    ["Kosten Aktien", p.buckets[2].costs / 100, "0.00%"],
    ["KESt Wertpapiere", (p.kestRate ?? 27.5) / 100, "0.00%"],
    ["KESt Bankeinlagen", (p.depositTaxRate ?? 25) / 100, "0.00%"],
    ["Inflation p.a.", c.inputs.inflationRate / 100, "0.00%"],
    ["Sparrate pro Monat", c.inputs.monthlySavings, EUR],
    ["Sparrate wächst mit Inflation (1=ja)", c.inputs.useRealValues ? 1 : 0, "0"],
    ["Sparsteigerung p.a. (falls nicht Inflation)", c.inputs.annualSavingsIncrease / 100, "0.00%"],
    ["Wunsch pro Monat", c.inputs.desiredMonthlyWithdrawal ?? 0, EUR],
    ["Pension pro Monat", c.inputs.monthlyPension, EUR],
    ["Beginn Pensionszahlung (Alter)", c.inputs.pensionStartAge, "0"],
    ["Beträge in heutiger Kaufkraft (1=ja)", c.inputs.inflateWithdrawalToRetirement !== false ? 1 : 0, "0"],
    ["Pensionsantritt (Alter)", c.client.retirementAge, "0"],
  ];
  const IN: Record<string, string> = {};
  inputsList.forEach(([label, value, fmt], i) => {
    const r = 4 + i;
    ws.getCell(`A${r}`).value = label;
    const cell = ws.getCell(`B${r}`);
    cell.value = value;
    cell.numFmt = fmt;
    cell.fill = INPUT;
    IN[label] = `$B$${r}`;
  });
  const evStart = 4 + inputsList.length + 1;
  ws.getCell(`A${evStart}`).value = "Liquiditätsereignisse (Alter → Betrag)";
  ws.getCell(`A${evStart}`).font = { bold: true };
  const evRows = Math.max(1, c.events.length);
  for (let i = 0; i < evRows; i++) {
    const e = c.events[i];
    ws.getCell(`A${evStart + 1 + i}`).value = e ? e.age : null;
    ws.getCell(`B${evStart + 1 + i}`).value = e ? e.amount : null;
    ws.getCell(`B${evStart + 1 + i}`).numFmt = EUR;
    ws.getCell(`A${evStart + 1 + i}`).fill = INPUT;
    ws.getCell(`B${evStart + 1 + i}`).fill = INPUT;
  }
  const evAges = `$A$${evStart + 1}:$A$${evStart + evRows}`;
  const evAmts = `$B$${evStart + 1}:$B$${evStart + evRows}`;

  // ── Jahrestabelle ────────────────────────────────────────────────
  const head = evStart + evRows + 3;
  COLS.forEach(([, label], i) => {
    const cell = ws.getCell(`${col(i + 1)}${head}`);
    cell.value = label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEAD;
    cell.alignment = { wrapText: true, vertical: "top" };
  });
  ws.getRow(head).height = 45;

  const wC = IN["Gewicht Liquidität"], wB = IN["Gewicht Anleihen"], wE = IN["Gewicht Aktien"];
  trace.rows.forEach((row, y) => {
    const r = head + 1 + y;
    const prev = r - 1;
    const f = (key: ColKey) => `${C[key]}${r}`;
    const set = (key: ColKey, formula: string, fmt = EUR) => {
      const cell = ws.getCell(f(key));
      cell.value = { formula };
      cell.numFmt = fmt;
    };
    ws.getCell(f("jahr")).value = row.year;
    ws.getCell(f("alter")).value = row.age;
    set("phase", `IF(${f("alter")}<${IN["Pensionsantritt (Alter)"]},"A","E")`, "@");
    if (y === 0) {
      set("sC", `${IN.Startkapital}*${wC}`);
      set("sB", `${IN.Startkapital}*${wB}`);
      set("sE", `${IN.Startkapital}*${wE}`);
      set("hw0", `${IN.Startkapital}`);
      set("infl", `1+${IN["Inflation p.a."]}`, "0.000000");
    } else {
      set("sC", `${C.c4}${prev}`);
      set("sB", `${C.b4}${prev}`);
      set("sE", `${C.e4}${prev}`);
      set("hw0", `${C.hw4}${prev}`);
      set("infl", `${C.infl}${prev}*(1+${IN["Inflation p.a."]})`, "0.000000");
    }
    // Rendite = EXP(Brutto − Kosten) − 1 (stetige Verzinsung, siehe Übersicht)
    set("rC", `EXP(${IN["Rendite Liquidität brutto"]}-${IN["Kosten Liquidität"]})-1`, PCT);
    set("rB", `EXP(${IN["Rendite Anleihen brutto"]}-${IN["Kosten Anleihen"]})-1`, PCT);
    set("rE", `EXP(${IN["Rendite Aktien brutto"]}-${IN["Kosten Aktien"]})-1`, PCT);
    set("zins", `${f("sC")}*${f("rC")}`);
    set("est", `MAX(0,${f("zins")})*${IN["KESt Bankeinlagen"]}`);
    set("c1", `${f("sC")}+${f("zins")}-${f("est")}`);
    set("b1", `${f("sB")}*(1+${f("rB")})`);
    set("e1", `${f("sE")}*(1+${f("rE")})`);
    set("hw1", `MAX(0,${f("hw0")}+${f("zins")}-${f("est")})`);
    const isA = `${f("phase")}="A"`;
    set(
      "spar",
      `IF(${isA},${IN["Sparrate pro Monat"]}*12*IF(${IN["Sparrate wächst mit Inflation (1=ja)"]}=1,${f("infl")},(1+${IN["Sparsteigerung p.a. (falls nicht Inflation)"]})^${y}),0)`,
    );
    const real = `${IN["Beträge in heutiger Kaufkraft (1=ja)"]}=1`;
    set("entn", `IF(${isA},0,${IN["Wunsch pro Monat"]}*12*IF(${real},${f("infl")},1))`);
    set(
      "pens",
      `IF(AND(NOT(${isA}),${f("alter")}>=${IN["Beginn Pensionszahlung (Alter)"]}),${IN["Pension pro Monat"]}*12*IF(${real},${f("infl")},1),0)`,
    );
    set("netto", `MAX(0,${f("entn")}-${f("pens")})`);
    // Sparrate nach Gewichten; Entnahme zuerst aus Liquidität, Rest anteilig
    set("c2", `IF(${isA},${f("c1")}+${wC}*${f("spar")},MAX(0,${f("c1")}-${f("netto")}))`);
    set(
      "ratio",
      `IF(OR(${isA},${f("c1")}>=${f("netto")},${f("b1")}+${f("e1")}<=0),0,MIN(1,(${f("netto")}-${f("c1")})/(${f("b1")}+${f("e1")})))`,
      PCT,
    );
    set("b2", `IF(${isA},${f("b1")}+${wB}*${f("spar")},${f("b1")}*(1-${f("ratio")}))`);
    set("e2", `IF(${isA},${f("e1")}+${wE}*${f("spar")},${f("e1")}*(1-${f("ratio")}))`);
    set("hw2", `IF(${isA},${f("hw1")}+${f("spar")},MAX(0,${f("hw1")}-${f("netto")}))`);
    // Ereignisse im Lebensjahr (Alter−1, Alter]
    set("ev", `SUMIFS(${evAmts},${evAges},">"&(${f("alter")}-1),${evAges},"<="&${f("alter")})`);
    const tot2 = `(${f("c2")}+${f("b2")}+${f("e2")})`;
    const out = `MIN(1,ABS(${f("ev")})/${tot2})`;
    set("c3", `IF(${f("ev")}>0,${f("c2")}+${wC}*${f("ev")},IF(AND(${f("ev")}<0,${tot2}>0),${f("c2")}*(1-${out}),${f("c2")}))`);
    set("b3", `IF(${f("ev")}>0,${f("b2")}+${wB}*${f("ev")},IF(AND(${f("ev")}<0,${tot2}>0),${f("b2")}*(1-${out}),${f("b2")}))`);
    set("e3", `IF(${f("ev")}>0,${f("e2")}+${wE}*${f("ev")},IF(AND(${f("ev")}<0,${tot2}>0),${f("e2")}*(1-${out}),${f("e2")}))`);
    set("hw3", `IF(${f("ev")}>0,${f("hw2")}+${f("ev")},IF(${f("ev")}<0,MAX(0,${f("hw2")}+${f("ev")}),${f("hw2")}))`);
    // KESt nur auf den Zuwachs über dem bisherigen Höchststand
    set("sum3", `${f("c3")}+${f("b3")}+${f("e3")}`);
    set("kest", `IF(AND(${f("sum3")}>${f("hw3")},${f("sum3")}>0),(${f("sum3")}-${f("hw3")})*${IN["KESt Wertpapiere"]},0)`);
    const factor = `IF(${f("sum3")}>0,(${f("sum3")}-${f("kest")})/${f("sum3")},1)`;
    set("c4", `MAX(0,${f("c3")}*${factor})`);
    set("b4", `MAX(0,${f("b3")}*${factor})`);
    set("e4", `MAX(0,${f("e3")}*${factor})`);
    set("hw4", `IF(${f("kest")}>0,${f("sum3")}-${f("kest")},${f("hw3")})`);
    set("ende", `${f("c4")}+${f("b4")}+${f("e4")}`);
    const app = ws.getCell(f("app"));
    app.value = row.endTotal;
    app.numFmt = EUR;
    app.fill = APP;
    set("diff", `${f("ende")}-${f("app")}`);
    ws.getCell(f("diff")).font = { color: { argb: RED } };
  });

  ws.columns.forEach((cl, i) => {
    cl.width = i === 0 ? 34 : 15;
  });
  ws.getColumn(2).width = 16;
  ws.views = [{ state: "frozen", ySplit: head, xSplit: 2 }];
  const last = head + trace.rows.length;
  return { finalExcel: `'${c.sheet}'!${C.ende}${last}`, finalApp: trace.finalWealth };
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ruhestandsplaner Pro";
  wb.calcProperties.fullCalcOnLoad = true;

  const ov = wb.addWorksheet("Übersicht");
  const results = CASES.map((c) => ({ c, ...buildCaseSheet(wb, c) }));

  const lines: [string, string?][] = [
    ["Fachliche Gegenrechnung — Ruhestandsplaner Pro"],
    [""],
    ["Zweck", "Unabhängige Prüfung, dass die App die dokumentierten Rechenregeln korrekt umsetzt."],
    ["Vorgehen", "Je Fall rechnet ein Tabellenblatt Jahr für Jahr mit offenen Excel-Formeln nach. Grün = Ergebnis der App, Rot = Abweichung."],
    ["Bitte prüfen", "1) Stimmen die Formeln mit Ihrem fachlichen Verständnis überein?  2) Ist die Abweichung in jeder Zeile ≈ 0,00 €?"],
    ["Eingaben", "Gelbe Zellen sind Eingaben und dürfen zum Testen verändert werden (die App-Spalte bleibt dann natürlich stehen)."],
    ["Vereinfachung", "Alle Fälle ohne Schwankung (Volatilität 0) und ohne Umschichtung, damit jede Zahl eindeutig nachrechenbar ist."],
    [""],
    ["Zur Prüfung vorgelegte Modellannahme", ""],
    [
      "Renditeformel",
      "Die App verzinst stetig: Jahresrendite = EXP(Brutto − Kosten) − 1. Aus 7,0 % Brutto − 1,5 % Kosten werden so 5,65 % statt 5,50 %. " +
        "Bei Schwankung ist der Mittelwert der Jahresrenditen ebenfalls EXP(Brutto − Kosten) − 1. Die fondsgebundene LV rechnet dagegen mit " +
        "ln(1 + Ertragserwartung), trifft also die Eingabe genau. Bitte fachlich entscheiden, welche Lesart der eingegebenen Renditen gilt.",
    ],
    [""],
    ["Fall", "Ende Gesamt Excel / App / Abweichung"],
  ];
  lines.forEach(([a, b], i) => {
    ov.getCell(`A${i + 1}`).value = a;
    if (b !== undefined) ov.getCell(`B${i + 1}`).value = b;
    ov.getCell(`B${i + 1}`).alignment = { wrapText: true, vertical: "top" };
  });
  ov.getCell("A1").font = { bold: true, size: 16 };
  ov.getCell("A9").font = { bold: true };
  ov.getCell("A12").font = { bold: true };
  results.forEach((res, i) => {
    const r = 13 + i;
    ov.getCell(`A${r}`).value = `${res.c.sheet}: ${res.c.title}`;
    ov.getCell(`B${r}`).value = { formula: res.finalExcel };
    ov.getCell(`B${r}`).numFmt = EUR;
    ov.getCell(`C${r}`).value = res.finalApp;
    ov.getCell(`C${r}`).numFmt = EUR;
    ov.getCell(`C${r}`).fill = APP;
    ov.getCell(`D${r}`).value = { formula: `B${r}-C${r}` };
    ov.getCell(`D${r}`).numFmt = EUR;
    ov.getCell(`D${r}`).font = { color: { argb: RED } };
  });
  ov.getColumn(1).width = 58;
  ov.getColumn(2).width = 90;
  ov.getColumn(3).width = 18;
  ov.getColumn(4).width = 16;

  await wb.xlsx.writeFile("docs/Gegenrechnung_Referenzfaelle.xlsx");
  for (const r of results) {
    console.log(`${r.c.sheet}: App-Endvermögen ${r.finalApp.toFixed(2)} €`);
  }
  console.log("geschrieben: docs/Gegenrechnung_Referenzfaelle.xlsx");
}

main();
