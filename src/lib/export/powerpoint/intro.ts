/**
 * PowerPoint-Export — Einstieg: Titel, Finanzübersicht, Liquiditätsereignisse, Portfolio, Annahmen.
 * (aus powerpoint.ts ausgelagert, Paket 4)
 */

import type {
  ClientProfile,
  FinancialInputs,
  PortfolioConfig,
  SimulationResult,
  LiquidityEvent,
} from "../../types";
import { safeCell } from "../sanitize";
import type PptxGenJS from "pptxgenjs";
import type { Pptx } from "./shared";
import {
  COLORS,
  FONT_HEADING,
  FONT_BODY,
  fmt,
  fmtEur,
  fmtPct,
  addRedTriangle,
  addSlideHeader,
} from "./shared";

export function addTitleSlide(pptx: Pptx, client: ClientProfile) {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.primary };

  /* Red triangle design element (SHC Diamond Grid) */
  addRedTriangle(slide, pptx, 7.5, 3.5, 2.5);

  slide.addText("Ruhestandsplanung", {
    x: 0.8,
    y: 1.0,
    w: 8.4,
    h: 1,
    fontSize: 36,
    fontFace: FONT_HEADING,
    color: COLORS.white,
    bold: true,
  });

  slide.addText("Professioneller Analysebericht", {
    x: 0.8,
    y: 2.0,
    w: 8.4,
    h: 0.6,
    fontSize: 20,
    fontFace: FONT_BODY,
    color: COLORS.feuerrot40,
  });

  /* Red accent line */
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 2.7,
    w: 2,
    h: 0.04,
    fill: { color: COLORS.accent },
  });

  slide.addText(
    [
      { text: "Erstellt für: ", options: { color: "9CA3AF", fontSize: 14, fontFace: FONT_BODY } },
      { text: safeCell(client.name), options: { color: COLORS.white, fontSize: 14, bold: true, fontFace: FONT_BODY } },
    ],
    { x: 0.8, y: 3.2, w: 8.4, h: 0.4, fontFace: FONT_BODY }
  );

  slide.addText(`Datum: ${new Date().toLocaleDateString("de-AT")}`, {
    x: 0.8,
    y: 3.7,
    w: 8.4,
    h: 0.4,
    fontSize: 12,
    fontFace: FONT_BODY,
    color: "9CA3AF",
  });

  slide.addText("Drei-Topf-Portfoliostrategie  |  Monte-Carlo-Simulation  |  Historischer Backtest", {
    x: 0.8,
    y: 4.6,
    w: 8.4,
    h: 0.4,
    fontSize: 10,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
  });

  slide.addText("Schelhammer Capital Bank AG", {
    x: 0.8,
    y: 5.1,
    w: 8.4,
    h: 0.3,
    fontSize: 9,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
  });
}

export function addFinancialSummary(
  pptx: Pptx,
  client: ClientProfile,
  inputs: FinancialInputs
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Finanzielle Gesamtübersicht", pptx);

  const leftData = [
    ["Aktuelles Alter", `${client.currentAge} Jahre`],
    ["Pensionsalter", `${client.retirementAge} Jahre`],
    ["Lebenserwartung", `${client.lifeExpectancy} Jahre`],
    ["Jahre bis zur Pension", `${client.retirementAge - client.currentAge} Jahre`],
    ["Entnahmezeitraum", `${client.lifeExpectancy - client.retirementAge} Jahre`],
  ];

  const rightData = [
    ["Anfangskapital", fmtEur(inputs.initialCapital)],
    ["Monatliche Sparrate", fmtEur(inputs.monthlySavings)],
    [
      "Gewünschter monatl. Gesamtbetrag (heutige Kaufkraft)",
      inputs.desiredMonthlyWithdrawal !== null
        ? `${fmtEur(inputs.desiredMonthlyWithdrawal)} /Monat`
        : "— (berechnen, was möglich ist)",
    ],
    ["Pensionseinkommen", `${fmtEur(inputs.monthlyPension)} /Monat`],
    ["Inflationsrate", fmtPct(inputs.inflationRate)],
  ];

  slide.addText("Persönliches Profil", {
    x: 0.5,
    y: 1.2,
    w: 4,
    h: 0.4,
    fontSize: 14,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
    bold: true,
  });

  const leftRows: PptxGenJS.TableRow[] = leftData.map(([k, v]) => [
    { text: k, options: { fontSize: 11, color: COLORS.muted, fontFace: FONT_BODY } },
    { text: v, options: { fontSize: 11, color: COLORS.text, bold: true, fontFace: FONT_BODY } },
  ]);

  slide.addTable(leftRows, {
    x: 0.5,
    y: 1.7,
    w: 4.2,
    colW: [2.2, 2],
    border: { type: "none" },
    rowH: 0.35,
  });

  slide.addText("Finanzielle Parameter", {
    x: 5.2,
    y: 1.2,
    w: 4,
    h: 0.4,
    fontSize: 14,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
    bold: true,
  });

  const rightRows: PptxGenJS.TableRow[] = rightData.map(([k, v]) => [
    { text: k, options: { fontSize: 11, color: COLORS.muted, fontFace: FONT_BODY } },
    { text: v, options: { fontSize: 11, color: COLORS.text, bold: true, fontFace: FONT_BODY } },
  ]);

  slide.addTable(rightRows, {
    x: 5.2,
    y: 1.7,
    w: 4.2,
    colW: [2.2, 2],
    border: { type: "none" },
    rowH: 0.35,
  });

  const annualContrib = inputs.monthlySavings * 12;
  const yearsToRet = client.retirementAge - client.currentAge;
  const totalContrib = inputs.initialCapital + annualContrib * yearsToRet;

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5,
    y: 4.0,
    w: 9,
    h: 1.1,
    fill: { color: COLORS.light },
    rectRadius: 0.1,
  });

  slide.addText(
    `Geplante Gesamteinzahlungen über ${yearsToRet} Jahre: ${fmtEur(totalContrib)} (ohne Renditen)`,
    {
      x: 0.8,
      y: 4.15,
      w: 8.4,
      h: 0.35,
      fontSize: 12,
      fontFace: FONT_BODY,
      color: COLORS.eis,
      bold: true,
    }
  );

  slide.addText(
    inputs.desiredMonthlyWithdrawal !== null
      ? `Benötigt aus dem Vermögen (heutige Kaufkraft): ${fmtEur(Math.max(0, inputs.desiredMonthlyWithdrawal - inputs.monthlyPension))} monatlich (Gesamtbetrag minus Pensionseinkünfte)`
      : `Kein Wunschbetrag erfasst — Modus „berechnen, was möglich ist".`,
    {
      x: 0.8,
      y: 4.55,
      w: 8.4,
      h: 0.35,
      fontSize: 11,
      fontFace: FONT_BODY,
      color: COLORS.text,
    }
  );
}

export function addLiquidityEventsSlide(pptx: Pptx, events: LiquidityEvent[]) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Liquiditätsereignisse", pptx);

  slide.addText(
    "Geplante Sonder-Ein- und Auszahlungen, die den Portfolioverlauf beeinflussen.",
    {
      x: 0.5,
      y: 1.2,
      w: 9,
      h: 0.4,
      fontSize: 11,
      fontFace: FONT_BODY,
      color: COLORS.muted,
    }
  );

  const sorted = [...events].sort((a, b) => a.age - b.age);

  const headerRow: PptxGenJS.TableRow = [
    { text: "Alter", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY, align: "center" } },
    { text: "Beschreibung", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY } },
    { text: "Betrag", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY, align: "right" } },
    { text: "Typ", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY, align: "center" } },
  ];

  const dataRows: PptxGenJS.TableRow[] = sorted.map((ev) => [
    { text: String(ev.age), options: { fontSize: 11, fontFace: FONT_BODY, align: "center" as const, bold: true } },
    { text: safeCell(ev.description), options: { fontSize: 11, fontFace: FONT_BODY } },
    {
      text: `${ev.amount >= 0 ? "+" : ""}${fmtEur(ev.amount)}`,
      options: {
        fontSize: 11,
        fontFace: FONT_BODY,
        align: "right" as const,
        bold: true,
        color: ev.amount >= 0 ? COLORS.success : COLORS.danger,
      },
    },
    {
      text: ev.amount >= 0 ? "Einzahlung" : "Auszahlung",
      options: {
        fontSize: 10,
        fontFace: FONT_BODY,
        align: "center" as const,
        color: ev.amount >= 0 ? COLORS.success : COLORS.danger,
      },
    },
  ]);

  slide.addTable([headerRow, ...dataRows], {
    x: 0.5,
    y: 1.8,
    w: 9,
    colW: [1.2, 4.0, 2.2, 1.6],
    border: { type: "solid", pt: 0.5, color: "DEE2E6" },
    rowH: 0.4,
  });

  const totalAmount = events.reduce((s, e) => s + e.amount, 0);
  const yPos = 1.8 + 0.4 * (sorted.length + 1) + 0.3;

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5,
    y: Math.min(yPos, 4.5),
    w: 9,
    h: 0.5,
    fill: { color: COLORS.light },
    rectRadius: 0.08,
  });

  slide.addText(
    `Netto-Summe aller Liquiditätsereignisse: ${totalAmount >= 0 ? "+" : ""}${fmtEur(totalAmount)}`,
    {
      x: 0.8,
      y: Math.min(yPos, 4.5),
      w: 8.4,
      h: 0.5,
      fontSize: 12,
      fontFace: FONT_BODY,
      color: totalAmount >= 0 ? COLORS.success : COLORS.danger,
      bold: true,
      valign: "middle",
    }
  );
}

export function addPortfolioSlide(pptx: Pptx, portfolio: PortfolioConfig) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Portfoliostruktur — Drei-Topf-Modell", pptx);

  const headerRow: PptxGenJS.TableRow = [
    { text: "Anlageklasse", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 10, fontFace: FONT_BODY } },
    { text: "Allokation", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 10, fontFace: FONT_BODY, align: "center" } },
    { text: "Erw. Rendite", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 10, fontFace: FONT_BODY, align: "center" } },
    { text: "Volat.", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 10, fontFace: FONT_BODY, align: "center" } },
    { text: "Kosten", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 10, fontFace: FONT_BODY, align: "center" } },
    { text: "KESt", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 10, fontFace: FONT_BODY, align: "center" } },
    { text: "Nettorendite", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 10, fontFace: FONT_BODY, align: "center" } },
  ];

  const dataRows: PptxGenJS.TableRow[] = portfolio.buckets.map((b, i) => {
    const colors = [COLORS.gras, COLORS.eis, COLORS.feuerrot];
    return [
      { text: b.label, options: { fontSize: 10, fontFace: FONT_BODY, color: colors[i], bold: true } },
      { text: fmtPct(b.allocation), options: { fontSize: 10, fontFace: FONT_BODY, align: "center" as const } },
      { text: fmtPct(b.expectedReturn), options: { fontSize: 10, fontFace: FONT_BODY, align: "center" as const } },
      { text: fmtPct(b.volatility), options: { fontSize: 10, fontFace: FONT_BODY, align: "center" as const } },
      { text: fmtPct(b.costs, 2), options: { fontSize: 10, fontFace: FONT_BODY, align: "center" as const } },
      { text: fmtPct(b.taxDrag, 2), options: { fontSize: 10, fontFace: FONT_BODY, align: "center" as const } },
      { text: fmtPct(b.netReturn), options: { fontSize: 10, fontFace: FONT_BODY, align: "center" as const, bold: true } },
    ];
  });

  slide.addTable([headerRow, ...dataRows], {
    x: 0.5,
    y: 1.3,
    w: 9,
    colW: [2.1, 1.15, 1.25, 0.9, 0.9, 0.9, 1.3],
    border: { type: "solid", pt: 0.5, color: "DEE2E6" },
    rowH: 0.4,
  });

  slide.addText(
    `KESt Wertpapiere = ${fmtPct(portfolio.kestRate ?? 27.5, 1)} (Höchststand-Prinzip) | KESt Bankeinlagen = ${fmtPct(portfolio.depositTaxRate ?? 25, 1)} (jährlich auf Zinsen)`,
    {
      x: 0.5, y: 2.95, w: 9, h: 0.25,
      fontSize: 9, fontFace: FONT_BODY, italic: true, color: COLORS.accent,
    }
  );

  // Produkt-Töpfe WBA/LV (AP8): Annahmen-Zeile, falls erfasst.
  const wbaSum = (portfolio.wohnbauanleihen ?? []).reduce((s, w) => s + w.amount, 0);
  const lvSum = (portfolio.lebensversicherungen ?? []).reduce((s, l) => s + l.amount, 0);
  if (wbaSum > 0 || lvSum > 0) {
    const parts: string[] = [];
    if (wbaSum > 0) parts.push(`Wohnbauanleihen ${fmtEur(wbaSum)} (Zinsen steuerfrei, mind. 11 J gebunden)`);
    if (lvSum > 0) parts.push(`Fondspolizzen ${fmtEur(lvSum)} (Mantel über VV, mit Markt schwankend; 4 % VersSt + 1 % einmalig, 0,075 % p.a., Erträge KESt-frei)`);
    slide.addText(`Produkt-Töpfe: ${parts.join(" | ")}`, {
      x: 0.5, y: 3.18, w: 12.3, h: 0.25,
      fontSize: 9, fontFace: FONT_BODY, italic: true, color: COLORS.muted,
    });
  }

  slide.addText("Die Drei-Topf-Strategie", {
    x: 0.5,
    y: 3.2,
    w: 9,
    h: 0.35,
    fontSize: 14,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
    bold: true,
  });

  const cashYrs = portfolio.cashYearsTarget ?? 2;
  const bucketDescriptions = [
    { title: "Topf 1: Bargeld / Liquidität", desc: `Entnahmephase: Hält ${cashYrs} Jahre der jährlichen Entnahme als Puffer. Entnahmen werden zuerst aus diesem Topf bedient. In der Ansparphase kein separater Liquiditätstopf.`, color: COLORS.gras },
    { title: "Topf 2: Anleihen / Festverzinslich", desc: "Mittelfristige Stabilität. Dient als Auffüllquelle für Topf 1, wenn Aktien Verluste aufweisen (Verlustschutz-Mechanismus der 3-Töpfe-Strategie).", color: COLORS.eis },
    { title: "Topf 3: Aktien / Beteiligungen", desc: "Langfristiger Wachstumsmotor. Bei positiver Rendite wird Topf 1 primär aus Aktiengewinnen aufgefüllt. Bei Verlusten wird nicht aus Aktien verkauft.", color: COLORS.feuerrot },
  ];

  let yPos = 3.6;
  for (const b of bucketDescriptions) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: yPos,
      w: 0.1,
      h: 0.55,
      fill: { color: b.color },
    });

    slide.addText(b.title, {
      x: 0.8,
      y: yPos,
      w: 8.5,
      h: 0.25,
      fontSize: 11,
      fontFace: FONT_BODY,
      color: b.color,
      bold: true,
    });

    slide.addText(b.desc, {
      x: 0.8,
      y: yPos + 0.22,
      w: 8.5,
      h: 0.3,
      fontSize: 9,
      fontFace: FONT_BODY,
      color: COLORS.muted,
    });

    yPos += 0.65;
  }
}

export function addAssumptionsSlide(
  pptx: Pptx,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  result: SimulationResult
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Annahmen & Portfolio-Kennzahlen", pptx);

  const metrics = [
    { label: "Portfoliorendite (p.a.)", value: fmtPct(result.portfolioReturn), color: COLORS.success },
    { label: "Portfoliovolatilität (p.a.)", value: fmtPct(result.portfolioVolatility), color: COLORS.danger },
    { label: "Sharpe Ratio", value: fmt(result.sharpeRatio, 2), color: COLORS.eis },
    { label: "Inflationsannahme", value: fmtPct(inputs.inflationRate), color: COLORS.accent },
  ];

  let xPos = 0.4;
  for (const m of metrics) {
    slide.addShape(pptx.ShapeType.rect, {
      x: xPos,
      y: 1.2,
      w: 2.2,
      h: 1.1,
      fill: { color: COLORS.light },
      rectRadius: 0.08,
      line: { color: "E5E7EB", width: 0.5 },
    });

    slide.addText(m.value, {
      x: xPos,
      y: 1.3,
      w: 2.2,
      h: 0.5,
      fontSize: 22,
      fontFace: FONT_BODY,
      color: m.color,
      bold: true,
      align: "center",
    });

    slide.addText(m.label, {
      x: xPos,
      y: 1.85,
      w: 2.2,
      h: 0.35,
      fontSize: 9,
      fontFace: FONT_BODY,
      color: COLORS.muted,
      align: "center",
    });

    xPos += 2.4;
  }

  slide.addText("Korrelationsmatrix", {
    x: 0.5,
    y: 2.7,
    w: 4,
    h: 0.4,
    fontSize: 14,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
    bold: true,
  });

  const labels = ["Bargeld", "Anleihen", "Aktien"];
  const corrHeader: PptxGenJS.TableRow = [
    { text: "", options: { fill: { color: COLORS.primary }, color: COLORS.white, fontSize: 10, fontFace: FONT_BODY } },
    ...labels.map((l) => ({
      text: l,
      options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 10, fontFace: FONT_BODY, align: "center" as const },
    })),
  ];

  const corrRows: PptxGenJS.TableRow[] = labels.map((l, i) => [
    { text: l, options: { bold: true, fontSize: 10, fontFace: FONT_BODY, fill: { color: COLORS.light } } },
    ...portfolio.correlationMatrix[i].map((v) => ({
      text: fmt(v, 2),
      options: { fontSize: 10, fontFace: FONT_BODY, align: "center" as const },
    })),
  ]);

  slide.addTable([corrHeader, ...corrRows], {
    x: 0.5,
    y: 3.15,
    w: 5,
    colW: [1.2, 1.2, 1.2, 1.2],
    border: { type: "solid", pt: 0.5, color: "DEE2E6" },
    rowH: 0.35,
  });

  slide.addText("Methodische Hinweise", {
    x: 5.8,
    y: 2.7,
    w: 3.8,
    h: 0.4,
    fontSize: 14,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
    bold: true,
  });

  const notes = [
    "• Renditen werden als korrelierte log-normale Prozesse modelliert",
    "• Cholesky-Zerlegung gewährleistet korrekte Korrelationsstruktur",
    "• Kosten und Steuerbelastung werden für Nettorenditen abgezogen",
    "• Inflationsanpassungen auf Entnahmen und Pensionen angewandt",
    `• Rebalancing: ${portfolio.rebalancingFrequency} (${portfolio.rebalancingThreshold}% Schwellenwert)`,
  ];

  slide.addText(notes.join("\n"), {
    x: 5.8,
    y: 3.15,
    w: 3.8,
    h: 2.0,
    fontSize: 9,
    fontFace: FONT_BODY,
    color: COLORS.text,
    lineSpacing: 16,
  });
}
