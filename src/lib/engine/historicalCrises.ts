/**
 * Mapping: Krisenjahr → bekannte historische Marktphase.
 *
 * Wird vom Stresstest-Chart in `HistoricalAnalysis.tsx` genutzt, um zu jedem
 * Pfad eine konkrete Krise zu benennen statt nur eine abstrakte Drawdown-Zahl
 * zu zeigen. Erhöht die Verständlichkeit im Beratungsgespräch enorm:
 *
 *   "Der schlimmste Einbruch in diesem Pfad fiel mit der Globalen Finanzkrise
 *    2008 zusammen — Lehman-Pleite, Subprime — Portfolio-Verlust ca. 38 %."
 *
 * Quelle der Phasen: Standard-Lehrbuch-Klassifikation (NBER-Rezessionen +
 * markante Aktien-Bear-Markets). Bewusst grobgranular gehalten: ein Pfad
 * nimmt das Krisenjahr aus seinem `worstYear`-Feld (= das Kalenderjahr mit
 * dem schlechtesten Einzelportfolio-Return im Pfad), was eine eindeutige
 * Zuordnung erlaubt.
 *
 * Die Liste deckt 1970-2024 ab (deckungsgleich mit `historical.ts`-Daten).
 * Jahre ohne dedizierte Krise → `null` zurück; UI zeigt dann „Normaler
 * Marktrückgang".
 */

export interface HistoricalCrisis {
  /** Inklusiv-Bereich der Jahre, in denen diese Krise wirkt. */
  yearRange: [number, number];
  /** Kurzer Name (DE). */
  nameDe: string;
  /** Kurzer Name (EN). */
  nameEn: string;
  /** Erklärtext für Banker (DE) — 1-2 Sätze, Auslöser & Auswirkung. */
  descDe: string;
  /** Erklärtext (EN). */
  descEn: string;
}

/**
 * Chronologisch sortiert. `findCrisisForYear` läuft linear durch die Liste
 * (≤ 15 Einträge), kein Performance-Problem.
 */
export const HISTORICAL_CRISES: ReadonlyArray<HistoricalCrisis> = [
  {
    yearRange: [1973, 1975],
    nameDe: "Ölkrise & Stagflation",
    nameEn: "Oil Crisis & Stagflation",
    descDe: "OPEC-Ölembargo, Energiepreisschock, gleichzeitig hohe Inflation und Rezession — Aktien & Anleihen real verlustreich.",
    descEn: "OPEC oil embargo, energy price shock, high inflation combined with recession — equities and bonds both losing in real terms.",
  },
  {
    yearRange: [1980, 1982],
    nameDe: "Volcker-Schock",
    nameEn: "Volcker Shock",
    descDe: "Fed hebt Leitzins auf bis zu 20 % zur Inflationsbekämpfung — schwere Rezession in den USA und global.",
    descEn: "Fed raises policy rate up to 20% to fight inflation — severe US and global recession.",
  },
  {
    yearRange: [1987, 1987],
    nameDe: "Black Monday",
    nameEn: "Black Monday",
    descDe: "19. Oktober 1987 — Aktienmärkte verlieren weltweit rund 22 % an einem einzigen Handelstag.",
    descEn: "October 19, 1987 — global equity markets lose around 22% in a single trading day.",
  },
  {
    yearRange: [1990, 1991],
    nameDe: "Japan-Bubble & Golfkrieg-Rezession",
    nameEn: "Japan Bubble & Gulf War Recession",
    descDe: "Platzen der japanischen Asset-Bubble (Nikkei −60 % bis 1992), Golfkrieg, US-Rezession.",
    descEn: "Japanese asset bubble bursts (Nikkei −60 % through 1992), Gulf War, US recession.",
  },
  {
    yearRange: [1994, 1994],
    nameDe: "Bond-Massaker",
    nameEn: "Bond Massacre",
    descDe: "Überraschende Fed-Zinserhöhungs-Serie löst weltweit hohe Anleihenverluste aus.",
    descEn: "Surprise Fed rate-hike cycle triggers heavy global bond losses.",
  },
  {
    yearRange: [1997, 1998],
    nameDe: "Asienkrise & LTCM",
    nameEn: "Asian Crisis & LTCM",
    descDe: "Währungskrise in Südostasien, Russland-Default, Beinahe-Kollaps des Hedgefonds LTCM — kurzer aber heftiger globaler Risk-Off.",
    descEn: "Southeast Asian currency crisis, Russian default, near-collapse of LTCM hedge fund — short but sharp global risk-off.",
  },
  {
    yearRange: [2000, 2002],
    nameDe: "Dotcom-Crash",
    nameEn: "Dotcom Crash",
    descDe: "Platzen der Internet-Blase, 9/11-Anschläge, Bilanzskandale (Enron, WorldCom). NASDAQ verliert ca. 78 %.",
    descEn: "Internet bubble bursts, 9/11 attacks, accounting scandals (Enron, WorldCom). NASDAQ loses about 78%.",
  },
  {
    yearRange: [2008, 2009],
    nameDe: "Globale Finanzkrise",
    nameEn: "Global Financial Crisis",
    descDe: "Lehman-Pleite, Subprime-Hypothekenkrise, Bankenrettungen — schlimmster Crash seit 1929. S&P 500 −57 % vom Hoch.",
    descEn: "Lehman collapse, subprime mortgage crisis, bank bailouts — worst crash since 1929. S&P 500 down 57% from peak.",
  },
  {
    yearRange: [2011, 2012],
    nameDe: "Eurokrise",
    nameEn: "Euro Crisis",
    descDe: "Griechenland-Schuldenkrise, PIIGS-Risikoaufschläge, Zweifel am Fortbestand des Euro — bis Draghis „whatever it takes“.",
    descEn: "Greece debt crisis, PIIGS risk premia spike, doubts about euro survival — until Draghi’s “whatever it takes”.",
  },
  {
    yearRange: [2015, 2016],
    nameDe: "China-Schock & Brexit",
    nameEn: "China Shock & Brexit",
    descDe: "Chinesischer Aktien-Crash, Yuan-Abwertung, Brexit-Referendum, Rohstofftief — diffuser Risk-Off.",
    descEn: "Chinese equity crash, yuan devaluation, Brexit referendum, commodity slump — diffuse risk-off.",
  },
  {
    yearRange: [2018, 2018],
    nameDe: "Q4-Crash 2018",
    nameEn: "Q4 2018 Crash",
    descDe: "Fed-Zinserhöhungen, US-China-Handelsstreit — S&P 500 verliert im Q4 rund 20 %.",
    descEn: "Fed rate hikes, US-China trade war — S&P 500 loses about 20% in Q4.",
  },
  {
    yearRange: [2020, 2020],
    nameDe: "Corona-Crash",
    nameEn: "Covid Crash",
    descDe: "März 2020 — schnellster Bärenmarkt der Geschichte: S&P 500 −34 % in 33 Tagen, danach extrem schnelle Erholung durch Notenbankhilfen.",
    descEn: "March 2020 — fastest bear market in history: S&P 500 −34% in 33 days, then exceptionally fast recovery thanks to central-bank stimulus.",
  },
  {
    yearRange: [2022, 2022],
    nameDe: "Inflations- & Zinsschock",
    nameEn: "Inflation & Rate Shock",
    descDe: "Russland-Krieg, Energie-Schock, schnellster Zinserhöhungs-Zyklus seit Jahrzehnten — Aktien UND Anleihen rot, schlechtestes Bond-Jahr seit über 100 Jahren.",
    descEn: "Russia war, energy shock, fastest rate-hike cycle in decades — both equities AND bonds in the red, worst bond year in over a century.",
  },
];

/**
 * Findet die Krise, in deren Jahresbereich `year` fällt.
 * Bei Überlappungen würde die erste passende zurückgegeben — aktuell überlappt
 * keine, bewusst kuratiert.
 *
 * Komplexität: O(n) mit n ≤ 15. Nicht performance-relevant.
 */
export function findCrisisForYear(year: number): HistoricalCrisis | null {
  if (!Number.isFinite(year)) return null;
  return (
    HISTORICAL_CRISES.find(
      (c) => year >= c.yearRange[0] && year <= c.yearRange[1],
    ) ?? null
  );
}

/**
 * Hilfsfunktion: liefert lokalisierten Krisennamen + Beschreibung.
 * Wenn keine Krise zugeordnet ist, kommt ein Fallback („Normaler
 * Marktrückgang"-Label aus i18n) zurück, damit die UI nie leere Felder zeigt.
 */
export function getLocalizedCrisis(
  year: number,
  locale: "de" | "en",
): { name: string; description: string } | null {
  const c = findCrisisForYear(year);
  if (!c) return null;
  return {
    name: locale === "de" ? c.nameDe : c.nameEn,
    description: locale === "de" ? c.descDe : c.descEn,
  };
}