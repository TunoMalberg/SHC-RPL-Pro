/**
 * PowerPoint-Export — Abschluss: Erklärfolien, Empfehlungen, Anhang, rechtliche Hinweise.
 * (aus powerpoint.ts ausgelagert, Paket 4)
 */

import type { ClientProfile, FinancialInputs, SimulationResult } from "../../types";
import type { Pptx } from "./shared";
import {
  COLORS,
  FONT_HEADING,
  FONT_BODY,
  fmtPct,
  addSlideFooter,
  addSlideHeader,
} from "./shared";
import { addWithdrawalSlide } from "./results";

export function addEducationalSlides(pptx: Pptx) {
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

export function addRecommendationsSlide(
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

  // EINHEITEN-FIX (AP9): siehe addWithdrawalSlide — Schritt- statt
  // Jahres-Index, Entnahmerate netto (ohne pensionsgedeckten Teil).
  const accYears = client.retirementAge - client.currentAge;
  const totalYearsRec = Math.max(1, client.lifeExpectancy - client.currentAge);
  const stepsPerYearRec = Math.max(1, Math.round((result.medianPath.length - 1) / totalYearsRec));
  const retIdx = Math.min(Math.max(0, accYears) * stepsPerYearRec, result.medianPath.length - 1);
  const capitalAtRet = result.medianPath[retIdx];
  const withdrawalRate = capitalAtRet > 0
    ? (Math.max(0, (inputs.desiredMonthlyWithdrawal ?? result.effectiveMonthlyWithdrawal ?? 0) - inputs.monthlyPension) * 12 / capitalAtRet) * 100
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

export function addAppendixSlide(pptx: Pptx) {
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

export function addMarketingDisclaimerSlide(pptx: Pptx) {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.white };
  addSlideFooter(slide);

  // Red accent bar at top-left
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 0.3, w: 0.12, h: 0.5,
    fill: { color: COLORS.accent },
    line: { type: "none" },
  });

  slide.addText("Rechtlicher Hinweis — Marketingmitteilung", {
    x: 0.75, y: 0.3, w: 12, h: 0.5,
    fontSize: 20, fontFace: FONT_HEADING, color: COLORS.primary, bold: true,
  });

  slide.addText(
    "Hierbei handelt es sich um eine Marketingmitteilung der Schelhammer Capital Bank AG, FN 58248i, " +
      "http://www.schelhammer.at, Goldschmiedgasse 3, 1010 Wien, welche keinesfalls eine anlegergerechte " +
      "Beratung sowie umfassende Risikoaufklärung ersetzt. Es handelt sich weder um ein Anbot oder " +
      "Aufforderung zum Kauf oder Verkauf, noch um eine Einladung zur Angebotslegung, ebenso wenig um " +
      "eine Kauf- bzw. Verkaufsempfehlung. Die Rendite des Investments kann je nach Währungsdomizil " +
      "infolge von Währungsschwankungen fallen oder steigen. Bitte beachten Sie, dass Investitionen " +
      "erheblichen Risiken ausgesetzt sind. Ein Totalverlust des eingesetzten Kapitals ist möglich. " +
      "Wir weisen darauf hin, dass sich die Rechtslage durch Gesetzesänderungen, Steuererlässe, " +
      "Rechtsprechung usw. ändern kann. Es wird keine Gewähr für die Vollständigkeit und Richtigkeit " +
      "der vorliegenden Marketingmitteilung übernommen. Irrtümer und Druckfehler vorbehalten. " +
      "Vergangene Wertentwicklungen sind kein verlässlicher Indikator für zukünftige Ergebnisse.",
    {
      x: 0.75, y: 1.1, w: 11.5, h: 4.7,
      fontSize: 13,
      fontFace: FONT_BODY,
      color: COLORS.text,
      lineSpacing: 20,
      valign: "top",
      paraSpaceAfter: 6,
    }
  );

  // "Stand: TT. Monat JJJJ" — verweist auf den Erstellungsstand der Simulation
  const asOfDate = new Date().toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  slide.addText(`Stand: ${asOfDate}`, {
    x: 0.75, y: 6.15, w: 11.5, h: 0.3,
    fontSize: 10,
    fontFace: FONT_BODY,
    color: COLORS.text,
    italic: true,
    bold: true,
  });

  slide.addText(
    "Schelhammer Capital Bank AG · FN 58248i · Goldschmiedgasse 3, 1010 Wien · www.schelhammer.at",
    {
      x: 0.75, y: 6.45, w: 11.5, h: 0.3,
      fontSize: 9,
      fontFace: FONT_BODY,
      color: COLORS.accent,
      italic: true,
      bold: true,
    }
  );
}
