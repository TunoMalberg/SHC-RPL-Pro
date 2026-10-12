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
