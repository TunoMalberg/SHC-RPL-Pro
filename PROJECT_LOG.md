# Project Log — Ruhestandsplaner Pro
*Stand: 2026-06-06 · Live: https://app.veyder-malberg.com*

> **Zweck dieser Datei:** Konsolidierte Single-Source-of-Truth für *Entscheidungen,
> Annahmen und Begründungen*. Soll auch ohne Chat-Verlauf reproduzierbar machen,
> warum die App so gebaut ist wie sie ist.
> Querverweise: `spec.md` (Feature-Spec), `SECURITY.md` (Bedrohungsmodell),
> `AUDIT_2026_06_06.md` (Detailaudit), `AUDIT_2026_06_06_ITER2.md` (Iter 2).

---

## 0 · Was diese App ist

Beratungswerkzeug für **österreichische Privatbanker** zur Ruhestandsplanung
mit Privatkunden. Vor-Ort-Einsatz im Beratungsgespräch (Tablet/Laptop), DE/EN.

Ein einzelner Berater plant *einen Kunden* pro Session: Profil, Eingaben,
Portfolioallokation, Simulation, Ergebnisinterpretation, Kundenausgabe (PDF/HTML/PPTX).

**Nicht im Scope:** Multi-Tenant-Auth, Trade-Ausführung, Echtzeitdepot-Sync,
Backoffice/CRM-Integration.

---

## 1 · Architektur-Entscheidungen (mit Begründung)

| # | Entscheidung | Warum (gewählt) | Verworfene Alternative |
|---|---|---|---|
| **A1** | Next.js 15 App Router, TS, Tailwind, Bun | Vercel-natives Deploy, einheitlicher Edge/Server-Stack, schnellster Iteration-Loop in einer Bank-Restricted-Umgebung | Vite + React (kein SSR, nicht zu API-Routes verheiratet); Remix (Bank wollte Vercel) |
| **A2** | Domain-Logik zu 100 % in `src/lib/engine/`, UI-frei | Mathematik soll testbar bleiben, ohne React zu mounten. UI darf wechseln, Engine nicht. | UI-State-getriebene Berechnung (Verlust der Testbarkeit) |
| **A3** | State via React Context + useReducer, **kein Zustand/Redux** | Single-Berater-Session, kein Multi-Window-Sync. Bun-Bundle bleibt schlank. | Zustand (Boilerplate-Win marginal); Redux Toolkit (Overkill) |
| **A4** | Persistenz nur **sessionStorage**, nie localStorage | DSGVO/MiFID: Kundendaten dürfen nach Browser-Tab-Schließen weg sein. SessionStorage erfüllt Banker-Workflow ("Kunde geht — Session weg"). Schema-versioniert (`v1`-Envelope), debounced 300 ms. | localStorage (DSGVO-Risiko); IndexedDB (Overkill für 1 Session) |
| **A5** | Externe Marktdaten (Yahoo, OpenFIGI, Frankfurter) **nur über API-Routes**, nie Client-direkt | CORS, Rate-Limit-Bündelung, kein Token-Leak im DevTools. Zwingend für Bank-CSP. | Direct fetch (DSGVO + Bank-Compliance verbieten) |
| **A6** | Strenge **CSP per-Request-Nonce** via `middleware.ts` | Bank-Audit-Anforderung. Inline-Scripts nur mit Nonce, kein `unsafe-inline` für JS. | nonce-loses CSP (verboten); kein CSP (durchgefallen) |
| **A7** | Skeena-Hausschrift via `next/font/local` **embedded** (vorher: Runtime-Fetch) | Reproduzierbar, keine Drittanbieter-Abhängigkeit, CSP-konform | Google-Fonts-CDN (Bank-Compliance verbietet 3rd-party Fonts) |
| **A8** | i18n DE/EN als **flaches `Record<string,string>`** in `src/lib/i18n.tsx` | Banker switcht häufig; einfaches Key-Lookup, kein i18next-Overhead, alle Strings auditierbar in einer Datei | i18next (zu fett für 2 Locales) |
| **A9** | Test-Runner = **`bun:test`**, kein Vitest/Jest | Bun ist ohnehin Build-Tool → 0 zusätzliche Dependencies, sub-2 s Suite-Lauf | Vitest (keine Notwendigkeit, 12 MB extra) |
| **A10** | Validierung **handgeschrieben in `src/lib/validation.ts`**, nicht zod | Domain-Schema klein und stabil; Bundle-Win ~12 KB; volle Kontrolle über deutsche Fehlertexte. Umstieg auf zod jederzeit möglich, da Funktions-Signaturen klar. | zod (Bundle-Größe + nicht-deutsche Standard-Errors) |
| **A11** | Toasts via **sonner**, keine `alert()` | `alert()` blockiert Beratungsgespräch. Sonner integriert sich CSS-konform. | Eigener Toast (Wartungslast) |
| **A12** | KESt 27,5 % als **App-Default**, vom Berater anpassbar | AT-Steuerrecht 2024+. Kunden-spezifische Sätze (z. B. Stiftungs-Sondersätze) müssen änderbar sein. | Hard-coded 27,5 % (zu starr) |
| **A13** | Drei-Topf-Modell (Cash/Anleihen/Aktien) als **Kern-Engine**, optional 4. Topf (Private Equity) | „Bucket-Strategie" ist die in AT-Privatbanken verbreitete Beratungssprache. PE-Topf separat, weil illiquid mit Capital-Calls. | Continuous-Asset-Allocation (kein Banker-Sprachvermögen) |
| **A14** | GBM mit **Itô-Korrektur** (`μ − σ²/2`) im Log-Return | Vermeidet systematisches Vermögens-Bias bei langen Horizonten. Standard in Quant-Lit. Tests in `montecarlo.test.ts`. | Naive arithmetische Returns (Bias über 30+ Jahre signifikant) |
| **A15** | Default-Korrelationsmatrix `[1.0, 0.2, -0.05; 0.2, 1.0, 0.25; -0.05, 0.25, 1.0]` | Empirisch aus 30-Jahres-DE-Daten Cash/EUR-Bonds/MSCI-World, konservativ gerundet. Im Pro-Mode editierbar. | Identität (kein Diversifikationseffekt); historisches σ-Bootstrap (Komplexität) |
| **A16** | Rebalancing **regelbasiert** mit Verlustschutz: bei Aktien-Drawdown nicht aus Aktien, sondern aus Anleihen entnehmen | „Sequence-of-Returns-Risk"-Mitigation, Banker-Lehrbuch. | Zeitbasiertes Rebalancing (kein Verlustschutz) |
| **A17** | Historischer Backtest **läuft automatisch mit jeder Simulation** | Berater muss nichts extra anstoßen; konsistente Datengrundlage. | On-Demand (zusätzlicher Klick = vergessen) |

---

## 2 · Domain-Annahmen (eine Stelle, an der alles steht)

- **Lebenserwartung Default:** 90 Jahre — entspricht AT-Statistik-Median + Sicherheitspuffer
- **Inflationsrate Default:** 2,0 % — EZB-Zielinflation
- **Cash-Reserve-Ziel:** 2 Jahre Entnahme (= "Kriegskasse" für Bear-Markets)
- **Default-Sparraten-Steigerung:** 0 % p. a. (Berater muss bewusst aktivieren)
- **Pensionsbeginn ≠ Rentenalter:** Erlaubt (Frühpension). Engine respektiert. Inline-Hinweis im Form.
- **`pensionStartAge < retirementAge`:** Frühpension. War 2026-Q2 ein Bug (Reference-Line falsch positioniert) — Regression-Test in `montecarlo.test.ts` verhindert Wiederkehr.
- **Quantile:** p10/p25/Median/p75/p90 für Fan-Chart. Worst/Best als Min/Max-Pfade.
- **„Erfolg":** Endvermögen ≥ 0 zur Lebenserwartung (kein Default-Withdrawal-Wunsch-Faktor — Banker-Konsens).

---

## 3 · Was Iteration 1 + 2 verändert hat (Kompakt)

### Iteration 1 (Audit + Quick-Wins)
- **Persistenz:** sessionStorage mit Schema-Version `v1`, debounced 300 ms (`src/lib/persistence.ts`).
- **UX-Blocker raus:** Alle `alert()`-Calls → `toast.error()`/`toast.warning()`.
- **Error-Boundary:** `src/app/error.tsx` (DE/EN) + `not-found.tsx` + `loading.tsx`.
- **Rate-Limit:** Token-Bucket pro IP für `/api/holdings/{search,backtest}` (`src/lib/holdings/rateLimit.ts`).
- **Strukturierter Logger:** `src/lib/logger.ts` (JSON in Prod, pretty in Dev).
- **Build-Pipeline:** Stale `prisma generate` raus, `typecheck`/`test`/`test:watch` Scripts hinzu.

### Iteration 2 (Test- & Validierungsunterbau)
- **39 Engine-Tests:** `random.test.ts` (9), `portfolio.test.ts` (18), `montecarlo.test.ts` (12). Cholesky-Reconstruction, GBM-Itô, Quantil-Ordnung, Verlustschutz, Pension-Regression.
- **Validation-Layer:** `src/lib/validation.ts` (handgeschrieben, kein zod) + 26 Tests. Wired in API-Boundary und vor `runSimulation()`.
- **Inline-Plausibilität:** Sofort-Warnungen bei `pensionAge ≤ currentAge`, `pensionStartAge > lifeExpectancy` etc.
- **Empty-States:** `<EmptyState/>` in 4 Tabs — kein leerer Bildschirm mehr im Beratungstermin.
- **i18n:** ~25 neue DE/EN-Keys.

**Stand:** 98/98 Tests grün, 32 747 Assertions, Build clean, deployed.

---

## 4 · Bekannte offene Risiken (in Iter-Reihenfolge)

| ID | Risiko | Wo dokumentiert |
|---|---|---|
| **R1** | Holdings-API hat keinen Stale-Cache bei Yahoo-Ausfall | Iter2-Audit §4 |
| **R2** | PDF-Skeena-Font wird zur Render-Zeit gefetcht statt zum Build-Zeitpunkt embedded | Iter2-Audit §4 |
| **R3** | Server-Side-Cache für Yahoo/OpenFIGI/Frankfurter fehlt | Iter2-Audit §4 |
| **R4** | Audit-Logs für Export-PDF & Holdings-Backtest fehlen — DSGVO-relevant | Iter2-Audit §4 |
| **R5** | E2E-Tests (Playwright o. ä.) für 5 Hauptworkflows fehlen | Iter2-Audit §4 |
| **R6** | Inline-Validation für Allokationssumme/Sparrate/Inflation noch nicht überall | Iter2-Audit §4 |

**Empfohlene nächste Iterationen:** siehe `AUDIT_2026_06_06_ITER2.md` §5.

---

## 5 · Wie Sie ohne Chat-Verlauf weitermachen können

### Repository wiederherstellen
- **Live-Source:** `git clone` aus dem Bank-Repo (TunoMalberg/SHC-RPL-Pro)
- **Vercel-Source:** `npx vercel pull` von Production zieht den exakten Deploy-Zustand
- **Git-Log lokal:** zeigt alle Audit-Commits chronologisch (`5aed0a2` = Iter 2 Summary, `0eb761b` = Iter 1+2 Code-Änderungen)

### Was zuerst zu lesen ist
1. `PROJECT_LOG.md` (diese Datei) — Entscheidungen + Begründungen
2. `spec.md` — Feature-Liste mit Status
3. `AUDIT_2026_06_06_SUMMARY.md` — Audit-Hauptpunkte
4. `AUDIT_2026_06_06_ITER2.md` — letzter Stand + offene Risiken
5. `SECURITY.md` — Bedrohungsmodell + Compliance-Anforderungen
6. `src/lib/engine/*.ts` + `*.test.ts` — Mathematik-Annahmen sind im Test-Code dokumentiert
7. `src/lib/validation.ts` — alle Eingabe-Pflausibilitäten
8. `src/lib/i18n.tsx` — Sprache der App (alle UI-Texte zentral)

### Wenn der Sandbox-Workspace weg ist
- Repo ist auf GitHub (TunoMalberg/SHC-RPL-Pro) und auf Vercel.
- Vercel-Token zum Deployen liegt beim Banker (`vcp_…` aus früheren Anweisungen).
- Lokal: `bun install && bun test src/ && bunx next build` reicht zum Validieren.

### Sicheren Backup-Workflow
- Nach jedem Major-Audit: dieses `PROJECT_LOG.md` aktualisieren + commiten.
- Audit-Reports im Repo halten (sind klein, dokumentieren Trade-Offs).
- ZIP der `*.md`-Dokumente regelmäßig herunterladen (siehe Send-User-Files-Action).

---

## 6 · Glossar / Konventionen

- **KESt:** Kapitalertragsteuer Österreich, 27,5 %.
- **Sequence-of-Returns-Risk:** Risiko, dass Negativ-Returns früh in der Entnahmephase überproportional schaden.
- **Itô-Korrektur:** `μ − σ²/2` als Drift-Adjustment in GBM, damit `E[exp(X)] = exp(μ)`.
- **Verlustschutz-Rebalancing:** Bei Aktien-Drawdown ersatzweise aus Anleihen-Topf entnehmen (statt verlustreiche Aktien zu verkaufen).
- **Klassik vs. Pro Mode:** Klassik = vereinfachte Berater-UI mit Erklärungen, Pro = volle Kontrolle (Korrelationen, Rebalancing-Regeln, Bestandsdepot-Import).
- **Topf 4 / PE-Bucket:** Private-Equity-Position mit Capital-Calls, separater Engine-Logik (`src/lib/engine/privateEquity.ts`).

---

*Aktualisiert nach jeder Audit-Iteration. Bei Konflikt zwischen `spec.md` und
diesem Dokument: `spec.md` ist die What-Quelle, `PROJECT_LOG.md` ist die
Why-Quelle.*