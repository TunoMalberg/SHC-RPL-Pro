/**
 * 5-Seiten PDF-Kundenzusammenfassung ("Client Summary").
 *
 * Layout:
 *   Seite 1 — Cover (Advisor-Briefkopf, Kundenname, Datum, Kernaussage)
 *   Seite 2 — Ihre Zahlen auf einen Blick (KPI-Tiles)
 *   Seite 3 — Portfolio (Donut + Legende + Kosten/Rendite-Tabelle)
 *   Seite 4 — Monte-Carlo-Fächer (mit Erklärtext)
 *   Seite 5 — Historischer Rückblick + nächste Schritte + Disclaimer
 *
 * Technik: pdf-lib für Struktur + Text, Charts werden aus dem SVG-Renderer
 * über ein offscreen <canvas> zu PNG gerendert und embedded.
 * Fonts: Skeena (Regular, Bold, Italic) wird aus /public/fonts/ geladen
 * und via @pdf-lib/fontkit in das PDF embedded. Fällt bei fetch-Fehlern
 * auf Standard-Helvetica zurück, damit der Export niemals bricht.
 * Alle Assets liegen lokal → CSP-konform und im Bank-Intranet lauffähig.
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type {
  AdvisorProfile,
  ClientProfile,
  FinancialInputs,
  HistoricalAnalysis,
  LiquidityEvent,
  PortfolioConfig,
  SimulationResult,
} from "../../types";
import type { Locale } from "../../i18n";
import {
  renderHistoricalSvg,
  renderMonteCarloFanSvg,
  renderPortfolioDonutSvg,
} from "./chartSvg";

/* Corporate colours in pdf-lib RGB (0..1 floats) */
const C = {
  text: rgb(0.125, 0.125, 0.118),      // #20201E
  muted: rgb(0.431, 0.42, 0.408),       // #6E6B68
  border: rgb(0.898, 0.882, 0.863),     // #E5E1DC
  soft: rgb(0.961, 0.953, 0.941),       // #F5F3F0
  accent: rgb(0.827, 0.071, 0.125),     // #D31220
  white: rgb(1, 1, 1),
  success: rgb(0.353, 0.541, 0.314),    // #5A8A50
};

const DE = {
  coverSub: "Persönliche Vermögens- & Entnahmesimulation",
  preparedFor: "Erstellt für",
  preparedBy: "Erstellt von",
  date: "Datum",
  summary: "Kernaussage",
  horizon: "Planungshorizont",
  yearsShort: "Jahre",
  yourNumbers: "Ihre Zahlen auf einen Blick",
  kpiStart: "Anfangskapital",
  kpiMonthly: "Monatliche Sparrate",
  kpiTarget: "Gewünschte Entnahme",
  kpiRet: "Pensionsalter",
  kpiSuccess: "Erfolgsrate",
  kpiMedian: "Medianes Endvermögen",
  kpiP10: "Konservativ (10%)",
  kpiP90: "Optimistisch (90%)",
  portfolio: "Ihr Portfolio",
  portfolioDesc: "Die Vermögensaufteilung bestimmt Rendite- und Risikoeigenschaften Ihres Plans.",
  assetClass: "Anlageklasse",
  weight: "Gewicht",
  returnCol: "Bruttorendite",
  volatilityCol: "Volatilität",
  netReturnCol: "Netto-Rendite",
  simulation: "Vermögensverlauf",
  simulationSub: "10.000 Monte-Carlo-Simulationen",
  simulationDesc: "Die Bänder zeigen, in welcher Spanne sich Ihr Vermögen mit großer Wahrscheinlichkeit bewegen wird. Die schwarze Linie ist der mittlere Verlauf (Median). Je breiter das Band, desto größer die Unsicherheit.",
  band10_90: "80% der Pfade",
  band25_75: "50% der Pfade",
  bandMedian: "Median-Pfad",
  historical: "Historischer Rückblick",
  historicalDesc: "Wie hätte Ihr Plan unter den tatsächlichen Marktbedingungen der letzten Jahrzehnte abgeschnitten?",
  histSuccess: "Erfolgsrate historisch",
  histWorst: "Schlechtester Startjahrgang",
  histBest: "Bester Startjahrgang",
  nextSteps: "Nächste Schritte",
  nextStepsText: "Sprechen Sie uns an, wenn Sie Fragen zu Ihrem Plan haben oder Anpassungen vornehmen möchten.",
  disclaimer: "Rechtlicher Hinweis — Marketingmitteilung",
  disclaimerText: "Diese Unterlagen stellen eine Marketingmitteilung dar und wurden nicht im Einklang mit den Rechtsvorschriften zur Förderung der Unabhängigkeit von Anlageanalysen erstellt. Sie unterliegen nicht dem Verbot des Handels im Anschluss an die Verbreitung von Anlageanalysen. Die angeführten Simulationen basieren auf Annahmen, die im Zeitablauf von der tatsächlichen Entwicklung abweichen können. Vergangenheitsergebnisse sind kein verlässlicher Indikator für zukünftige Wertentwicklungen. Die dargestellten Informationen stellen weder eine individuelle Anlageberatung noch ein Angebot oder eine Aufforderung zum Kauf oder Verkauf von Finanzinstrumenten dar.",
  issuedBy: "Ausgegeben von",
  asOf: "Stand",
  pageOf: (a: number, b: number) => `Seite ${a} von ${b}`,
  confidential: "Vertraulich",
  perMonth: "/Monat",
  age: "Alter",
  wealth: "Vermögen (EUR)",
  year: "Jahr",
};

const EN: typeof DE = {
  coverSub: "Personal wealth & withdrawal simulation",
  preparedFor: "Prepared for",
  preparedBy: "Prepared by",
  date: "Date",
  summary: "Key takeaway",
  horizon: "Planning horizon",
  yearsShort: "years",
  yourNumbers: "Your numbers at a glance",
  kpiStart: "Initial capital",
  kpiMonthly: "Monthly savings",
  kpiTarget: "Target withdrawal",
  kpiRet: "Retirement age",
  kpiSuccess: "Success rate",
  kpiMedian: "Median final wealth",
  kpiP10: "Conservative (10%)",
  kpiP90: "Optimistic (90%)",
  portfolio: "Your portfolio",
  portfolioDesc: "Your asset allocation drives the return and risk profile of your plan.",
  assetClass: "Asset class",
  weight: "Weight",
  returnCol: "Gross return",
  volatilityCol: "Volatility",
  netReturnCol: "Net return",
  simulation: "Wealth trajectory",
  simulationSub: "10,000 Monte-Carlo simulations",
  simulationDesc: "The bands show the range your wealth is most likely to move within. The black line is the median path. Wider bands indicate higher uncertainty.",
  band10_90: "80% of paths",
  band25_75: "50% of paths",
  bandMedian: "Median path",
  historical: "Historical lookback",
  historicalDesc: "How would your plan have fared under the actual market conditions of recent decades?",
  histSuccess: "Historical success rate",
  histWorst: "Worst starting year",
  histBest: "Best starting year",
  nextSteps: "Next steps",
  nextStepsText: "Please reach out with any questions or if you'd like to adjust your plan.",
  disclaimer: "Legal notice — Marketing communication",
  disclaimerText: "This document is a marketing communication and has not been prepared in accordance with legal requirements designed to promote the independence of investment research. It is not subject to any prohibition on dealing ahead of the dissemination of investment research. The simulations shown are based on assumptions that may diverge from actual developments over time. Past performance is not a reliable indicator of future performance. The information contained herein does not constitute personal investment advice, nor an offer or solicitation to buy or sell any financial instrument.",
  issuedBy: "Issued by",
  asOf: "As of",
  pageOf: (a: number, b: number) => `Page ${a} of ${b}`,
  confidential: "Confidential",
  perMonth: "/month",
  age: "Age",
  wealth: "Wealth (EUR)",
  year: "Year",
};

/* ──────────────────────────────────────────
   SVG → PNG via offscreen canvas (browser-only)
   ────────────────────────────────────────── */
async function svgToPngBytes(svg: string, width: number, height: number): Promise<Uint8Array> {
  const scale = 2; // retina-ish for PDF print clarity
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("SVG load failed"));
      i.src = url;
    });
    ctx.drawImage(img, 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* ──────────────────────────────────────────
   pdf-lib text helpers
   ────────────────────────────────────────── */
interface DrawOpt {
  font?: PDFFont;
  size?: number;
  color?: RGB;
  lineHeight?: number;
  maxWidth?: number;
}

function drawText(page: PDFPage, text: string, x: number, y: number, opt: DrawOpt = {}) {
  const font = opt.font!;
  const size = opt.size ?? 10;
  const color = opt.color ?? C.text;
  // Replace characters pdf-lib standard fonts don't support (é, non-WinAnsi)
  const safe = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
  page.drawText(safe, { x, y, size, font, color });
}

/* simple word-wrap within maxWidth; returns lines */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? current + " " + w : w;
    const width = font.widthOfTextAtSize(test, size);
    if (width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  opt: DrawOpt = {},
): number {
  const size = opt.size ?? 10;
  const lh = opt.lineHeight ?? 1.4;
  const lines = wrap(text, opt.font!, size, maxWidth);
  let cursor = y;
  for (const line of lines) {
    drawText(page, line, x, cursor, opt);
    cursor -= size * lh;
  }
  return cursor;
}

function footer(page: PDFPage, fonts: { body: PDFFont }, S: typeof DE, pageNo: number, totalPages: number, confidential: boolean) {
  const w = page.getWidth();
  const h = page.getHeight();
  if (confidential) {
    drawText(page, S.confidential.toUpperCase(), 48, 24, { font: fonts.body, size: 8, color: C.muted });
  }
  drawText(page, S.pageOf(pageNo, totalPages), w - 100, 24, { font: fonts.body, size: 8, color: C.muted });
  page.drawLine({ start: { x: 48, y: h - 0 }, end: { x: w - 48, y: h - 0 }, color: C.border, thickness: 0 });
}

/* ──────────────────────────────────────────
   Formatters
   ────────────────────────────────────────── */
function fmtEur(locale: Locale, v: number): string {
  return new Intl.NumberFormat(locale === "de" ? "de-AT" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}
function fmtPct(locale: Locale, v: number, digits = 1): string {
  return new Intl.NumberFormat(locale === "de" ? "de-AT" : "en-GB", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v / 100);
}
function fmtDate(locale: Locale): string {
  return new Date().toLocaleDateString(locale === "de" ? "de-AT" : "en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/* ──────────────────────────────────────────
   Main generator
   ────────────────────────────────────────── */
export async function generateClientPdfReport(
  client: ClientProfile,
  advisor: AdvisorProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  result: SimulationResult,
  historicalResult: HistoricalAnalysis | null,
  _liquidityEvents: LiquidityEvent[],
  locale: Locale,
): Promise<Blob> {
  const S = locale === "de" ? DE : EN;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  /* Try to embed Skeena (Corporate Font). Fall back to Helvetica if the
     /public/fonts/ files are unreachable — the export must never break. */
  let body: PDFFont;
  let bold: PDFFont;
  let italic: PDFFont;
  try {
    const [reg, bld, it] = await Promise.all([
      fetch("/fonts/Skeena-Regular.ttf").then((r) => r.arrayBuffer()),
      fetch("/fonts/Skeena-Bold.ttf").then((r) => r.arrayBuffer()),
      fetch("/fonts/Skeena-Italic.ttf").then((r) => r.arrayBuffer()),
    ]);
    body = await pdf.embedFont(reg, { subset: true });
    bold = await pdf.embedFont(bld, { subset: true });
    italic = await pdf.embedFont(it, { subset: true });
  } catch (err) {
    console.warn("[clientReport] Skeena embed failed, falling back to Helvetica", err);
    body = await pdf.embedFont(StandardFonts.Helvetica);
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  }

  // A4 portrait
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  const CW = W - 2 * M;
  const totalPages = 5;

  const mcSvg = renderMonteCarloFanSvg(result, client, {
    xAxis: S.age, yAxis: "EUR",
    p10p90: S.band10_90, p25p75: S.band25_75, median: S.bandMedian,
  }, 720, 360);
  const histSvg = historicalResult
    ? renderHistoricalSvg(historicalResult, client, { xAxis: S.age, yAxis: "EUR" }, 720, 320)
    : "";
  const donutSvg = renderPortfolioDonutSvg(portfolio, 260, 260);

  const mcPng = await svgToPngBytes(mcSvg, 720, 360);
  const histPng = histSvg ? await svgToPngBytes(histSvg, 720, 320) : null;
  const donutPng = await svgToPngBytes(donutSvg, 260, 260);

  const mcImg = await pdf.embedPng(mcPng);
  const histImg = histPng ? await pdf.embedPng(histPng) : null;
  const donutImg = await pdf.embedPng(donutPng);

  let logoImg = null;
  if (advisor.logoDataUrl) {
    try {
      const b64 = advisor.logoDataUrl.split(",")[1];
      if (b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        if (advisor.logoDataUrl.includes("image/png")) {
          logoImg = await pdf.embedPng(bytes);
        } else if (advisor.logoDataUrl.includes("image/jpeg") || advisor.logoDataUrl.includes("image/jpg")) {
          logoImg = await pdf.embedJpg(bytes);
        }
        // SVG logos: skip — pdf-lib doesn't support SVG natively. Advisor sees graceful degradation.
      }
    } catch {
      logoImg = null;
    }
  }

  /* ═══════════════ PAGE 1: COVER ═══════════════ */
  const p1 = pdf.addPage([W, H]);
  // Accent band at top
  p1.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: C.accent });
  // Logo
  if (logoImg) {
    const logoH = 44;
    const logoW = logoImg.width * (logoH / logoImg.height);
    p1.drawImage(logoImg, { x: M, y: H - M - logoH, width: logoW, height: logoH });
  } else {
    drawText(p1, advisor.bankName, M, H - M - 14, { font: bold, size: 14 });
  }

  // Title block (middle)
  const titleY = H - 280;
  drawText(p1, locale === "de" ? "Ruhestandsplan" : "Retirement Plan", M, titleY, {
    font: bold, size: 32, color: C.text,
  });
  drawText(p1, S.coverSub, M, titleY - 28, {
    font: body, size: 14, color: C.muted,
  });

  // Metadata block
  const metaY = titleY - 100;
  const col2 = M + 260;
  drawText(p1, S.preparedFor.toUpperCase(), M, metaY, { font: body, size: 9, color: C.muted });
  drawText(p1, client.name || "—", M, metaY - 16, { font: bold, size: 14 });
  drawText(p1, S.date.toUpperCase(), col2, metaY, { font: body, size: 9, color: C.muted });
  drawText(p1, fmtDate(locale), col2, metaY - 16, { font: bold, size: 14 });

  drawText(p1, S.preparedBy.toUpperCase(), M, metaY - 48, { font: body, size: 9, color: C.muted });
  drawText(p1, advisor.name || advisor.bankName, M, metaY - 64, { font: bold, size: 14 });
  if (advisor.title) drawText(p1, advisor.title, M, metaY - 80, { font: body, size: 10, color: C.muted });

  drawText(p1, S.horizon.toUpperCase(), col2, metaY - 48, { font: body, size: 9, color: C.muted });
  drawText(p1, `${client.lifeExpectancy - client.currentAge} ${S.yearsShort}`, col2, metaY - 64, { font: bold, size: 14 });

  // Hero / Summary box
  const heroY = metaY - 160;
  p1.drawRectangle({ x: M, y: heroY - 130, width: CW, height: 130, color: C.accent });
  drawText(p1, S.summary.toUpperCase(), M + 20, heroY - 26, { font: bold, size: 10, color: C.white });
  const p10 = result.p10Path[result.p10Path.length - 1] ?? 0;
  const p90 = result.p90Path[result.p90Path.length - 1] ?? 0;
  const heroText = locale === "de"
    ? `Mit Ihrem aktuellen Plan erreichen Sie in ${fmtPct("de", result.successRate)} der Szenarien Ihr Entnahmeziel bis zum Alter ${client.lifeExpectancy}. Das mittlere Endvermögen liegt bei ${fmtEur("de", result.medianFinalWealth)}; das 10%/90%-Perzentil bei ${fmtEur("de", p10)} bzw. ${fmtEur("de", p90)}.`
    : `With your current plan you achieve your withdrawal target up to age ${client.lifeExpectancy} in ${fmtPct("en", result.successRate)} of scenarios. Median final wealth is ${fmtEur("en", result.medianFinalWealth)}; the 10th/90th percentile is ${fmtEur("en", p10)} / ${fmtEur("en", p90)}.`;
  drawWrappedText(p1, heroText, M + 20, heroY - 52, CW - 40, { font: body, size: 13, color: C.white, lineHeight: 1.5 });

  // Footer: contact
  const footerY = 120;
  p1.drawLine({ start: { x: M, y: footerY + 20 }, end: { x: W - M, y: footerY + 20 }, color: C.border, thickness: 0.5 });
  drawText(p1, advisor.bankName, M, footerY, { font: bold, size: 11 });
  if (advisor.branch) drawText(p1, advisor.branch, M, footerY - 14, { font: body, size: 9, color: C.muted });
  if (advisor.address) {
    const addrLines = advisor.address.split("\n");
    addrLines.forEach((l, i) => drawText(p1, l, M, footerY - 28 - i * 12, { font: body, size: 9, color: C.muted }));
  }
  const contactLines: string[] = [];
  if (advisor.phone) contactLines.push(advisor.phone);
  if (advisor.email) contactLines.push(advisor.email);
  if (advisor.website) contactLines.push(advisor.website.replace(/^https?:\/\//, ""));
  contactLines.forEach((l, i) => drawText(p1, l, col2, footerY - i * 14, { font: body, size: 9, color: C.muted }));

  footer(p1, { body }, S, 1, totalPages, false);

  /* ═══════════════ PAGE 2: KPIs ═══════════════ */
  const p2 = pdf.addPage([W, H]);
  drawText(p2, S.yourNumbers, M, H - M - 10, { font: bold, size: 22 });
  p2.drawLine({ start: { x: M, y: H - M - 28 }, end: { x: M + 80, y: H - M - 28 }, color: C.accent, thickness: 2 });

  const kpis: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: S.kpiStart, value: fmtEur(locale, inputs.initialCapital) },
    { label: S.kpiMonthly, value: fmtEur(locale, inputs.monthlySavings) + S.perMonth },
    { label: S.kpiTarget, value: fmtEur(locale, inputs.desiredMonthlyWithdrawal) + S.perMonth },
    { label: S.kpiRet, value: `${client.retirementAge}` },
    { label: S.kpiSuccess, value: fmtPct(locale, result.successRate), accent: true },
    { label: S.kpiMedian, value: fmtEur(locale, result.medianFinalWealth) },
    { label: S.kpiP10, value: fmtEur(locale, p10) },
    { label: S.kpiP90, value: fmtEur(locale, p90) },
  ];
  const gridTop = H - M - 80;
  const cols = 2;
  const tileW = (CW - 16) / cols;
  const tileH = 88;
  kpis.forEach((k, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * (tileW + 16);
    const y = gridTop - row * (tileH + 16) - tileH;
    p2.drawRectangle({ x, y, width: tileW, height: tileH, color: k.accent ? C.accent : C.soft });
    drawText(p2, k.label.toUpperCase(), x + 18, y + tileH - 24, {
      font: body, size: 9, color: k.accent ? C.white : C.muted,
    });
    drawText(p2, k.value, x + 18, y + 22, {
      font: bold, size: 22, color: k.accent ? C.white : C.text,
    });
  });

  footer(p2, { body }, S, 2, totalPages, true);

  /* ═══════════════ PAGE 3: PORTFOLIO ═══════════════ */
  const p3 = pdf.addPage([W, H]);
  drawText(p3, S.portfolio, M, H - M - 10, { font: bold, size: 22 });
  p3.drawLine({ start: { x: M, y: H - M - 28 }, end: { x: M + 80, y: H - M - 28 }, color: C.accent, thickness: 2 });
  drawWrappedText(p3, S.portfolioDesc, M, H - M - 48, CW, { font: body, size: 10, color: C.muted });

  // Donut (260x260 → scale down to 180x180)
  const donutSize = 180;
  const donutX = M;
  const donutY = H - M - 260;
  p3.drawImage(donutImg, { x: donutX, y: donutY, width: donutSize, height: donutSize });

  // Legend next to donut
  const legendX = donutX + donutSize + 24;
  const palette = ["#D31220", "#87BBE6", "#8FB687", "#FAC075", "#4D4A47", "#DA4D3E"];
  const hexToRgb = (hex: string) => {
    const h = hex.replace("#", "");
    return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
  };
  const visibleBuckets = portfolio.buckets.filter((b) => b.allocation > 0);
  visibleBuckets.forEach((b, i) => {
    const y = donutY + donutSize - 20 - i * 24;
    p3.drawRectangle({ x: legendX, y, width: 14, height: 14, color: hexToRgb(palette[i % palette.length]) });
    drawText(p3, b.label, legendX + 22, y + 3, { font: body, size: 11 });
    drawText(p3, `${b.allocation}%`, W - M - 40, y + 3, { font: bold, size: 11 });
  });

  // Asset-class table below donut
  const tableY = donutY - 48;
  drawText(p3, S.assetClass.toUpperCase(), M, tableY, { font: bold, size: 9, color: C.muted });
  drawText(p3, S.weight.toUpperCase(), M + 180, tableY, { font: bold, size: 9, color: C.muted });
  drawText(p3, S.returnCol.toUpperCase(), M + 260, tableY, { font: bold, size: 9, color: C.muted });
  drawText(p3, S.volatilityCol.toUpperCase(), M + 360, tableY, { font: bold, size: 9, color: C.muted });
  drawText(p3, S.netReturnCol.toUpperCase(), M + 450, tableY, { font: bold, size: 9, color: C.muted });
  p3.drawLine({ start: { x: M, y: tableY - 6 }, end: { x: W - M, y: tableY - 6 }, color: C.border, thickness: 0.5 });

  visibleBuckets.forEach((b, i) => {
    const y = tableY - 22 - i * 20;
    drawText(p3, b.label, M, y, { font: body, size: 11 });
    drawText(p3, `${b.allocation}%`, M + 180, y, { font: body, size: 11 });
    drawText(p3, fmtPct(locale, b.expectedReturn), M + 260, y, { font: body, size: 11 });
    drawText(p3, fmtPct(locale, b.volatility), M + 360, y, { font: body, size: 11 });
    drawText(p3, fmtPct(locale, b.netReturn), M + 450, y, { font: bold, size: 11, color: C.accent });
  });

  footer(p3, { body }, S, 3, totalPages, true);

  /* ═══════════════ PAGE 4: MONTE CARLO ═══════════════ */
  const p4 = pdf.addPage([W, H]);
  drawText(p4, S.simulation, M, H - M - 10, { font: bold, size: 22 });
  drawText(p4, S.simulationSub, M, H - M - 28, { font: italic, size: 12, color: C.muted });
  p4.drawLine({ start: { x: M, y: H - M - 44 }, end: { x: M + 80, y: H - M - 44 }, color: C.accent, thickness: 2 });

  drawWrappedText(p4, S.simulationDesc, M, H - M - 62, CW, { font: body, size: 10, color: C.text });

  // MC chart (720x360 → fit to CW = 499.28 → scale 0.69, height 249.6)
  const mcW = CW;
  const mcH = (CW / 720) * 360;
  const mcY = H - M - 130 - mcH;
  p4.drawImage(mcImg, { x: M, y: mcY, width: mcW, height: mcH });

  // Explanation below chart
  const explainY = mcY - 32;
  drawText(p4, locale === "de" ? "Wie Sie die Grafik lesen" : "How to read this chart", M, explainY, { font: bold, size: 12 });
  const readIt = locale === "de"
    ? 'Jede der 10.000 simulierten Lebensverläufe endet in einem anderen Endvermögen — je nach Börsenjahren, Inflation und Marktschwankungen. Wir zeigen Bänder: Im dunklen Bereich liegen 50% aller Pfade, im hellen weitere 30%. Bewegt sich Ihr Vermögen nahe am Median, entwickelt es sich "wie erwartet". Die Bandbreite ist ein Maß für Unsicherheit — nicht für das schlimmste oder beste Szenario.'
    : 'Each of the 10,000 simulated lifetime paths ends in a different final wealth, depending on market years, inflation and volatility. We show bands: the darker region contains 50% of all paths, the lighter another 30%. If your wealth tracks the median, it is developing "as expected". The width of the bands measures uncertainty — not the worst or best case.';
  drawWrappedText(p4, readIt, M, explainY - 18, CW, { font: body, size: 10, color: C.muted, lineHeight: 1.5 });

  footer(p4, { body }, S, 4, totalPages, true);

  /* ═══════════════ PAGE 5: HISTORICAL + NEXT STEPS ═══════════════ */
  const p5 = pdf.addPage([W, H]);
  if (histImg && historicalResult) {
    drawText(p5, S.historical, M, H - M - 10, { font: bold, size: 22 });
    p5.drawLine({ start: { x: M, y: H - M - 28 }, end: { x: M + 80, y: H - M - 28 }, color: C.accent, thickness: 2 });
    drawWrappedText(p5, S.historicalDesc, M, H - M - 48, CW, { font: body, size: 10, color: C.muted });

    const histW = CW;
    const histH = (CW / 720) * 320;
    const histY = H - M - 110 - histH;
    p5.drawImage(histImg, { x: M, y: histY, width: histW, height: histH });

    // Stats row
    const statsY = histY - 24;
    const statW = (CW - 24) / 3;
    const stats = [
      { label: S.histSuccess, value: fmtPct(locale, historicalResult.overallSuccessRate) },
      { label: S.histWorst, value: String(historicalResult.worstScenario?.startYear ?? "—") },
      { label: S.histBest, value: String(historicalResult.bestScenario?.startYear ?? "—") },
    ];
    stats.forEach((s, i) => {
      const x = M + i * (statW + 12);
      p5.drawRectangle({ x, y: statsY - 56, width: statW, height: 52, color: C.soft });
      drawText(p5, s.label.toUpperCase(), x + 12, statsY - 18, { font: body, size: 8, color: C.muted });
      drawText(p5, s.value, x + 12, statsY - 44, { font: bold, size: 18 });
    });
  } else {
    drawText(p5, S.nextSteps, M, H - M - 10, { font: bold, size: 22 });
    p5.drawLine({ start: { x: M, y: H - M - 28 }, end: { x: M + 80, y: H - M - 28 }, color: C.accent, thickness: 2 });
  }

  // Next steps block (bottom of page 5)
  const nextY = histImg ? 290 : H - M - 60;
  drawText(p5, S.nextSteps, M, nextY, { font: bold, size: 16 });
  drawWrappedText(p5, S.nextStepsText, M, nextY - 20, CW, { font: body, size: 10, color: C.text });

  // Advisor contact in bordered box
  const boxY = nextY - 72;
  p5.drawRectangle({ x: M, y: boxY - 64, width: CW, height: 72, color: C.soft });
  drawText(p5, advisor.name || advisor.bankName, M + 16, boxY - 12, { font: bold, size: 12 });
  if (advisor.title) drawText(p5, advisor.title, M + 16, boxY - 26, { font: body, size: 9, color: C.muted });
  const cLines: string[] = [];
  if (advisor.phone) cLines.push("☎ " + advisor.phone);
  if (advisor.email) cLines.push("✉ " + advisor.email);
  cLines.forEach((l, i) => drawText(p5, l, M + 16, boxY - 44 - i * 12, { font: body, size: 9 }));

  // Disclaimer at bottom
  const discY = 140;
  p5.drawLine({ start: { x: M, y: discY + 16 }, end: { x: W - M, y: discY + 16 }, color: C.border, thickness: 0.5 });
  drawText(p5, S.disclaimer.toUpperCase(), M, discY, { font: bold, size: 8, color: C.muted });
  const discEndY = drawWrappedText(
    p5,
    `${S.disclaimerText} ${S.issuedBy} ${advisor.bankName}.`,
    M,
    discY - 14,
    CW,
    { font: body, size: 7, color: C.muted, lineHeight: 1.5 },
  );
  // "Stand: TT. Monat JJJJ" below disclaimer
  drawText(p5, `${S.asOf}: ${fmtDate(locale)}`, M, discEndY - 6, {
    font: italic,
    size: 7,
    color: C.muted,
  });

  footer(p5, { body }, S, 5, totalPages, true);

  /* ═══════════════ Metadata ═══════════════ */
  pdf.setTitle(`Ruhestandsplan — ${client.name || ""}`.trim());
  pdf.setAuthor(advisor.name || advisor.bankName);
  pdf.setCreator("Ruhestandsplaner Pro");
  pdf.setProducer("Ruhestandsplaner Pro");
  pdf.setKeywords(["retirement", "wealth", "simulation", "marketing communication"]);
  pdf.setCreationDate(new Date());

  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}