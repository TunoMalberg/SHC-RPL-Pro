/**
 * Drehbuch — Schulungsvideo 2 „Probepension" (Ruhestandsplaner PRO).
 *
 * Kundenfall (frei erfunden, nur Beispieldaten): Dr. Michael Huber, 60,
 * Geschäftsführer, Pension mit 65, Planung bis 92, 3,5 Mio. € veranlagt,
 * Sparrate 5.000 €, staatliche Pension 3.500 €. Wunsch: zusätzlich
 * 10.000 € pro Monat aus dem Depot, in heutiger Kaufkraft.
 *
 * Aufbau wie das Schulungsvideo der Vermögensnachfolge („Probesterben"):
 * je Szene ein Bild und ein Sprechertext. Texte mit {Platzhaltern} werden
 * während der Aufnahme mit den Werten befüllt, die die App anzeigt.
 * Sprache: österreichisches Deutsch, Sie-Form, kurze Sätze.
 */

export interface Szene {
  id: string;
  kap: string;
  titel: string;
  /** Titel- oder Schlussfolie statt App-Bild. */
  slide?: "intro" | "outro";
  text: string;
}

export const SZENEN: Szene[] = [
  {
    id: "intro", kap: "Warum", titel: "Probepension", slide: "intro",
    text: "Willkommen zur Schulung Probepension mit dem Ruhestandsplaner PRO der Schelhammer Capital. Die Idee ist einfach: Ihr Kunde tritt seine Pension heute schon einmal probeweise an, fünf Jahre bevor es ernst wird. Er sieht schwarz auf weiß, ob sein Wunsch trägt. Und weil fünf Jahre bleiben, kann er noch gegensteuern. Genau das ist der Mehrwert, den Sie mit der App liefern.",
  },
  {
    id: "kunde", kap: "Der Fall", titel: "Dr. Michael Huber, 60",
    text: "Unser Fall: Dr. Michael Huber, sechzig Jahre alt, Geschäftsführer. Ein Beispielfall, die Daten sind frei erfunden. Er möchte mit fünfundsechzig in Pension gehen. Geplant wird bis zweiundneunzig, also für siebenundzwanzig Jahre Ruhestand.",
  },
  {
    id: "eingaben", kap: "Der Fall", titel: "Vermögen und Wunsch",
    text: "Herr Huber hat dreieinhalb Millionen Euro veranlagt und legt bis zur Pension noch fünftausend Euro im Monat zur Seite. Seine staatliche Pension beträgt dreitausendfünfhundert Euro. Sein Wunsch: zusätzlich zehntausend Euro im Monat aus dem Depot. Wir erfassen deshalb einen Gesamtbedarf von dreizehntausendfünfhundert Euro, in heutiger Kaufkraft.",
  },
  {
    id: "inflation", kap: "Der Fall", titel: "Was 10.000 € in Zukunft bedeuten",
    text: "Hier zeigt die App den ersten Aha-Moment. Bei zweieinhalb Prozent Inflation werden aus den dreizehntausendfünfhundert Euro von heute bis zum Pensionsantritt {startMonat} Euro im Monat. Mit zweiundneunzig wäre es mehr als das Doppelte von heute. Diesen Effekt unterschätzt fast jeder Kunde.",
  },
  {
    id: "portfolio", kap: "Der Fall", titel: "Heutiges Portfolio: sehr vorsichtig",
    text: "Herr Huber ist heute sehr vorsichtig veranlagt: {cash} Prozent Liquidität, {bonds} Prozent Anleihen und nur {equities} Prozent Aktien. Wir bilden das im Reiter Portfolio ab, ausgehend vom Profil Konservativ.",
  },
  {
    id: "ergebnis", kap: "Probepension I", titel: "Die Erfolgsquote",
    text: "Jetzt die Probepension. Die App spielt zehntausend mögliche Marktverläufe durch, mit Kosten, Steuern und Inflation. Das Ergebnis: Nur in {erfolg} Prozent der Verläufe reicht das Geld bis zweiundneunzig. Anders gesagt: In etwa jedem {jeder} Verlauf geht Herrn Huber das Geld vorher aus.",
  },
  {
    id: "korridor", kap: "Probepension I", titel: "Was das Vermögen wirklich trägt",
    text: "Der Planungskorridor übersetzt das in Euro. Bei typischer Marktentwicklung trägt das Vermögen {korridorTypisch} Euro im Monat zusätzlich zur Pension, bei schwieriger Entwicklung nur {korridorSchwierig} Euro. Herr Huber wünscht sich zehntausend. {korridorSatz}",
  },
  {
    id: "luecke", kap: "Probepension I", titel: "Die Lücke in Zahlen",
    text: "Die Gap-Analyse nennt die Lücke konkret. Für neunzig Prozent Sicherheit tragen Vermögen und Pension zusammen {tragbar90} Euro im Monat. Aus dem Depot wären das nur {ausDepot90} Euro statt zehntausend. Darunter stehen die Hebel, um die Lücke zu schließen. Genau die prüfen wir gleich, einen nach dem anderen.",
  },
  {
    id: "faecher", kap: "Probepension I", titel: "Die Bandbreite",
    text: "Das Fächerdiagramm zeigt die Bandbreite der Vermögensentwicklung, in heutiger Kaufkraft. Die rote Linie ist der Median, der dunkle Bereich umfasst die mittlere Hälfte aller Verläufe. Die senkrechte Linie markiert den Pensionsantritt. Ab da zehrt die Entnahme das Vermögen auf.",
  },
  {
    id: "worstcase", kap: "Probepension I", titel: "Wenn es schlecht läuft",
    text: "Was heißt das konkret? Der Reiter Einzelpfad zeigt den ungünstigsten Marktverlauf Jahr für Jahr. {leerSatz} Das ist der Moment, in dem Ihr Kunde versteht, warum sich die nächsten fünf Jahre lohnen.",
  },
  {
    id: "hebelPortfolio", kap: "Hebel 1", titel: "Das Portfolio",
    text: "Erster Hebel: das Portfolio. Die Optimierung prüft rund zweihundert Aufteilungen, Private Equity schalten wir dabei aus. In der Optimierung erreicht die beste Aufteilung {best} Prozent, das heutige Portfolio {baseline} Prozent. Ein Fortschritt, aber das Portfolio allein schließt die Lücke nicht. Auch das ist eine wichtige Erkenntnis: Mehr Aktien sind hier nicht automatisch die Lösung.",
  },
  {
    id: "hebelPension", kap: "Hebel 2", titel: "Ein Jahr später in Pension",
    text: "Zweiter Hebel: der Pensionsantritt. Wir rechnen mit sechsundsechzig statt fünfundsechzig. Ein Jahr länger sparen, ein Jahr kürzer entnehmen. Die Erfolgsquote steigt von {vorher} auf {erfolg} Prozent. Ein einziges Jahr wirkt hier stärker als jede Umschichtung.",
  },
  {
    id: "hebelSparen", kap: "Hebel 3", titel: "Mehr sparen in den letzten Jahren",
    text: "Dritter Hebel: die Sparrate. Legt Herr Huber bis zur Pension achttausend statt fünftausend Euro im Monat zur Seite, steigt die Erfolgsquote auf {erfolg} Prozent. Der Wunsch von zehntausend Euro bleibt dabei unverändert.",
  },
  {
    id: "planOptimiert", kap: "Der Plan", titel: "Zum Schluss optimieren",
    text: "Zum Schluss optimieren wir das Portfolio noch einmal, diesmal für den fertigen Plan. Ein wichtiger Tipp für Ihre Praxis: Optimieren Sie immer zuletzt, denn die beste Aufteilung hängt vom ganzen Plan ab. Nach Übernehmen und neuer Simulation liegt die Erfolgsquote bei {erfolg} Prozent.",
  },
  {
    id: "vorherNachher", kap: "Probepension II", titel: "Vorher und nachher",
    text: "Probepension, die zweite. Die Szenario-Übersicht zeigt alle Schritte nebeneinander: von {heute} Prozent mit dem heutigen Plan auf {plan} Prozent. Mit demselben Wunsch von zehntausend Euro im Monat. Herr Huber sieht auf einen Blick, was ihm ein Jahr später, etwas mehr Sparen und ein passendes Portfolio bringen.",
  },
  {
    id: "historie", kap: "Gegenprobe", titel: "Echte Börsengeschichte",
    text: "Zur Gegenprobe rechnet der Reiter Historie den Plan mit echten Marktdaten seit neunzehnhundertsiebzig durch. Die Karte zeigt, welche Monatsentnahme im ungünstigsten Startjahr gerade noch gereicht hätte. {histSatz} So verbinden Sie Wahrscheinlichkeiten mit Erfahrungen, die Ihr Kunde selbst erlebt hat.",
  },
  {
    id: "bericht", kap: "Dokumentation", titel: "Kundenbericht",
    text: "In der Kundenansicht erstellen Sie den Kundenbericht, als PDF oder als interaktive Webseite, auf Wunsch mit allen gespeicherten Szenarien. Er hält Wunsch, Lücke und den vereinbarten Plan fest. Für Ihre Unterlagen gibt es zusätzlich Excel und PowerPoint.",
  },
  {
    id: "outro", kap: "Ihr Gespräch", titel: "Der Gesprächseinstieg", slide: "outro",
    text: "Ihr Einstieg ins nächste Gespräch mit Kunden kurz vor der Pension: Wollen wir Ihre Pension einmal probeweise antreten? In einer Stunde sieht Ihr Kunde, ob sein Wunsch trägt, und welcher Hebel wirklich wirkt. Zum Schluss wichtig: Die App rechnet mit Annahmen und Wahrscheinlichkeiten. Sie ersetzt keine individuelle Beratung und gibt keine Anlageempfehlung. Viel Erfolg!",
  },
];

/** Platzhalter {name} durch Werte ersetzen. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in values)) throw new Error(`Platzhalter {${k}} ohne Wert`);
    return String(values[k]);
  });
}
