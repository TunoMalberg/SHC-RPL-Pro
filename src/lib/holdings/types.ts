/**
 * Bestandsportfolio — Typen für Excel-Import + ISIN-Backtest.
 *
 * Datenfluss:
 *   Excel/CSV/Manual  →  Holding[]  →  resolve via OpenFIGI
 *                                    →  load prices via Yahoo v8 / Stooq / Frankfurter (FX)
 *                                    →  runHoldingsBacktest()
 *                                    →  HoldingsBacktestResult
 *                                    →  UI + Kundenansicht
 */

export type HoldingCurrency = "EUR" | "USD" | "CHF" | "GBP" | "JPY" | "CAD" | "AUD";

export type HoldingAssetClass =
  | "Aktien Welt"
  | "Aktien USA"
  | "Aktien Europa"
  | "Aktien Schwellenländer"
  | "Aktien Sektor"
  | "Anleihen Staat"
  | "Anleihen Unternehmen"
  | "Anleihen High Yield"
  | "Geldmarkt / Cash"
  | "Rohstoffe / Gold"
  | "Immobilien (REIT)"
  | "Alternatives / PE"
  | "Mischfonds"
  | "Sonstiges";

export type HoldingResolutionStatus = "pending" | "ok" | "partial" | "proxy" | "failed";

export interface Holding {
  /** Stable id (uuid). */
  id: string;
  /** ISIN — bevorzugt, optional wenn Ticker gegeben. */
  isin?: string;
  /** Yahoo-Ticker (z. B. AAPL, EUNL.DE, ^GSPC). */
  ticker?: string;
  /** Anzeigename. */
  name: string;
  /** Stückzahl. */
  quantity: number;
  /** Einstandskurs pro Stück (optional). */
  costPrice?: number;
  /** Aktueller Kurs pro Stück. */
  currentPrice: number;
  /** Notierungswährung. */
  currency: HoldingCurrency;
  /** Anlageklasse — wird auto-klassifiziert oder manuell überschrieben. */
  assetClass: HoldingAssetClass;
  /** Region (optional). */
  region?: string;
  /** Sektor (optional). */
  sector?: string;
  /** Modified Duration in Jahren — nur Bonds, optional. */
  duration?: number;
  /** OpenFIGI securityType2 (Cache). */
  figiType?: string;
  /** OpenFIGI compositeFIGI für Issuer-Konzentration. */
  compositeFIGI?: string;
  /** Notiz. */
  note?: string;
  /** Status der Auflösung. */
  resolutionStatus: HoldingResolutionStatus;
  /** Quelle der Preishistorie. */
  priceHistorySource?: "yahoo" | "stooq" | "proxy" | "manual";
  /** Warning-/Error-Message von Resolver. */
  resolutionMessage?: string;
}

export interface HoldingsState {
  enabled: boolean;
  holdings: Holding[];
  importMeta?: {
    source: "shc-template" | "comdirect" | "dab" | "vbank" | "ffb" | "hauck" | "manual" | "custom";
    importedAt: string;
    fileName: string;
  };
  anonymized: boolean;
}

export interface PositionMetric {
  holdingId: string;
  isin?: string;
  ticker?: string;
  name: string;
  weight: number; // 0..1
  marketValueEUR: number;
  costBasisEUR?: number;
  pnlPctVsCost?: number;
  annualizedReturn?: number;
  annualizedVol?: number;
  maxDrawdown?: number;
  recoveryDays?: number;
  /** Anzahl Tage mit verfügbarer Preishistorie. */
  historyDays?: number;
  historyStart?: string;
  historyEnd?: string;
}

export interface ConcentrationFlag {
  type: "single_position" | "issuer" | "sector" | "currency" | "region";
  level: "info" | "warn" | "critical";
  label: string;
  weight: number;
  threshold: number;
  message: string;
}

export interface StressTestResult {
  scenario:
    | "crisis_2008"
    | "covid_2020"
    | "dotcom_2000"
    | "rate_shock_up"
    | "rate_shock_down"
    | "fx_shock"
    | "sector_tech_crash"
    | "stagflation_70s";
  scenarioLabel: string;
  /** Verlust in % auf den heutigen Marktwert. */
  lossPct: number;
  /** Verlust in EUR. */
  lossEUR: number;
  /** Erholungsdauer in Tagen (falls historisch ableitbar). */
  recoveryDays?: number;
  description: string;
}

export interface AllocationBucket {
  key: string;
  label: string;
  weight: number;
  marketValueEUR: number;
}

export interface HoldingsBacktestResult {
  totalMarketValueEUR: number;
  totalCostBasisEUR?: number;
  unrealizedPnLEUR?: number;
  unrealizedPnLPct?: number;
  positionMetrics: PositionMetric[];
  classWeights: AllocationBucket[];
  regionWeights: AllocationBucket[];
  currencyWeights: AllocationBucket[];
  topHoldings: { name: string; weight: number; marketValueEUR: number; isin?: string }[];
  /** Gewichtete Portfolio-Returns über das längste gemeinsame Window. */
  portfolioMetrics: {
    windowFrom: string;
    windowTo: string;
    windowYears: number;
    annualizedReturn: number;
    annualizedVol: number;
    sharpe: number;
    sortino: number;
    maxDrawdown: number;
    /** Datum des Höchststands vor dem schlimmsten Drawdown (ISO yyyy-mm-dd). */
    maxDrawdownPeakDate?: string;
    /** Datum des Tiefpunkts des schlimmsten Drawdowns (ISO yyyy-mm-dd). */
    maxDrawdownTroughDate?: string;
    /** Datum der Rückkehr zum Peak (oder undefined, falls bis Window-Ende noch nicht erreicht). */
    maxDrawdownRecoveryDate?: string;
    /** Handelstage von Peak bis Trough (Dauer der Abwärtsphase). */
    drawdownPeakToTroughDays?: number;
    /** Handelstage vom Trough bis zur Wiedererreichung des Peaks; bei nicht erfolgter Erholung Tage bis Serienende. */
    drawdownRecoveryDays?: number;
    /** Handelstage Peak → Recovery (bzw. Serienende, falls noch nicht erholt). */
    drawdownUnderwaterDays?: number;
    /** True, wenn der Peak bis Serienende wieder erreicht wurde. */
    drawdownRecovered?: boolean;
    bestYear: number;
    worstYear: number;
    /** Gewichtete tägliche EUR-Returns als kumuliertes Index = 100. */
    indexPath: { date: string; value: number }[];
  };
  stressTests: StressTestResult[];
  concentrationFlags: ConcentrationFlag[];
  warnings: string[];
}