import type {
  ClientProfile,
  FinancialInputs,
  PortfolioConfig,
  SimulationSettings,
} from "./types";

export const defaultClient: ClientProfile = {
  name: "Max Mustermann",
  birthYear: 1980,
  currentAge: 45,
  retirementAge: 65,
  lifeExpectancy: 90,
  currency: "EUR",
  notes: "",
};

export const defaultInputs: FinancialInputs = {
  initialCapital: 250000,
  monthlySavings: 1500,
  annualSavingsIncrease: 2.0,
  desiredMonthlyWithdrawal: 3000,
  monthlyPension: 1200,
  pensionStartAge: 65,
  inflationRate: 2.5,
  useRealValues: true,
};

export const defaultPortfolio: PortfolioConfig = {
  buckets: [
    {
      name: "cash",
      label: "Cash / Liquidity",
      allocation: 15,
      expectedReturn: 2.0,
      volatility: 0.5,
      costs: 0.1,
      taxDrag: 0.3,
      netReturn: 1.6,
    },
    {
      name: "bonds",
      label: "Bonds / Fixed Income",
      allocation: 35,
      expectedReturn: 3.5,
      volatility: 5.0,
      costs: 0.3,
      taxDrag: 0.5,
      netReturn: 2.7,
    },
    {
      name: "equities",
      label: "Equities / Stocks",
      allocation: 50,
      expectedReturn: 7.0,
      volatility: 16.0,
      costs: 0.5,
      taxDrag: 0.8,
      netReturn: 5.7,
    },
  ],
  correlationMatrix: [
    [1.0, 0.2, 0.05],
    [0.2, 1.0, 0.3],
    [0.05, 0.3, 1.0],
  ],
  rebalancingFrequency: "annually",
  rebalancingThreshold: 5,
};

export const defaultSettings: SimulationSettings = {
  numSimulations: 5000,
  timeStepMonths: 12,
  mode: "fixed_withdrawal",
};