/**
 * Single-file interactive HTML client report.
 *
 * Output goals:
 *  • Self-contained: openable via `file://` after e-mail download, no CDN,
 *    no external fonts, no network calls (CSP-compatible on disk).
 *  • Bilingual (DE/EN), chosen by the advisor at export time.
 *  • Curated "client view" first, optional `Details einblenden` reveals
 *    methodology, percentile table and full portfolio breakdown.
 *  • Optional 6-digit PIN gate (SHA-256 + random salt, Web-Crypto-API).
 *  • Safe: all user-controlled text (client name, advisor name, notes,
 *    liquidity-event descriptions) is HTML-escaped; no `innerHTML`-user paths.
 *
 * The function returns a `Blob` of MIME `text/html`, ready to download.
 */

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
import { hashPin } from "./crypto";
import {
  portfolioLegend,
  renderHistoricalSvg,
  renderMonteCarloFanSvg,
  renderPortfolioDonutSvg,
} from "./chartSvg";

/* HTML-escape. No external deps — deliberately minimal. */
function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DE_STRINGS = {
  pinPrompt: "Dieser Bericht ist PIN-geschützt.",
  pinHint: "Bitte geben Sie die 6-stellige PIN ein, die Sie von Ihrer Beraterin / Ihrem Berater erhalten haben.",
  pinLabel: "PIN",
  pinSubmit: "Bericht öffnen",
  pinWrong: "PIN inkorrekt. Bitte erneut versuchen.",
  preparedFor: "Erstellt für",
  preparedBy: "Erstellt von",
  date: "Datum",
  summary: "Kernaussage",
  yourNumbers: "Ihre Zahlen auf einen Blick",
  portfolio: "Ihr Portfolio",
  portfolioDesc: "Die Vermögensaufteilung bestimmt Rendite- und Risikoeigenschaften Ihres Plans.",
  simulation: "Vermögensverlauf (10.000 Simulationen)",
  simulationDesc: "Die Bänder zeigen, in welcher Spanne sich Ihr Vermögen mit großer Wahrscheinlichkeit bewegen wird. Die schwarze Linie ist der mittlere Verlauf (Median).",
  historical: "Historischer Rückblick",
  historicalDesc: "Wie hätte Ihr Plan unter den tatsächlichen Marktbedingungen der letzten Jahrzehnte abgeschnitten?",
  histSuccessRate: "Erfolgsrate historisch",
  histWorst: "Schlechtester Startjahrgang",
  histBest: "Bester Startjahrgang",
  nextSteps: "Nächste Schritte",
  ctaAppointment: "Termin vereinbaren",
  ctaMailSubject: "Rückfrage zu meinem Ruhestandsplan",
  showDetails: "Details einblenden",
  hideDetails: "Details ausblenden",
  methodology: "Methodik",
  assumptions: "Annahmen",
  portfolioDetails: "Portfolio-Details",
  axisAge: "Alter",
  axisYear: "Jahr",
  band10_90: "80% der Pfade",
  band25_75: "50% der Pfade",
  bandMedian: "Median-Pfad",
  kpiStart: "Anfangskapital",
  kpiMonthly: "Monatliche Sparrate",
  kpiTarget: "Gewünschte Entnahme",
  kpiRet: "Pensionsalter",
  kpiHorizon: "Planungshorizont",
  kpiHorizonUnit: "Jahre",
  kpiSuccess: "Erfolgsrate",
  kpiMedian: "Medianes Endvermögen",
  kpiP10: "Konservativ (10%)",
  kpiP90: "Optimistisch (90%)",
  disclaimerTitle: "Rechtlicher Hinweis — Marketingmitteilung",
  confidential: "Vertraulich — nur zur persönlichen Verwendung",
  perMonth: "/Monat",
  returnRow: "Erwartete Bruttorendite",
  volatilityRow: "Volatilität",
  costsRow: "Kosten",
  netReturnRow: "Netto-Rendite (nach KESt)",
  inflationRow: "Inflationsannahme",
  kestRow: "KESt",
  liqEvents: "Liquiditätsereignisse",
  ageHeader: "Alter",
  descHeader: "Beschreibung",
  amtHeader: "Betrag",
  contact: "Kontakt",
};

const EN_STRINGS: typeof DE_STRINGS = {
  pinPrompt: "This report is PIN-protected.",
  pinHint: "Please enter the 6-digit PIN provided by your advisor.",
  pinLabel: "PIN",
  pinSubmit: "Open report",
  pinWrong: "Incorrect PIN. Please try again.",
  preparedFor: "Prepared for",
  preparedBy: "Prepared by",
  date: "Date",
  summary: "Key takeaway",
  yourNumbers: "Your numbers at a glance",
  portfolio: "Your portfolio",
  portfolioDesc: "Your asset allocation drives the return and risk profile of your plan.",
  simulation: "Wealth trajectory (10,000 simulations)",
  simulationDesc: "The bands show the range your wealth is most likely to move within. The black line is the median path.",
  historical: "Historical lookback",
  historicalDesc: "How would your plan have fared under the actual market conditions of recent decades?",
  histSuccessRate: "Historical success rate",
  histWorst: "Worst starting year",
  histBest: "Best starting year",
  nextSteps: "Next steps",
  ctaAppointment: "Schedule a meeting",
  ctaMailSubject: "Follow-up on my retirement plan",
  showDetails: "Show details",
  hideDetails: "Hide details",
  methodology: "Methodology",
  assumptions: "Assumptions",
  portfolioDetails: "Portfolio details",
  axisAge: "Age",
  axisYear: "Year",
  band10_90: "80% of paths",
  band25_75: "50% of paths",
  bandMedian: "Median path",
  kpiStart: "Initial capital",
  kpiMonthly: "Monthly savings",
  kpiTarget: "Target withdrawal",
  kpiRet: "Retirement age",
  kpiHorizon: "Planning horizon",
  kpiHorizonUnit: "years",
  kpiSuccess: "Success rate",
  kpiMedian: "Median final wealth",
  kpiP10: "Conservative (10%)",
  kpiP90: "Optimistic (90%)",
  disclaimerTitle: "Legal notice — Marketing communication",
  confidential: "Confidential — for personal use only",
  perMonth: "/month",
  returnRow: "Expected gross return",
  volatilityRow: "Volatility",
  costsRow: "Costs",
  netReturnRow: "Net return (after CGT)",
  inflationRow: "Inflation assumption",
  kestRow: "Capital-gains tax",
  liqEvents: "Liquidity events",
  ageHeader: "Age",
  descHeader: "Description",
  amtHeader: "Amount",
  contact: "Contact",
};

const DISCLAIMER_DE = "Diese Unterlagen stellen eine Marketingmitteilung dar und wurden nicht im Einklang mit den Rechtsvorschriften zur Förderung der Unabhängigkeit von Anlageanalysen erstellt. Sie unterliegen nicht dem Verbot des Handels im Anschluss an die Verbreitung von Anlageanalysen. Die angeführten Simulationen basieren auf Annahmen, die im Zeitablauf von der tatsächlichen Entwicklung abweichen können. Vergangenheitsergebnisse sind kein verlässlicher Indikator für zukünftige Wertentwicklungen. Die dargestellten Informationen stellen weder eine individuelle Anlageberatung noch ein Angebot oder eine Aufforderung zum Kauf oder Verkauf von Finanzinstrumenten dar. Vor einer Anlageentscheidung sollten Sie die für Ihre persönliche Situation passende Anlageberatung in Anspruch nehmen.";
const DISCLAIMER_EN = "This document is a marketing communication and has not been prepared in accordance with legal requirements designed to promote the independence of investment research. It is not subject to any prohibition on dealing ahead of the dissemination of investment research. The simulations shown are based on assumptions that may diverge from actual developments over time. Past performance is not a reliable indicator of future performance. The information contained herein does not constitute personal investment advice, nor an offer or solicitation to buy or sell any financial instrument. Before making an investment decision you should seek advice tailored to your personal circumstances.";

/* ────────── formatters ────────── */
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

export interface ClientReportOptions {
  locale: Locale;
  pin?: string;                /* optional 6-digit; empty / undef → no gate */
  includeHistorical?: boolean;
  includeLiquidityEvents?: boolean;
}

export async function generateClientHtmlReport(
  client: ClientProfile,
  advisor: AdvisorProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  result: SimulationResult,
  historicalResult: HistoricalAnalysis | null,
  liquidityEvents: LiquidityEvent[],
  opts: ClientReportOptions,
): Promise<Blob> {
  const S = opts.locale === "de" ? DE_STRINGS : EN_STRINGS;
  const disclaimer = opts.locale === "de" ? DISCLAIMER_DE : DISCLAIMER_EN;

  /* PIN hashing */
  let pinHashStr = "";
  let pinSalt = "";
  if (opts.pin && /^\d{6}$/.test(opts.pin)) {
    const h = await hashPin(opts.pin);
    pinHashStr = h.hash;
    pinSalt = h.salt;
  }

  const axisLabels = {
    xAxis: S.axisAge,
    yAxis: "EUR",
    p10p90: S.band10_90,
    p25p75: S.band25_75,
    median: S.bandMedian,
  };

  const mcSvg = renderMonteCarloFanSvg(result, client, axisLabels, 760, 360);
  const histSvg = opts.includeHistorical && historicalResult
    ? renderHistoricalSvg(historicalResult, client, { xAxis: S.axisAge, yAxis: "EUR" }, 760, 320)
    : "";
  const donutSvg = renderPortfolioDonutSvg(portfolio, 240, 240);
  const legend = portfolioLegend(portfolio);

  const horizon = client.lifeExpectancy - client.currentAge;
  const p10 = result.p10Path[result.p10Path.length - 1] ?? 0;
  const p90 = result.p90Path[result.p90Path.length - 1] ?? 0;

  const liqSorted = opts.includeLiquidityEvents
    ? [...liquidityEvents].sort((a, b) => a.age - b.age)
    : [];

  const mailHref = advisor.email
    ? `mailto:${encodeURIComponent(advisor.email)}?subject=${encodeURIComponent(S.ctaMailSubject)}`
    : "";

  /* ────────── Build markup ────────── */
  const title = opts.locale === "de"
    ? `Ruhestandsplan — ${client.name || ""}`
    : `Retirement Plan — ${client.name || ""}`;

  const css = `
    :root{
      --bg:#FAF8F5;--card:#FFFFFF;--text:#20201E;--muted:#6E6B68;--soft:#F5F3F0;
      --accent:#D31220;--accent-soft:rgba(211,18,32,0.08);--border:#E5E1DC;
      --ok:#5A8A50;--warn:#FAC075;
    }
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:var(--bg);color:var(--text);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;
      -webkit-font-smoothing:antialiased;font-size:16px;line-height:1.5}
    .container{max-width:960px;margin:0 auto;padding:32px 24px 120px}
    .header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:48px}
    .header h1{font-size:32px;line-height:1.15;font-weight:700;letter-spacing:-0.01em;margin:0 0 8px;color:var(--text)}
    .header .sub{color:var(--muted);font-size:15px;margin:0}
    .logo{max-height:56px;max-width:180px;object-fit:contain}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:20px;background:var(--soft);border-radius:12px;padding:20px;margin-bottom:32px}
    .meta dt{font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
    .meta dd{margin:0;font-weight:500;font-size:16px}
    .section{margin-top:48px}
    .section h2{font-size:22px;font-weight:700;margin:0 0 6px;letter-spacing:-0.005em}
    .section p.desc{color:var(--muted);margin:0 0 20px;font-size:15px}
    .hero-card{background:linear-gradient(135deg,var(--accent) 0%, #8C0D14 100%);
      color:white;border-radius:16px;padding:32px;box-shadow:0 8px 32px rgba(211,18,32,0.15)}
    .hero-card h2{margin:0;color:white;font-size:20px;font-weight:600}
    .hero-card p{margin:12px 0 0;font-size:18px;line-height:1.5}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
    @media(max-width:720px){.kpi-grid{grid-template-columns:repeat(2,1fr)}.header{flex-direction:column}.meta{grid-template-columns:1fr}}
    .kpi{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px}
    .kpi .label{font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
    .kpi .value{font-size:22px;font-weight:700;letter-spacing:-0.01em}
    .kpi.accent .value{color:var(--accent)}
    .chart-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;margin-top:20px}
    .chart-card svg{width:100%;height:auto;display:block}
    .portfolio-row{display:grid;grid-template-columns:240px 1fr;gap:32px;align-items:center}
    @media(max-width:720px){.portfolio-row{grid-template-columns:1fr}}
    .leg{list-style:none;padding:0;margin:0}
    .leg li{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:15px}
    .leg li:last-child{border-bottom:none}
    .leg .sw{width:14px;height:14px;border-radius:3px;flex-shrink:0}
    .leg .pct{margin-left:auto;font-weight:700;color:var(--text)}
    .cta{display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:white;
      padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;font-size:16px;
      box-shadow:0 4px 16px rgba(211,18,32,0.25);transition:transform .12s}
    .cta:hover{transform:translateY(-1px)}
    .contact-card{background:var(--soft);border-radius:12px;padding:24px;margin-top:20px;
      display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center}
    @media(max-width:720px){.contact-card{grid-template-columns:1fr}}
    .contact-card .name{font-weight:700;font-size:18px}
    .contact-card .role{color:var(--muted);font-size:14px}
    .contact-card a{color:var(--text)}
    .details-toggle{background:transparent;border:1px solid var(--border);color:var(--text);
      padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;margin-top:24px;font-weight:500}
    .details-toggle:hover{background:var(--soft)}
    .details{display:none;margin-top:20px}
    .details.open{display:block}
    .details table{width:100%;border-collapse:collapse;font-size:14px}
    .details th,.details td{padding:8px 12px;text-align:left;border-bottom:1px solid var(--border)}
    .details th{font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;font-size:11px}
    .details td.num{text-align:right;font-variant-numeric:tabular-nums}
    .hist-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}
    @media(max-width:720px){.hist-stats{grid-template-columns:1fr}}
    .disclaimer{margin-top:64px;padding:24px;background:var(--soft);border-radius:12px;font-size:12px;color:var(--muted);line-height:1.6}
    .disclaimer h3{font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text);margin:0 0 12px}
    .footer-meta{margin-top:24px;font-size:11px;color:var(--muted);text-align:center;letter-spacing:0.08em;text-transform:uppercase}
    .liq-inflow{color:var(--ok);font-weight:600}
    .liq-outflow{color:var(--accent);font-weight:600}
    /* PIN gate */
    .pin-overlay{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:1000;padding:24px}
    .pin-box{max-width:420px;width:100%;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.12)}
    .pin-box h2{margin:0 0 8px;font-size:22px}
    .pin-box p{color:var(--muted);margin:0 0 24px;font-size:14px}
    .pin-input{font-size:24px;letter-spacing:0.4em;text-align:center;padding:12px;width:220px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-variant-numeric:tabular-nums}
    .pin-input:focus{outline:none;border-color:var(--accent)}
    .pin-submit{margin-top:16px;background:var(--accent);color:white;border:none;padding:12px 24px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer}
    .pin-error{color:var(--accent);font-size:14px;margin-top:12px;min-height:20px}
    .vault{display:${pinHashStr ? "none" : "block"}}
    @media print{.pin-overlay,.details-toggle{display:none !important}.vault{display:block !important}.container{padding:0}}
  `;

  /* advisor contact block */
  const advisorBlock = `
    <div class="contact-card">
      <div>
        ${advisor.logoDataUrl ? `<img src="${esc(advisor.logoDataUrl)}" alt="Logo" class="logo" style="margin-bottom:12px"/>` : ""}
        <div class="name">${esc(advisor.name) || esc(advisor.bankName)}</div>
        ${advisor.title ? `<div class="role">${esc(advisor.title)}</div>` : ""}
        ${advisor.bankName && advisor.name ? `<div class="role">${esc(advisor.bankName)}</div>` : ""}
        ${advisor.branch ? `<div class="role">${esc(advisor.branch)}</div>` : ""}
        ${advisor.address ? `<div class="role" style="white-space:pre-line;margin-top:4px">${esc(advisor.address)}</div>` : ""}
        <div style="margin-top:12px;font-size:14px">
          ${advisor.phone ? `<div>☎ <a href="tel:${esc(advisor.phone)}">${esc(advisor.phone)}</a></div>` : ""}
          ${advisor.email ? `<div>✉ <a href="mailto:${esc(advisor.email)}">${esc(advisor.email)}</a></div>` : ""}
          ${advisor.website ? `<div>🌐 <a href="${esc(advisor.website)}" target="_blank" rel="noopener noreferrer">${esc(advisor.website.replace(/^https?:\/\//, ""))}</a></div>` : ""}
        </div>
      </div>
      ${mailHref ? `<a class="cta" href="${mailHref}">${esc(S.ctaAppointment)} →</a>` : ""}
    </div>
  `;

  /* summary text */
  const summaryText = opts.locale === "de"
    ? `Mit Ihrem aktuellen Plan erreichen Sie in <strong>${fmtPct("de", result.successRate)}</strong> der simulierten Szenarien Ihr gewünschtes Entnahmeziel bis zum Alter ${client.lifeExpectancy}. Das mittlere Endvermögen liegt bei <strong>${fmtEur("de", result.medianFinalWealth)}</strong>; das 10%-/90%-Perzentil bei ${fmtEur("de", p10)} bzw. ${fmtEur("de", p90)}.`
    : `With your current plan you achieve your target withdrawal up to age ${client.lifeExpectancy} in <strong>${fmtPct("en", result.successRate)}</strong> of simulated scenarios. The median final wealth is <strong>${fmtEur("en", result.medianFinalWealth)}</strong>; the 10th/90th percentile is ${fmtEur("en", p10)} / ${fmtEur("en", p90)}.`;

  /* historical block */
  const historicalBlock = opts.includeHistorical && historicalResult ? `
    <section class="section">
      <h2>${esc(S.historical)}</h2>
      <p class="desc">${esc(S.historicalDesc)}</p>
      <div class="hist-stats">
        <div class="kpi"><div class="label">${esc(S.histSuccessRate)}</div><div class="value">${fmtPct(opts.locale, historicalResult.overallSuccessRate)}</div></div>
        <div class="kpi"><div class="label">${esc(S.histWorst)}</div><div class="value">${historicalResult.worstScenario?.startYear ?? "—"}</div></div>
        <div class="kpi"><div class="label">${esc(S.histBest)}</div><div class="value">${historicalResult.bestScenario?.startYear ?? "—"}</div></div>
      </div>
      <div class="chart-card">${histSvg}</div>
    </section>
  ` : "";

  /* liquidity events */
  const liqBlock = liqSorted.length > 0 ? `
    <section class="section">
      <h2>${esc(S.liqEvents)}</h2>
      <div class="chart-card" style="padding:0">
        <table style="width:100%;border-collapse:collapse;font-size:15px">
          <thead><tr style="background:var(--soft)">
            <th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.ageHeader)}</th>
            <th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.descHeader)}</th>
            <th style="padding:12px 16px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.amtHeader)}</th>
          </tr></thead>
          <tbody>${liqSorted.map((ev) => `
            <tr style="border-top:1px solid var(--border)">
              <td style="padding:12px 16px;font-weight:600">${esc(ev.age)}</td>
              <td style="padding:12px 16px">${esc(ev.description)}</td>
              <td style="padding:12px 16px;text-align:right;font-variant-numeric:tabular-nums" class="${ev.amount >= 0 ? "liq-inflow" : "liq-outflow"}">${ev.amount >= 0 ? "+" : ""}${fmtEur(opts.locale, ev.amount)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  ` : "";

  /* details section (collapsed by default) */
  const methodologyText = opts.locale === "de"
    ? `Die Simulation verwendet 10.000 Monte-Carlo-Pfade auf Basis korrelierter log-normaler Renditen. Kosten und die österreichische Kapitalertragsteuer von ${portfolio.kestRate}% werden auf Netto-Renditen abgezogen. Inflationsanpassungen (${inputs.inflationRate}% p.a.) gelten für Entnahmen und Pensionen.`
    : `The simulation uses 10,000 Monte-Carlo paths based on correlated log-normal returns. Costs and Austrian capital-gains tax of ${portfolio.kestRate}% are deducted for net returns. Inflation adjustments (${inputs.inflationRate}% p.a.) apply to withdrawals and pensions.`;

  const detailsBlock = `
    <button class="details-toggle" id="details-btn" type="button"
      data-show="${esc(S.showDetails)}" data-hide="${esc(S.hideDetails)}">${esc(S.showDetails)} ▼</button>
    <div class="details" id="details">
      <div class="section">
        <h2>${esc(S.methodology)}</h2>
        <p class="desc">${esc(methodologyText)}</p>
      </div>
      <div class="section">
        <h2>${esc(S.portfolioDetails)}</h2>
        <table>
          <thead><tr>
            <th>${opts.locale === "de" ? "Anlageklasse" : "Asset class"}</th>
            <th class="num">${opts.locale === "de" ? "Gewicht" : "Weight"}</th>
            <th class="num">${esc(S.returnRow)}</th>
            <th class="num">${esc(S.volatilityRow)}</th>
            <th class="num">${esc(S.costsRow)}</th>
            <th class="num">${esc(S.netReturnRow)}</th>
          </tr></thead>
          <tbody>${portfolio.buckets.filter((b) => b.allocation > 0).map((b) => `
            <tr>
              <td>${esc(b.label)}</td>
              <td class="num">${fmtPct(opts.locale, b.allocation, 0)}</td>
              <td class="num">${fmtPct(opts.locale, b.expectedReturn)}</td>
              <td class="num">${fmtPct(opts.locale, b.volatility)}</td>
              <td class="num">${fmtPct(opts.locale, b.costs, 2)}</td>
              <td class="num">${fmtPct(opts.locale, b.netReturn)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="section">
        <h2>${esc(S.assumptions)}</h2>
        <table>
          <tbody>
            <tr><td>${esc(S.inflationRow)}</td><td class="num">${fmtPct(opts.locale, inputs.inflationRate)} p.a.</td></tr>
            <tr><td>${esc(S.kestRow)}</td><td class="num">${fmtPct(opts.locale, portfolio.kestRate)}</td></tr>
            <tr><td>${opts.locale === "de" ? "Rebalancing" : "Rebalancing"}</td><td class="num">${esc(portfolio.rebalancingFrequency)} · ${portfolio.rebalancingThreshold}%</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  /* PIN gate */
  const pinGate = pinHashStr ? `
    <div class="pin-overlay" id="pin-overlay">
      <div class="pin-box">
        <h2>🔒 ${esc(S.pinPrompt)}</h2>
        <p>${esc(S.pinHint)}</p>
        <form id="pin-form" autocomplete="off">
          <input id="pin-input" class="pin-input" type="password" inputmode="numeric" pattern="\\d{6}" maxlength="6" autofocus aria-label="${esc(S.pinLabel)}"/>
          <div><button class="pin-submit" type="submit">${esc(S.pinSubmit)}</button></div>
          <div class="pin-error" id="pin-error" role="alert"></div>
        </form>
      </div>
    </div>
  ` : "";

  const pinScript = pinHashStr ? `
    (function(){
      var HASH=${JSON.stringify(pinHashStr)};
      var SALT=${JSON.stringify(pinSalt)};
      var WRONG=${JSON.stringify(S.pinWrong)};
      async function sha256hex(s){
        var buf=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0')}).join('');
      }
      document.getElementById('pin-form').addEventListener('submit', async function(e){
        e.preventDefault();
        var pin=document.getElementById('pin-input').value.trim();
        var h=await sha256hex(SALT+pin);
        if(h===HASH){
          document.getElementById('pin-overlay').style.display='none';
          document.querySelector('.vault').style.display='block';
        } else {
          document.getElementById('pin-error').textContent=WRONG;
          document.getElementById('pin-input').value='';
          document.getElementById('pin-input').focus();
        }
      });
    })();
  ` : "";

  const detailsScript = `
    (function(){
      var btn=document.getElementById('details-btn');
      var box=document.getElementById('details');
      if(!btn||!box)return;
      btn.addEventListener('click',function(){
        var open=box.classList.toggle('open');
        btn.textContent=(open?btn.dataset.hide:btn.dataset.show)+' '+(open?'▲':'▼');
      });
    })();
  `;

  const html = `<!DOCTYPE html>
<html lang="${opts.locale}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="generator" content="Ruhestandsplaner Pro"/>
<meta name="robots" content="noindex,nofollow"/>
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
${pinGate}
<div class="vault">
  <div class="container">
    <div class="header">
      <div>
        <h1>${esc(client.name || (opts.locale === "de" ? "Ihr Ruhestandsplan" : "Your Retirement Plan"))}</h1>
        <p class="sub">${opts.locale === "de" ? "Persönliche Vermögens- & Entnahmesimulation" : "Personal wealth & withdrawal simulation"}</p>
      </div>
      ${advisor.logoDataUrl ? `<img src="${esc(advisor.logoDataUrl)}" alt="Logo" class="logo"/>` : ""}
    </div>

    <dl class="meta">
      <div><dt>${esc(S.preparedFor)}</dt><dd>${esc(client.name)}</dd></div>
      <div><dt>${esc(S.preparedBy)}</dt><dd>${esc(advisor.name) || esc(advisor.bankName)}</dd></div>
      <div><dt>${esc(S.date)}</dt><dd>${esc(fmtDate(opts.locale))}</dd></div>
      <div><dt>${esc(S.kpiHorizon)}</dt><dd>${horizon} ${esc(S.kpiHorizonUnit)}</dd></div>
    </dl>

    <div class="hero-card">
      <h2>${esc(S.summary)}</h2>
      <p>${summaryText}</p>
    </div>

    <section class="section">
      <h2>${esc(S.yourNumbers)}</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="label">${esc(S.kpiStart)}</div><div class="value">${fmtEur(opts.locale, inputs.initialCapital)}</div></div>
        <div class="kpi"><div class="label">${esc(S.kpiMonthly)}</div><div class="value">${fmtEur(opts.locale, inputs.monthlySavings)}${esc(S.perMonth)}</div></div>
        <div class="kpi"><div class="label">${esc(S.kpiTarget)}</div><div class="value">${fmtEur(opts.locale, inputs.desiredMonthlyWithdrawal)}${esc(S.perMonth)}</div></div>
        <div class="kpi"><div class="label">${esc(S.kpiRet)}</div><div class="value">${client.retirementAge}</div></div>
        <div class="kpi accent"><div class="label">${esc(S.kpiSuccess)}</div><div class="value">${fmtPct(opts.locale, result.successRate)}</div></div>
        <div class="kpi"><div class="label">${esc(S.kpiMedian)}</div><div class="value">${fmtEur(opts.locale, result.medianFinalWealth)}</div></div>
        <div class="kpi"><div class="label">${esc(S.kpiP10)}</div><div class="value">${fmtEur(opts.locale, p10)}</div></div>
        <div class="kpi"><div class="label">${esc(S.kpiP90)}</div><div class="value">${fmtEur(opts.locale, p90)}</div></div>
      </div>
    </section>

    <section class="section">
      <h2>${esc(S.portfolio)}</h2>
      <p class="desc">${esc(S.portfolioDesc)}</p>
      <div class="chart-card">
        <div class="portfolio-row">
          ${donutSvg}
          <ul class="leg">
            ${legend.map((l) => `<li><span class="sw" style="background:${l.color}"></span><span>${esc(l.label)}</span><span class="pct">${l.pct}%</span></li>`).join("")}
          </ul>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>${esc(S.simulation)}</h2>
      <p class="desc">${esc(S.simulationDesc)}</p>
      <div class="chart-card">${mcSvg}</div>
    </section>

    ${historicalBlock}
    ${liqBlock}

    <section class="section">
      <h2>${esc(S.nextSteps)}</h2>
      ${advisorBlock}
      ${detailsBlock}
    </section>

    <div class="disclaimer">
      <h3>${esc(S.disclaimerTitle)}</h3>
      <p>${esc(disclaimer)} ${opts.locale === "de" ? "Ausgegeben von" : "Issued by"} ${esc(advisor.bankName)}.</p>
    </div>
    <div class="footer-meta">${esc(S.confidential)}</div>
  </div>
</div>
<script>${pinScript}${detailsScript}</script>
</body></html>`;

  return new Blob([html], { type: "text/html;charset=utf-8" });
}