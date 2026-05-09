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

export interface PortfolioConfig {
  buckets: [AssetBucket, AssetBucket, AssetBucket];
  correlationMatrix: number[][];
  rebalancingFrequency: 'monthly' | 'quarterly' | 'annually' | 'none';
  rebalancingThreshold: number;
  cashYearsTarget: number; // 1-3 years of withdrawals held as cash in withdrawal phase
  kestRate: number; // Austrian KESt / capital gains tax rate in percent (default 27.5)
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
}