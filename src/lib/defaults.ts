import type {
  AdvisorProfile,
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
  advisoryDate: new Date().toISOString().split("T")[0],
  advisoryMeetingType: "in_person",
  advisoryNotes: "",
  advisoryNextSteps: "",
  advisoryRiskDisclosed: false,
  advisoryMifidConfirmed: false,
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

// Default KESt rate (Austrian capital gains tax) applied to (gross return − costs)
const KEST_DEFAULT = 27.5;
const autoTax = (grossReturn: number, costs: number, kest = KEST_DEFAULT) =>
  Math.max(0, (grossReturn - costs) * (kest / 100));

const cashGross = 2.0;
const cashCost = 0.1;
const cashTax = autoTax(cashGross, cashCost); // ≈ 0.52
const bondsGross = 3.5;
const bondsCost = 0.3;
const bondsTax = autoTax(bondsGross, bondsCost); // ≈ 0.88
const eqGross = 7.0;
const eqCost = 0.5;
const eqTax = autoTax(eqGross, eqCost); // ≈ 1.79

export const defaultPortfolio: PortfolioConfig = {
  buckets: [
    {
      name: "cash",
      label: "Bargeld / Liquidität",
      allocation: 15,
      expectedReturn: cashGross,
      volatility: 2.0,
      costs: cashCost,
      taxDrag: +cashTax.toFixed(2),
      netReturn: +(cashGross - cashCost - cashTax).toFixed(2),
    },
    {
      name: "bonds",
      label: "Anleihen / Festverzinslich",
      allocation: 35,
      expectedReturn: bondsGross,
      volatility: 5.5,
      costs: bondsCost,
      taxDrag: +bondsTax.toFixed(2),
      netReturn: +(bondsGross - bondsCost - bondsTax).toFixed(2),
    },
    {
      name: "equities",
      label: "Aktien / Beteiligungen",
      allocation: 50,
      expectedReturn: eqGross,
      volatility: 18.0,
      costs: eqCost,
      taxDrag: +eqTax.toFixed(2),
      netReturn: +(eqGross - eqCost - eqTax).toFixed(2),
    },
  ],
  correlationMatrix: [
    [1.0, 0.2, -0.05],
    [0.2, 1.0, 0.25],
    [-0.05, 0.25, 1.0],
  ],
  rebalancingFrequency: "annually",
  rebalancingThreshold: 5,
  cashYearsTarget: 2,
  kestRate: KEST_DEFAULT,
};

export const defaultSettings: SimulationSettings = {
  numSimulations: 5000,
  timeStepMonths: 12,
  mode: "fixed_withdrawal",
};

export const defaultAdvisor: AdvisorProfile = {
  name: "",
  title: "Private Banking",
  email: "",
  phone: "",
  bankName: "Schelhammer Capital Bank AG",
  branch: "",
  address: "Goldschmiedgasse 3\n1010 Wien",
  website: "https://www.schelhammer.at",
  logoDataUrl: "",
};