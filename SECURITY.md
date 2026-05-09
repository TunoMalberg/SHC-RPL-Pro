# Security Hardening — Intranet / Bank-Deployment

Dieses Dokument beschreibt, welche Maßnahmen zur Erfüllung des externen
Sicherheitsaudits vom **06.05.2026** (fluffysoft / Johannes Tödling, im
Auftrag der GRAWE Bankengruppe) umgesetzt wurden.

Scope-Zusammenfassung des Audits: Static Application Security Testing + Software
Composition Analysis, CVSS v4.0, OWASP Top 10 (2021), ASVS 4.0.3.

## Zusammenfassung

| Finding | Severity | Status   | Umsetzung                                                                          |
| ------- | -------- | -------- | ---------------------------------------------------------------------------------- |
| F-01    | HIGH     | ✅ Behoben | `safeCell()` in Excel- und PowerPoint-Export (`src/lib/export/sanitize.ts`)        |
| F-02    | MEDIUM   | ✅ Behoben | Produktions-Security-Header (CSP mit Nonce + `strict-dynamic` in `src/middleware.ts`, HSTS / X-Frame-Options / … in `next.config.js`) |
| F-03    | MEDIUM   | ✅ Behoben | `mathjs` entfernt (`bun remove mathjs`)                                            |
| F-04    | MEDIUM   | ✅ Behoben | Inline-`postMessage`-Script aus `src/app/layout.tsx` entfernt                      |
| F-05    | MEDIUM   | ✅ Behoben | `ignoreBuildErrors` / `ignoreDuringBuilds` → `false`; TS- und Lint-Errors behoben  |
| F-06    | LOW      | ✅ Behoben | `safeFilename()` für Download-Dateinamen (`src/lib/export/sanitize.ts`)            |

**bun audit** vor Patches: 12 Vulnerabilities (5 high, 7 moderate).
**bun audit** nach Patches: 8 Vulnerabilities (2 high, 6 moderate).

Die verbleibenden Findings (`picomatch`, `brace-expansion`, …) sind laut
Audit-Abschnitt 4.3 _„ausgeklammert: nicht clientseitig exploitierbar"_ —
sie liegen in Build-Time-Toolchains (Tailwind, ESLint) oder in
attacker-nicht-kontrollierten Transitive-Pfaden (exceljs › archiver).

## F-01 — Formula-Injection in Exporten

**CWE-1236, OWASP A03:2021, ASVS V5.3.4.**

- Neuer Helper `safeCell()` in `src/lib/export/sanitize.ts` präfigiert jeden
  String, der mit `=`, `+`, `-`, `@`, `\t` oder `\r` beginnt, mit einem
  Apostroph (`'`) — dem Standard-Excel-Mechanismus zur Erzwingung von
  Text-Interpretation.
- Angewendet an allen drei Stellen, an denen freier User-Input in
  Zellen / Textframes geschrieben wird:
  - `src/lib/export/excel.ts` → `client.name`, `LiquidityEvent.description`
  - `src/lib/export/powerpoint.ts` → `client.name`, `LiquidityEvent.description`, `pptx.title`
- Zusätzlich Längen-Cap auf Excel-Zellen-Maximum (32767 Zeichen) gegen DoS.
- Unit-Tests in `src/lib/export/sanitize.test.ts` decken alle fünf
  Trigger-Zeichen, klassische Payloads (HYPERLINK, DDE `cmd|'/c calc'!A0`),
  benigne Inputs, Null/Undefined und Längen-Cap ab. `bun test` → 20 passed.

## F-02 — Security-Header

**CWE-693 / CWE-1021, OWASP A05:2021, ASVS V14.4.**

Für Production werden folgende Header gesetzt — die statischen Header in
`next.config.js → async headers()`, die **CSP pro Request** mit frischem
Nonce in `src/middleware.ts`:

| Header                      | Wert                                                                                                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`   | `default-src 'self'; script-src 'self' 'nonce-<per-request>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` |
| `X-Frame-Options`           | `DENY`                                                                                                                                                                                                                                                                      |
| `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                                                                                                                   |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                                                                                                                                                           |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload`                                                                                                                                                                                                                              |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=(), payment=(), usb=()`                                                                                                                                                                                                              |
| `X-DNS-Prefetch-Control`    | `off`                                                                                                                                                                                                                                                                       |

### Warum Nonce + `strict-dynamic`?

Next.js 15 (App Router) emittiert für jedes Rendering eigene
`<script>…self.__next_f.push([…])…</script>`-Blöcke, um die React-Server-
Component-Payload und die Hydration-Instruktionen an den Client zu streamen.
Eine reine `script-src 'self'`-CSP blockiert diese Inline-Blöcke → React
hydriert nicht, die Seite bleibt leer.

Die Middleware generiert deshalb pro Request ein kryptographisch zufälliges
Nonce (16 Byte, Base64), setzt den Request-Header `x-nonce`, damit Next.js
das Nonce an allen eigenen Inline-Scripts anbringt, und setzt gleichzeitig
den Response-Header `Content-Security-Policy` mit
`'nonce-<value>' 'strict-dynamic'`. Das bedeutet:

- Nur Inline-Scripts mit dem korrekten Nonce laufen (also ausschließlich
  die von Next.js selbst generierten).
- `'strict-dynamic'` erlaubt dynamisch nachgeladene Chunks, die von einem
  nonce-validen Script angefordert werden (Webpack-Runtime, App-Chunks),
  ohne dass jeder Chunk-Hash einzeln whitelisted werden muss.
- Alle anderen Inline-Scripts (z. B. von einem XSS-Payload eingeschleuste)
  werden weiterhin blockiert.
- Externe Hosts sind nach wie vor gesperrt — keine Third-Party-JS.

`style-src 'unsafe-inline'` bleibt notwendig, weil Tailwind/Next.js
generierte `<style>`-Blöcke einsetzt.

Verifikation:

```
curl -sI https://app.intern.veyder-malberg.example/ | grep -i security
→ Content-Security-Policy: default-src 'self'; ...
→ Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
→ X-Frame-Options: DENY
...
```

## F-03 — `mathjs` entfernt

**CWE-1104 / CWE-915, OWASP A06:2021, ASVS V14.2.**

`mathjs` war als direkte Dependency gelistet, wurde aber im Source-Code
nicht verwendet. Zwei GHSA-Advisories mit CVSS-Base 9.3 (High) verschwinden
damit vollständig aus dem Audit-Bericht.

```bash
bun remove mathjs
```

## F-04 — Inline `postMessage` entfernt

**CWE-940 / CWE-200, OWASP A05:2021, ASVS V13.4.2.**

Der `dangerouslySetInnerHTML`-Script-Block in `src/app/layout.tsx` (Überbleibsel
des Same.dev-Preview-Harness) sendete bei jedem Navigationsereignis
`location.origin + pathname + hash` mit Wildcard-Target `'*'` an `window.parent`.
Ersatzlos entfernt. Side-Benefit: erlaubt die strikte CSP aus F-02 ohne
`script-src 'unsafe-inline'`.

## F-05 — Strikte CI-Validierung

**CWE-489 / CWE-1188, OWASP A05:2021 / A04:2021, ASVS V14.1.**

In `next.config.js`:

```js
typescript: { ignoreBuildErrors: false },
eslint:     { ignoreDuringBuilds: false },
```

Bei der Umstellung aufgetretene Fehler behoben:

- `src/lib/engine/random.ts` – `let u2` → `const u2` (`prefer-const`)
- `src/components/sections/FinancialInputs.tsx` – `React.Dispatch<any>` →
  `React.Dispatch<Action>` (`no-explicit-any`)
- `src/components/sections/ResultsDashboard.tsx`, `HistoricalAnalysis.tsx`,
  `ScenarioComparison.tsx`, `DetailedExample.tsx` – strikte Typisierung der
  Recharts-`Tooltip.formatter`-Callbacks mit `Number(value) || 0`-Coercion
  statt `any`-Cast.

Build (`bun run build`) läuft grün durch.

## F-06 — Filename-Sanitizing

**CWE-641, OWASP A03:2021, ASVS V12.3.**

Neuer Helper `safeFilename()` in `src/lib/export/sanitize.ts`:

```ts
name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 64)
```

- Unicode-Letter/Number-Klassen erlauben internationale Namen (Umlaute,
  kyrillische / arabische Schrift) ohne Zeichenverlust.
- Alle Steuerzeichen (inkl. Right-to-Left-Override U+202E), Punkte,
  Slashes, Backslashes und Pathtraversal-Sequenzen werden durch `_`
  ersetzt → kein Double-Extension-Trick möglich.
- Längenkappe auf 64 schützt vor Filesystem-Limits.
- In `src/components/sections/ExportPanel.tsx` beim Zusammensetzen der
  Excel-/PowerPoint-Dateinamen angewandt.

## Verifikations-Matrix

| Maßnahme                       | Kommando                                         | Erwartetes Ergebnis                            |
| ------------------------------ | ------------------------------------------------ | ---------------------------------------------- |
| Unit-Tests                     | `bun test src/lib/export/sanitize.test.ts`       | 20 passed                                      |
| Strict Build                   | `bun run build`                                  | ✓ Compiled successfully                        |
| Security-Header live           | `curl -sI <prod-url>`                            | CSP / HSTS / XFO / nosniff vorhanden           |
| Dep-Audit                      | `bun audit`                                      | 8 Vulnerabilities (2 high build-time only)     |
| Keine Inline-Scripts           | `grep dangerouslySetInnerHTML src/app/layout.tsx` | leer                                           |

## Remediation-Fortschritt laut Audit-Roadmap

Vom Audit vorgeschlagene Reihenfolge vollständig abgearbeitet:

1. ✅ `safeCell()`-Wrapper → F-01
2. ✅ `bun remove mathjs` + `bun update` → F-03 & Dep-Refresh
3. ✅ `ignoreBuildErrors`/`ignoreDuringBuilds` → `false` → F-05
4. ✅ Security-Header in `headers()` → F-02
5. ✅ Inline-Script in `layout.tsx` entfernen → F-04
6. ✅ Filename-Sanitizing → F-06

Gesamtaufwand laut Audit-Schätzung: 4–5 Stunden. Umgesetzt im Rahmen des
Security-Patches 2026-05-06.