# Abnahmeanleitung — CR „Heutige Kaufkraft, Planungskorridor & Vergleichsansicht"

Kurze Klick-Anleitung je CR-Punkt. Vorbereitung: App starten (`bun run dev` bzw. Deployment öffnen), Modus Klassik oder Pro.

| CR | Prüfschritt | Erwartung |
|---|---|---|
| 1 | — | Gap-Check im Abschlussbericht des CR |
| 2 | Tab **Eingaben** | Bestehende Felder wiederverwendet; „Benötigt aus dem Vermögen" ist Read-only-Anzeige, keine zweite Eingabemaske |
| 3 | Tab **Eingaben**, Karte „Entnahmen & Pension" | Labels exakt: „Gewünschter monatlicher Gesamtbetrag in heutiger Kaufkraft (€)", „Welche laufenden (Pensions-)Einkünfte erwarten Sie?", „Benötigt aus dem Vermögen in heutiger Kaufkraft"; grüner Hinweis „Bitte geben Sie die Beträge aus heutiger Sicht ein…" sichtbar |
| 4 | Wunschbetrag-Feld leeren → Simulation starten | Ergebnis zeigt „Berechnet, was möglich ist" + mögliche Monatsentnahme je Marktentwicklung; keine Erfolgsquote, keine Einordnung, keine Gap-Analyse |
| 5 | Tab **Eingaben**, Karte „Liquiditätsereignisse" | Zwei Abschnitte „Zusätzliche Einnahmen"/„Zusätzliche Ausgaben" mit den CR-Beispielen; Ausgaben werden positiv eingegeben; obere Monats-Eingaben unverändert oben |
| 6 | Header-Badge klicken (Heutige Kaufkraft ⇄ Nominal) | Alle Ergebnisdarstellungen wechseln; Nominalwerte stets mit Jahr (z. B. „nominal (Jahr 2070)"), Realwerte stets „in heutiger Kaufkraft"; Badge dauerhaft sichtbar |
| 7 | Ergebnis-Tab, Korridor-Karte + Vergleich | Label „Monatsentnahme in heutiger Kaufkraft"; nach Badge-Umschaltung „Monatsentnahme nominal (Jahr X)" |
| 8 | Volltextsuche UI/Report | Kein „Lebensstandard"; neutrale Begriffe (automatisiert getestet: `i18n.test.ts`) |
| 9 | Ergebnis-Tab, Korridor-Karte | Drei Werte schwierig/typisch/günstig; Perzentile zentral in `displayConfig.ts` (25/50/75) |
| 10 | Wunschbetrag > Pension erfassen → Simulation | Einordnungszeile „Benötigt aus dem Vermögen: … €" gegen die drei Korridor-Werte; keine weiteren Schwellenwerte |
| 11 | `src/lib/displayConfig.ts` | Alle CR-Werte wie spezifiziert, `version` gesetzt |
| 12/15 | Tab **Vergleich** → Zielstrategie wählen → „Vergleich berechnen" | Drei getrennte Karten (Baseline/Bestand/Ziel) mit Ertragserwartung (nominal+real), Endwert nominal (mit Jahr), Wert in heutiger Kaufkraft, Monatsentnahme, Korridor, Einordnung bzw. „was möglich", Konsequenz-Karte, CTA |
| 13 | `valuation.test.ts` | Fisher-Formel + Verkettung exakt getestet |
| 14 | `docs/DATENMODELL_API.md` §6 | Reihenfolge dokumentiert, Abweichungen begründet (historical-Fix, Trace-Crossing) |
| 16 | Korridor-Karte, Kleingedrucktes | „Beraterhinweis: … 25./50./75. Perzentil der Simulationsverteilung …" sichtbar |
| 17 | Tab **Vergleich**, Konsequenz-Karte | Differenz nominal + real am Horizont, Differenz Monatsentnahme, Zielerreichungs-Impact, fallabhängiger CTA + Hinweis „nicht in jedem Verlauf überlegen" |
| 18 | Tab **Eingaben** unten + Tab **Vergleich** + Report-Footer | dataCompletenessNotice; Checkbox „Vollständigkeit … besprochen" wandelt den Hinweis in Bestätigung |
| 19 | Ergebnis-Tab, Expander „Berechnungsnachweis" | Alle Sektionen sichtbar; Button lädt calculationTrace als JSON |
| 20 | `bun test src/` | 242 Tests grün (58 neue: valuation/corridor/baseline/trace/comparison/historical/i18n + Erweiterungen) |

Abschluss: `bun run typecheck` (nur bekannte `bun:test`-Deklarationszeilen), Client-Report erzeugen (Tab Kundenansicht) und KPI-Duo „Endvermögen real/nominal (Jahr)" + Footer-Hinweise prüfen.
