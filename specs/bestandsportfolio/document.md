# Bestandsportfolio — Excel-Import + ISIN-Backtest mit kostenfreien Daten

> Status: **Proposal / draft** · Ziel-Release: SHC-RPL-Pro 0.2.0 · Ergänzt nahtlos die bestehende Engine (Topf 1–4) und die Kundenansicht.

---

## 1. Overview

Ein neues Eingabe-Modul **„Bestandsportfolio“** erlaubt dem Berater, ein bestehendes Wertpapierdepot per Excel-Datei zu importieren (oder manuell zu erfassen) und unmittelbar gegen den vorhandenen historischen Backtest, die Monte-Carlo-Simulation und alle Stresstest-Szenarien laufen zu lassen — auf Basis **echter ISIN-Preishistorien aus kostenfreien öffentlichen Quellen** (Stooq, Yahoo Finance, OpenFIGI, Frankfurter ECB, Bundesbank).

Damit wird aus dem bisher modell-allokativen Planer („60 % Aktien, 40 % Anleihen“) ein positions-genauer Analyse-Werkzeug für reale Kundendepots, ohne kostenpflichtige Marktdaten-Lizenz.

---

## 2. Goals

1. **Kundendepot in < 60 Sek.** in den Planer importieren (Drag-&-Drop Excel).
2. **Echter, positions-genauer historischer Backtest** über die gesamte verfügbare Preishistorie jeder Position (kein Anlageklassen-Proxy mehr nötig).
3. **Erweiterte Stresstests** auf Basis realer Position-Drawdowns (2008, 2020, Dotcom, Stagflation, Rate-Shock, FX-Shock, Klumpenrisiko).
4. **Zero-Cost-Datenversorgung** — keine Lizenzgebühren, kein Vendor-Lock-In.
5. **Konsistente DSGVO-/MiFID-Compliance** — alle externen Aufrufe gehen ausschließlich Server-side, keine ISIN- oder Kundendaten in Drittanbieter-Tracker.
6. **Voll integriert** in bestehende Topf-1–4-Logik, MC-Engine, HTML-/PDF-Kundenansicht und Disclaimer.

---

## 3. Scope / Non-Goals

### In Scope
- Excel-Import (eigene SHC-Vorlage **plus** Auto-Erkennung der häufigsten Custodian-Exports: comdirect, DAB/BNP, V-Bank, FFB, Hauck Aufhäuser).
- Manuelle Tabelle als Fallback.
- ISIN → Ticker-Auflösung über **OpenFIGI** (kostenfrei, 25 req/6 s ohne Key, 250 req/6 s mit Key).
- Preishistorie über **Stooq.com CSV** (Primärquelle, EU-freundlich) und **Yahoo Finance** (Fallback für US-/Asien-Werte).
- FX-Historie über **ECB / Frankfurter App** (kostenfreie offizielle EZB-Daten).
- Server-side Caching der Preisreihen (SQLite/Postgres) → max. ein Aufruf pro ISIN/Tag.
- Position-genauer historischer Backtest, Klumpen-/FX-/Sektor-Stresstests.
- Bestandsportfolio-Block in HTML- und PDF-Kundenansicht (analog PE-Block, optional anonymisierbar).

### Non-Goals (V1)
- Live-Intraday-Kurse (nur EOD).
- Vollständige ESG-/SFDR-Analyse (Phase 2).
- Tax-Lot-genaue Steuersimulation (Phase 2).
- Order-Routing/Trading-Funktionen.
- OTC-Produkte ohne ISIN/CUSIP (manuelle Erfassung als „Sonstiges“ mit Anlageklassen-Proxy).

---

## 4. User Flows / UX

### 4.1 Import-Flow

```
Tab „Bestandsportfolio“
├─ [Vorlage herunterladen] (SHC_Bestandsportfolio_Vorlage.xlsx)
├─ [Datei importieren] → Drag-&-Drop oder File-Picker
│       ↓
│   Auto-Erkennung Format
│       ├─ SHC-Vorlage erkannt        → direkt parsen
│       ├─ comdirect/DAB/V-Bank etc.  → Mapping vorausgefüllt
│       └─ Unbekannt                  → Mapping-Wizard
│       ↓
│   Validierung (ISIN-Prüfsumme, Pflichtfelder, Zahlenformate)
│       ↓
│   Vorschau-Tabelle mit Inline-Korrektur
│       ↓
│   ISIN-Auflösung (OpenFIGI) + Preishistorie laden (Stooq/Yahoo)
│       Status pro Position:
│       ✅ Mapped + Historie OK
│       ⚠ Mapped, Historie kurz (< 5 J)
│       ❌ Nicht auflösbar → Anlageklassen-Proxy verwenden
│       ↓
│   [In Simulation übernehmen]
└─ [Manuell hinzufügen] → Inline-Edit-Zeile
```

### 4.2 Analyse-Flow

```
Inputs (Bestandsportfolio aktiv)
   ↓
Topf-1–3-Allokation read-only & abgeleitet
   ↓
Run Simulation
   ↓
Ergebnisse  +  Neuer Block „Portfolio-Analyse“
              ├─ Positions-Heatmap (Anlageklasse × Region)
              ├─ Top-10 Positionen (anonymisierbar)
              ├─ Klumpenrisiko-Ampel
              ├─ Stresstest-Tabelle (real, pro Szenario in EUR + %)
              ├─ FX-Sensitivität
              └─ Drawdown-Historie pro Position
   ↓
Kundenansicht (HTML + PDF)
   └─ Neuer Abschnitt „Ihr Portfolio“ analog PE-Block
```

### 4.3 UI-Komponenten

| Komponente | Datei | Notizen |
|---|---|---|
| Tab + Tabelle | `src/components/sections/HoldingsImport.tsx` | neu |
| Excel-Parser | `src/lib/import/excelHoldings.ts` | neu, nutzt `exceljs` (bereits installiert) |
| Mapping-Wizard | `src/components/sections/HoldingsMappingWizard.tsx` | neu |
| Heatmap | `src/components/sections/HoldingsHeatmap.tsx` | neu, SVG (kein extra Lib) |
| Konzentrations-Ampel | inline in Heatmap | neu |
| Bestand-Block Kundenansicht | `src/lib/export/clientReport/holdings.ts` | neu, wird aus `html.ts` und `pdf.ts` aufgerufen |

---

## 5. Functional Requirements

### 5.1 Excel-Import

**FR-1.1** Vorlage `SHC_Bestandsportfolio_Vorlage.xlsx` mit zwei Tabs:
- **„Positionen“** — die eigentliche Eingabe-Tabelle
- **„Hilfslisten“** — Drop-Down-Werte (Anlageklasse, Region, Währung) und ISIN-Prüfsumme als Excel-Validation

**FR-1.2** Spalten der „Positionen“-Tabelle (in dieser Reihenfolge):

| # | Header | Pflicht | Typ | Beispiel |
|---|---|---|---|---|
| 1 | ISIN | bedingt¹ | Text(12) | DE000A0H08H3 |
| 2 | Ticker | bedingt¹ | Text | EUNL.DE |
| 3 | Bezeichnung | ja | Text | iShares Core MSCI World UCITS ETF |
| 4 | Stückzahl | ja | Number | 1250 |
| 5 | Einstandskurs | optional | Number | 78,40 |
| 6 | Aktueller Kurs | ja² | Number | 102,15 |
| 7 | Währung | ja | Text(3) | EUR |
| 8 | Anlageklasse | optional³ | Drop-Down | Aktien Welt |
| 9 | Region | optional | Drop-Down | Welt / DM |
| 10 | Sektor | optional | Drop-Down | Diversified |
| 11 | Notiz | optional | Text | Kerninvestment |

¹ Mindestens eines von ISIN/Ticker erforderlich.
² Wird bei aktivem Live-Refresh automatisch aktualisiert (Stooq/Yahoo).
³ Wird bei aktivem Live-Refresh automatisch ergänzt aus OpenFIGI (`securityType2`).

**FR-1.3** Auto-Erkennung Custodian-Exports anhand Header-Signatur:

| Custodian | Header-Hint (case-insensitive) |
|---|---|
| comdirect | „WKN“, „ISIN“, „Wertpapierbezeichnung“, „Bestand“, „Kurs“ |
| DAB / BNP | „ISIN“, „Stück“, „Kurs in“, „Kurswert in“ |
| V-Bank | „Wertpapier“, „Nominal“, „Kurs“, „Kurswert“ |
| FFB | „ISIN“, „Anteile“, „Anteilspreis“ |
| Hauck Aufhäuser | „WKN/ISIN“, „Bestand“, „Kurs“, „Wert in EUR“ |

Bei erkanntem Format → Mapping vorausgefüllt, User kann bestätigen oder anpassen.

**FR-1.4** Mapping-Wizard für unbekannte Formate:
- Tabellen-Vorschau (erste 20 Zeilen)
- Drop-Down über jeder Spalte: „ISIN | Ticker | Bezeichnung | Stückzahl | Kurs | Währung | Ignorieren“
- Speichern als benutzerdefiniertes Mapping (im LocalStorage), wiederverwendbar

**FR-1.5** Validierung beim Parsen:
- ISIN-Prüfsumme (Mod-10 Doppelt-and-Add)
- Stückzahl > 0
- Kurs > 0
- Währung in [EUR, USD, CHF, GBP, JPY, CAD, AUD]
- Duplikate (gleiche ISIN/Ticker) → zusammenführen mit Warning

### 5.2 ISIN-Auflösung & Preishistorie

**FR-2.1** ISIN → Ticker-Resolver via OpenFIGI:
- Endpoint: `POST https://api.openfigi.com/v3/mapping`
- Request-Body: `[{"idType":"ID_ISIN","idValue":"DE000A0H08H3","exchCode":"GY"}]`
- Response liefert `ticker`, `compositeFIGI`, `securityType2`, `marketSector`
- Server-side Cache (Postgres-Tabelle `isin_resolution`, TTL 90 Tage)

**FR-2.2** Preishistorie-Resolver mit Quellen-Kaskade:

| Priorität | Quelle | URL-Schema | Coverage |
|---|---|---|---|
| 1 | Stooq | `https://stooq.com/q/d/l/?s={ticker}&i=d` | EU + US, sehr breit, EOD |
| 2 | Yahoo Finance | `https://query1.finance.yahoo.com/v7/finance/download/{ticker}?period1={ts}&period2={now}&interval=1d` | global, EOD |
| 3 | Bundesbank Zeitreihen | `https://www.bundesbank.de/statistic-rmi/StatisticDownload?...` | dt. Anleihen-Renditen |
| 4 | Manuelle Anlageklassen-Proxy-Reihe | bestehende `historical.ts` Datensätze | Fallback für nicht-auflösbare Positionen |

**FR-2.3** Caching & Persistence:
- Tabelle `price_history (isin, ticker, date, close, currency, source, fetched_at)`
- Refresh-Strategie: ein Hintergrund-Job pro Session, der für jede ISIN max. 1×/Tag eine Aktualisierung anstößt.
- Vollabzug initial (max. verfügbare Historie, oft 20+ Jahre für gängige ETFs/Aktien).

**FR-2.4** FX-Konvertierung:
- Quelle: ECB Reference Rates via Frankfurter (`https://api.frankfurter.app/{date}?from=USD&to=EUR`)
- Tagesgenau, EUR-basiert, kostenfrei, keine Authentifizierung.
- Fallback: Stooq FX (`USDEUR=X` etc.).

### 5.3 Backtest-Integration

**FR-3.1** Neuer Engine-Modus in `src/lib/engine/historical.ts`:
- `runHoldingsBacktest(holdings: Holding[], window: DateRange, config: BacktestConfig): BacktestResult`
- Berechnet täglich gewichtete Portfolio-Returns aus realen Schlusskursen.
- Reinvestiert Dividenden (Dividend-adjusted-Close von Yahoo/Stooq).
- FX-bereinigt zu EUR.

**FR-3.2** Position-genaue Drawdowns:
- Pro Position: max. Drawdown im Window, Erholungsdauer, Volatilität (annualisiert).
- Aggregat: gewichtete Portfolio-Volatilität, Sharpe (vs. €STR), Sortino, Max-DD.

**FR-3.3** Stresstest-Erweiterungen (zusätzlich zu bestehenden Szenarien):

| Test | Berechnung |
|---|---|
| Klumpenrisiko | Position > 10 % → Flag; > 20 % → Critical |
| Emittentenrisiko | Aggregat pro `compositeFIGI`-Issuer > 15 % → Flag |
| Sektor-Klumpen | Aggregat pro `marketSector` > 35 % → Flag |
| FX-Schock | Alle Nicht-EUR-Positionen ±15 % → Marktwert-Delta |
| Zinsschock | Anleihen-Positionen mit Duration: ΔKurs ≈ −Duration × Δr (±200 bp) |
| Sektor-Crash | Pro Sektor historischer Worst-Quarter (z. B. Tech –35 % Q1/2022, Banken –28 % Q3/2008) |
| 2008-Replay | Portfolio-Wert-Pfad 06/2008 – 03/2009 mit Ist-Gewichten |
| 2020-Replay | Portfolio-Wert-Pfad 02/2020 – 04/2020 mit Ist-Gewichten |

### 5.4 Topf-Mapping

**FR-4.1** Auto-Klassifikation aus OpenFIGI `securityType2`:

| FIGI Type | Topf | Anlageklasse |
|---|---|---|
| Common Stock, ADR, REIT | Topf 1 | Aktien Region |
| ETF (Equity) | Topf 1 | Aktien Region |
| Mutual Fund (Equity) | Topf 1 | Aktien Region |
| ETF (Fixed Income) | Topf 2 | Anleihen |
| Corporate Bond, Govt Bond | Topf 2 | Anleihen |
| Money Market, T-Bill | Topf 3 | Cash |
| Private Equity Fund | Topf 4 | PE |
| Commodity ETF | Topf 4 | Alternatives |
| REIT (non-listed) | Topf 4 | Alternatives |

**FR-4.2** Bei aktivem Bestandsportfolio:
- Topf-1–3-Allokation wird **read-only** aus aggregierten Marktwerten berechnet.
- Toggle „Modellportfolio ↔ Bestandsportfolio“ erhält beide Modi.
- Topf-4 (PE) bleibt separat eingebbar (PE-Fonds haben oft keinen täglichen NAV).

### 5.5 Kundenansicht (HTML + PDF)

**FR-5.1** Neuer Abschnitt „Ihr Portfolio“ analog PE-Block, vor Disclaimer:
- KPI-Kacheln: Marktwert, Anzahl Positionen, Top-Position-Anteil, Anzahl Währungen
- Allokations-Donut + Stacked-Bar (Anlageklasse, Region)
- Top-10 Positionen-Tabelle (anonymisierbar)
- Stresstest-Resultate-Tabelle: Szenario, Verlust EUR, Verlust %, Erholungsdauer
- Klumpen-Hinweise (Ampel)
- Disclaimer-Hinweis-Box (analog PE)

**FR-5.2** Anonymisierungs-Toggle:
- An (Default in Berater-Reports): Echte ISINs + Namen
- Aus (für Schulung/Demo): „Position 1, 2, 3 …“ + maskierte ISIN „DE…H3“

**FR-5.3** PDF-Pagination:
- Bei aktivem Bestandsportfolio: neue Seite zwischen MiFID und PE
- `totalPages` dynamisch: PE+ Bestand → 8 Seiten, nur Bestand → 7, nur PE → 7, keines → 6

---

## 6. Data Model / Schema

### 6.1 TypeScript-Typen

```ts
// src/lib/types.ts (Ergänzung)
export interface Holding {
  id: string;                  // uuid
  isin?: string;               // mind. eins von isin/ticker
  ticker?: string;
  name: string;
  quantity: number;
  costPrice?: number;
  currentPrice: number;
  currency: Currency;          // "EUR" | "USD" | …
  assetClass: AssetClass;      // wie bisher
  region?: Region;
  sector?: Sector;
  duration?: number;           // nur für Bonds, Jahre
  figiType?: string;           // aus OpenFIGI, optional
  proxyIsin?: string;          // Fallback-Proxy für Backtest
  note?: string;
  resolutionStatus: "ok" | "partial" | "proxy" | "failed";
  priceHistorySource?: "stooq" | "yahoo" | "bundesbank" | "proxy" | "manual";
}

export interface HoldingsState {
  enabled: boolean;            // Toggle Modell- vs. Bestandsportfolio
  holdings: Holding[];
  importMeta?: {
    source: "shc-template" | "comdirect" | "dab" | "vbank" | "ffb" | "hauck" | "manual" | "custom";
    importedAt: string;        // ISO date
    fileName: string;
  };
  anonymized: boolean;
  lastBacktestRun?: string;
}

export interface HoldingsBacktestResult {
  totalValue: number;
  totalCost: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  weights: Record<string, number>;          // by holding id
  classWeights: Record<AssetClass, number>;
  regionWeights: Record<Region, number>;
  currencyWeights: Record<Currency, number>;
  positionMetrics: PositionMetric[];        // Vola, MaxDD, Sharpe pro Position
  portfolioMetrics: {
    annualizedReturn: number;
    annualizedVol: number;
    sharpe: number;
    sortino: number;
    maxDrawdown: number;
    recoveryDays: number;
  };
  stressTests: StressTestResult[];
  concentrationFlags: ConcentrationFlag[];
}
```

### 6.2 Postgres-Tabellen (für Cache)

```sql
CREATE TABLE isin_resolution (
  isin            CHAR(12) PRIMARY KEY,
  ticker          TEXT,
  composite_figi  TEXT,
  security_type2  TEXT,
  market_sector   TEXT,
  exch_code       TEXT,
  resolved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  source          TEXT DEFAULT 'openfigi'
);

CREATE TABLE price_history (
  isin       CHAR(12) NOT NULL,
  ticker     TEXT NOT NULL,
  date       DATE NOT NULL,
  close      NUMERIC(20, 6) NOT NULL,
  currency   CHAR(3) NOT NULL,
  source     TEXT NOT NULL,           -- stooq | yahoo | bundesbank | manual
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (isin, date)
);

CREATE INDEX idx_price_history_isin ON price_history(isin);
CREATE INDEX idx_price_history_date ON price_history(date);

CREATE TABLE fx_history (
  date     DATE NOT NULL,
  base     CHAR(3) NOT NULL,
  quote    CHAR(3) NOT NULL,
  rate     NUMERIC(18, 8) NOT NULL,
  source   TEXT DEFAULT 'frankfurter',
  PRIMARY KEY (date, base, quote)
);
```

---

## 7. API Contracts

Alle Endpoints unter `/api/holdings/*`, server-side, kein Streaming an den Client von Drittservices.

### 7.1 `POST /api/holdings/import`
Upload Excel oder CSV.
- Body: `multipart/form-data`, Field `file`
- Response:
```json
{
  "detectedFormat": "comdirect",
  "rows": 23,
  "preview": [ { "isin": "DE...", "name": "...", ... } ],
  "warnings": [ { "row": 4, "msg": "ISIN-Prüfsumme falsch" } ]
}
```

### 7.2 `POST /api/holdings/resolve`
Auflösung Batch.
- Body: `{ "isins": ["DE000A0H08H3", "US0378331005", ...] }`
- Response:
```json
{
  "results": {
    "DE000A0H08H3": { "ticker": "EUNL.DE", "type": "ETF", "source": "openfigi" },
    "US0378331005": { "ticker": "AAPL",    "type": "Common Stock", "source": "openfigi" }
  },
  "failed": []
}
```

### 7.3 `POST /api/holdings/prices`
Preishistorie laden (mit Cache).
- Body: `{ "tickers": ["EUNL.DE","AAPL"], "from": "2005-01-01" }`
- Response: NDJSON-Stream mit `{ ticker, date, close, currency }`

### 7.4 `POST /api/holdings/backtest`
Position-genauer Backtest.
- Body: `{ "holdings": [...], "window": {"from":"2005-01-01","to":"2024-12-31"}, "config": {...} }`
- Response: `HoldingsBacktestResult` (siehe 6.1)

### 7.5 `GET /api/holdings/template`
Liefert die SHC-Excel-Vorlage zum Download.
- Response: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` Stream

---

## 8. Edge Cases / Failure Modes

| Edge Case | Behandlung |
|---|---|
| ISIN nicht in OpenFIGI | Status `failed` → User bekommt Drop-Down zum manuellen Anlageklassen-Proxy. Backtest läuft mit Proxy-Reihe. |
| Stooq + Yahoo liefern keine Daten | Status `proxy` → identisch zur Anlageklassen-Proxy-Logik. |
| Preishistorie kürzer als Backtest-Window | Window automatisch auf gemeinsamen Schnittmenge der Positionen verkürzt. UI zeigt: „Backtest-Window angepasst auf 01/2010–12/2024 wegen Position X“. |
| Excel mit verbundenen Zellen / Header in Zeile 5 | Mapping-Wizard erlaubt Setzen der Header-Zeile manuell. |
| Komma vs. Punkt als Dezimaltrennzeichen | Auto-Detection (deutsche Locale-Heuristik). |
| Doppel-Listings (gleiche ISIN auf .DE und .L) | Ein einziger Eintrag, primärer Ticker wird heuristisch (Volume) gewählt. |
| Stooq Rate-Limit (HTTP 429) | Exponential Backoff, Wartezeit max. 30 s, dann Fallback Yahoo. |
| Yahoo Endpoint-Bruch (Stand 2025) | Resilient: bei 401/404 sofort auf Stooq, dann Bundesbank, dann Proxy. |
| Sehr großes Depot (> 200 Positionen) | Streaming-UI (Virtuelle Liste), Backtest in Web Worker. |
| OpenFIGI-Daily-Quota erreicht | Lokaler Cache reicht für 99 % der Wiederbesuche; harter Cap zeigt Banner. |

---

## 9. Acceptance Criteria

- [ ] Excel-Vorlage downloadbar; Auto-Validierung in Excel funktioniert.
- [ ] Import einer comdirect-, DAB-, V-Bank-Datei wird ohne Wizard korrekt erkannt.
- [ ] 95 % aller gängigen DE/EU/US-ISINs werden via OpenFIGI in < 2 s aufgelöst.
- [ ] Preishistorie für DAX-30 + EuroStoxx 50 + S&P-500-Werte verfügbar > 15 Jahre.
- [ ] Position-Backtest liefert Sharpe, Vola, MaxDD pro Position und für Gesamt-Portfolio.
- [ ] Klumpenrisiko-Ampel zeigt korrekt bei > 10 % / > 15 % / > 20 % Einzelposition.
- [ ] Stresstest 2008-Replay produziert plausible Drawdown-Werte (60 %-Aktien-Depot ca. −35 %–−45 %).
- [ ] FX-Schock ±15 % funktioniert positions-genau für Nicht-EUR-Positionen.
- [ ] Bestand-Block erscheint in HTML- und PDF-Kundenansicht.
- [ ] Anonymisierungs-Toggle blendet ISIN/Namen korrekt aus.
- [ ] PDF-Pagination dynamisch: 6/7/7/8 Seiten je nach Bestand+PE-Kombination.
- [ ] Alle externen API-Calls server-side; im Browser-Network-Tab sichtbar nur `/api/holdings/*`.

---

## 10. Test Plan / Test Cases

### 10.1 Unit
- ISIN-Prüfsumme: 20 valide + 10 invalide ISINs
- Excel-Parser: SHC-Vorlage, comdirect, DAB, V-Bank, FFB, Hauck, generisches CSV
- Mapping-Wizard-State (Spalten-zu-Feld-Persistenz)
- Topf-Auto-Klassifikation: alle FIGI-Types
- FX-Konvertierung: Querkurs USD→EUR und CHF→EUR an festen Daten

### 10.2 Integration
- `POST /api/holdings/import` mit allen 7 Vorlagen
- `POST /api/holdings/resolve` Batch 50 ISINs
- `POST /api/holdings/prices` mit 20 Tickers, Cache-Hit + Cache-Miss
- `POST /api/holdings/backtest` mit Demo-Depot 10 Positionen, 10 Jahre

### 10.3 E2E (Playwright)
- Excel-Upload → Wizard → Auflösung → Backtest → Kundenansicht-Export
- Anonymisierungs-Toggle Round-Trip
- PE + Bestand kombiniert → 8-seitiges PDF generiert

### 10.4 Daten-Smoketests (CI-täglich)
- Stooq-Endpoint liefert valide CSV für `eunl.de`, `^spx`, `^dax`
- OpenFIGI antwortet auf bekannte ISIN
- Frankfurter-API liefert EUR/USD vom letzten Werktag

---

## 11. Implementation Notes

### 11.1 Dateien (neu / verändert)

```
NEW:
  src/components/sections/HoldingsImport.tsx
  src/components/sections/HoldingsMappingWizard.tsx
  src/components/sections/HoldingsHeatmap.tsx
  src/components/sections/HoldingsResults.tsx
  src/lib/engine/holdings.ts
  src/lib/import/excelHoldings.ts
  src/lib/import/customDetect.ts
  src/lib/data/openfigi.ts
  src/lib/data/stooq.ts
  src/lib/data/yahoo.ts
  src/lib/data/frankfurter.ts
  src/lib/data/priceCache.ts
  src/lib/export/clientReport/holdings.ts
  src/app/api/holdings/import/route.ts
  src/app/api/holdings/resolve/route.ts
  src/app/api/holdings/prices/route.ts
  src/app/api/holdings/backtest/route.ts
  src/app/api/holdings/template/route.ts
  prisma/migrations/<ts>_holdings_cache/migration.sql

CHANGED:
  src/lib/types.ts              (+Holding, +HoldingsState, +HoldingsBacktestResult)
  src/lib/store.ts              (+holdings reducer)
  src/lib/i18n.tsx              (+~40 Strings DE/EN)
  src/components/sections/PortfolioBuilder.tsx  (Toggle Modell vs. Bestand)
  src/components/sections/HistoricalAnalysis.tsx (Bestand-Pfad)
  src/components/sections/ClientView.tsx        (Toggle „Bestand zeigen“)
  src/lib/export/clientReport/html.ts           (+Bestand-Section)
  src/lib/export/clientReport/pdf.ts            (+Bestand-Seite, dyn. Pagination)
  prisma/schema.prisma                          (+IsinResolution, +PriceHistory, +FxHistory)
```

### 11.2 Architektur-Prinzipien

- **Server-side only** für alle Drittanbieter-Calls. Frontend ruft ausschließlich `/api/holdings/*`. Begründung: DSGVO (keine ISIN/Namen an Yahoo-Tracker), Rate-Limit-Pooling, Cache-Konsistenz.
- **Cache-First**: Jeder Request prüft erst `price_history` / `isin_resolution`. Stooq/Yahoo nur bei Cache-Miss oder älter als 24 h.
- **Graceful Degradation**: Mehrstufiger Fallback (Stooq → Yahoo → Bundesbank → Anlageklassen-Proxy). Kein Hard-Fail durch externe Quelle.
- **Web-Worker für Backtest** bei > 50 Positionen, sonst Main-Thread (synchroner UX-Flow).

### 11.3 Rate-Limits & Quotas

| Quelle | Limit | Strategie |
|---|---|---|
| OpenFIGI ohne Key | 25 req / 6 s | Batch (max. 100 IDs / Request), Server-Pool |
| OpenFIGI mit Key (kostenfrei) | 250 req / 6 s | Optional ENV-Var `OPENFIGI_API_KEY` |
| Stooq | inoffiziell ~5 req/s | Throttle 200 ms, Backoff bei 429 |
| Yahoo Finance | undokumentiert | Throttle 500 ms, Crumb-Cookie ggf. erforderlich |
| Frankfurter / ECB | „faire Nutzung“ | Cache 24 h |

### 11.4 Library-Auswahl

- `exceljs` (bereits installiert) — Excel-Parser + Vorlagen-Generator
- `papaparse` — CSV-Parser
- Native `fetch` mit `AbortController` für externe APIs
- Kein zusätzliches Backtest-Lib — eigene `holdings.ts` engine im Stil der bestehenden `historical.ts`

### 11.5 Sicherheit

- ISIN als PII behandeln: nicht in Logs, nicht in Vercel-Edge-Logs.
- Rate-Limit pro Session-IP (max. 200 ISIN-Requests / 5 min).
- CSP unverändert (alle Calls intern).
- Excel-Dateien max. 5 MB, MIME-Whitelist.

---

## 12. Roadmap

| Sprint | Inhalt | Tage |
|---|---|---|
| **S1 — Foundation** | Excel-Vorlage, Parser, manuelle Tabelle, Topf-Mapping, Toggle in `PortfolioBuilder` | 2 |
| **S2 — Resolver** | OpenFIGI-Adapter, Cache-Layer, ISIN-Auflösung-API, Mapping-Wizard | 2 |
| **S3 — Prices & Backtest** | Stooq + Yahoo + Frankfurter Adapter, Cache-Migration, `holdings.ts` Engine, Position-Metriken | 3 |
| **S4 — Stresstests** | Klumpenrisiko, FX-Schock, Zinsschock, 2008/2020-Replay, Heatmap-Komponente | 2 |
| **S5 — Kundenansicht** | HTML- + PDF-Section, dynamische Pagination, Anonymisierung, i18n | 2 |
| **S6 — Custodian-Importe** | comdirect, DAB, V-Bank, FFB, Hauck Templates + Auto-Detect | 1 |
| **S7 — Hardening** | E2E-Tests, Daten-Smoketests in CI, Performance-Tuning > 100 Positionen | 1 |

**Total: ~13 Personentage** für vollständigen Phase-3-Import-und-Backtest mit kostenfreien Datenquellen.

---

## 13. Open Questions

1. **OpenFIGI-Key**: kostenfrei bei [openfigi.com/api](https://www.openfigi.com/api) registrierbar — sollen wir gleich einen für SHC anlegen (höheres Rate-Limit)? *Empfehlung: ja.*
2. **Yahoo-Stabilität**: Yahoo bricht regelmäßig undokumentierte Endpoints. Sollen wir alternativ auf **Twelve Data Free Tier** (800 req/Tag) setzen? *Empfehlung: erst nur Stooq+Yahoo, Twelve als Phase-2.*
3. **Anonymisierung Default**: Standard ein oder aus? *Empfehlung: in Berater-Reports an, in Schulungs-Demos aus.*
4. **Bond-Duration**: Aus Excel-Spalte importieren oder via Bundesbank/EZB heuristisch berechnen? *Empfehlung: User-Eingabe optional, sonst nicht im Zinsschock berücksichtigt.*
5. **Steuerlogik**: Soll der Backtest Realisierungs-Steuern (KESt/Soli) berücksichtigen oder Brutto bleiben? *Empfehlung: Brutto im Backtest, Netto-Sicht später separat.*
6. **DSGVO-Audit**: ISINs sind PII-nah. Brauchen wir explizite Einwilligung des Endkunden für externe Lookup-Calls? *Empfehlung: Disclaimer im UI + DSV-Anhang.*

---

## 14. Status

- [x] Konzept abgenommen (Vorschlag-Stufe)
- [ ] Detail-Spec abgenommen
- [ ] OpenFIGI-Key registriert
- [ ] Sprint S1 gestartet