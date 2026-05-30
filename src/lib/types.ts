export interface LiquidityEvent {
  id: string;
  age: number;
  description: string;
  amount: number; // positive = inflow, negative = outflow
}

export interface ClientProfile {
  name: string;
  birthYear: number;
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  currency: string;
  notes: string;
  advisoryDate: string;
  advisoryMeetingType: string;
  advisoryNotes: string;
  advisoryNextSteps: string;
  advisoryRiskDisclosed: boolean;
  advisoryMifidConfirmed: boolean;
}

export interface FinancialInputs {
  initialCapital: number;
  monthlySavings: number;
  annualSavingsIncrease: number;
  desiredMonthlyWithdrawal: number;
  monthlyPension: number;
  pensionStartAge: number;
  inflationRate: number;
  useRealValues: boolean;
}

export interface AssetBucket {
  name: string;
  label: string;
  allocation: number;
  expectedReturn: number;
  volatility: number;
  costs: number;
  taxDrag: number;
  netReturn: number;
}

export type MifidProfile = 'conservative' | 'balanced' | 'growth' | 'speculative';

/**
 * Private-Equity-Fonds (Topf 4 — deterministisch).
 *
 * Eingaben werden im Portfolio-Bereich als 4. Topf gepflegt; die
 * Engine berechnet Capital Calls (Yale-Ramp), Brutto-Distributions
 * (kalibriert auf Ziel-IRR) und NAV (Compound-Balance) deterministisch.
 *
 * Steuerstatus: KESt-endbesteuert (27,5 %) auf den Gewinnanteil
 * jeder Distribution, sobald die kumulierten Brutto-Distributions
 * das tatsächlich abgerufene Kapital (= commitment × callRatio/100)
 * übersteigen.
 */
export interface PEFund {
  /** Stable id (uuid/random). */
  id: string;
  /** Anzeigename / Bezeichnung des Fonds. */
  name: string;
  /** Commitment in € (Zeichnungssumme). */
  commitment: number;
  /** Abrufquote in % (Default 80). */
  callRatio: number;
  /** Ziel-IRR in % (Default 10). */
  irr: number;
  /** Ziel-TVPI als Multiple (Default 1.7). */
  tvpi: number;
  /** Investitionsperiode in Jahren (Default 5). */
  investmentPeriod: number;
  /** Fondslaufzeit in Jahren (Default 14). */
  fundDuration: number;
  /** Investorenalter beim Fonds-Start. */
  startAge: number;
  // ---- J-Curve / Fee-Drag (für Modus „Realistisch" und „Vollständig") ----
  /** Mgmt-Fee p.a. in % auf Commitment während der Investitionsperiode. Default 2.0. */
  mgmtFeeRate?: number;
  /** Mgmt-Fee p.a. in % auf NAV nach Investitionsperiode. Default 1.5. */
  postPeriodFeeRate?: number;
  /** Einmalige Set-up-Kosten in % auf Commitment im Jahr 0. Default 1.0. */
  setupCostPct?: number;
  // ---- Stochastik (nur Modus „Vollständig") ----
  /** Standardabweichung der realisierten IRR in Prozentpunkten (1σ). Default 5. */
  irrVolatility?: number;
  /** Standardabweichung des realisierten TVPI als Multiple (1σ). Default 0.35. */
  tvpiVolatility?: number;
  /** Wahrscheinlichkeit eines Total-/Quasi-Loss pro Fonds (0–1). Default 0.03. */
  lossProbability?: number;
}

/**
 * PE-Modellierungs-Modus (drei Stufen):
 * - 'simple'    : Compound-Balance NAV, deterministisch (Legacy).
 * - 'realistic' : J-Curve über Fee-Drag, deterministisch (Default).
 * - 'full'      : J-Curve + Stochastik (IRR/TVPI variieren je MC-Pfad).
 */
export type PEModelingMode = 'simple' | 'realistic' | 'full';

export interface PortfolioConfig {
  buckets: [AssetBucket, AssetBucket, AssetBucket];
  correlationMatrix: number[][];
  rebalancingFrequency: 'monthly' | 'quarterly' | 'annually' | 'none';
  rebalancingThreshold: number;
  cashYearsTarget: number; // 1-3 years of withdrawals held as cash in withdrawal phase
  kestRate: number; // Austrian KESt / capital gains tax rate in percent (default 27.5)
  mifidProfile?: MifidProfile;
  /** Liste der PE-Fonds (Topf 4). Leer = keine PE-Beteiligung. */
  peFunds?: PEFund[];
  /** PE-Modellierungs-Modus. Default 'realistic'. */
  peModelingMode?: PEModelingMode;
}

export interface SimulationSettings {
  numSimulations: number;
  timeStepMonths: number;
  mode: SimulationMode;
  randomSeed?: number;
}

export type SimulationMode =
  | 'fixed_withdrawal'
  | 'sustainable_withdrawal'
  | 'required_capital'
  | 'required_savings'
  | 'scenario_comparison';

export interface SimulationResult {
  successRate: number;
  medianFinalWealth: number;
  meanFinalWealth: number;
  percentiles: Record<string, number>;
  medianPath: number[];
  p10Path: number[];
  p25Path: number[];
  p75Path: number[];
  p90Path: number[];
  worstPath: number[];
  bestPath: number[];
  allPaths?: number[][];
  failureYear: number | null;
  medianFailureYear: number | null;
  sustainableWithdrawal?: number;
  requiredCapital?: number;
  requiredSavings?: number;
  portfolioReturn: number;
  portfolioVolatility: number;
  maxDrawdown: number;
  sharpeRatio: number;
  yearLabels: number[];
  annualWithdrawals: number[];
  annualPortfolioValues: number[];
  withdrawalHeatmap?: { withdrawal: number; successRate: number }[];
  /** PE-NAV-Pfad (Median über Stochastik bzw. deterministisch). */
  pePath?: number[];
  /** PE-NAV-Pfad p25 (nur im stochastischen Modus). */
  pePathP25?: number[];
  /** PE-NAV-Pfad p75 (nur im stochastischen Modus). */
  pePathP75?: number[];
  /** Anteil PE-Pfade mit TVPI ≥ 1,0× (Erfolgsquote PE-Tranche). */
  peSuccessRate?: number;
  /** Median realisierte PE-IRR über alle Stochastik-Pfade (in %). */
  peMedianIRR?: number;
  /** Median realisierter PE-TVPI über alle Stochastik-Pfade. */
  peMedianTVPI?: number;
}

export interface HistoricalData {
  year: number;
  equityReturn: number;
  bondReturn: number;
  cashReturn: number;
  inflation: number;
}

export interface HistoricalResult {
  startYear: number;
  endYear: number;
  success: boolean;
  finalWealth: number;
  maxDrawdown: number;
  path: number[];
  worstYear: number;
  worstReturn: number;
}

export interface HistoricalAnalysis {
  scenarios: HistoricalResult[];
  overallSuccessRate: number;
  averageFinalWealth: number;
  /** Median-Endvermögen über alle rollierenden Szenarien (für Vergleich mit MC-Median). */
  medianFinalWealth: number;
  worstScenario: HistoricalResult;
  bestScenario: HistoricalResult;
  drawdownDistribution: number[];
}

export interface DetailedYearRow {
  year: number;
  age: number;
  phase: "Anspar" | "Entnahme";
  startTotal: number;
  startCash: number;
  startBonds: number;
  startEquities: number;
  returnCash: number;
  returnBonds: number;
  returnEquities: number;
  returnCashPct: number;
  returnBondsPct: number;
  returnEquitiesPct: number;
  cashflow: number;
  cashflowLabel: string;
  liquidityEvent: number;
  liquidityEventLabel: string;
  rebalanced: boolean;
  rebalCashDelta: number;
  rebalBondsDelta: number;
  rebalEquitiesDelta: number;
  rebalSource: string; // e.g. "Aktien → Liquidität", "Anleihen → Liquidität (Verlustschutz)"
  endCash: number;
  endBonds: number;
  endEquities: number;
  endTotal: number;
  cumulativeInflation: number;
  /** Capital Calls aus PE-Fonds in diesem Jahr (positiv, drainen Cash). */
  peCall?: number;
  /** Brutto-Distributions in diesem Jahr (positiv). */
  peDistGross?: number;
  /** Netto-Distributions nach KESt in diesem Jahr (positiv). */
  peDistNet?: number;
  /** Aggregierter NAV aller PE-Fonds am Ende des Jahres. */
  peNav?: number;
}

export interface DetailedSimTrace {
  rows: DetailedYearRow[];
  simulationIndex: number;
  seed: number;
  finalWealth: number;
  success: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  inputs: FinancialInputs;
  portfolio: PortfolioConfig;
  result?: SimulationResult;
  /** Quelle: "manual" = vom Berater gespeichert, "multirun" = automatisch
   *  vom Modus „Szenariovergleich" erzeugt (4 MiFID-Profile). Wird verwendet,
   *  damit Multi-Runs nur ihre eigenen Szenarien ersetzen, nicht die manuell
   *  gespeicherten. */
  source?: "manual" | "multirun";
}

/**
 * Advisor profile — used as letterhead / contact block on the client-facing
 * report (HTML + PDF). Not persisted to localStorage per the audit's positive
 * finding („Kein localStorage / sessionStorage / Cookie-Schreiben →
 * keine PII-Persistenz im Browser"). The advisor re-enters once per session,
 * or the bank can pre-fill via build-time env vars.
 */
export interface AdvisorProfile {
  /** Full name incl. title, e.g. "Dr. Anna Berater" */
  name: string;
  /** Job title, e.g. "Senior Private Banker" */
  title: string;
  /** E-Mail for the "arrange appointment" button */
  email: string;
  /** Phone incl. country code */
  phone: string;
  /** Bank / institution legal name */
  bankName: string;
  /** Branch name, e.g. "Niederlassung Wien Innere Stadt" */
  branch: string;
  /** Postal address of the branch, multi-line (\n) */
  address: string;
  /** Optional website URL */
  website: string;
  /** Logo as data URL (PNG/SVG). Inlined so the HTML stays self-contained. */
  logoDataUrl: string;
}

/**
 * UI-Bedienmodus.
 * - 'classic' : Reduzierte Oberfläche für Standardberatung (10 Tabs, ohne
 *   Bestandsportfolio, ohne Korrelationsmatrix, ohne 4. Topf, ohne
 *   Rebalancing-Eingaben). Dafür mehr Inline-Erklärungen.
 * - 'pro'     : Voller Funktionsumfang (11 Tabs, alle Profi-Eingaben,
 *   minimierte Erklärtexte).
 *
 * Beide Modi nutzen dieselbe Engine. Klassik liefert für ausgeblendete
 * Pro-Eingaben fest verdrahtete Best-Practice-Defaults (Korrelationen,
 * Rebalancing jährlich/5 %), sodass Ergebnisse, Quantile, MaxDrawdown
 * und Exporte bei identischen sichtbaren Eingaben bitidentisch zu Pro
 * sind.
 */
export type UIMode = 'classic' | 'pro';

export interface AppState {
  client: ClientProfile;
  advisor: AdvisorProfile;
  inputs: FinancialInputs;
  portfolio: PortfolioConfig;
  settings: SimulationSettings;
  liquidityEvents: LiquidityEvent[];
  result: SimulationResult | null;
  historicalResult: HistoricalAnalysis | null;
  detailedTrace: DetailedSimTrace | null;
  scenarios: Scenario[];
  activeTab: string;
  /** Bestandsportfolio (Excel-Import + ISIN-Backtest). Optional. */
  holdings?: import("./holdings/types").HoldingsState;
  /** UI-Modus (Klassik/Pro). Default 'classic'. Persistiert in localStorage. */
  uiMode: UIMode;
  /** Wurde der Modus beim Erstaufruf bereits gewählt? Wenn nicht, zeigt die
   *  App einmalig ein Auswahl-Modal. */
  uiModeChosen: boolean;
}