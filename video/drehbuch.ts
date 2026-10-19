/**
 * Drehbuch — Schulungsvideo „Ruhestandsplaner PRO" für Beraterinnen und
 * Berater im Private Banking.
 *
 * Kundenfall (frei erfunden, nur Beispieldaten): Herr Thomas Berger, 48,
 * Pension mit 62, Lebenserwartung 92, 500.000 € Vermögen, Sparrate 2.000 €,
 * Pension 2.400 €, Wunsch 4.500 € pro Monat. Heutige Aufteilung sehr
 * vorsichtig: 40 % Liquidität, 45 % Anleihen, 15 % Aktien.
 *
 * Texte mit {Platzhaltern} werden während der Aufnahme mit den Werten
 * befüllt, die die App tatsächlich anzeigt — Bild und Ton passen immer.
 * Sprache: österreichisches Deutsch, Sie-Form, kurze Sätze (gut vertonbar).
 */

export const DREHBUCH = {
  intro: [
    "Willkommen zur Schulung Ruhestandsplaner PRO der Schelhammer Capital Bank.",
    "In den nächsten zehn Minuten begleiten wir einen Kundenfall von der ersten Eingabe bis zum Kundenbericht. Sie sehen dabei, wie Sie mit der App nachvollziehbar zeigen, welches Portfolio zum Ruhestand Ihres Kunden passt, und welchen Vorteil die Optimierung bringt.",
  ],

  kundeIntro:
    "Unser Kunde ist Herr Thomas Berger, achtundvierzig Jahre alt. Ein Beispielfall, die Daten sind frei erfunden. Herr Berger möchte mit zweiundsechzig in Pension gehen. Wir planen bis zum Alter von zweiundneunzig.",
  kundeFelder:
    "Im Reiter Kunde erfassen wir Name, Alter, Pensionsantritt und Planungshorizont. Das Geburtsjahr rechnet die App aus dem Alter selbst aus.",

  eingabenIntro:
    "Im Reiter Eingaben folgen die Zahlen. Herr Berger hat fünfhunderttausend Euro veranlagt und spart monatlich zweitausend Euro dazu.",
  eingabenWunsch:
    "In der Pension wünscht er sich viertausendfünfhundert Euro im Monat, in heutiger Kaufkraft. Die staatliche Pension von zweitausendvierhundert Euro ab zweiundsechzig ziehen wir ab. Aus dem Vermögen müssen also jeden Monat rund zweitausendeinhundert Euro kommen.",
  eingabenInflation:
    "Alle Beträge geben Sie aus heutiger Sicht ein. Die Inflation von zweieinhalb Prozent rechnet die App automatisch mit.",

  portfolioIntro:
    "Im Reiter Portfolio bilden wir ab, wie Herr Berger heute veranlagt ist. Wir starten mit dem Profil Konservativ.",
  portfolioAnpassen:
    "Herr Berger hält vierzig Prozent auf dem Sparbuch, fünfundvierzig Prozent in Anleihen und nur fünfzehn Prozent in Aktien. Wir sperren den Aktienanteil mit dem Schloss und erhöhen die Liquidität. Die Summe bleibt dabei immer bei hundert Prozent.",

  simulationIntro:
    "Jetzt rechnen wir. Im Reiter Simulation setzen wir einen festen Startwert. So bekommen Sie bei jeder Wiederholung dieselben Zahlen, das ist für Gespräche und Dokumentation wichtig.",
  simulationLaeuft:
    "Die App spielt zehntausend mögliche Marktverläufe durch, mit Kosten, Kapitalertragsteuer und Inflation. Die Rechnung läuft im Hintergrund, die Oberfläche bleibt bedienbar.",

  ergebnisHeute:
    "Das Ergebnis für das heutige Portfolio: In {erfolg} Prozent der Marktverläufe reicht das Vermögen bis zum Lebensende. Für einen Ruhestandsplan ist das zu wenig.",
  ergebnisKorridor:
    "Besonders wichtig ist der Planungskorridor. Er zeigt, wie viel das Vermögen monatlich tragen kann, zusätzlich zur Pension. Bei typischer Marktentwicklung sind das {korridorTypisch} Euro, bei schwieriger Entwicklung {korridorSchwierig} Euro. Herr Berger braucht aber rund zweitausendeinhundert.",
  ergebnisFaecher:
    "Das Fächerdiagramm zeigt die Bandbreite der Vermögensentwicklung. Die rote Linie markiert den Pensionsantritt.",

  szenarioHeute:
    "Diesen Stand speichern wir als Szenario. So können wir ihn später direkt mit Alternativen vergleichen.",

  vergleichIntro:
    "Ist das heutige Portfolio das richtige? Der Reiter Vergleich stellt es einer Zielstrategie gegenüber, hier dem MiFID-Profil Ausgewogen.",
  vergleichErgebnis:
    "Mit dem ausgewogenen Profil steigt die Erfolgsquote von {heute} auf {ausgewogen} Prozent. Der Vergleich zeigt außerdem, was ganz ohne Veranlagung übrig bliebe. Das macht den Wert der Veranlagung für den Kunden sichtbar.",

  optimierungIntro:
    "Geht es noch besser? Der Reiter Optimierung prüft automatisch rund zweihundert Aufteilungen und bewertet die besten mit fünftausend Marktverläufen nach.",
  optimierungEinstellen:
    "Als Ziel wählen wir: Erfolgsquote maximieren. Private Equity schalten wir für diese Beratung aus. Es wird in der Optimierung vereinfacht ohne Kursschwankung gerechnet und würde das Ergebnis zu günstig darstellen.",
  optimierungLaeuft: "Die Suche dauert nur wenige Sekunden.",
  optimierungErgebnis:
    "Das Ergebnis: Die beste Aufteilung liegt bei {cash} Prozent Liquidität, {bonds} Prozent Anleihen und {equities} Prozent Aktien. Die Erfolgsquote steigt damit von {baseline} auf {best} Prozent.",
  optimierungEinordnung:
    "Wichtig für Ihr Gespräch: Gegenüber dem heutigen, sehr vorsichtigen Portfolio ist der Fortschritt groß. Gegenüber einem guten Standardprofil ist er klein. Die Optimierung bestätigt also vor allem die Richtung. Mehr Sparbuch bedeutet hier nicht mehr Sicherheit, denn ohne Ertrag zehrt die Inflation den Ruhestand auf.",
  optimierungUebernehmen:
    "Mit Übernehmen wird die Aufteilung ins Portfolio geschrieben. Danach rechnen wir die volle Simulation neu.",

  ergebnisOptimiert:
    "Mit dem optimierten Portfolio liegt die Erfolgsquote jetzt bei {erfolg} Prozent. Der Planungskorridor steigt bei typischer Marktentwicklung auf {korridorTypisch} Euro im Monat.",
  ergebnisGespraech:
    "Für das Gespräch heißt das: Das Portfolio sollte stärker auf Ertrag ausgerichtet werden. Und der Korridor zeigt ehrlich, welcher Entnahmewunsch realistisch ist. Hier können Sie mit Herrn Berger über eine etwas niedrigere Entnahme oder eine längere Sparphase sprechen.",

  szenarioOptimiert:
    "Auch diesen Stand speichern wir. Die Szenario-Übersicht zeigt beide Varianten nebeneinander, mit Erfolgsquote, Endvermögen und Bandbreite.",

  einzelpfad:
    "Der Reiter Einzelpfad macht einen einzelnen Marktverlauf Jahr für Jahr nachvollziehbar. Mit Worst Case sehen Sie den ungünstigsten Verlauf: Renditen, Entnahmen, Umschichtungen und Steuern, jede Buchung einzeln. So beantworten Sie die Frage: Was passiert, wenn es richtig schlecht läuft?",

  historie:
    "Die Historie prüft den Plan mit echten Marktdaten seit neunzehnhundertsiebzig. Die Karte Historisch tragbare Monatsentnahme zeigt, welcher Betrag im ungünstigsten Startjahr gerade noch gereicht hätte.",

  kundenansicht:
    "In der Kundenansicht bereiten Sie die Ergebnisse für Herrn Berger auf. Nach Eingabe Ihres Beraterprofils erstellen Sie den Kundenbericht als PDF oder als interaktive Webseite. Für Ihre Unterlagen gibt es im Berater-Export zusätzlich Excel und PowerPoint.",

  outro: [
    "Zusammengefasst: Erfassen Sie Kunde, Eingaben und heutiges Portfolio. Rechnen Sie, lesen Sie Erfolgsquote und Planungskorridor. Vergleichen und optimieren Sie, und dokumentieren Sie die Varianten als Szenarien.",
    "Bitte beachten Sie: Die App rechnet mit Annahmen und Wahrscheinlichkeiten. Sie ersetzt keine individuelle Beratung und gibt keine Anlageempfehlung. Viel Erfolg in Ihren Kundengesprächen.",
  ],
} as const;

/** Kapitel-Überschriften für die Einblendung oben rechts. */
export const KAPITEL = [
  "Einführung",
  "1 · Kunde",
  "2 · Eingaben",
  "3 · Heutiges Portfolio",
  "4 · Simulation",
  "5 · Ergebnis & Planungskorridor",
  "6 · Vergleich",
  "7 · Optimierung",
  "8 · Ergebnis optimiert",
  "9 · Einzelpfad & Historie",
  "10 · Kundenbericht",
  "Zusammenfassung",
] as const;

/** Platzhalter {name} durch Werte ersetzen. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}
