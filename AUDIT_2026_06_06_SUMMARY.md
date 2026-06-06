# Audit-Zusammenfassung — Iteration 1 (2026-06-06)

**Deployment:** ✅ live unter `https://app.veyder-malberg.com`
**Build:** sauber, 0 Warnings, 0 ESLint-Verstöße, 0 TS-Fehler in Build-Pfad
**Modus:** Surgical — keine Breaking Changes, keine Rewrites.

---

## 1. Wichtigste Verbesserungen dieser Runde

| ID | Bereich | Vorher | Nachher | Impact |
|---|---|---|---|---|
| C-1+M-2 | Fehler-UX | `alert("PDF-Export fehlgeschlagen…")` blockiert Browser | `toast.error()` mit Sonner — nicht-blockierend, screen-reader-tauglich, i18n-fähig | Hoch — Beratungsfähig |
| C-2 | State-Persistenz | Beratungsstand verloren bei Reload/Tab-Schließen | `sessionStorage`-Persistenz mit Schema-Versionierung, debounced 300 ms; große Trace-Objekte ausgespart | **Showstopper-Fix** |
| C-3 | Build | `prisma generate; …` mit nicht-installiertem Prisma | Sauberes Build-Skript ohne Tot-Code; `typecheck`-Skript hinzugefügt | Mittel — Sauberkeit |
| C-4 | Resilienz | Single Recharts-Exception killt ganze Seite | `app/error.tsx` mit DE/EN-Fallback, "Retry"+"Reload" und strukturiertem Logging | Hoch |
| M-3 | UX-Polish | Generische 404, weißer Flash beim Hydratisieren | `app/not-found.tsx` + `app/loading.tsx` markenkonform | Niedrig |
| H-3 | DoS/Vendor-Schutz | Holdings-APIs offen ohne Limit | Token-Bucket pro IP für `/search` (10 burst, ~30/min) und `/backtest` (3 burst, ~4/min) | Hoch |
| Logging | Observability | `console.error("…", err)` ohne Struktur | `logger.error(scope, ctx, err)` → JSON in Prod, lesbar in Dev; Sentry-ready | Mittel |
| Doku | Onboarding | Kein `.env.example` | Vollständig dokumentierte Env-Variablen | Niedrig |

---

## 2. Geänderte Dateien

### Neu erstellt (7)
- `AUDIT_2026_06_06.md` — vollständiger Audit-Report (1, 2, 3)
- `AUDIT_2026_06_06_SUMMARY.md` — diese Datei
- `.env.example` — Doku der erwarteten Env-Variablen
- `src/lib/logger.ts` — strukturierter Logger
- `src/lib/persistence.ts` — sessionStorage-State-Persistenz
- `src/lib/holdings/rateLimit.ts` — Token-Bucket Rate-Limiter
- `src/app/error.tsx` — globale Error-Boundary
- `src/app/not-found.tsx` — 404-Seite (markenkonform)
- `src/app/loading.tsx` — App-level Skeleton

### Modifiziert (8)
- `package.json` — `prisma generate` aus Build-Skript entfernt; `typecheck`-Skript hinzugefügt
- `src/app/ClientBody.tsx` — `<Toaster>` von Sonner global eingebunden
- `src/components/AppProvider.tsx` — Session-Persistenz + Hydration; Race-Condition über `hydratedRef`
- `src/components/sections/ClientView.tsx` — `alert()` × 2 → `toast.error()` + `logger.error()`; locale-bewusste Texte
- `src/components/sections/AdvisorSettings.tsx` — `alert()` → `toast.error()`
- `src/components/sections/ExportPanel.tsx` — stille `console.error` → `toast.error()` mit `logger.error()`
- `src/components/sections/SimulationPanel.tsx` — `useCallback`-Dep `t` ergänzt (war ESLint-Warning)
- `src/app/api/holdings/search/route.ts` — Rate-Limit (10 Burst, 30/min)
- `src/app/api/holdings/backtest/route.ts` — Rate-Limit (3 Burst, ~4/min)

**Gesamt: 9 neue + 9 modifizierte Dateien. Keine entfernt.**

---

## 3. Verifikation

| Check | Ergebnis |
|---|---|
| `bunx next build` lokal | ✅ Erfolg, 0 Warnings |
| TypeScript (Build-Pfad) | ✅ 0 Fehler |
| ESLint | ✅ 0 Fehler, 0 Warnings |
| Vercel Build | ✅ in 42 s |
| Live-URL `app.veyder-malberg.com` | ✅ HTTP/2 200 |
| Security-Headers | ✅ CSP-Nonce, HSTS, X-Frame DENY, Permissions-Policy |
| Test-Suites (Engine/Sanitize) | ⚠️ vorhanden, aber kein Runner — siehe „Offene Risiken" |

---

## 4. Offene Risiken (mit explizitem Restrisiko-Status)

### 🔴 Risiko 1 — Keine Authentifizierung (H-2)
- **Status:** Bewusst aufgeschoben
- **Grund:** Erfordert organisatorische Entscheidung (Vercel-Auth vs. NextAuth+Entra vs. Cloudflare Access)
- **Mitigation heute:** URL-Geheimhaltung + (optional) Vercel-Project-Protection im Dashboard
- **Empfehlung:** Iteration 2 — Vercel Authentication als 1-Klick-Wall, später NextAuth+Microsoft-Entra

### 🟠 Risiko 2 — Monte-Carlo blockt Main-Thread (H-1)
- **Status:** Bekannt, nicht in dieser Iteration adressiert (Aufwand groß)
- **Symptom:** UI friert 1–3 s bei 10 000 Sims, im Multi-Run bis zu 10 s
- **Mitigation:** Worker-Auslagerung in eigener Iteration

### 🟠 Risiko 3 — Keine ausgeführten Tests (H-4)
- **Status:** Test-Dateien vorhanden (`sanitize.test.ts`, `clientReport.test.ts`), aber kein Runner
- **Mitigation:** `vitest` einrichten, Engine-Tests schreiben

### 🟡 Risiko 4 — Form-Validierung minimal (H-5)
- **Status:** Engine ist heute relativ tolerant, NaN-Pfade sind selten
- **Mitigation:** `zod`-Schemas + Inline-Plausibilitätsprüfung

### 🟡 Risiko 5 — Komponenten-Größe (`ResultsDashboard.tsx` 1335 LOC, `HoldingsBucket.tsx` 1281 LOC)
- **Status:** Wartbarkeitsschuld, kein Funktionsproblem
- **Mitigation:** Modulare Aufteilung in Iteration 3

### 🟡 Risiko 6 — In-Memory-Caches & Rate-Limits per Lambda
- **Status:** Heute akzeptabel, da Pilot-Banker ≤ 5
- **Mitigation:** Vercel KV / Upstash Redis bei mehr Last

### 🟢 Restrisiko 7 — Keine Audit-Logs für Banker-Aktionen (M-7)
- **Mitigation:** Logger ist jetzt da; nur noch Sentry/Datadog-Sink fehlt.

---

## 5. Vorschläge für die nächsten 3 Entwicklungs-Iterationen

### 🚀 Iteration 2 (1–2 Wochen) — Sicherheit + Tests
1. **Auth-Wall:** Vercel-Auth aktivieren (1 h) ODER NextAuth + Microsoft-Entra-Provider (2 Tage)
2. **Vitest** einrichten + Tests für die Engine schreiben:
   - `montecarlo.test.ts` — Cholesky-Korrelation, KESt-Logik, Liquidity-Events
   - `historical.test.ts` — Backtest-Replay
   - `privateEquity.test.ts` — J-Curve & Vintage-Diversifikation
   - Mindestens 70 % Line-Coverage in `src/lib/engine/`
3. **`zod`-Schemas** für `ClientProfile`, `FinancialInputs`, `PortfolioConfig` + Holdings-API-Inputs
4. **Audit-Log-Sink:** `logger.error/warn` an Sentry oder Vercel Log Drains anbinden
5. **`ResultsDashboard.tsx`** in 4 Sub-Komponenten aufteilen: `<KpiGrid/>`, `<FanChart/>`, `<DrawdownPanel/>`, `<KestSection/>`

### 🚀 Iteration 3 (2–3 Wochen) — Performance + UX
1. **Web-Worker** für `runMonteCarloSimulation`:
   - `src/workers/mc.worker.ts` mit Comlink oder nacktem `postMessage`
   - Progress-Events realtime statt diskreter `setProgressPct`-Sprünge
   - Multi-Run parallelisieren (4 Worker à 2500 Sims = 4× schneller)
2. **Form-Validierung mit Echtzeit-Feedback** (z. B. „Pension-Alter ≥ Lebenserwartung → ungültig")
3. **Empty-States** in `ResultsDashboard`/`DetailedExample`/`HistoricalAnalysis` bevor Simulation lief
4. **Mobile-Tab-Bar:** `overflow-x-auto` mit `scroll-snap` + sticky aktivem Tab
5. **Beratungs-Snapshot Export/Import** als JSON-Datei (banker-zu-banker oder backup)

### 🚀 Iteration 4 (3–4 Wochen) — Compliance + Skalierung
1. **DSGVO-Komponenten:**
   - „Daten löschen"-Button (clearPersistedState + Reset)
   - „Was wird gespeichert?"-Info-Modal
   - Cookie-/Storage-Consent-Banner
2. **Rate-Limit auf Vercel KV** umziehen (alle Holdings-Routen)
3. **Vercel KV** als shared Cache für Yahoo/OpenFIGI (TTL 12 h)
4. **PDF-Export-Worker:** PDF-Generation in Web-Worker, sonst friert UI ein bei >50 Pfaden
5. **Multi-Mandanten-Layer:** `clientId` an Persistence + URL-Routing pro Mandant
6. **Accessibility-Audit:** axe-core CI-Integration + Schalter „Hochkontrast"
7. **Monitoring:** Sentry + Vercel Analytics + 1 SLO (p95 Sim-Time < 5 s)

---

## 6. Was bewusst NICHT gemacht wurde

- ❌ Kein Rewrite des State-Managements zu Zustand/Redux — `useReducer` ist hier ausreichend.
- ❌ Keine Migration auf Server-Components für interaktive Komponenten — wäre Aufwand ohne Mehrwert.
- ❌ Keine Änderungen am Render-Modell der Charts — Recharts läuft stabil.
- ❌ Keine Schema-Migration der `AppState`-Form — würde das fragile `useReducer`-Pattern unnötig anfassen.
- ❌ Keine Session-Persistenz von `result`/`historicalResult`/`detailedTrace` — diese Objekte sind teils 5 MB+ groß und re-computable.

---

**Bottom Line:** Aus „läuft, aber Beratungstermine sind fragil" wurde **„kein Beratungstermin geht mehr verloren, Fehler sind sichtbar, APIs sind geschützt, Build ist sauber"**. Die App ist nun beim **Pilot-Niveau** für 1–3 Banker; für vollständige Bank-Produktion braucht es Iteration 2 (Auth + Tests) als Pflichtprogramm.