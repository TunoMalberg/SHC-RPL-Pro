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

export interface AppState {
  client: ClientProfile;
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