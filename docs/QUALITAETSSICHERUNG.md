# Qualitätssicherung — automatischer Prüflauf & Auslieferung

Stand: Paket 1 („Sicherheitsnetz"), 10/2026.

## Was bei jeder Änderung automatisch passiert

Jede Änderung, die auf GitHub ankommt, durchläuft dort — unabhängig vom
Bank-Rechner — fünf Prüfungen (`.github/workflows/ci.yml`):

1. **Installation exakt laut Lockfile** — keine „zufälligen" neuen Versionen.
2. **Typprüfung** (TypeScript) — 0 Fehler erlaubt.
3. **Stilprüfung** (Biome) — echte Fehlerquellen blockieren; reine
   Stilfragen erscheinen als Hinweis (Abbau in Paket 4).
4. **Tests** — alle automatischen Tests müssen grün sein.
5. **Produktions-Build** — die App muss sich fehlerfrei bauen lassen.

Ist **ein** Schritt rot, wird **nicht** ausgeliefert.

| Ereignis | Prüfungen | danach |
|---|---|---|
| Änderung auf `main` | ✅ | Auslieferung in Produktion |
| Pull Request | ✅ | eigene Vorschau-Adresse zum Testen |
| sonstiger Zweig | ✅ | — |

## Einmalige Einrichtung: Vercel-Token in GitHub hinterlegen

Damit GitHub selbst ausliefern kann, braucht es den Vercel-Token als
**Repository-Secret** (wird nie im Code gespeichert, ist in Protokollen
maskiert):

1. GitHub → Repository `SHC-RPL-Pro` → **Settings** → **Secrets and
   variables** → **Actions** → **New repository secret**
2. Name: `VERCEL_TOKEN`, Wert: der Token (derselbe wie
   `VERCEL_DEPLOYMENT_KEY` in `.env.local`)
3. Speichern.

Ohne Secret laufen die Prüfungen trotzdem; die Auslieferung wird mit Hinweis
übersprungen. Die Auslieferung vom Laptop (`scripts/deploy-vercel.ps1`)
bleibt als Notfallweg erhalten.

## Lokal denselben Prüflauf ausführen

```bash
bun run check
```

(Typprüfung + Stilprüfung + Tests; Build zusätzlich mit `bun run build:vercel`.)

## Abhängigkeiten & Sicherheit

- **Dependabot** (`.github/dependabot.yml`) prüft wöchentlich (montags) auf
  veraltete oder unsichere Bibliotheken und öffnet dafür Pull Requests, die
  den Prüflauf durchlaufen.
- Stand der Sicherheitsprüfung (`bun audit`) nach Paket 1:
  **0 kritisch**, 3 hoch, 2 mittel (vorher: 2 kritisch in Next.js sowie
  16 hoch allein in Unter-Bibliotheken).
- Verbleibende Hinweise — nach Prüfung in der laufenden App **nicht
  praktisch ausnutzbar**, Behebung erfordert inkompatible Versionssprünge:

| Bibliothek | eingebunden über | Einschätzung |
|---|---|---|
| `braces` | Tailwind (nur beim Bauen) | Build-Werkzeug; noch keine korrigierte Version verfügbar |
| `postcss-selector-parser` | Tailwind 3 (nur beim Bauen) | Korrektur erst in Version 7, die Tailwind 3 nicht unterstützt |
| `image-size` | PowerPoint-Export | betrifft Bildformate JXL/HEIF/ICNS; der Export verarbeitet nur eigene PNG-Logos |
| `uuid` | Excel-Export | betrifft Funktionen v3/v5/v6 mit Puffer; der Excel-Export nutzt nur v4 |

## Rechenrichtigkeit (Paket 2)

**Referenzfälle mit eingefrorenen Ergebnissen** (`src/lib/engine/golden/`):
13 typische Kundensituationen (Standard, Liquiditätsereignisse, Zweiphasen-
Allokation, Private Equity in allen Modi, PE-Programm, Wohnbauanleihe/LV,
Monatsschritt, bereits pensioniert, nominal ohne KESt, knappes Budget …).
Jedes Ergebnis — Erfolgsquote, Perzentile, Pfade, Einzelpfad-Tabelle,
historischer Backtest, Korridor — ist in `reference.golden.json` festgehalten.
Ändert sich auch nur ein Wert um mehr als einen Bruchteil eines Cents, schlägt
der Prüflauf fehl. Bewusste Änderungen werden nur mit Begründung im Commit neu
eingefroren:

    UPDATE_GOLDEN=1 bun test src/lib/engine/golden

**Excel-Gegenrechnung** (`docs/Gegenrechnung_Referenzfaelle.xlsx`, erzeugt mit
`bun scripts/gegenrechnung/generate.ts`): drei schwankungsfreie Fälle Jahr für
Jahr mit offenen Excel-Formeln nachgerechnet (Rendite, Kosten, KESt auf
Bankeinlagen, Sparrate/Entnahme/Pension, Entnahme-Reihenfolge,
Liquiditätsereignisse, Höchststand-KESt) und mit der App verglichen —
Abweichung 0,00 €. Zur fachlichen Durchsicht durch eine Kollegin/einen Kollegen
der Bank gedacht.

**Gemeinsamer Rechenkern** (`src/lib/engine/pathCore.ts`): Monte-Carlo-
Simulation, Einzelpfad und historischer Backtest rechnen mit derselben
Funktion (der Backtest mit echten Jahresrenditen und echter Inflation, ohne
Private Equity und Produkt-Töpfe, weil es dafür keine historischen Reihen gibt); jede Rechenregel
steht genau einmal im Code. Ein Test stellt sicher, dass der Einzelpfad den
Worst-/Best-Case-Pfad der Simulation exakt reproduziert.

Bei der Vereinheitlichung behobene Abweichungen (Referenzen bewusst neu
eingefroren):

1. „Quartalsweise umschichten" hat bei jährlichem Simulationsschritt in der
   Hauptsimulation nie umgeschichtet — jetzt jeden Schritt (wie im Einzelpfad).
2. Mehrere Liquiditätsereignisse im selben Jahr mit unterschiedlichem
   Vorzeichen: der Einzelpfad hat sie saldiert, die Simulation einzeln
   gebucht — jetzt überall einzeln.
3. Private Equity „Vollständig": der Einzelpfad zeigte den Median-Verlauf,
   die Simulation je Pfad ein eigenes Szenario — jetzt zeigt der Einzelpfad
   dasselbe Szenario wie der Simulationspfad gleicher Nummer.
4. PE-Wert am Laufzeitende: beide verwenden jetzt den zuletzt gebuchten Wert.

Historischer Backtest — durch den gemeinsamen Kern neu berücksichtigt:

5. Zweiphasen-Allokation (Wechsel auf das Entnahme-Portfolio).
6. Sparsteigerung p.a. bei nominaler Eingabe (vorher ignoriert).
7. Liquiditätsereignisse mit gebrochenem Alter (z. B. 62,5) — vorher nie gebucht.
8. Erfolgskriterium wie Monte-Carlo (Vermögen reicht nicht mehr für die
   nächste Entnahme) statt „Kapital = 0".
9. Drawdown als reiner Marktverlust wie Monte-Carlo, ohne Entnahmen.

Offen bleibt bewusst: Der Einzelpfad rechnet immer in Jahresschritten, auch
wenn die Simulation monatlich rechnet.

**Renditelogik (fachliche Entscheidung 12.10.2026):** Eingegebene Renditen
sind Jahreserträge ohne unterjährigen Zinseszins: 7,0 % Brutto − 1,5 % Kosten
= 5,50 % p.a. Der Durchschnitt der simulierten Jahresrenditen ist genau dieser
Wert; Zinseszins entsteht über die Jahre. Wertpapier-Töpfe und fondsgebundene
LV rechnen nach derselben Logik. Vorher ergab dieselbe Eingabe 5,65 % p.a.
Wirkung auf die Referenzfälle: Erfolgsquoten 0–3 Prozentpunkte niedriger;
historischer Backtest unverändert (echte Renditen).

## Klicktests und Betrieb (Paket 3)

**Klicktests** (`e2e/`, Playwright): Bei jedem Pull Request und vor jedem
Livegang baut GitHub die App wie für die Produktion und bedient sie im
Browser wie eine Beraterin:

- Klassik: Eingaben → Simulation → Ergebnisse, Historie, Einzelpfad, Kundenansicht
- Pro: alle 13 Reiter öffnen sich ohne Fehler
- Hinweise statt leerer Seiten, wenn noch keine Simulation läuft
- Szenarien speichern, vergleichen und ansehen; Vergleichsansicht berechnen
- Exporte: Excel, PowerPoint, HTML-Kundenreport, PDF werden erzeugt und geprüft
- Sprache Englisch; Handybreite ohne seitliches Verrutschen

Jeder Test schlägt auch dann fehl, wenn die App im Hintergrund Fehler wirft.
Nur Dummy-Daten („Erika Test"). Bei Fehlern liegt der Bericht samt
Bildschirmfoto als „klicktest-bericht" am GitHub-Lauf. Auf Bank-Arbeitsplätzen
ist die Browser-Fernsteuerung per IT-Richtlinie gesperrt — dort laufen die
Klicktests nicht lokal, nur auf GitHub.

**Kurzprüfung nach dem Livegang:** Nach jeder Auslieferung öffnet GitHub
`https://app.veyder-malberg.com`, startet eine Simulation und prüft Ergebnis
und Backtest.

**Fehlerprotokoll:** Fehler im Browser eines Beraters werden an die eigene
Route `/api/client-error` gemeldet und stehen im Vercel-Protokoll (Suchwort
`client-error`). Kein externer Dienst. Gesendet werden nur Fehlerart,
bereinigte Meldung (Beträge, Jahreszahlen, lange Ziffernfolgen und
E-Mail-Adressen unkenntlich), Code-Stelle, Seitenpfad und App-Version —
nie Eingaben, Ergebnisse oder Kundendaten. Höchstens 10 Meldungen je Seite.

**Rechenzeit-Grenzen** (`src/lib/engine/performance.test.ts`): schlagen an,
wenn eine Änderung die Simulation spürbar verlangsamt (z. B. Standardfall
10.000 Pfade über 3 s; lokal 0,35 s).

## Wartbarkeit (Paket 4)

- **Stilprüfung ohne Hinweise:** alle 148 Stilhinweise behoben (ohne
  Verhaltensänderung, Referenzfälle unverändert). Ausnahmen nur mit
  begründetem Kommentar im Code; in Testdateien sind „!"-Annahmen erlaubt.
  Neue Hinweise lassen den Prüflauf jetzt scheitern.
- **Rechnen im Hintergrund:** „Simulation starten" rechnet in einem Web Worker
  (`src/lib/engine/simulationJob.ts`, `simulation.worker.ts`). Die Oberfläche
  bleibt während der Rechnung bedienbar. Kann der Browser keinen Worker
  starten, läuft dieselbe Rechnung im Vordergrund — Ergebnis identisch.
  Sicherheitsrichtlinie: `worker-src 'self'`.
- **Große Dateien aufgeteilt:** Übersetzungen (`src/lib/translations/de.ts`,
  `en.ts`), PowerPoint-Export (`src/lib/export/powerpoint/`), Private Equity
  (`PEProgramCard`, `PEFundRow`), Ergebnisseite (`sections/results/`).
