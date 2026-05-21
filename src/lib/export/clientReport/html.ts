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
  DetailedSimTrace,
  FinancialInputs,
  HistoricalAnalysis,
  LiquidityEvent,
  MifidProfile,
  PortfolioConfig,
  Scenario,
  SimulationResult,
} from "../../types";
import type { Locale } from "../../i18n";
import { hashPin } from "./crypto";
import { buildEmbeddedSkeenaCss } from "./fonts";
import {
  portfolioLegend,
  renderDetailedPathSvg,
  renderHistoricalSvg,
  renderMonteCarloFanSvg,
  renderPortfolioDonutSvg,
  renderPrivateEquitySvg,
  renderScenariosComparisonSvg,
  chartInteractionScript,
} from "./chartSvg";
import { computePETimeline, buildStochasticEnsemble } from "../../engine/privateEquity";

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
  simulationDesc: "Die Bänder zeigen, in welcher Spanne sich Ihr Vermögen mit großer Wahrscheinlichkeit bewegen wird. Die schwarze Linie ist der mittlere Verlauf (Median). Bewegen Sie die Maus über den Chart für konkrete Werte je Alter.",
  historical: "Historischer Rückblick",
  historicalDesc: "Wie hätte Ihr Plan unter den tatsächlichen Marktbedingungen der letzten Jahrzehnte abgeschnitten? Bewegen Sie die Maus über einen Pfad für Details zum Startjahrgang.",
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
  meetingNotesTitle: "Gesprächsnotizen",
  meetingNotesDesc: "Von Ihrer Beraterin / Ihrem Berater festgehaltene Punkte aus dem persönlichen Gespräch.",
  nextStepsFromMeeting: "Vereinbarte nächste Schritte",
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
  /* Scenarios */
  scenariosTitle: "Ihre verglichenen Szenarien",
  scenariosDesc: "Diese Szenarien haben wir gemeinsam in der Beratung festgehalten. Jede Linie zeigt den medianen Vermögensverlauf einer Variante — bewegen Sie die Maus über das Diagramm, um Werte für jedes Alter zu sehen.",
  scenariosTableScenario: "Szenario",
  scenariosTableSuccess: "Erfolgsrate",
  scenariosTableMedian: "Median Endvermögen",
  scenariosTableP10: "P10 (konservativ)",
  scenariosTableP90: "P90 (optimistisch)",
  scenariosTableWithdraw: "Entnahme/Monat",
  scenariosTableCapital: "Startkapital",
  /* Individual path */
  detailedTitle: "Möglicher Einzelverlauf (Beispielpfad)",
  detailedDesc: "Ein einzelner, zufällig gezogener Verlauf aus der Simulation — zeigt, wie Ihr Vermögen Jahr für Jahr aus den drei Töpfen zusammengesetzt sein könnte. Bewegen Sie die Maus über die Flächen für Werte je Alter.",
  detailedFinalWealth: "Endvermögen in diesem Pfad",
  detailedStatus: "Ergebnis",
  detailedSuccess: "Entnahmeziel erreicht",
  detailedDepleted: "Kapital vor Alter {age} erschöpft",
  detailedTableToggle: "Jahr-für-Jahr-Tabelle einblenden",
  detailedTableHideToggle: "Jahr-für-Jahr-Tabelle ausblenden",
  detailedColYear: "Jahr",
  detailedColAge: "Alter",
  detailedColPhase: "Phase",
  detailedColStart: "Start Total",
  detailedColCashflow: "Cashflow",
  detailedColRebal: "Rebal.",
  detailedColEnd: "End Total",
  phaseAccum: "Ansparen",
  phaseWithdraw: "Entnahme",
  /* MiFID */
  mifidTitle: "Ihr Anlegerprofil (MiFID II)",
  mifidIntro: "Auf Basis des gemeinsam ausgefüllten Eignungstests haben wir Ihre Anlagestrategie auf folgendes Profil abgestimmt:",
  mifidSelected: "Zugewiesenes Risikoprofil",
  mifidAllocation: "Zielallokation",
  mifidConfirmedYes: "Eignungstest abgeschlossen und Risikohinweise erläutert.",
  mifidConfirmedNo: "Bitte schließen Sie gemeinsam mit Ihrer Beraterin / Ihrem Berater den Eignungstest ab.",
  mifidWhyMatters: "Was bedeutet das für Sie?",
  mifidConservativeName: "Konservativ",
  mifidConservativeDesc: "Kapitalerhalt steht vor Wertzuwachs. Geringe Schwankungen, überschaubares Verlustrisiko — geeignet, wenn Sicherheit und Planbarkeit wichtiger sind als hohe Renditen.",
  mifidBalancedName: "Ausgewogen",
  mifidBalancedDesc: "Ausgewogenes Verhältnis von Sicherheit und Wachstum. Zwischenzeitliche Schwankungen werden in Kauf genommen, weil langfristig höhere Erträge angestrebt werden — typische Wahl für Altersvorsorge.",
  mifidGrowthName: "Wachstum",
  mifidGrowthDesc: "Langfristiger Vermögensaufbau steht im Vordergrund. Höhere Schwankungen sind möglich; ein längerer Anlagehorizont und ein ruhiger Umgang mit Kursrückgängen werden vorausgesetzt.",
  mifidSpeculativeName: "Spekulativ",
  mifidSpeculativeDesc: "Maximale Renditechancen, mit entsprechend höheren Risiken. Auch stärkere Wertrückgänge sollten Sie aushalten können, ohne Ihre Anlagestrategie zu ändern.",
  /* Private Equity (Topf 4) */
  peTitle: "Private Equity (Topf 4)",
  peDesc: "Zeichnungen in Private-Equity-Fonds ergänzen Ihr Portfolio um eine illiquide Komponente mit höheren Renditezielen. Die Auszahlungen erfolgen über die Fondslaufzeit (typisch 10–14 Jahre) und folgen dem charakteristischen J-Curve-Muster: in den ersten Jahren überwiegen Capital Calls, später dominieren Distributions.",
  peSummaryFunds: "Anzahl Fonds",
  peSummaryCommitment: "Σ Zeichnungssumme",
  peSummaryCalled: "Σ abgerufenes Kapital",
  peSummaryDistGross: "Σ Distributions (brutto)",
  peSummaryPeakNav: "Höchster NAV",
  peSummaryTargetIRR: "Ø Ziel-IRR",
  peSummaryTargetTVPI: "Ø Ziel-TVPI",
  peEnsembleSuccess: "Erfolg (TVPI ≥ 1×)",
  peEnsembleMedianIRR: "Median IRR (realisiert)",
  peEnsembleMedianTVPI: "Median TVPI (realisiert)",
  peChartTitle: "Verlauf NAV, Capital Calls & Netto-Distributions",
  peChartNavMedian: "NAV (Median)",
  peChartNav: "NAV",
  peChartNavBand: "NAV-Band p25–p75",
  peChartCalls: "Capital Calls",
  peChartDistNet: "Distributions (netto)",
  peTableTitle: "Ihre Private-Equity-Fonds",
  peTableName: "Bezeichnung",
  peTableCommitment: "Zeichnungssumme",
  peTableStart: "Start-Alter",
  peTableDuration: "Laufzeit",
  peTableIrr: "Ziel-IRR",
  peTableTvpi: "Ziel-TVPI",
  peModeLabel: "Modellierung",
  peModeSimple: "Vereinfacht",
  peModeRealistic: "Realistisch (J-Curve)",
  peModeFull: "Vollständig (J-Curve + Stochastik)",
  peNoteTitle: "Was bedeutet das für Sie?",
  peNoteBody:
    "Private Equity ist eine langfristige, illiquide Beteiligung. Capital Calls werden über mehrere Jahre verteilt abgerufen und müssen aus liquiden Mitteln bedient werden — der Liquiditätsplan im Topf 1 berücksichtigt dies bereits. Distributions sind nicht garantiert; die genannten Ziel-IRR/TVPI sind Erwartungswerte und können in Einzelfällen deutlich verfehlt werden (Totalverlust nicht ausgeschlossen).",
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
  simulationDesc: "The bands show the range your wealth is most likely to move within. The black line is the median path. Hover the chart to see concrete values for each age.",
  historical: "Historical lookback",
  historicalDesc: "How would your plan have fared under the actual market conditions of recent decades? Hover a path for details about that starting year.",
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
  meetingNotesTitle: "Meeting notes",
  meetingNotesDesc: "Key points captured by your advisor during our in-person meeting.",
  nextStepsFromMeeting: "Agreed next steps",
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
  /* Scenarios */
  scenariosTitle: "Your compared scenarios",
  scenariosDesc: "These are the scenarios we captured together during your advisory session. Each line is the median wealth path of a variant — hover the chart to see values for any age.",
  scenariosTableScenario: "Scenario",
  scenariosTableSuccess: "Success rate",
  scenariosTableMedian: "Median final wealth",
  scenariosTableP10: "P10 (conservative)",
  scenariosTableP90: "P90 (optimistic)",
  scenariosTableWithdraw: "Withdrawal/month",
  scenariosTableCapital: "Initial capital",
  /* Individual path */
  detailedTitle: "One possible path (example trajectory)",
  detailedDesc: "A single, randomly drawn path from the simulation — showing how your wealth could evolve year by year across the three buckets. Hover the areas to see values for any age.",
  detailedFinalWealth: "Final wealth in this path",
  detailedStatus: "Outcome",
  detailedSuccess: "Withdrawal target achieved",
  detailedDepleted: "Capital depleted before age {age}",
  detailedTableToggle: "Show year-by-year table",
  detailedTableHideToggle: "Hide year-by-year table",
  detailedColYear: "Year",
  detailedColAge: "Age",
  detailedColPhase: "Phase",
  detailedColStart: "Start total",
  detailedColCashflow: "Cashflow",
  detailedColRebal: "Rebal.",
  detailedColEnd: "End total",
  phaseAccum: "Accumulation",
  phaseWithdraw: "Withdrawal",
  /* MiFID */
  mifidTitle: "Your investor profile (MiFID II)",
  mifidIntro: "Based on the suitability test we completed together, we have aligned your investment strategy with the following profile:",
  mifidSelected: "Assigned risk profile",
  mifidAllocation: "Target allocation",
  mifidConfirmedYes: "Suitability test completed and risk notices explained.",
  mifidConfirmedNo: "Please complete the suitability test together with your advisor.",
  mifidWhyMatters: "What does this mean for you?",
  mifidConservativeName: "Conservative",
  mifidConservativeDesc: "Capital preservation is prioritised over growth. Low volatility and a manageable loss risk — suitable if safety and predictability matter more to you than high returns.",
  mifidBalancedName: "Balanced",
  mifidBalancedDesc: "A balanced mix of safety and growth. Interim fluctuations are accepted in exchange for higher long-term returns — the typical choice for retirement planning.",
  mifidGrowthName: "Growth",
  mifidGrowthDesc: "Long-term wealth building is the priority. Higher fluctuations are possible; a longer investment horizon and a calm approach to market setbacks are required.",
  mifidSpeculativeName: "Speculative",
  mifidSpeculativeDesc: "Maximum return potential with correspondingly higher risks. You should be able to tolerate pronounced drawdowns without changing your investment strategy.",
  /* Private Equity (bucket 4) */
  peTitle: "Private Equity (bucket 4)",
  peDesc: "Subscriptions to private-equity funds add an illiquid component with higher target returns to your portfolio. Distributions occur over the fund life (typically 10–14 years) and follow the characteristic J-curve: capital calls dominate in the early years, distributions in the later years.",
  peSummaryFunds: "Number of funds",
  peSummaryCommitment: "Σ Commitment",
  peSummaryCalled: "Σ Capital called",
  peSummaryDistGross: "Σ Distributions (gross)",
  peSummaryPeakNav: "Peak NAV",
  peSummaryTargetIRR: "Avg. target IRR",
  peSummaryTargetTVPI: "Avg. target TVPI",
  peEnsembleSuccess: "Success (TVPI ≥ 1×)",
  peEnsembleMedianIRR: "Median IRR (realised)",
  peEnsembleMedianTVPI: "Median TVPI (realised)",
  peChartTitle: "NAV, capital calls & net distributions over time",
  peChartNavMedian: "NAV (median)",
  peChartNav: "NAV",
  peChartNavBand: "NAV band p25–p75",
  peChartCalls: "Capital calls",
  peChartDistNet: "Distributions (net)",
  peTableTitle: "Your private-equity funds",
  peTableName: "Name",
  peTableCommitment: "Commitment",
  peTableStart: "Start age",
  peTableDuration: "Duration",
  peTableIrr: "Target IRR",
  peTableTvpi: "Target TVPI",
  peModeLabel: "Modelling",
  peModeSimple: "Simplified",
  peModeRealistic: "Realistic (J-curve)",
  peModeFull: "Full (J-curve + stochastic)",
  peNoteTitle: "What does this mean for you?",
  peNoteBody:
    "Private equity is a long-term, illiquid commitment. Capital calls are drawn down over several years and must be funded from liquid assets — your liquidity plan in bucket 1 already accounts for this. Distributions are not guaranteed; the target IRR/TVPI shown above are expected values and may, in individual cases, be missed substantially (total loss cannot be excluded).",
};

/* ────────── Schelhammer Capital Marketingmitteilung — full structured legal notice ────────── */
type LegalNotice = {
  title: string;
  intro: string;
  bulletsLead: string;
  bullets: string[];
  performance: string;
  liability: string;
  aiNotice: string;
};

const LEGAL_DE: LegalNotice = {
  title: "Marketingmitteilung — Rechtliche Hinweise",
  intro:
    "Bei dieser Unterlage handelt es sich um eine MARKETINGMITTEILUNG der Schelhammer Capital Bank AG („Schelhammer Capital“) FN 58248i (HG Wien), Goldschmiedgasse 3-5, 1010 Wien, https://schelhammer.at. Dies ist KEINE Finanzanalyse, die unter Einhaltung der Rechtsvorschriften zur Förderung der Unabhängigkeit von Finanzanalysen erstellt wurde und unterliegt daher auch nicht dem Verbot des Handels im Anschluss an die Verbreitung von Finanzanalysen (Art 36 f delegierte Verordnung (EU) 2017/565).",
  bulletsLead: "Die in dieser Präsentation enthaltenen Informationen",
  bullets: [
    "dienen ausschließlich der unverbindlichen Information und basieren auf dem aktuellen Wissensstand und der Markteinschätzung der Schelhammer Capital.",
    "sind nur zum Erstellungszeitpunkt gültig und können sich unter Umständen sehr rasch ändern.",
    "stellen keine Empfehlung im Sinn des Art. 9 delegierte Verordnung (EU) 2017/565 der Europäischen Kommission dar.",
    "ersetzen nicht die fachgerechte Beratung für die darin beschriebenen Finanzinstrumente und dienen insbesondere nicht als Ersatz für eine umfassende Risikoaufklärung.",
    "stellen weder ein Anbot, noch eine Einladung zur Anbotsstellung zum Kauf oder Verkauf von Finanzinstrumenten dar.",
    "wurden mit größter Sorgfalt recherchiert, es kann aber keine Haftung für deren Richtigkeit, Vollständigkeit, Aktualität oder Genauigkeit übernommen werden.",
  ],
  performance:
    "Vergangene Entwicklungen und Erträge sind kein verlässlicher Indikator für künftige Entwicklungen. Sofern Angaben zur künftigen Wertentwicklung dargestellt sind, weist die Erstellerin darauf hin, dass derartige Prognosen kein verlässlicher Indikator für die künftige Entwicklung sind. Wertpapiere weisen je nach konkreter Ausgestaltung des Produktes ein unterschiedlich hohes Anlagerisiko auf (Totalverlust kann nicht ausgeschlossen werden). Obwohl wir die von uns verwendeten Quellen als verlässlich einstufen, übernehmen wir für die Vollständigkeit und Richtigkeit der hier wiedergegebenen Informationen keine Haftung. Die Berechnungen berücksichtigen weder Ausgabe- noch Rücknahmespesen.",
  liability:
    "Haftungsausschluss: Jegliche Haftung im Zusammenhang mit der Erstellung dieser Unterlage, insbesondere für die Richtigkeit und Vollständigkeit ihres Inhaltes oder für das Eintreten erstellter Prognosen, ist ausgeschlossen. Die konkreten Hinweise und Feststellungen auf den einzelnen Seiten sind jedenfalls zu berücksichtigen. Irrtum und Druckfehler vorbehalten.",
  aiNotice:
    "Hinweis: Diese Unterlage basiert auf einem Programm, welches unter zu Hilfenahme von Künstlicher Intelligenz (KI) erstellt wurde. Die KI dient hierbei als unterstützendes Analyse- und Visualisierungswerkzeug für Ihren Kundenbetreuer. Sämtliche Ergebnisse wurden von diesem auf Plausibilität geprüft und fachlich validiert. KI-generierte Prognosen sind Modellrechnungen und keine Garantie für zukünftige Ergebnisse.",
};

const LEGAL_EN: LegalNotice = {
  title: "Marketing communication — Legal notice",
  intro:
    "This document is a MARKETING COMMUNICATION of Schelhammer Capital Bank AG (“Schelhammer Capital”), FN 58248i (Commercial Court Vienna), Goldschmiedgasse 3-5, 1010 Vienna, https://schelhammer.at. This is NOT investment research prepared in accordance with the legal requirements designed to promote the independence of investment research and is therefore not subject to any prohibition on dealing ahead of the dissemination of investment research (Art 36 f Commission Delegated Regulation (EU) 2017/565).",
  bulletsLead: "The information contained in this presentation",
  bullets: [
    "is provided for non-binding information purposes only and is based on the current state of knowledge and market assessment of Schelhammer Capital.",
    "is only valid at the time of preparation and may change very quickly under certain circumstances.",
    "does not constitute a recommendation within the meaning of Art. 9 of Commission Delegated Regulation (EU) 2017/565.",
    "does not replace professional advice for the financial instruments described and, in particular, is not a substitute for comprehensive risk disclosure.",
    "constitutes neither an offer nor a solicitation to purchase or sell any financial instruments.",
    "has been researched with the utmost care; however, no liability can be accepted for its accuracy, completeness, timeliness or precision.",
  ],
  performance:
    "Past developments and returns are not a reliable indicator of future performance. To the extent that information on future performance is shown, the issuer points out that such forecasts are not a reliable indicator of future performance. Securities entail different levels of investment risk depending on the specific structure of the product (total loss cannot be excluded). Although we consider the sources used to be reliable, we accept no liability for the completeness or accuracy of the information reproduced herein. The calculations take neither subscription nor redemption fees into account.",
  liability:
    "Liability disclaimer: Any liability in connection with the preparation of this document, in particular for the accuracy and completeness of its content or for the realisation of forecasts shown, is excluded. The specific notes and statements on the individual pages must be observed in any case. Subject to error and misprints.",
  aiNotice:
    "Note: This document is based on a program that was created with the assistance of artificial intelligence (AI). The AI serves as a supporting analysis and visualisation tool for your client advisor. All results have been reviewed for plausibility and professionally validated by your advisor. AI-generated forecasts are model calculations and not a guarantee of future results.",
};

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
  includeSavedScenarios?: boolean;
  includeDetailedPath?: boolean;
  includeMifid?: boolean;
  includeMeetingNotes?: boolean;
  includePrivateEquity?: boolean;
  scenarios?: Scenario[];
  detailedTrace?: DetailedSimTrace | null;
}

/* MiFID profile default allocations (for customer-friendly display).
   Kept in sync with PortfolioBuilder → MIFID_PRESETS. */
const MIFID_ALLOC: Record<MifidProfile, [number, number, number]> = {
  conservative: [30, 55, 15],
  balanced:     [15, 35, 50],
  growth:       [10, 20, 70],
  speculative:  [ 5, 15, 80],
};

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
  const legal = opts.locale === "de" ? LEGAL_DE : LEGAL_EN;

  /* Skeena font embedding (self-contained HTML, portable without /fonts/ path) */
  const fontFaceCss = await buildEmbeddedSkeenaCss();

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
    ${fontFaceCss}
    :root{
      --bg:#FAF8F5;--card:#FFFFFF;--text:#20201E;--muted:#6E6B68;--soft:#F5F3F0;
      --accent:#D31220;--accent-soft:rgba(211,18,32,0.08);--border:#E5E1DC;
      --ok:#5A8A50;--warn:#FAC075;
    }
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:var(--bg);color:var(--text);
      font-family:"Skeena",-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
      -webkit-font-smoothing:antialiased;font-size:16px;line-height:1.5;font-feature-settings:"kern","liga","calt"}
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
    .notes-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:4px}
    @media(max-width:720px){.notes-grid{grid-template-columns:1fr}}
    .notes-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 22px;
      box-shadow:0 1px 2px rgba(0,0,0,0.03)}
    .notes-card-accent{border-left:4px solid var(--accent);background:var(--accent-soft)}
    .notes-card-label{font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);
      font-weight:600;margin-bottom:10px}
    .notes-card-body{font-size:15px;line-height:1.6;color:var(--text)}
    .next-steps-list{margin:0;padding-left:22px}
    .next-steps-list li{margin:6px 0;line-height:1.55}
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
    .disclaimer p{margin:0}
    .disclaimer .legal-bullets{margin:0 0 0 20px;padding:0;list-style:disc}
    .disclaimer .legal-bullets li{margin:4px 0;padding-left:4px}
    .footer-meta{margin-top:24px;font-size:11px;color:var(--muted);text-align:center;letter-spacing:0.08em;text-transform:uppercase}
    .liq-inflow{color:var(--ok);font-weight:600}
    .liq-outflow{color:var(--accent);font-weight:600}
    /* MiFID card */
    .mifid-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-top:8px}
    .mifid-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .mifid-tag{display:inline-flex;align-items:center;padding:8px 16px;border-radius:999px;font-weight:700;font-size:15px;letter-spacing:0.01em}
    .mifid-tag.tag-conservative{background:#eaf4e7;color:#3d6c38;border:1px solid #c9e0c4}
    .mifid-tag.tag-balanced{background:#e6f1fa;color:#205782;border:1px solid #bfd7ec}
    .mifid-tag.tag-growth{background:#fdf2e0;color:#8a5a11;border:1px solid #f2dfb7}
    .mifid-tag.tag-speculative{background:#fbe4e6;color:#9a111d;border:1px solid #f0b9bf}
    .mifid-tag.tag-none{background:var(--soft);color:var(--muted);border:1px dashed var(--border)}
    .mifid-alloc{display:flex;gap:6px;align-items:center}
    .mifid-alloc .alloc-pill{padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;color:white;font-variant-numeric:tabular-nums}
    .mifid-alloc .alloc-cash{background:#8FB687}
    .mifid-alloc .alloc-bonds{background:#87BBE6;color:#1f4d78}
    .mifid-alloc .alloc-equity{background:#D31220}
    .mifid-desc{margin-top:16px;padding-top:16px;border-top:1px solid var(--border)}
    .mifid-desc .mifid-why{font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
    .mifid-desc p{margin:0;font-size:15px;line-height:1.55}
    .mifid-confirm{margin-top:14px;padding:12px 14px;border-radius:8px;display:flex;align-items:center;gap:10px;font-size:13px}
    .mifid-confirm.confirmed{background:#eaf4e7;color:#3d6c38}
    .mifid-confirm.unconfirmed{background:#fdf2e0;color:#8a5a11}
    .mifid-confirm .confirm-icon{font-weight:700;font-size:16px}
    /* Trace (individual-path) extras */
    .trace-summary{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
    @media(max-width:720px){.trace-summary{grid-template-columns:1fr}}
    .trace-table{width:100%;border-collapse:collapse;font-size:13px}
    .trace-table th,.trace-table td{padding:8px 10px;border-bottom:1px solid var(--border);white-space:nowrap}
    .trace-table th{background:var(--soft);font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);font-weight:600}
    .trace-table td.num{text-align:right;font-variant-numeric:tabular-nums}
    .trace-table tbody tr:hover{background:rgba(211,18,32,0.03)}
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

  /* ───────── MiFID profile block (customer-friendly) ───────── */
  let mifidBlock = "";
  if (opts.includeMifid !== false) {
    const profile = portfolio.mifidProfile;
    // Name + description lookup — if no profile chosen we still show
    // the guided block (confirmation state + reminder).
    const profileName = profile ? S[`mifid${profile.charAt(0).toUpperCase() + profile.slice(1)}Name` as keyof typeof S] as string : null;
    const profileDesc = profile ? S[`mifid${profile.charAt(0).toUpperCase() + profile.slice(1)}Desc` as keyof typeof S] as string : null;
    const allocStr = profile ? MIFID_ALLOC[profile] : null;

    const confirmed = client.advisoryMifidConfirmed;

    mifidBlock = `
      <section class="section">
        <h2>${esc(S.mifidTitle)}</h2>
        <p class="desc">${esc(S.mifidIntro)}</p>
        <div class="mifid-card">
          <div class="mifid-row">
            <div class="mifid-tag ${profile ? `tag-${profile}` : "tag-none"}">
              ${profile ? esc(profileName!) : (opts.locale === "de" ? "Noch nicht zugewiesen" : "Not yet assigned")}
            </div>
            ${allocStr ? `
              <div class="mifid-alloc" title="${esc(S.mifidAllocation)}">
                <span class="alloc-pill alloc-cash">${allocStr[0]}%</span>
                <span class="alloc-pill alloc-bonds">${allocStr[1]}%</span>
                <span class="alloc-pill alloc-equity">${allocStr[2]}%</span>
              </div>
            ` : ""}
          </div>
          ${profileDesc ? `
            <div class="mifid-desc">
              <div class="mifid-why">${esc(S.mifidWhyMatters)}</div>
              <p>${esc(profileDesc)}</p>
            </div>
          ` : ""}
          <div class="mifid-confirm ${confirmed ? "confirmed" : "unconfirmed"}">
            <span class="confirm-icon">${confirmed ? "✓" : "ℹ"}</span>
            <span>${esc(confirmed ? S.mifidConfirmedYes : S.mifidConfirmedNo)}</span>
          </div>
        </div>
      </section>
    `;
  }

  /* ───────── Private Equity (Topf 4) block ───────── */
  let peBlock = "";
  const peFunds = portfolio.peFunds ?? [];
  if (opts.includePrivateEquity !== false && peFunds.length > 0) {
    const peMode = portfolio.peModelingMode ?? "realistic";
    const totalYears = client.lifeExpectancy - client.currentAge + 1;
    const kestRateFraction = (portfolio.kestRate ?? 27.5) / 100;

    /* Aggregated annual timeline (median for stochastic mode). */
    const timeline = computePETimeline(
      peFunds,
      client.currentAge,
      totalYears,
      kestRateFraction,
      peMode,
    );
    /* p25/p75 NAV bands only available in 'full' mode. */
    let navP25: number[] | undefined;
    let navP75: number[] | undefined;
    let ensembleSuccess: number | null = null;
    let ensembleMedianIRR: number | null = null;
    let ensembleMedianTVPI: number | null = null;
    if (peMode === "full") {
      const ens = buildStochasticEnsemble(
        peFunds,
        client.currentAge,
        totalYears,
        kestRateFraction,
        100,
        12345,
      );
      navP25 = ens.navP25;
      navP75 = ens.navP75;
      ensembleSuccess = ens.successRate;
      ensembleMedianIRR = ens.medianIRRPct;
      ensembleMedianTVPI = ens.medianTVPI;
    }

    const totalCommitment = peFunds.reduce((s, f) => s + f.commitment, 0);
    const totalCalled = timeline.reduce((s, e) => s + e.totalCall, 0);
    const totalDistGross = timeline.reduce((s, e) => s + e.totalDistGross, 0);
    const peakNav = timeline.reduce((m, e) => Math.max(m, e.totalNav), 0);
    const avgTargetIRR =
      peFunds.reduce((s, f) => s + f.irr, 0) / peFunds.length;
    const avgTargetTVPI =
      peFunds.reduce((s, f) => s + f.tvpi, 0) / peFunds.length;

    const modeLabel =
      peMode === "simple"
        ? S.peModeSimple
        : peMode === "full"
          ? S.peModeFull
          : S.peModeRealistic;

    const peSvg = renderPrivateEquitySvg(
      timeline,
      client,
      {
        xAxis: S.axisAge,
        navMedian: peMode === "full" ? S.peChartNavMedian : S.peChartNav,
        navBand: S.peChartNavBand,
        calls: S.peChartCalls,
        distNet: S.peChartDistNet,
      },
      navP25,
      navP75,
      760,
      320,
    );

    const fundRows = peFunds
      .map((f) => {
        return `<tr style="border-top:1px solid var(--border)">
          <td style="padding:10px 12px;font-weight:600">${esc(f.name || "—")}</td>
          <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${fmtEur(opts.locale, f.commitment)}</td>
          <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${f.startAge}</td>
          <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${f.fundDuration} ${opts.locale === "de" ? "Jahre" : "yrs"}</td>
          <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${fmtPct(opts.locale, f.irr)}</td>
          <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${f.tvpi.toFixed(2)}×</td>
        </tr>`;
      })
      .join("");

    const summaryCards = `
      <div class="kpi"><div class="label">${esc(S.peSummaryFunds)}</div><div class="value">${peFunds.length}</div></div>
      <div class="kpi"><div class="label">${esc(S.peSummaryCommitment)}</div><div class="value">${fmtEur(opts.locale, totalCommitment)}</div></div>
      <div class="kpi"><div class="label">${esc(S.peSummaryCalled)}</div><div class="value">${fmtEur(opts.locale, totalCalled)}</div></div>
      <div class="kpi"><div class="label">${esc(S.peSummaryDistGross)}</div><div class="value">${fmtEur(opts.locale, totalDistGross)}</div></div>
      <div class="kpi"><div class="label">${esc(S.peSummaryPeakNav)}</div><div class="value">${fmtEur(opts.locale, peakNav)}</div></div>
      <div class="kpi"><div class="label">${esc(S.peSummaryTargetIRR)}</div><div class="value">${fmtPct(opts.locale, avgTargetIRR)}</div></div>
      <div class="kpi"><div class="label">${esc(S.peSummaryTargetTVPI)}</div><div class="value">${avgTargetTVPI.toFixed(2)}×</div></div>
      <div class="kpi"><div class="label">${esc(S.peModeLabel)}</div><div class="value" style="font-size:14px">${esc(modeLabel)}</div></div>
    `;

    const ensembleCards =
      peMode === "full" && ensembleSuccess !== null
        ? `
        <div class="kpi accent"><div class="label">${esc(S.peEnsembleSuccess)}</div><div class="value">${fmtPct(opts.locale, (ensembleSuccess ?? 0) * 100)}</div></div>
        <div class="kpi"><div class="label">${esc(S.peEnsembleMedianIRR)}</div><div class="value">${fmtPct(opts.locale, ensembleMedianIRR ?? 0)}</div></div>
        <div class="kpi"><div class="label">${esc(S.peEnsembleMedianTVPI)}</div><div class="value">${(ensembleMedianTVPI ?? 0).toFixed(2)}×</div></div>
      `
        : "";

    peBlock = `
      <section class="section">
        <h2>${esc(S.peTitle)}</h2>
        <p class="desc">${esc(S.peDesc)}</p>
        <div class="kpi-grid" style="margin-bottom:16px">
          ${summaryCards}
        </div>
        ${
          ensembleCards
            ? `<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">${ensembleCards}</div>`
            : ""
        }
        <div class="chart-card">
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px">${esc(S.peChartTitle)}</div>
          ${peSvg}
        </div>
        <div class="chart-card" style="padding:0;margin-top:16px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead><tr style="background:var(--soft)">
              <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.peTableName)}</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.peTableCommitment)}</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.peTableStart)}</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.peTableDuration)}</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.peTableIrr)}</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.peTableTvpi)}</th>
            </tr></thead>
            <tbody>${fundRows}</tbody>
          </table>
        </div>
        <div class="notes-card" style="margin-top:16px;border-left:4px solid #7B5BB6;background:rgba(123,91,182,0.06)">
          <div class="notes-card-label" style="color:#7B5BB6">${esc(S.peNoteTitle)}</div>
          <div class="notes-card-body">${esc(S.peNoteBody)}</div>
        </div>
      </section>
    `;
  }

  /* ───────── Saved scenarios block ───────── */
  let scenariosBlock = "";
  const scenarioList = opts.scenarios ?? [];
  const scenariosWithResult = scenarioList.filter((s) => s.result);
  if (opts.includeSavedScenarios !== false && scenariosWithResult.length > 0) {
    const scenSvg = renderScenariosComparisonSvg(scenariosWithResult, client, S.axisAge, 760, 360);
    scenariosBlock = `
      <section class="section">
        <h2>${esc(S.scenariosTitle)}</h2>
        <p class="desc">${esc(S.scenariosDesc)}</p>
        <div class="chart-card">${scenSvg}</div>
        <div class="chart-card" style="padding:0;margin-top:16px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead><tr style="background:var(--soft)">
              <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.scenariosTableScenario)}</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.scenariosTableCapital)}</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.scenariosTableWithdraw)}</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.scenariosTableSuccess)}</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.scenariosTableMedian)}</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.scenariosTableP10)}</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${esc(S.scenariosTableP90)}</th>
            </tr></thead>
            <tbody>${scenariosWithResult.map((s, idx) => {
              const colors = ["#D31220","#87BBE6","#8FB687","#FAC075","#8A83BE","#DA4D3E"];
              const c = colors[idx % colors.length];
              const r = s.result!;
              return `<tr style="border-top:1px solid var(--border)">
                <td style="padding:10px 12px;font-weight:600;color:${c}">${esc(s.name)}</td>
                <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${fmtEur(opts.locale, s.inputs.initialCapital)}</td>
                <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${fmtEur(opts.locale, s.inputs.desiredMonthlyWithdrawal)}</td>
                <td style="padding:10px 12px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:${r.successRate >= 90 ? "var(--ok)" : r.successRate >= 70 ? "#c58a1b" : "var(--accent)"}">${fmtPct(opts.locale, r.successRate)}</td>
                <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${fmtEur(opts.locale, r.medianFinalWealth)}</td>
                <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${fmtEur(opts.locale, r.percentiles?.p10 ?? 0)}</td>
                <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${fmtEur(opts.locale, r.percentiles?.p90 ?? 0)}</td>
              </tr>`;
            }).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  /* ───────── Individual-path block ───────── */
  let detailedBlock = "";
  if (opts.includeDetailedPath !== false && opts.detailedTrace && opts.detailedTrace.rows.length > 0) {
    const trace = opts.detailedTrace;
    const bLabels = {
      cash:     portfolio.buckets[0]?.label?.trim() || (opts.locale === "de" ? "Bargeld" : "Cash"),
      bonds:    portfolio.buckets[1]?.label?.trim() || (opts.locale === "de" ? "Anleihen" : "Bonds"),
      equities: portfolio.buckets[2]?.label?.trim() || (opts.locale === "de" ? "Aktien" : "Equities"),
    };
    const traceSvg = renderDetailedPathSvg(trace, client, bLabels, S.axisAge, 760, 340);

    // depletion age for status text
    let depleteAge = client.lifeExpectancy;
    if (!trace.success) {
      const firstZero = trace.rows.find((r) => r.endTotal <= 0);
      if (firstZero) depleteAge = firstZero.age;
    }
    const depletedMsg = S.detailedDepleted.replace("{age}", String(depleteAge));

    // Year-by-year table (collapsed by default) — sampled at 2-year steps to keep HTML small
    const rows = trace.rows.filter((_r, i) => i % 2 === 0 || i === trace.rows.length - 1);
    const tableRows = rows.map((r) => `
      <tr>
        <td>${r.year}</td>
        <td style="text-align:center">${r.age}</td>
        <td>${r.phase === "Anspar" ? esc(S.phaseAccum) : esc(S.phaseWithdraw)}</td>
        <td class="num">${fmtEur(opts.locale, r.startTotal)}</td>
        <td class="num">${fmtEur(opts.locale, r.endCash)}</td>
        <td class="num">${fmtEur(opts.locale, r.endBonds)}</td>
        <td class="num">${fmtEur(opts.locale, r.endEquities)}</td>
        <td class="num" style="color:${r.cashflow >= 0 ? "var(--ok)" : "var(--accent)"}">${r.cashflow >= 0 ? "+" : ""}${fmtEur(opts.locale, r.cashflow)}</td>
        <td style="text-align:center">${r.rebalanced ? "●" : ""}</td>
        <td class="num" style="font-weight:600">${fmtEur(opts.locale, r.endTotal)}</td>
      </tr>
    `).join("");

    detailedBlock = `
      <section class="section">
        <h2>${esc(S.detailedTitle)}</h2>
        <p class="desc">${esc(S.detailedDesc)}</p>
        <div class="chart-card">${traceSvg}</div>
        <div class="trace-summary">
          <div class="kpi"><div class="label">${esc(S.detailedStatus)}</div>
            <div class="value" style="color:${trace.success ? "var(--ok)" : "var(--accent)"};font-size:16px">
              ${trace.success ? esc(S.detailedSuccess) : esc(depletedMsg)}
            </div>
          </div>
          <div class="kpi"><div class="label">${esc(S.detailedFinalWealth)}</div><div class="value">${fmtEur(opts.locale, trace.finalWealth)}</div></div>
        </div>
        <button class="details-toggle" id="trace-btn" type="button"
          data-show="${esc(S.detailedTableToggle)}" data-hide="${esc(S.detailedTableHideToggle)}">${esc(S.detailedTableToggle)} ▼</button>
        <div class="details" id="trace-table">
          <div class="chart-card" style="padding:0;overflow-x:auto">
            <table class="trace-table">
              <thead><tr>
                <th>${esc(S.detailedColYear)}</th>
                <th>${esc(S.detailedColAge)}</th>
                <th>${esc(S.detailedColPhase)}</th>
                <th class="num">${esc(S.detailedColStart)}</th>
                <th class="num">${esc(bLabels.cash)}</th>
                <th class="num">${esc(bLabels.bonds)}</th>
                <th class="num">${esc(bLabels.equities)}</th>
                <th class="num">${esc(S.detailedColCashflow)}</th>
                <th>${esc(S.detailedColRebal)}</th>
                <th class="num">${esc(S.detailedColEnd)}</th>
              </tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

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

  /* ───────── Meeting notes & next-steps block ───────── */
  const rawMeetingNotes = (client.advisoryNotes ?? "").trim();
  const rawNextSteps    = (client.advisoryNextSteps ?? "").trim();
  const showMeetingNotes = opts.includeMeetingNotes !== false && (rawMeetingNotes.length > 0 || rawNextSteps.length > 0);

  /* Render next-steps body: a proper list if lines start with "-" / "*" / "1." / "•",
     otherwise an escaped paragraph preserving line breaks. */
  function renderNextStepsBody(raw: string): string {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const bulletRe = /^\s*(?:[-*•·]|\d+[.)])\s*/;
    const looksLikeList = lines.length >= 2 && lines.every((l) => bulletRe.test(l));
    if (looksLikeList) {
      const items = lines.map((l) => `<li>${esc(l.replace(bulletRe, ""))}</li>`).join("");
      return `<ol class="next-steps-list">${items}</ol>`;
    }
    return `<p style="white-space:pre-line;margin:0">${esc(raw)}</p>`;
  }

  const meetingNotesBlock = showMeetingNotes ? `
    <section class="section">
      <h2>${esc(S.meetingNotesTitle)}</h2>
      <p class="desc">${esc(S.meetingNotesDesc)}</p>
      <div class="notes-grid">
        ${rawMeetingNotes.length > 0 ? `
          <div class="notes-card">
            <div class="notes-card-label">${esc(S.meetingNotesTitle)}</div>
            <div class="notes-card-body" style="white-space:pre-line">${esc(rawMeetingNotes)}</div>
          </div>` : ""}
        ${rawNextSteps.length > 0 ? `
          <div class="notes-card notes-card-accent">
            <div class="notes-card-label">${esc(S.nextStepsFromMeeting)}</div>
            <div class="notes-card-body">${renderNextStepsBody(rawNextSteps)}</div>
          </div>` : ""}
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
      function bind(btnId, boxId){
        var btn=document.getElementById(btnId);
        var box=document.getElementById(boxId);
        if(!btn||!box)return;
        btn.addEventListener('click',function(){
          var open=box.classList.toggle('open');
          btn.textContent=(open?btn.dataset.hide:btn.dataset.show)+' '+(open?'▲':'▼');
        });
      }
      bind('details-btn','details');
      bind('trace-btn','trace-table');
    })();
  `;

  const interactionScript = chartInteractionScript();

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

    ${mifidBlock}
    ${peBlock}
    ${scenariosBlock}
    ${detailedBlock}
    ${historicalBlock}
    ${liqBlock}
    ${meetingNotesBlock}

    <section class="section">
      <h2>${esc(S.nextSteps)}</h2>
      ${advisorBlock}
      ${detailsBlock}
    </section>

    <div class="disclaimer">
      <h3>${esc(legal.title)}</h3>
      <p>${esc(legal.intro)}</p>
      <p style="margin-top:12px;margin-bottom:6px;">${esc(legal.bulletsLead)}</p>
      <ul class="legal-bullets">
        ${legal.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}
      </ul>
      <p style="margin-top:12px;">${esc(legal.performance)}</p>
      <p style="margin-top:12px;">${esc(legal.liability)}</p>
      <p style="margin-top:12px;">${esc(legal.aiNotice)}</p>
      <p style="margin-top:14px;font-style:italic;"><strong>${opts.locale === "de" ? "Ausgegeben von" : "Issued by"}:</strong> ${esc(advisor.bankName)} &nbsp;·&nbsp; <strong>${opts.locale === "de" ? "Stand" : "As of"}:</strong> ${esc(fmtDate(opts.locale))}</p>
    </div>
    <div class="footer-meta">${esc(S.confidential)}</div>
  </div>
</div>
<script>${pinScript}${detailsScript}${interactionScript}</script>
</body></html>`;

  return new Blob([html], { type: "text/html;charset=utf-8" });
}