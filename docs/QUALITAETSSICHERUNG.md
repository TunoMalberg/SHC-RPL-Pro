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
Simulation und Einzelpfad rechnen mit derselben Funktion; jede Rechenregel
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

Offen bleibt bewusst: Der Einzelpfad rechnet immer in Jahresschritten, auch
wenn die Simulation monatlich rechnet; der historische Backtest hat noch eine
eigene, vereinfachte Rechnung.
