/**
 * PowerPoint-Export — Ergebnisse: Monte-Carlo, Erfolgswahrscheinlichkeit, Entnahme, Risiko, Historie, Szenarien, Einzelpfad.
 * (aus powerpoint.ts ausgelagert, Paket 4)
 */

import type {
  ClientProfile,
  FinancialInputs,
  SimulationResult,
  HistoricalAnalysis,
  DetailedSimTrace,
  Scenario,
} from "../../types";
import { formatAT } from "../../format";
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
  addSlideFooter,
  addSlideHeader,
} from "./shared";

export function addMonteCarloResults(
  pptx: Pptx,
  result: SimulationResult,
  inputs: FinancialInputs,
  client: ClientProfile,
  numSims?: number
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Monte-Carlo-Simulationsergebnisse", pptx);

  const successColor = result.successRate >= 90
    ? COLORS.success
    : result.successRate >= 70
      ? COLORS.accent
      : COLORS.danger;

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5,
    y: 1.2,
    w: 3,
    h: 1.6,
    fill: { color: COLORS.light },
    rectRadius: 0.1,
    line: { color: successColor, width: 1 },
  });

  slide.addText(fmtPct(result.successRate), {
    x: 0.5,
    y: 1.35,
    w: 3,
    h: 0.8,
    fontSize: 42,
    fontFace: FONT_BODY,
    color: successColor,
    bold: true,
    align: "center",
  });

  slide.addText("Erfolgswahrscheinlichkeit", {
    x: 0.5,
    y: 2.2,
    w: 3,
    h: 0.35,
    fontSize: 12,
    fontFace: FONT_BODY,
    color: COLORS.muted,
    align: "center",
  });

  const rightMetrics = [
    ["Median Endvermögen", fmtEur(result.medianFinalWealth)],
    ["Bester Fall (90. Perz.)", fmtEur(result.percentiles.p90)],
    ["Schlechtester Fall (10. Perz.)", fmtEur(result.percentiles.p10)],
    ["Max. Drawdown (Median)", fmtPct(result.maxDrawdown)],
  ];

  let yPos = 1.3;
  for (const [label, value] of rightMetrics) {
    slide.addText(label, {
      x: 4.0,
      y: yPos,
      w: 3,
      h: 0.3,
      fontSize: 10,
      fontFace: FONT_BODY,
      color: COLORS.muted,
    });
    slide.addText(value, {
      x: 7.0,
      y: yPos,
      w: 2.5,
      h: 0.3,
      fontSize: 11,
      fontFace: FONT_BODY,
      color: COLORS.text,
      bold: true,
      align: "right",
    });
    yPos += 0.38;
  }

  slide.addText("Endvermögensverteilung (Perzentile)", {
    x: 0.5,
    y: 3.2,
    w: 9,
    h: 0.4,
    fontSize: 14,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
    bold: true,
  });

  const pctRows: PptxGenJS.TableRow[] = [
    ["5.", "10.", "25.", "50. (Median)", "75.", "90.", "95."].map((p) => ({
      text: p,
      options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 10, fontFace: FONT_BODY, align: "center" as const },
    })),
    [
      result.percentiles.p5,
      result.percentiles.p10,
      result.percentiles.p25,
      result.percentiles.p50,
      result.percentiles.p75,
      result.percentiles.p90,
      result.percentiles.p95,
    ].map((v) => ({
      text: fmtEur(v),
      options: { fontSize: 10, fontFace: FONT_BODY, align: "center" as const },
    })),
  ];

  slide.addTable(pctRows, {
    x: 0.5,
    y: 3.65,
    w: 9,
    colW: [1.28, 1.28, 1.28, 1.3, 1.28, 1.28, 1.28],
    border: { type: "solid", pt: 0.5, color: "DEE2E6" },
    rowH: 0.4,
  });

  slide.addText(
    // KONSISTENZ-FIX (CR 14): Entnahme-Inflation hängt seit e967b66 am
    // Schalter `inflateWithdrawalToRetirement`, nicht an `useRealValues`.
    // AP10-FIX: tatsächliche Simulationsanzahl statt fix „5.000".
    `Basierend auf ${fmt(numSims ?? 10000)} Simulationen mit ${inputs.inflateWithdrawalToRetirement !== false ? "inflationsindexierten Entnahmen (Eingabe in heutiger Kaufkraft)" : "nominal konstanten Entnahmen"} von ${fmtEur(inputs.desiredMonthlyWithdrawal ?? result.effectiveMonthlyWithdrawal ?? 0)}/Monat (abzgl. ${fmtEur(inputs.monthlyPension)} Pension).`,
    {
      x: 0.5,
      y: 4.65,
      w: 9,
      h: 0.35,
      fontSize: 9,
      fontFace: FONT_BODY,
      color: COLORS.muted,
      italic: true,
    }
  );
}

export function addSuccessProbabilitySlide(pptx: Pptx, result: SimulationResult) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Erfolgswahrscheinlichkeit — Was bedeutet sie?", pptx);

  slide.addText(
    "Die Erfolgswahrscheinlichkeit gibt den Prozentsatz der simulierten Szenarien an, in denen Ihr Portfolio " +
    "alle geplanten Entnahmen während des gesamten Ruhestands aufrechterhalten kann, ohne dass die Mittel aufgebraucht werden.",
    {
      x: 0.5,
      y: 1.3,
      w: 9,
      h: 0.6,
      fontSize: 11,
      fontFace: FONT_BODY,
      color: COLORS.text,
      lineSpacing: 16,
    }
  );

  const interpretations = [
    { range: "> 95%", meaning: "Sehr hohe Sicherheit — konservativer Plan", color: COLORS.success },
    { range: "85–95%", meaning: "Gute Sicherheit — vernünftiger Plan mit etwas Spielraum", color: COLORS.gras },
    { range: "70–85%", meaning: "Mäßige Sicherheit — Entnahmereduktion oder Sparerhöhung erwägen", color: COLORS.accent },
    { range: "< 70%", meaning: "Erhöhtes Risiko — wesentliche Plananpassungen empfohlen", color: COLORS.danger },
  ];

  let yPos = 2.2;
  for (const item of interpretations) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: yPos,
      w: 9,
      h: 0.4,
      fill: { color: COLORS.light },
      rectRadius: 0.05,
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: yPos,
      w: 0.08,
      h: 0.4,
      fill: { color: item.color },
    });

    slide.addText(item.range, {
      x: 0.8,
      y: yPos,
      w: 1.5,
      h: 0.4,
      fontSize: 11,
      fontFace: FONT_BODY,
      color: item.color,
      bold: true,
    });

    slide.addText(item.meaning, {
      x: 2.5,
      y: yPos,
      w: 7,
      h: 0.4,
      fontSize: 11,
      fontFace: FONT_BODY,
      color: COLORS.text,
    });

    yPos += 0.5;
  }

  slide.addText("Wichtige Hinweise", {
    x: 0.5,
    y: yPos + 0.3,
    w: 9,
    h: 0.4,
    fontSize: 13,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
    bold: true,
  });

  slide.addText(
    "• Monte-Carlo-Simulationen modellieren zukünftige Unsicherheit, können aber keine exakten Ergebnisse vorhersagen.\n" +
    "• Ergebnisse hängen stark von den Eingabeannahmen ab (Renditen, Volatilität, Korrelationen).\n" +
    "• Black-Swan-Ereignisse und strukturelle Marktveränderungen werden nicht vollständig erfasst.\n" +
    "• Regelmäßige Planüberprüfungen (jährlich) sind unerlässlich, um auf tatsächliche Marktbedingungen zu reagieren.",
    {
      x: 0.5,
      y: yPos + 0.7,
      w: 9,
      h: 1.2,
      fontSize: 10,
      fontFace: FONT_BODY,
      color: COLORS.text,
      lineSpacing: 15,
    }
  );
}

export function addWithdrawalSlide(
  pptx: Pptx,
  result: SimulationResult,
  inputs: FinancialInputs,
  client: ClientProfile
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Analyse der nachhaltigen Entnahmerate", pptx);

  // EINHEITEN-FIX (AP9): medianPath ist per Simulationsschritt indiziert —
  // bei monatlichem Zeitschritt braucht das Jahr des Pensionsantritts
  // den Faktor stepsPerYear. Entnahmerate auf Netto-Basis (ohne den
  // pensionsgedeckten Teil).
  const accYears = client.retirementAge - client.currentAge;
  const totalYearsPpt = Math.max(1, client.lifeExpectancy - client.currentAge);
  const stepsPerYearPpt = Math.max(1, Math.round((result.medianPath.length - 1) / totalYearsPpt));
  const retIdx = Math.min(Math.max(0, accYears) * stepsPerYearPpt, result.medianPath.length - 1);
  const capitalAtRet = result.medianPath[retIdx];
  const annualWithdrawal =
    Math.max(0, (inputs.desiredMonthlyWithdrawal ?? result.effectiveMonthlyWithdrawal ?? 0) - inputs.monthlyPension) * 12;
  const withdrawalRate = capitalAtRet > 0 ? (annualWithdrawal / capitalAtRet) * 100 : 0;

  slide.addText("Ihre Entnahmerate", {
    x: 0.5,
    y: 1.2,
    w: 4,
    h: 0.4,
    fontSize: 14,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
    bold: true,
  });

  slide.addText(fmtPct(withdrawalRate), {
    x: 0.5,
    y: 1.65,
    w: 2,
    h: 0.7,
    fontSize: 36,
    fontFace: FONT_BODY,
    color: withdrawalRate <= 4 ? COLORS.success : COLORS.danger,
    bold: true,
  });

  slide.addText(`Anfängliche Entnahmerate\n(${fmtEur(annualWithdrawal)} / ${fmtEur(capitalAtRet)} prognostiziertes Kapital)`, {
    x: 2.5,
    y: 1.65,
    w: 3,
    h: 0.7,
    fontSize: 10,
    fontFace: FONT_BODY,
    color: COLORS.muted,
  });

  slide.addText("Die 4%-Regel (Trinity-Studie)", {
    x: 0.5,
    y: 2.8,
    w: 9,
    h: 0.4,
    fontSize: 14,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
    bold: true,
  });

  slide.addText(
    "Die berühmte ‚4%-Regel' stammt aus der Trinity-Studie von 1998 (Cooley, Hubbard und Walz). " +
    "Sie besagt, dass Pensionisten jährlich 4% ihres anfänglichen Portfoliowerts entnehmen können (inflationsbereinigt) " +
    "mit hoher Wahrscheinlichkeit, dass das Portfolio mindestens 30 Jahre hält.\n\n" +
    "Diese Regel hat jedoch erhebliche Einschränkungen:\n" +
    "• Basiert auf US-Daten (1926–1995) — möglicherweise nicht auf europäische Märkte anwendbar\n" +
    "• Geht von einem 50/50-Aktien/Anleihen-Portfolio aus\n" +
    "• Berücksichtigt keine Gebühren, Steuern oder Verhaltensfehler\n" +
    "• 30-Jahres-Horizont kann für Frühpensionisten zu kurz sein\n" +
    "• Das aktuelle Niedrigzinsumfeld erfordert möglicherweise konservativere Raten (3,0–3,5%)",
    {
      x: 0.5,
      y: 3.2,
      w: 9,
      h: 2.2,
      fontSize: 10,
      fontFace: FONT_BODY,
      color: COLORS.text,
      lineSpacing: 14,
    }
  );
}

export function addRiskAnalysis(pptx: Pptx, result: SimulationResult) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Risikoanalyse — Reihenfolge-der-Renditen-Risiko", pptx);

  slide.addText(
    "Das Reihenfolge-der-Renditen-Risiko (Sequence of Returns Risk, SoRR) beschreibt die Gefahr, dass der Zeitpunkt " +
    "schlechter Anlagerenditen die Nachhaltigkeit von Ruhestandsentnahmen erheblich beeinträchtigen kann. Ein Bärenmarkt in den " +
    "frühen Ruhestandsjahren ist weitaus schädlicher als ein späterer, weil Entnahmen eine kleinere Portfoliobasis aufzehren.",
    {
      x: 0.5,
      y: 1.2,
      w: 9,
      h: 0.8,
      fontSize: 11,
      fontFace: FONT_BODY,
      color: COLORS.text,
      lineSpacing: 16,
    }
  );

  slide.addText("Warum es wichtig ist", {
    x: 0.5,
    y: 2.2,
    w: 9,
    h: 0.35,
    fontSize: 14,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
    bold: true,
  });

  const points = [
    "Zwei Pensionisten mit identischen Durchschnittsrenditen, aber unterschiedlicher Reihenfolge, können völlig verschiedene Ergebnisse erzielen.",
    "Die Drei-Topf-Strategie hilft, das SoRR zu mindern, indem Bargeldreserven für 1–2 Jahre Ausgaben gehalten werden.",
    "Dies ermöglicht dem Aktientopf, sich von Abschwüngen zu erholen, ohne zu gedrückten Preisen verkaufen zu müssen.",
    `Ihr Worst-Case-Szenario (10. Perzentil) endet bei ${fmtEur(result.percentiles.p10)}.`,
    `Maximaler Portfolio-Drawdown (Median über Simulationen): ${fmtPct(result.maxDrawdown)}.`,
  ];

  let yPos = 2.6;
  for (const point of points) {
    slide.addText(`→  ${point}`, {
      x: 0.5,
      y: yPos,
      w: 9,
      h: 0.35,
      fontSize: 10,
      fontFace: FONT_BODY,
      color: COLORS.text,
    });
    yPos += 0.4;
  }

  slide.addText("Gegenmaßnahmen", {
    x: 0.5,
    y: yPos + 0.2,
    w: 9,
    h: 0.35,
    fontSize: 14,
    fontFace: FONT_BODY,
    color: COLORS.secondary,
    bold: true,
  });

  slide.addText(
    "1. Ausreichende Bargeldreserven (Topf 1) für 1–2 Jahre Ausgaben vorhalten\n" +
    "2. Entnahmerate in Jahren nach erheblichen Marktrückgängen reduzieren\n" +
    "3. Dynamische Entnahmestrategien erwägen (Guardrails-Ansatz)\n" +
    "4. Nicht wesentliche Ausgaben in Bärenmärkten aufschieben\n" +
    "5. Regelmäßig rebalancieren, um die Zielallokation beizubehalten",
    {
      x: 0.5,
      y: yPos + 0.55,
      w: 9,
      h: 1.2,
      fontSize: 10,
      fontFace: FONT_BODY,
      color: COLORS.text,
      lineSpacing: 15,
    }
  );
}

export function addHistoricalSlide(
  pptx: Pptx,
  historical: HistoricalAnalysis | null
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Historische Backtest-Ergebnisse", pptx);

  if (!historical) {
    slide.addText("Kein historischer Backtest durchgeführt.", {
      x: 0.5,
      y: 2.5,
      w: 9,
      h: 0.5,
      fontSize: 14,
      fontFace: FONT_BODY,
      color: COLORS.muted,
      align: "center",
    });
    return;
  }

  const successColor = historical.overallSuccessRate >= 90 ? COLORS.success : COLORS.danger;

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5,
    y: 1.2,
    w: 2.5,
    h: 1.2,
    fill: { color: COLORS.light },
    rectRadius: 0.08,
  });

  slide.addText(fmtPct(historical.overallSuccessRate), {
    x: 0.5,
    y: 1.3,
    w: 2.5,
    h: 0.6,
    fontSize: 32,
    fontFace: FONT_BODY,
    color: successColor,
    bold: true,
    align: "center",
  });

  slide.addText("Historische Erfolgsquote", {
    x: 0.5,
    y: 1.95,
    w: 2.5,
    h: 0.35,
    fontSize: 10,
    fontFace: FONT_BODY,
    color: COLORS.muted,
    align: "center",
  });

  const summaryData = [
    ["Getestete Szenarien", `${historical.scenarios.length}`],
    ["Ø Endvermögen", fmtEur(historical.averageFinalWealth)],
    ["Bestes Startjahr", `${historical.bestScenario?.startYear ?? "k. A."}`],
    ["Schlechtestes Startjahr", `${historical.worstScenario?.startYear ?? "k. A."}`],
    ["Schlecht. Endvermögen", fmtEur(historical.worstScenario?.finalWealth ?? 0)],
  ];

  let yPos = 1.25;
  for (const [label, value] of summaryData) {
    slide.addText(label, {
      x: 3.5,
      y: yPos,
      w: 3,
      h: 0.3,
      fontSize: 10,
      fontFace: FONT_BODY,
      color: COLORS.muted,
    });
    slide.addText(value, {
      x: 6.5,
      y: yPos,
      w: 3,
      h: 0.3,
      fontSize: 11,
      fontFace: FONT_BODY,
      color: COLORS.text,
      bold: true,
      align: "right",
    });
    yPos += 0.34;
  }

  slide.addText(
    "Der historische Backtest verwendet reale Marktrenditen (MSCI World, europäische Anleihen, EUR-Geldmarktzinsen), " +
    "um rollierende Ruhestandsszenarien zu simulieren. Jedes Szenario beginnt in einem anderen Jahr und wendet denselben " +
    "Entnahmeplan auf historische Renditen an. Dies zeigt, wie das Reihenfolge-der-Renditen-Risiko " +
    "Ergebnisse unter tatsächlichen Marktbedingungen beeinflusst hätte.",
    {
      x: 0.5,
      y: 3.1,
      w: 9,
      h: 0.8,
      fontSize: 10,
      fontFace: FONT_BODY,
      color: COLORS.text,
      lineSpacing: 15,
    }
  );

  slide.addText("Hinweis: Die Wertentwicklung der Vergangenheit ist kein zuverlässiger Indikator für zukünftige Ergebnisse. Historische Backtests dienen nur der Veranschaulichung.", {
    x: 0.5,
    y: 4.5,
    w: 9,
    h: 0.3,
    fontSize: 9,
    fontFace: FONT_BODY,
    color: COLORS.muted,
    italic: true,
  });
}

/**
 * AP10: Direkter Vergleich gespeicherter Szenarien — Tabelle mit
 * Erfolgsquote, Median-Endvermögen, P10/P90 und max. Drawdown je
 * Szenario (nur Szenarien mit gespeichertem Ergebnis, max. 8).
 */
export function addScenarioComparisonSlide(pptx: Pptx, scenarios: Scenario[]) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Szenarienvergleich", pptx);

  const withResult = scenarios
    .filter((s): s is Scenario & { result: SimulationResult } => !!s.result)
    .slice(0, 8);

  const headerOpts = {
    fill: { color: COLORS.primary },
    color: COLORS.white,
    bold: true,
    fontSize: 10,
    fontFace: FONT_BODY,
    align: "center" as const,
  };
  const cellOpts = { fontSize: 10, fontFace: FONT_BODY, align: "center" as const };

  const rows: PptxGenJS.TableRow[] = [
    [
      { text: "Szenario", options: { ...headerOpts, align: "left" as const } },
      { text: "Erfolgsquote", options: headerOpts },
      { text: "Median Endvermögen", options: headerOpts },
      { text: "P10 (konservativ)", options: headerOpts },
      { text: "P90 (optimistisch)", options: headerOpts },
      { text: "Max. Drawdown", options: headerOpts },
    ],
    ...withResult.map((s) => {
      const r = s.result;
      return [
        { text: safeCell(s.name), options: { ...cellOpts, align: "left" as const, bold: true } },
        {
          text: fmtPct(r.successRate),
          options: {
            ...cellOpts,
            color: r.successRate >= 90 ? "5A8A50" : r.successRate >= 70 ? "B8863B" : "D31220",
            bold: true,
          },
        },
        { text: fmtEur(r.medianFinalWealth), options: cellOpts },
        { text: fmtEur(r.percentiles.p10), options: cellOpts },
        { text: fmtEur(r.percentiles.p90), options: cellOpts },
        { text: fmtPct(r.maxDrawdown), options: cellOpts },
      ];
    }),
  ];

  slide.addTable(rows, {
    x: 0.5,
    y: 1.3,
    w: 12.3,
    colW: [3.3, 1.8, 2.2, 2.0, 2.0, 1.0],
    border: { type: "solid", pt: 0.5, color: "DEE2E6" },
    rowH: 0.42,
  });

  slide.addText(
    "Alle Werte nominal zum Planungshorizont. Jedes Szenario friert die zum Speicherzeitpunkt erfassten Eingaben und das Portfolio ein; " +
      "Unterschiede zeigen die Wirkung der jeweiligen Annahmen (z. B. Allokation, Sparrate, Entnahmehöhe).",
    {
      x: 0.5,
      y: 1.4 + Math.min(withResult.length + 1, 9) * 0.45,
      w: 12.3,
      h: 0.6,
      fontSize: 9,
      fontFace: FONT_BODY,
      color: COLORS.muted,
      italic: true,
    }
  );
}

export function addDetailedTraceSlides(pptx: Pptx, trace: DetailedSimTrace, client: ClientProfile) {
  const slide1 = pptx.addSlide();
  slide1.background = { fill: COLORS.white };
  addSlideFooter(slide1);

  slide1.addText("Einzelpfad-Beispiel: Portfolioentwicklung", {
    x: 0.5, y: 0.3, w: 8, h: 0.45,
    fontSize: 20, fontFace: FONT_HEADING, color: COLORS.primary, bold: true,
  });

  slide1.addText(
    `Simulation #${trace.simulationIndex + 1} — ${trace.success ? "Erfolgreich" : "Kapital aufgebraucht"} — Endvermögen: € ${formatAT(Math.round(trace.finalWealth))}`,
    {
      x: 0.5, y: 0.75, w: 12, h: 0.3,
      fontSize: 11, fontFace: FONT_BODY,
      color: trace.success ? COLORS.success : COLORS.danger, bold: true,
    }
  );

  const accYears = client.retirementAge - client.currentAge;
  const keyYears = trace.rows.filter((r, i) =>
    i === 0 ||
    i === trace.rows.length - 1 ||
    i === accYears - 1 ||
    i === accYears ||
    r.rebalanced ||
    i % 5 === 0
  );

  const displayRows = keyYears.slice(0, 18);

  const tableRows: PptxGenJS.TableRow[] = [
    [
      { text: "Jahr", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "center" } },
      { text: "Alter", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "center" } },
      { text: "Phase", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "center" } },
      { text: "Start Ges.", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "right" } },
      { text: "Rend. B%", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "right" } },
      { text: "Rend. A%", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "right" } },
      { text: "Rend. Akt%", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "right" } },
      { text: "Cashflow", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "right" } },
      { text: "Liquid.", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "right" } },
      { text: "Umsch.", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "center" } },
      { text: "Ende Ges.", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "right" } },
      { text: "Bargeld", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "right" } },
      { text: "Anleihen", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "right" } },
      { text: "Aktien", options: { bold: true, fontSize: 7, color: COLORS.white, fill: { color: COLORS.primary }, align: "right" } },
    ],
  ];

  for (const r of displayRows) {
    const isRetStart = r.age === client.retirementAge;
    const hasLE = r.liquidityEvent !== 0;
    const rowFill = hasLE ? "FFF3F0FF" : r.rebalanced ? "FFFFF3E0" : isRetStart ? "FFFCE4EC" : "FFFFFFFF";

    tableRows.push([
      { text: String(r.year), options: { fontSize: 7, align: "center", fill: { color: rowFill } } },
      { text: String(r.age), options: { fontSize: 7, align: "center", fill: { color: rowFill } } },
      { text: r.phase, options: { fontSize: 7, align: "center", bold: true, color: r.phase === "Anspar" ? "1565C0" : "E65100", fill: { color: rowFill } } },
      { text: `€ ${fmt(r.startTotal)}`, options: { fontSize: 7, align: "right", fill: { color: rowFill } } },
      { text: fmtPct(r.returnCashPct), options: { fontSize: 7, align: "right", color: r.returnCashPct >= 0 ? COLORS.success : COLORS.danger, fill: { color: rowFill } } },
      { text: fmtPct(r.returnBondsPct), options: { fontSize: 7, align: "right", color: r.returnBondsPct >= 0 ? "1565C0" : COLORS.danger, fill: { color: rowFill } } },
      { text: fmtPct(r.returnEquitiesPct), options: { fontSize: 7, align: "right", color: r.returnEquitiesPct >= 0 ? COLORS.feuerrot : COLORS.danger, fill: { color: rowFill } } },
      { text: `€ ${fmt(r.cashflow)}`, options: { fontSize: 7, align: "right", color: r.cashflow >= 0 ? COLORS.success : "E65100", fill: { color: rowFill } } },
      { text: hasLE ? `€ ${fmt(r.liquidityEvent)}` : "—", options: { fontSize: 7, align: "right", bold: hasLE, color: hasLE ? (r.liquidityEvent >= 0 ? COLORS.success : COLORS.danger) : "CCCCCC", fill: { color: rowFill } } },
      { text: r.rebalanced ? "⟳" : "—", options: { fontSize: 7, align: "center", bold: r.rebalanced, color: r.rebalanced ? "E65100" : "CCCCCC", fill: { color: rowFill } } },
      { text: `€ ${fmt(r.endTotal)}`, options: { fontSize: 7, align: "right", bold: true, fill: { color: rowFill } } },
      { text: `€ ${fmt(r.endCash)}`, options: { fontSize: 7, align: "right", color: COLORS.success, fill: { color: rowFill } } },
      { text: `€ ${fmt(r.endBonds)}`, options: { fontSize: 7, align: "right", color: "1565C0", fill: { color: rowFill } } },
      { text: `€ ${fmt(r.endEquities)}`, options: { fontSize: 7, align: "right", color: COLORS.feuerrot, fill: { color: rowFill } } },
    ]);
  }

  slide1.addTable(tableRows, {
    x: 0.2, y: 1.15, w: 12.8,
    fontSize: 7,
    fontFace: FONT_BODY,
    border: { type: "solid", pt: 0.5, color: "E5E7EB" },
    colW: [0.7, 0.5, 0.7, 1.0, 0.75, 0.75, 0.75, 0.9, 0.8, 0.5, 1.0, 0.85, 0.85, 0.85],
    autoPage: false,
  });

  const legendY = 1.15 + 0.25 * (displayRows.length + 1) + 0.15;
  if (legendY < 4.8) {
    slide1.addText(
      [
        { text: "Legende: ", options: { bold: true, fontSize: 8, color: COLORS.primary } },
        { text: "Rend.% = Jahresrendite  |  ", options: { fontSize: 8, color: COLORS.muted } },
        { text: "Liquid. = Sonderzahlung  |  ", options: { fontSize: 8, color: COLORS.lavendel } },
        { text: "Umsch. = Rebalancing (⟳)  |  ", options: { fontSize: 8, color: COLORS.muted } },
        { text: "Gelb = Rebal.  |  ", options: { fontSize: 8, color: "E65100" } },
        { text: "Lila = Liquidität  |  ", options: { fontSize: 8, color: COLORS.lavendel } },
        { text: "Rosa = Pension", options: { fontSize: 8, color: COLORS.danger } },
      ],
      { x: 0.3, y: Math.min(legendY, 4.7), w: 12, h: 0.3 }
    );
  }

  if (trace.rows.length > 18) {
    const slide2 = pptx.addSlide();
    slide2.background = { fill: COLORS.white };
    addSlideFooter(slide2);

    slide2.addText("Einzelpfad-Beispiel: Fortsetzung", {
      x: 0.5, y: 0.3, w: 8, h: 0.45,
      fontSize: 20, fontFace: FONT_HEADING, color: COLORS.primary, bold: true,
    });

    const remaining = keyYears.slice(18, 36);
    const tableRows2: PptxGenJS.TableRow[] = [tableRows[0]];

    for (const r of remaining) {
      const isRetStart = r.age === client.retirementAge;
      const hasLE = r.liquidityEvent !== 0;
      const rowFill = hasLE ? "FFF3F0FF" : r.rebalanced ? "FFFFF3E0" : isRetStart ? "FFFCE4EC" : "FFFFFFFF";

      tableRows2.push([
        { text: String(r.year), options: { fontSize: 7, align: "center", fill: { color: rowFill } } },
        { text: String(r.age), options: { fontSize: 7, align: "center", fill: { color: rowFill } } },
        { text: r.phase, options: { fontSize: 7, align: "center", bold: true, color: r.phase === "Anspar" ? "1565C0" : "E65100", fill: { color: rowFill } } },
        { text: `€ ${fmt(r.startTotal)}`, options: { fontSize: 7, align: "right", fill: { color: rowFill } } },
        { text: fmtPct(r.returnCashPct), options: { fontSize: 7, align: "right", color: r.returnCashPct >= 0 ? COLORS.success : COLORS.danger, fill: { color: rowFill } } },
        { text: fmtPct(r.returnBondsPct), options: { fontSize: 7, align: "right", color: r.returnBondsPct >= 0 ? "1565C0" : COLORS.danger, fill: { color: rowFill } } },
        { text: fmtPct(r.returnEquitiesPct), options: { fontSize: 7, align: "right", color: r.returnEquitiesPct >= 0 ? COLORS.feuerrot : COLORS.danger, fill: { color: rowFill } } },
        { text: `€ ${fmt(r.cashflow)}`, options: { fontSize: 7, align: "right", color: r.cashflow >= 0 ? COLORS.success : "E65100", fill: { color: rowFill } } },
        { text: hasLE ? `€ ${fmt(r.liquidityEvent)}` : "—", options: { fontSize: 7, align: "right", bold: hasLE, color: hasLE ? (r.liquidityEvent >= 0 ? COLORS.success : COLORS.danger) : "CCCCCC", fill: { color: rowFill } } },
        { text: r.rebalanced ? "⟳" : "—", options: { fontSize: 7, align: "center", bold: r.rebalanced, color: r.rebalanced ? "E65100" : "CCCCCC", fill: { color: rowFill } } },
        { text: `€ ${fmt(r.endTotal)}`, options: { fontSize: 7, align: "right", bold: true, fill: { color: rowFill } } },
        { text: `€ ${fmt(r.endCash)}`, options: { fontSize: 7, align: "right", color: COLORS.success, fill: { color: rowFill } } },
        { text: `€ ${fmt(r.endBonds)}`, options: { fontSize: 7, align: "right", color: "1565C0", fill: { color: rowFill } } },
        { text: `€ ${fmt(r.endEquities)}`, options: { fontSize: 7, align: "right", color: COLORS.feuerrot, fill: { color: rowFill } } },
      ]);
    }

    slide2.addTable(tableRows2, {
      x: 0.2, y: 0.9, w: 12.8,
      fontSize: 7,
      fontFace: FONT_BODY,
      border: { type: "solid", pt: 0.5, color: "E5E7EB" },
      colW: [0.7, 0.5, 0.7, 1.0, 0.75, 0.75, 0.75, 0.9, 0.8, 0.5, 1.0, 0.85, 0.85, 0.85],
      autoPage: false,
    });
  }
}
