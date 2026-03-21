import type {
  ClientProfile,
  FinancialInputs,
  PortfolioConfig,
  SimulationResult,
  HistoricalAnalysis,
  DetailedSimTrace,
  LiquidityEvent,
} from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Pptx = any;
type Slide = any;

/* Schelhammer Capital Corporate Design Colors */
const COLORS = {
  primary: "20201E",       // Mattschwarz
  secondary: "4D4A47",     // Naturgrau
  accent: "D31220",        // Feuerrot
  success: "5A8A50",       // Gras (darker)
  danger: "D31220",        // Feuerrot
  light: "F5F3F0",         // Warm light bg
  white: "FFFFFF",         // Reinweiß
  text: "20201E",          // Mattschwarz
  muted: "4D4A47",         // Naturgrau
  gras: "8FB687",          // Gras (Cash)
  eis: "87BBE6",           // Eis (Bonds)
  feuerrot: "D31220",      // Feuerrot (Equities)
  feuerrot80: "DA4D3E",    // 80% Feuerrot
  feuerrot60: "E37E67",    // 60% Feuerrot
  feuerrot40: "EDAC98",    // 40% Feuerrot
  feuerrot20: "F7D8CD",    // 20% Feuerrot
  oliv: "969476",
  lavendel: "8A83BE",
  heu: "D0D2AD",
  orange: "FAC075",
};

const FONT_HEADING = "Sitka Heading";
const FONT_BODY = "Skeena";

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("de-AT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtEur(n: number): string {
  return `€ ${fmt(n)}`;
}

function fmtPct(n: number, decimals = 1): string {
  return `${fmt(n, decimals)}%`;
}

function addSlideFooter(slide: Slide) {
  slide.addText("Vertraulichkeitsstufe: Klasse 1", {
    x: 0.3,
    y: 5.15,
    w: 5,
    h: 0.25,
    fontSize: 7,
    fontFace: FONT_BODY,
    color: "9CA3AF",
  });
}

function addRedTriangle(slide: Slide, pptx: Pptx, x: number, y: number, size: number) {
  slide.addShape(pptx.ShapeType.rtTriangle, {
    x,
    y,
    w: size,
    h: size,
    fill: { color: COLORS.accent },
    rotate: 0,
  });
}

function addTitleSlide(pptx: Pptx, client: ClientProfile) {
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
      { text: client.name, options: { color: COLORS.white, fontSize: 14, bold: true, fontFace: FONT_BODY } },
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

function addSectionSlide(pptx: Pptx, title: string, subtitle: string) {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.primary };

  /* Red triangle design element */
  addRedTriangle(slide, pptx, 7.8, 3.8, 2.2);

  slide.addText(title, {
    x: 0.8,
    y: 2,
    w: 8.4,
    h: 1,
    fontSize: 32,
    fontFace: FONT_HEADING,
    color: COLORS.white,
    bold: true,
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 3.1,
    w: 1.5,
    h: 0.04,
    fill: { color: COLORS.accent },
  });

  slide.addText(subtitle, {
    x: 0.8,
    y: 3.4,
    w: 8.4,
    h: 0.6,
    fontSize: 16,
    fontFace: FONT_BODY,
    color: COLORS.feuerrot40,
  });
}

function addSlideHeader(slide: Slide, title: string, pptx?: Pptx) {
  /* SHC-style header: thin red top line + title */
  slide.addShape("rect" as any, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.06,
    fill: { color: COLORS.accent },
  });

  slide.addText(title, {
    x: 0.5,
    y: 0.2,
    w: 8.5,
    h: 0.6,
    fontSize: 22,
    fontFace: FONT_HEADING,
    color: COLORS.primary,
    bold: true,
  });

  /* Subtle separator line */
  slide.addShape("rect" as any, {
    x: 0.5,
    y: 0.85,
    w: 9,
    h: 0.01,
    fill: { color: "E5E2DF" },
  });

  if (pptx) {
    addSlideFooter(slide);
  }
}

function addFinancialSummary(
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
    ["Gewünschte Entnahme", fmtEur(inputs.desiredMonthlyWithdrawal) + " /Monat"],
    ["Pensionseinkommen", fmtEur(inputs.monthlyPension) + " /Monat"],
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

  const leftRows: any[] = leftData.map(([k, v]) => [
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

  const rightRows: any[] = rightData.map(([k, v]) => [
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
    `Netto-Monatsbedarf: ${fmtEur(inputs.desiredMonthlyWithdrawal - inputs.monthlyPension)} (Entnahme minus Pension)`,
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

function addLiquidityEventsSlide(pptx: Pptx, events: LiquidityEvent[]) {
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

  const headerRow: any = [
    { text: "Alter", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY, align: "center" } },
    { text: "Beschreibung", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY } },
    { text: "Betrag", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY, align: "right" } },
    { text: "Typ", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY, align: "center" } },
  ];

  const dataRows: any[] = sorted.map((ev) => [
    { text: String(ev.age), options: { fontSize: 11, fontFace: FONT_BODY, align: "center" as const, bold: true } },
    { text: ev.description, options: { fontSize: 11, fontFace: FONT_BODY } },
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

function addPortfolioSlide(pptx: Pptx, portfolio: PortfolioConfig) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Portfoliostruktur — Drei-Topf-Modell", pptx);

  const headerRow: any = [
    { text: "Anlageklasse", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY } },
    { text: "Allokation", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY, align: "center" } },
    { text: "Erw. Rendite", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY, align: "center" } },
    { text: "Volatilität", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY, align: "center" } },
    { text: "Nettorendite", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: FONT_BODY, align: "center" } },
  ];

  const dataRows: any[] = portfolio.buckets.map((b, i) => {
    const colors = [COLORS.gras, COLORS.eis, COLORS.feuerrot];
    return [
      { text: b.label, options: { fontSize: 11, fontFace: FONT_BODY, color: colors[i], bold: true } },
      { text: fmtPct(b.allocation), options: { fontSize: 11, fontFace: FONT_BODY, align: "center" as const } },
      { text: fmtPct(b.expectedReturn), options: { fontSize: 11, fontFace: FONT_BODY, align: "center" as const } },
      { text: fmtPct(b.volatility), options: { fontSize: 11, fontFace: FONT_BODY, align: "center" as const } },
      { text: fmtPct(b.netReturn), options: { fontSize: 11, fontFace: FONT_BODY, align: "center" as const } },
    ];
  });

  slide.addTable([headerRow, ...dataRows], {
    x: 0.5,
    y: 1.3,
    w: 9,
    colW: [2.5, 1.5, 1.8, 1.5, 1.7],
    border: { type: "solid", pt: 0.5, color: "DEE2E6" },
    rowH: 0.4,
  });

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

  const bucketDescriptions = [
    { title: "Topf 1: Bargeld / Liquidität", desc: "Kurzfristige Reserven (1–2 Jahre Ausgaben). Bietet Stabilität und deckt den unmittelbaren Bedarf. Niedrige Rendite, aber nahezu keine Volatilität.", color: COLORS.gras },
    { title: "Topf 2: Anleihen / Festverzinslich", desc: "Mittelfristige Stabilität (3–7 Jahre). Staats- und Unternehmensanleihen bieten regelmäßiges Einkommen und dienen als Puffer gegen Aktienvolatilität.", color: COLORS.eis },
    { title: "Topf 3: Aktien / Beteiligungen", desc: "Langfristiger Wachstumsmotor. Diversifizierte globale Aktien (z. B. MSCI World) bieten inflationsübertreffende Renditen über Jahrzehnte.", color: COLORS.feuerrot },
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

function addAssumptionsSlide(
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
  const corrHeader: any = [
    { text: "", options: { fill: { color: COLORS.primary }, color: COLORS.white, fontSize: 10, fontFace: FONT_BODY } },
    ...labels.map((l) => ({
      text: l,
      options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 10, fontFace: FONT_BODY, align: "center" as const },
    })),
  ];

  const corrRows: any[] = labels.map((l, i) => [
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

function addMonteCarloResults(
  pptx: Pptx,
  result: SimulationResult,
  inputs: FinancialInputs,
  client: ClientProfile
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

  const pctRows: any[] = [
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
    `Basierend auf ${fmt(5000)} Simulationen mit ${inputs.useRealValues ? "inflationsbereinigten" : "nominalen"} Entnahmen von ${fmtEur(inputs.desiredMonthlyWithdrawal)}/Monat (abzgl. ${fmtEur(inputs.monthlyPension)} Pension).`,
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

function addSuccessProbabilitySlide(pptx: Pptx, result: SimulationResult) {
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

function addWithdrawalSlide(
  pptx: Pptx,
  result: SimulationResult,
  inputs: FinancialInputs,
  client: ClientProfile
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Analyse der nachhaltigen Entnahmerate", pptx);

  const accYears = client.retirementAge - client.currentAge;
  const retIdx = Math.min(accYears, result.medianPath.length - 1);
  const capitalAtRet = result.medianPath[retIdx];
  const annualWithdrawal = inputs.desiredMonthlyWithdrawal * 12;
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

function addRiskAnalysis(pptx: Pptx, result: SimulationResult) {
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

function addHistoricalSlide(
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

function addEducationalSlides(pptx: Pptx) {
  // Modern Portfolio Theory
  let slide = pptx.addSlide();
  addSlideHeader(slide, "Moderne Portfoliotheorie & Diversifikation", pptx);

  slide.addText(
    "Die Moderne Portfoliotheorie (MPT), entwickelt von Harry Markowitz im Jahr 1952, zeigt, dass Anleger Portfolios " +
    "konstruieren können, um die erwartete Rendite bei einem gegebenen Risikoniveau durch Diversifikation zu optimieren.\n\n" +
    "Kernprinzipien:\n\n" +
    "1. Diversifikationsvorteil: Durch die Kombination von Anlagen mit niedrigen oder negativen Korrelationen kann die " +
    "Gesamtvolatilität des Portfolios unter den gewichteten Durchschnitt der einzelnen Anlagenvolatilitäten gesenkt werden.\n\n" +
    "2. Effiziente Grenze: Die Menge der Portfolios, die die maximale erwartete Rendite für jedes Risikoniveau bieten. " +
    "Unser Drei-Topf-Modell ist auf dieser Grenze positioniert.\n\n" +
    "3. Korrelation ist entscheidend: Die Korrelation zwischen Anlageklassen bestimmt den Diversifikationsvorteil. " +
    "Aktien und hochwertige Anleihen zeigten historisch eine niedrige oder negative Korrelation in Krisen, " +
    "was einen entscheidenden Verlustschutz bietet.\n\n" +
    "4. Risikobereinigte Renditen: Die Sharpe Ratio misst die Überrendite pro Risikoeinheit. Höhere Sharpe Ratios " +
    "zeigen eine bessere risikobereinigte Performance an.",
    {
      x: 0.5,
      y: 1.2,
      w: 9,
      h: 4.0,
      fontSize: 10,
      fontFace: FONT_BODY,
      color: COLORS.text,
      lineSpacing: 14,
    }
  );

  // Monte Carlo Explanation
  slide = pptx.addSlide();
  addSlideHeader(slide, "Monte-Carlo-Simulation — So funktioniert es", pptx);

  slide.addText(
    "Die Monte-Carlo-Simulation ist eine rechnerische Methode, die Zufallsstichproben nutzt, um die Wahrscheinlichkeit " +
    "verschiedener Ergebnisse in einem unsicheren Prozess zu modellieren.\n\n" +
    "Wie wir sie einsetzen:\n\n" +
    "1. Wir definieren Renditeverteilungen für jede Anlageklasse (Durchschnittsrendite und Volatilität)\n\n" +
    "2. Wir generieren Tausende möglicher zukünftiger Renditeszenarien mit korrelierten Zufallsziehungen\n\n" +
    "3. Für jedes Szenario simulieren wir Ihren gesamten Finanzplan: Ansparphase, Ruhestand, Entnahmen, " +
    "Pensionseinkommen, Inflation und Rebalancing\n\n" +
    "4. Wir analysieren alle Ergebnisse statistisch: Welcher Prozentsatz der Szenarien endet erfolgreich? Was ist die " +
    "Bandbreite möglicher Ergebnisse? In welchem Alter gehen im schlimmsten Fall die Mittel aus?\n\n" +
    "Warum Monte Carlo?\n\n" +
    "Im Gegensatz zu deterministischen Projektionen (die konstante Renditen annehmen) erfasst Monte Carlo die Realität, " +
    "dass Märkte volatil sind. Ein Portfolio mit durchschnittlich 7% Rendite erzielt nicht exakt 7% pro Jahr — es kann " +
    "+25% in einem Jahr und −15% im nächsten erzielen. Diese Volatilität erzeugt in Kombination mit Entnahmen eine breite " +
    "Bandbreite möglicher Ergebnisse, die einfache Projektionen verfehlen.",
    {
      x: 0.5,
      y: 1.2,
      w: 9,
      h: 4.2,
      fontSize: 10,
      fontFace: FONT_BODY,
      color: COLORS.text,
      lineSpacing: 14,
    }
  );

  // Risks
  slide = pptx.addSlide();
  addSlideHeader(slide, "Zentrale Ruhestandsrisiken", pptx);

  const risks = [
    {
      title: "Inflationsrisiko",
      desc: "Selbst moderate Inflation von 2–3% kann die Kaufkraft von Ersparnissen über 25 Jahre halbieren. " +
        "Alle Projektionen sollten reale (inflationsbereinigte) Werte verwenden. Staatliche Pensionen in Österreich haben teilweisen Inflationsschutz.",
    },
    {
      title: "Langlebigkeitsrisiko",
      desc: "Das Risiko, die eigenen Mittel zu überleben. Die österreichische Lebenserwartung steigt weiter — " +
        "eine Planung bis 90+ ist ratsam. Ein 65-jähriger Österreicher hat etwa 20% Chance, 95 zu erreichen.",
    },
    {
      title: "Reihenfolge-der-Renditen-Risiko",
      desc: "Frühe Ruhestandsverluste sind überproportional schädlich. Eine Rendite von −30% im 1. Ruhestandsjahr " +
        "ist weit schlimmer als im 20., weil Entnahmen den Verlust auf einem geschrumpften Portfolio verstärken.",
    },
    {
      title: "Verhaltensrisiko",
      desc: "Panikverkäufe bei Marktrückgängen, Selbstüberschätzung in Bullenmärkten und fehlendes Rebalancing " +
        "sind häufige Fehler. Ein disziplinierter, systematischer Ansatz (wie die Drei-Topf-Strategie) hilft, diese Risiken zu mindern.",
    },
    {
      title: "Regulatorisches & Steuerrisiko",
      desc: "Steuergesetze und Pensionsregelungen (KESt in Österreich, Sozialversicherungsbeiträge) können sich ändern. " +
        "Dieses Modell verwendet flexible Annahmen, sollte aber regelmäßig mit einem Steuerberater überprüft werden.",
    },
  ];

  let yPos2 = 1.2;
  for (const risk of risks) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: yPos2,
      w: 0.08,
      h: 0.7,
      fill: { color: COLORS.accent },
    });

    slide.addText(risk.title, {
      x: 0.8,
      y: yPos2,
      w: 8.5,
      h: 0.25,
      fontSize: 11,
      fontFace: FONT_BODY,
      color: COLORS.secondary,
      bold: true,
    });

    slide.addText(risk.desc, {
      x: 0.8,
      y: yPos2 + 0.25,
      w: 8.5,
      h: 0.45,
      fontSize: 9,
      fontFace: FONT_BODY,
      color: COLORS.text,
      lineSpacing: 13,
    });

    yPos2 += 0.85;
  }
}

function addRecommendationsSlide(
  pptx: Pptx,
  result: SimulationResult,
  inputs: FinancialInputs,
  client: ClientProfile
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Empfehlungen", pptx);

  const recommendations: string[] = [];

  if (result.successRate >= 95) {
    recommendations.push(
      "Ihr Plan zeigt eine sehr hohe Erfolgswahrscheinlichkeit. Sie haben möglicherweise Spielraum, Ausgaben zu erhöhen oder das Risiko zu reduzieren."
    );
  } else if (result.successRate >= 80) {
    recommendations.push(
      "Ihr Plan hat eine gute Erfolgswahrscheinlichkeit, aber erwägen Sie den Aufbau zusätzlicher Puffer."
    );
  } else {
    recommendations.push(
      "Ihr Plan birgt erhebliches Risiko. Erwägen Sie, geplante Entnahmen zu reduzieren, Sparraten zu erhöhen oder den Ruhestandsbeginn zu verschieben."
    );
  }

  const accYears = client.retirementAge - client.currentAge;
  const retIdx = Math.min(accYears, result.medianPath.length - 1);
  const capitalAtRet = result.medianPath[retIdx];
  const withdrawalRate = capitalAtRet > 0
    ? (inputs.desiredMonthlyWithdrawal * 12 / capitalAtRet) * 100
    : 0;

  if (withdrawalRate > 4) {
    recommendations.push(
      `Ihre anfängliche Entnahmerate von ${fmtPct(withdrawalRate)} überschreitet den empfohlenen Bereich von 3,5–4,0%. Erwägen Sie, monatliche Entnahmen zu reduzieren oder mehr Kapital anzusparen.`
    );
  }

  recommendations.push(
    "Überprüfen Sie diesen Plan jährlich und nach wichtigen Lebensereignissen (Jobwechsel, Erbschaft, Gesundheitsveränderungen)."
  );
  recommendations.push(
    "Erwägen Sie eine dynamische Entnahmestrategie: Reduzieren Sie Ausgaben um 10–15% in Jahren nach Marktrückgängen von >15%."
  );
  recommendations.push(
    "Stellen Sie sicher, dass Ihr Bargeldtopf (Topf 1) vor dem Ruhestand mindestens 12–24 Monate Ausgaben abdeckt."
  );
  recommendations.push(
    "Konsultieren Sie einen qualifizierten Finanzberater und Steuerexperten, bevor Sie diesen Plan umsetzen."
  );

  let yPos = 1.3;
  for (let i = 0; i < recommendations.length; i++) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: yPos,
      w: 9,
      h: 0.55,
      fill: { color: i % 2 === 0 ? "F8F9FA" : COLORS.white },
      rectRadius: 0.05,
    });

    slide.addText(`${i + 1}.`, {
      x: 0.6,
      y: yPos,
      w: 0.4,
      h: 0.55,
      fontSize: 14,
      fontFace: FONT_BODY,
      color: COLORS.secondary,
      bold: true,
    });

    slide.addText(recommendations[i], {
      x: 1.1,
      y: yPos,
      w: 8.2,
      h: 0.55,
      fontSize: 10,
      fontFace: FONT_BODY,
      color: COLORS.text,
      lineSpacing: 14,
      valign: "middle",
    });

    yPos += 0.65;
  }
}

function addAppendixSlide(pptx: Pptx) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Anhang — Methodik", pptx);

  slide.addText(
    "Simulationsmethodik\n\n" +
    "• Anlageerträge werden als korrelierte geometrische Brownsche Bewegungsprozesse modelliert\n" +
    "• Die Korrelationsstruktur wird mittels Cholesky-Zerlegung der Korrelationsmatrix erzwungen\n" +
    "• Renditen werden im festgelegten Zeitschritt generiert (monatlich oder jährlich)\n" +
    "• Entnahmen werden proportional aus allen Töpfen nach Anwendung der Renditen abgezogen\n" +
    "• Das Portfolio wird gemäß gewählter Häufigkeit und Schwellenwert auf Zielgewichte rebalanciert\n" +
    "• Inflationsanpassungen werden kumulativ auf Entnahmen und Pensionseinkommen angewandt\n" +
    "• Ein Szenario wird als ‚gescheitert' klassifiziert, wenn der Portfoliowert auf null oder darunter fällt\n\n" +
    "Historischer Backtest\n\n" +
    "• Verwendet tatsächliche jährliche Renditen für globale Aktien (MSCI-World-Proxy), europäische Staatsanleihen " +
    "und EUR/ATS-Kurzfristzinsen von 1970 bis 2024\n" +
    "• Rollierende Fenster testen jedes mögliche Startjahr mit den definierten Planparametern\n" +
    "• Kosten und Steuerbelastung werden von historischen Bruttorenditen abgezogen\n\n" +
    "Einschränkungen\n\n" +
    "• Die Wertentwicklung der Vergangenheit garantiert keine zukünftigen Ergebnisse\n" +
    "• Das Modell nimmt konstante Korrelationen und Renditeverteilungen an (Regimewechsel werden nicht modelliert)\n" +
    "• Transaktionskosten werden approximiert, nicht präzise modelliert\n" +
    "• Steuerberechnungen sind vereinfacht — tatsächliche österreichische KESt und Sozialversicherung können abweichen\n" +
    "• Tail-Risiken (Black Swans) werden durch Normalverteilungsannahmen möglicherweise nicht vollständig erfasst\n\n" +
    "Dieser Bericht dient ausschließlich Informationszwecken und stellt keine Anlageberatung dar.",
    {
      x: 0.5,
      y: 1.1,
      w: 9,
      h: 4.5,
      fontSize: 9,
      fontFace: FONT_BODY,
      color: COLORS.text,
      lineSpacing: 13,
    }
  );
}

export async function generatePowerPointReport(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  result: SimulationResult,
  historical: HistoricalAnalysis | null,
  detailedTrace?: DetailedSimTrace | null,
  liquidityEvents?: LiquidityEvent[]
): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Ruhestandsplaner Pro";
  pptx.company = "Ruhestandsplaner Pro";
  pptx.title = `Ruhestandsplan — ${client.name}`;

  addTitleSlide(pptx, client);
  addFinancialSummary(pptx, client, inputs);
  if (liquidityEvents && liquidityEvents.length > 0) {
    addLiquidityEventsSlide(pptx, liquidityEvents);
  }
  addPortfolioSlide(pptx, portfolio);
  addAssumptionsSlide(pptx, inputs, portfolio, result);
  addSectionSlide(pptx, "Simulationsergebnisse", "Monte-Carlo-Analyse & Entnahme-Nachhaltigkeit");
  addMonteCarloResults(pptx, result, inputs, client);
  addSuccessProbabilitySlide(pptx, result);
  addWithdrawalSlide(pptx, result, inputs, client);
  addRiskAnalysis(pptx, result);
  if (detailedTrace) {
    addSectionSlide(pptx, "Einzelpfad-Beispiel", "Detaillierte Portfolioentwicklung eines Simulationspfades");
    addDetailedTraceSlides(pptx, detailedTrace, client);
  }
  addSectionSlide(pptx, "Historische Analyse", "Backtest mit realen Marktdaten");
  addHistoricalSlide(pptx, historical);
  addSectionSlide(pptx, "Wissenswertes", "Die wichtigsten Konzepte verstehen");
  addEducationalSlides(pptx);
  addRecommendationsSlide(pptx, result, inputs, client);
  addAppendixSlide(pptx);

  const output = await pptx.write({ outputType: "blob" });
  return output as Blob;
}

function addDetailedTraceSlides(pptx: Pptx, trace: DetailedSimTrace, client: ClientProfile) {
  const slide1 = pptx.addSlide();
  slide1.background = { fill: COLORS.white };
  addSlideFooter(slide1);

  slide1.addText("Einzelpfad-Beispiel: Portfolioentwicklung", {
    x: 0.5, y: 0.3, w: 8, h: 0.45,
    fontSize: 20, fontFace: FONT_HEADING, color: COLORS.primary, bold: true,
  });

  slide1.addText(
    `Simulation #${trace.simulationIndex + 1} — ${trace.success ? "Erfolgreich" : "Kapital aufgebraucht"} — Endvermögen: € ${Math.round(trace.finalWealth).toLocaleString("de-AT")}`,
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

  const tableRows: any[][] = [
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
    const tableRows2: any[][] = [tableRows[0]];

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