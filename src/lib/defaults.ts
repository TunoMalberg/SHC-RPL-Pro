import type {
  AdvisorProfile,
  ClientProfile,
  FinancialInputs,
  LVHolding,
  PEFund,
  PEProgram,
  PortfolioConfig,
  SimulationSettings,
  WBAHolding,
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
  // CR 4 (Freigabe 2026-08): Neue Planungen starten OHNE Wunschbetrag im
  // Modus „berechnen, was möglich ist" — kein erfundener Ankerwert.
  // Bestehende Sessions behalten ihren gespeicherten Wert.
  desiredMonthlyWithdrawal: null,
  monthlyPension: 1200,
  pensionStartAge: 65,
  inflationRate: 2.5,
  useRealValues: true,
  // Default ON: Berater geben Entnahmewünsche typischerweise in heutiger
  // Kaufkraft an. Engine inflationiert dann bis Pensionsbeginn, sodass
  // der zukünftige Nominalbetrag entnommen wird. Siehe Engine-Kommentar
  // in montecarlo.ts (FIX 2026-Q4).
  inflateWithdrawalToRetirement: true,
};

// Default KESt rate (Austrian capital gains tax) applied to (gross return − costs)
const KEST_DEFAULT = 27.5;
const autoTax = (grossReturn: number, costs: number, kest = KEST_DEFAULT) =>
  Math.max(0, (grossReturn - costs) * (kest / 100));

// AP7: Zinsen aus Bankeinlagen unterliegen einem eigenen KESt-Satz (25 %),
// der jährlich bei Zufluss anfällt (siehe PortfolioConfig.depositTaxRate).
export const DEPOSIT_TAX_DEFAULT = 25;
const cashGross = 1.5;
const cashCost = 0.0;
const cashTax = autoTax(cashGross, cashCost, DEPOSIT_TAX_DEFAULT); // ≈ 0.38
const bondsGross = 3.5;
const bondsCost = 0.6;
const bondsTax = autoTax(bondsGross, bondsCost); // ≈ 0.80
const eqGross = 7.0;
const eqCost = 1.5;
const eqTax = autoTax(eqGross, eqCost); // ≈ 1.51

export const defaultPortfolio: PortfolioConfig = {
  buckets: [
    {
      name: "cash",
      label: "Bargeld / Liquidität",
      allocation: 15,
      expectedReturn: cashGross,
      volatility: 0.2,
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
  depositTaxRate: DEPOSIT_TAX_DEFAULT,
  peFunds: [],
  // Default ist „Realistisch": J-Curve aktiv, Stochastik aus → Berater
  // kann reproduzierbare Zahlen erklären, Kunde sieht aber realistische
  // NAV-Trajektorie inkl. Fee-Drag in den ersten Jahren.
  peModelingMode: "realistic",
};

// ---- Industrie-Defaults für die J-Curve / Stochastik-Schicht ----
/** Mgmt-Fee p.a. auf Commitment in der Investitionsperiode (Buyout-Median). */
export const PE_DEFAULT_MGMT_FEE = 2.0;
/** Mgmt-Fee p.a. auf NAV nach der Investitionsperiode. */
export const PE_DEFAULT_POSTPERIOD_FEE = 1.5;
/** Einmalige Set-up-Costs in % auf Commitment im Jahr 0. */
export const PE_DEFAULT_SETUP_COST = 1.0;
/** Standardabweichung der realisierten IRR (Cambridge Associates Buyout-Vintages). */
export const PE_DEFAULT_IRR_VOL = 5.0;
/** Standardabweichung des realisierten TVPI (Cambridge Associates Buyout-Vintages). */
export const PE_DEFAULT_TVPI_VOL = 0.35;
/** Wahrscheinlichkeit eines Total-/Quasi-Loss pro Fonds. */
export const PE_DEFAULT_LOSS_PROB = 0.03;
/** Anzahl stochastischer Szenarien (Ensemble-Grösse) im Modus „Vollständig". */
export const PE_STOCHASTIC_ENSEMBLE_SIZE = 100;

/** Maximalzahl an PE-Fonds pro Plan. */
export const MAX_PE_FUNDS = 10;

/**
 * Default-Werte für einen neuen PE-Fonds.
 * - Commitment 250.000 €
 * - Abrufquote 80 %
 * - IRR 10 %
 * - TVPI 1,7 ×
 * - Investitionsperiode 5 Jahre
 * - Fondslaufzeit 14 Jahre
 * - Start-Alter = aktuelles Alter (vom Caller zu setzen)
 */
export function makeDefaultPEFund(startAge: number, index = 0): PEFund {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pe-${Date.now()}-${index}`,
    name: index === 0 ? "PE-Fonds 1" : `PE-Fonds ${index + 1}`,
    commitment: 250_000,
    callRatio: 80,
    irr: 10,
    tvpi: 1.7,
    investmentPeriod: 5,
    fundDuration: 14,
    startAge: Math.max(18, startAge),
    mgmtFeeRate: PE_DEFAULT_MGMT_FEE,
    postPeriodFeeRate: PE_DEFAULT_POSTPERIOD_FEE,
    setupCostPct: PE_DEFAULT_SETUP_COST,
    irrVolatility: PE_DEFAULT_IRR_VOL,
    tvpiVolatility: PE_DEFAULT_TVPI_VOL,
    lossProbability: PE_DEFAULT_LOSS_PROB,
  };
}

/**
 * Default-Werte für ein neues rollierendes PE-Programm.
 * - Zielquote 15 % des Gesamtvermögens (NAV-Basis)
 * - Vintage-Rhythmus 1 Jahr
 * - Liquiditätspuffer 3 Jahresentnahmen (Ansparphase-Guard)
 * - Entnahme-Deckung 100 % der restlichen Netto-Entnahmen
 * - Max. 10 % des Gesamtvermögens je Vintage
 * - Fonds-Template = Industrie-Defaults (wie makeDefaultPEFund)
 */
export function makeDefaultPEProgram(): PEProgram {
  return {
    enabled: true,
    targetQuotaPct: 15,
    vintageCadenceYears: 1,
    liquidityBufferYears: 3,
    withdrawalCoveragePct: 100,
    maxVintageQuotaPct: 10,
    fundTemplate: {
      callRatio: 80,
      irr: 10,
      tvpi: 1.7,
      investmentPeriod: 5,
      fundDuration: 14,
      mgmtFeeRate: PE_DEFAULT_MGMT_FEE,
      postPeriodFeeRate: PE_DEFAULT_POSTPERIOD_FEE,
      setupCostPct: PE_DEFAULT_SETUP_COST,
      irrVolatility: PE_DEFAULT_IRR_VOL,
      tvpiVolatility: PE_DEFAULT_TVPI_VOL,
      lossProbability: PE_DEFAULT_LOSS_PROB,
    },
  };
}

// ---- Produkt-Töpfe (AP8): Wohnbauanleihe & Lebensversicherung ----
// Steuer-/Produktregeln laut fachlicher Freigabe (Vorstand, 09/2026).
/** Mindestlaufzeit Wohnbauanleihe in Jahren (Entnahmesperre). */
export const WBA_MIN_TERM_YEARS = 11;
/** Versicherungssteuer auf den LV-Einmalerlag in %. */
export const LV_INSURANCE_TAX_PCT = 4;
/** Einmalkosten auf den LV-Erlag in %. */
export const LV_UPFRONT_COST_PCT = 1;
/** Laufende LV-Kosten in % p.a. */
export const LV_ANNUAL_COST_PCT = 0.075;
/** LV-Mindestbindung in Jahren (Standard). */
export const LV_LOCK_YEARS = 15;
/** LV-Mindestbindung ab Kaufalter ≥ 50 (gesetzlich). */
export const LV_LOCK_YEARS_AGE50 = 10;
/** Maximalzahl Produkt-Positionen je Typ. */
export const MAX_PRODUCT_HOLDINGS = 10;

/** Gesetzliche LV-Bindefrist: 10 Jahre ab Kaufalter ≥ 50, sonst 15. */
export const deriveLvLockYears = (purchaseAge: number): number =>
  purchaseAge >= 50 ? LV_LOCK_YEARS_AGE50 : LV_LOCK_YEARS;

const productId = (prefix: string, index: number): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${index}`;

/** Default-Werte für eine neue Wohnbauanleihe. */
export function makeDefaultWBA(purchaseAge: number, index = 0): WBAHolding {
  return {
    id: productId("wba", index),
    name: index === 0 ? "Wohnbauanleihe 1" : `Wohnbauanleihe ${index + 1}`,
    purchaseAge: Math.max(18, purchaseAge),
    amount: 50_000,
    couponPct: 3.0,
    termYears: WBA_MIN_TERM_YEARS,
  };
}

/** Default-Werte für eine neue fondsgebundene Lebensversicherung. */
export function makeDefaultLV(purchaseAge: number, index = 0): LVHolding {
  const age = Math.max(18, purchaseAge);
  return {
    id: productId("lv", index),
    name: index === 0 ? "Fondspolizze 1" : `Fondspolizze ${index + 1}`,
    purchaseAge: age,
    amount: 100_000,
    expectedReturnPct: 5.0,
    lockYears: deriveLvLockYears(age),
  };
}

export const defaultSettings: SimulationSettings = {
  numSimulations: 10000,
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