# Schulungsfeedback-Paket — Änderungen & Abnahme (09/2026)

Umsetzung der 10 Berater-Wünsche aus den Schulungen. Alle fachlichen
Festlegungen (Topf-Architektur, Steuerregeln, Cash-KESt, Szenario-Abruf)
wurden vor der Umsetzung vom Vorstand freigegeben.

## Änderungen je Punkt

| # | Wunsch/Befund | Umsetzung |
|---|---|---|
| 1 | Fixierung von Allokationen | Schloss-Symbol je Topf (Anspar- und Entnahmephase getrennt). Slider-Änderungen verteilen die Differenz nur auf nicht fixierte Töpfe; Summe bleibt 100 %. Reiner Bedienkomfort, wird nicht gespeichert. |
| 2 | „Spekulativ" → „Dynamisch" | Label in App (DE „Dynamisch"/EN „Dynamic") und Kundenbericht geändert. Interne Kennung bleibt — keine Migration; bereits gespeicherte Szenarien behalten ihren alten Namen im Titel. |
| 3 | Dynamische Allokation | Neues Feld im Zwei-Phasen-Bereich: „Wechsel bereits X Jahre vor Pensionsantritt" (0 = wie bisher, Ergebnisse dann bit-identisch). Ab dem Wechsel fließen Sparraten in die Entnahme-Gewichte, rebalanciert wird klassisch auf die Entnahme-Gewichte mit der Entnahme-Schwelle (dieses Feld war bisher ohne Wirkung); die Cash-Puffer-Logik startet mit der Entnahmephase. Umschichtungs-KESt fällt zum Wechselzeitpunkt an. Backtest/PE-Pacing unverändert (nutzen weiterhin die Anspar-Gewichte). |
| 4 | Pensionsbeginn doppelt | Klar getrennte Begriffe: „Pensionsantritt (Beginn der Entnahmephase)" (Kundenprofil) vs. „Beginn der Pensionszahlung (Alter)" (Eingaben). Irreführende Alt-Texte korrigiert; der Frühpensions-Hinweis sagt jetzt ehrlich, dass Zahlungen vor dem Pensionsantritt nicht als Einnahme angerechnet werden. |
| 5 | Szenarien erneut aufrufen | Button „Ergebnis ansehen" auf jeder Szenariokarte: zeigt das gespeicherte Ergebnis sofort im Ergebnis-Reiter (Banner + „Zurück zum aktuellen Ergebnis"), ohne Neusimulation und ohne den Arbeitsstand zu verändern. Bugfix nebenbei: Beim Szenario-Speichern werden Liquiditätsereignisse jetzt mitgerechnet (vorher wichen gespeicherte Ergebnisse vom Hauptlauf ab). |
| 6 | KESt = 0 ohne Wirkung | Ursache: Ergebnisse werden bei Eingabeänderungen nicht automatisch neu gerechnet. Jetzt: deutlicher Hinweis „Eingaben geändert — bitte Simulation neu starten" in Ergebnis- und Vergleichsansicht (Fingerabdruck-Vergleich). Zusätzlich behoben: PE-Karte im Ergebnis-Reiter war auf 27,5 % fest verdrahtet; mehrere Fixtexte und die Methodik-Beschreibung passten nicht zur Rechenlogik. Engine-Test belegt: KESt 0 → höheres Endvermögen nach Neulauf. |
| — | Neue Töpfe (Architektur) | Wohnbauanleihe & Lebensversicherung als **zusätzliche Produkt-Töpfe** neben den drei Kerntöpfen (wie Private Equity) — kein Umbau der geprüften 3-Topf-Rechenlogik. Nicht genutzte Töpfe bleiben leer. |
| 6b | Wohnbauanleihe | Fixkupon zu Nominale, **Zinsen steuerfrei** (jährlich → Liquidität), Mindestlaufzeit 11 Jahre (vorher nicht entnehmbar), Tilgung steuerfrei am Laufzeitende. |
| 6c | Lebensversicherung | Einmalerlag: **4 % Versicherungssteuer + 1 % Einmalkosten** auf den Erlag, **0,075 % p.a.** laufend, Erträge KESt-frei. **Mindestbindung 15 Jahre, ab Kaufalter 50 gesetzlich 10 Jahre** (automatisch abgeleitet, editierbar). Auszahlung steuerfrei, frühestens zum Bindefrist-Ende. Deterministische Modellierung (v1, ohne Schwankung) — dokumentiert. |
| 7 | Pensionsmarker Fan-Chart | Marker saß am Alter der Pensionszahlung statt am Pensionsantritt und verschwand bei bestimmten Konstellationen. Jetzt: Marker „Pensionsantritt" (immer, korrekt geclampt) + zweiter Marker „Pension" nur wenn die Zahlung abweichend beginnt. |
| 8 | Szenarienvergleich in PowerPoint | Neue Folie „Szenarienvergleich" (Tabelle: Erfolgsquote, Median, P10, P90, Max. Drawdown je gespeichertem Szenario). Zudem behoben: fixe Angabe „5.000 Simulationen" → tatsächliche Anzahl. |
| 9 | Entnahme vs. Erfolgsquote | Achse präzisiert („Monatlicher Gesamtbetrag inkl. Pensionseinkünfte"), Tooltip trennt „davon Pension / aus dem Vermögen", Fußnote erklärt die Deckung ab Pensionszahlung. Die „4%-Regel"-Linie erscheint jetzt tatsächlich (nächstliegender Balken; vorher traf sie die Achse nie) inkl. exaktem Wert im Erklärkasten. |
| 10 | KESt Barvermögen | Berechtigter Befund: Zinsen wurden nur bei neuem Portfolio-Höchststand besteuert (faktisch Verrechnung mit Kursverlusten inkl. unbegrenztem Vortrag — real unzulässig). Jetzt: **Zinsen des Liquiditäts-Topfs werden jährlich bei Zufluss besteuert**, eigener Satz „KESt Bankeinlagen" (Default 25 %, editierbar), ohne Verrechnung mit Kursverlusten; Wertpapiere bleiben beim Höchststand-Modell. Gilt in Monte-Carlo, Einzelpfad und historischem Backtest. |

## Begründete Abweichungen vom Produktivbestand

- **Cash-Zins-KESt (Punkt 10)**: Ergebnisse aller Pläne ändern sich leicht
  (realistischer, tendenziell konservativer). Fachlich freigegeben.
- **Entnahmerate/„Kapital bei Pensionsantritt"**: Einheiten-Fehler bei
  monatlichem Simulationsschritt behoben (Index Monat statt Jahr) und
  Entnahmerate auf den Vermögensanteil (ohne pensionsgedeckten Teil)
  umgestellt — vorher überzeichnet.
- **Einzelpfad**: Wechsel-Logik strukturell an die Hauptsimulation
  angeglichen (identisches Verhalten bei X = 0, per Test belegt).

## Nicht enthalten (bewusst)

- Produkt-Töpfe und PE sind im historischen Backtest nicht enthalten
  (Hinweistext ergänzt) — dafür gibt es keine historischen Serien.
- Voller Umbau auf beliebig viele Kerntöpfe: eigener Change Request
  (~40 verdrahtete Stellen in Engine, Optimizer, Exporten).
- LV-Rückkauf vor Bindefrist-Ende (Nachversteuerungsmodell): v1 sperrt
  die Entnahme vollständig.

## Tests

278/278 grün (36 neue): Produkt-Schedules und Steuer-Neutralität
(steuerfreie Kupons/Abläufe lösen keine Höchststand-KESt aus),
Cash-KESt exakt (inkl. Negativzins, Satz 0, Backtest-Parität),
früher Wechsel (X = 0 bit-identisch, Wechseljahr, Sparraten-Gewichte,
Entnahme-Schwelle wirkt), KESt-0-Wirkung, Fingerabdruck, Validierung
(Mindestlaufzeit 11 J, gesetzliche Bindefrist), Labels DE/EN.

## Abnahme (Klickstrecke)

1. **Portfolio (Pro)**: Schloss an einem Topf setzen → anderen Slider
   bewegen → fixierter Wert bleibt. MiFID-Kachel heißt „Dynamisch".
   Zwei-Phasen aktivieren → Feld „Wechsel bereits X Jahre …" (z. B. 5 →
   „Wechsel mit Alter 60"). Felder „KESt (%)"/„KESt Bankeinlagen (%)".
   Produkt-Karte: Wohnbauanleihe (Kupon-Hinweis, Tilgungsalter) und
   Fondspolizze (Basis 95 %, Bindung 15 J; Kaufalter ≥ 50 → 10 J).
2. **Eingaben**: Labels „Pensionsantritt …" (Kundenprofil) vs. „Beginn
   der Pensionszahlung (Alter)".
3. **Simulation starten → Ergebnisse**: Fan-Chart-Marker „Pensionsantritt";
   Heatmap mit Gesamtbetrag-Achse, Tooltip-Split, „≈ 4%-Regel"-Markierung.
   Danach KESt im Portfolio auf 0 → Ergebnis-Reiter zeigt gelben
   Hinweis „… bitte Simulation neu starten"; Neulauf → höheres Endvermögen.
4. **Szenarien**: speichern → „Ergebnis ansehen" → Banner + „Zurück".
5. **Berater-Export**: PowerPoint mit gespeicherten Szenarien →
   Folie „Szenarienvergleich".
