# SHC Ruhestandsplaner Pro — Master-Spec

## Projekt-Überblick
Beraterwerkzeug zur ganzheitlichen Ruhestands- und Vermögensplanung. Kombiniert Monte-Carlo-Simulation, historischen Backtest, Stresstests und MiFID-konforme Kundenausgabe.

- **Stack:** Next.js 15 (App Router), TypeScript, Tailwind, Prisma + Postgres, Vercel Hosting
- **Deploy-Domain:** https://app.veyder-malberg.com
- **Repo:** github.com/TunoMalberg/SHC-RPL-Pro

## Architektur-Prinzipien
- Engine-Logik liegt unter `src/lib/engine/` und ist UI-frei.
- Exporter unter `src/lib/export/clientReport/` (HTML, PDF, PPTX) konsumieren das gleiche Result-Objekt.
- Externe API-Calls ausschließlich server-side (DSGVO/MiFID).
- i18n DE/EN durchgängig in `src/lib/i18n.tsx`.
- State via Zustand-Store (`src/lib/store.ts`).

## Feature-Liste

| Feature | Status | Spec |
|---|---|---|
| Topf 1–3 Asset-Buckets + MC-Simulation | done | (legacy core) |
| Historischer Backtest (Anlageklassen-Proxy) | done | (legacy core) |
| Stresstest-Szenarien (2008, 2020, …) | done | (legacy core) |
| MiFID-Compliance + Disclaimer | done | (legacy core) |
| Monte-Carlo-Engine | done | (legacy core) |
| Multi-Run-Szenarienvergleich | done | (legacy core) |
| Private Equity (Topf 4) | done | (legacy core) |
| Private Equity in Kundenansicht (HTML+PDF) | done | (commit 14747cb) |
| Bestandsportfolio Excel-Import + ISIN-Backtest | planned | [specs/bestandsportfolio/document.md](bestandsportfolio/document.md) |