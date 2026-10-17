/**
 * Referenzfälle (Paket 2, Punkt 4) — typische Kundenkonstellationen, deren
 * Rechenergebnisse eingefroren werden (`reference.golden.json`).
 *
 * Zweck: Jede ungewollte Änderung an einem Ergebnis fällt sofort auf —
 * insbesondere beim Umbau auf einen gemeinsamen Rechenkern (Punkt 6).
 *
 * Alle Daten sind fiktive Beispielwerte (keine Kundendaten). Ids sind fest
 * vergeben, damit die Fälle vollständig deterministisch sind.
 */

import type {
  ClientProfile,
  FinancialInputs,
  LiquidityEvent,
  PortfolioConfig,
  SimulationSettings,
} from "../../types";
import {
  defaultClient,
  defaultInputs,
  defaultPortfolio,
  makeDefaultLV,
  makeDefaultPEFund,
  makeDefaultPEProgram,
  makeDefaultWBA,
} from "../../defaults";

export interface ReferenceCase {
  id: string;
  /** Kurzbeschreibung (deutsch) — erscheint in Testnamen. */
  title: string;
  client: ClientProfile;
  inputs: FinancialInputs;
  portfolio: PortfolioConfig;
  settings: SimulationSettings;
  liquidityEvents: LiquidityEvent[];
  /** Zusätzlich Planungskorridor + Baseline einfrieren (teurer). */
  withCorridor?: boolean;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const baseClient = (): ClientProfile => ({
  ...clone(defaultClient),
  name: "Referenzfall",
  advisoryDate: "2026-10-01",
});
const baseInputs = (): FinancialInputs => ({
  ...clone(defaultInputs),
  desiredMonthlyWithdrawal: 3000,
});
const basePortfolio = (): PortfolioConfig => clone(defaultPortfolio);
const baseSettings = (): SimulationSettings => ({
  numSimulations: 300,
  timeStepMonths: 12,
  mode: "fixed_withdrawal",
  randomSeed: 4711,
});

function withPortfolio(fn: (p: PortfolioConfig) => void): PortfolioConfig {
  const p = basePortfolio();
  fn(p);
  return p;
}

export const REFERENCE_CASES: ReferenceCase[] = [
  {
    id: "standard",
    title: "Standard: 45 J, Pension mit 65, 3.000 € Wunsch, ausgewogenes Portfolio",
    client: baseClient(),
    inputs: baseInputs(),
    portfolio: basePortfolio(),
    settings: baseSettings(),
    liquidityEvents: [],
    withCorridor: true,
  },
  {
    id: "moeglich",
    title: "Kein Wunschbetrag (Modus „was möglich ist“)",
    client: baseClient(),
    inputs: { ...baseInputs(), desiredMonthlyWithdrawal: null },
    portfolio: basePortfolio(),
    settings: baseSettings(),
    liquidityEvents: [],
    withCorridor: true,
  },
  {
    id: "liquiditaet",
    title: "Liquiditätsereignisse: Erbschaft, halbes Alter, gemischte Ereignisse im selben Jahr",
    client: baseClient(),
    inputs: baseInputs(),
    portfolio: basePortfolio(),
    settings: baseSettings(),
    liquidityEvents: [
      { id: "le-1", age: 52, description: "Erbschaft", amount: 150_000 },
      { id: "le-2", age: 62.5, description: "Renovierung", amount: -40_000 },
      { id: "le-3", age: 70, description: "Immobilienverkauf", amount: 80_000 },
      { id: "le-4", age: 70, description: "Unterstützung Kinder", amount: -30_000 },
    ],
  },
  {
    id: "zweiphasen",
    title: "Zwei Phasen: Wechsel 5 Jahre vor Pension auf defensives Entnahme-Portfolio",
    client: baseClient(),
    inputs: baseInputs(),
    portfolio: withPortfolio((p) => {
      p.buckets[0].allocation = 5;
      p.buckets[1].allocation = 15;
      p.buckets[2].allocation = 80;
      p.withdrawalPhase = {
        allocations: [30, 50, 20],
        rebalancingFrequency: "annually",
        rebalancingThreshold: 5,
        cashYearsTarget: 2,
        switchYearsBeforeRetirement: 5,
      };
    }),
    settings: baseSettings(),
    liquidityEvents: [],
  },
  {
    id: "pe-fonds",
    title: "Private Equity: zwei Bestandsfonds (realistisch, J-Curve)",
    client: baseClient(),
    inputs: baseInputs(),
    portfolio: withPortfolio((p) => {
      const f1 = { ...makeDefaultPEFund(45, 0), id: "pe-1", commitment: 100_000 };
      const f2 = { ...makeDefaultPEFund(50, 1), id: "pe-2", commitment: 80_000 };
      p.peFunds = [f1, f2];
      p.peModelingMode = "realistic";
    }),
    settings: baseSettings(),
    liquidityEvents: [],
  },
  {
    // Schulungsfall 10/2026: Abrufe übersteigen die Liquidität — eingezahltes
    // Kapital bleibt investiert, Ausschüttungen füllen die Liquidität wieder auf.
    id: "pe-liquiditaet",
    title: "Private Equity: Kapitalabrufe größer als die Liquidität (pensioniert)",
    client: { ...baseClient(), birthYear: 1961, currentAge: 65, retirementAge: 65 },
    inputs: { ...baseInputs(), initialCapital: 2_400_000, monthlySavings: 0, desiredMonthlyWithdrawal: 10_100, monthlyPension: 0, pensionStartAge: 65 },
    portfolio: withPortfolio((p) => {
      p.buckets = p.buckets.map((b, i) => ({ ...b, allocation: i === 2 ? 100 : 0 })) as typeof p.buckets;
      p.peFunds = [{ ...makeDefaultPEFund(65, 0), id: "pe-1", commitment: 3_300_000 }];
      p.peModelingMode = "realistic";
    }),
    settings: baseSettings(),
    liquidityEvents: [],
  },
  {
    id: "pe-stochastisch",
    title: "Private Equity: Modus „Vollständig“ (Stochastik)",
    client: baseClient(),
    inputs: baseInputs(),
    portfolio: withPortfolio((p) => {
      p.peFunds = [{ ...makeDefaultPEFund(45, 0), id: "pe-1", commitment: 120_000 }];
      p.peModelingMode = "full";
    }),
    settings: baseSettings(),
    liquidityEvents: [],
  },
  {
    id: "pe-programm",
    title: "Rollierendes PE-Programm, Zielquote 15 %",
    client: baseClient(),
    inputs: { ...baseInputs(), initialCapital: 600_000 },
    portfolio: withPortfolio((p) => {
      p.peProgram = makeDefaultPEProgram();
    }),
    settings: baseSettings(),
    liquidityEvents: [],
  },
  {
    id: "produkte",
    title: "Produkt-Töpfe: Wohnbauanleihe + fondsgebundene LV (VV-Mantel, stochastisch)",
    client: baseClient(),
    inputs: { ...baseInputs(), initialCapital: 400_000 },
    portfolio: withPortfolio((p) => {
      p.wohnbauanleihen = [{ ...makeDefaultWBA(45, 0), id: "wba-1", amount: 60_000 }];
      p.lebensversicherungen = [
        { ...makeDefaultLV(50, 0), id: "lv-1", amount: 100_000, payoutAge: 65 },
      ];
    }),
    settings: baseSettings(),
    liquidityEvents: [],
  },
  {
    id: "monatlich",
    title: "Monatlicher Simulationsschritt",
    client: baseClient(),
    inputs: baseInputs(),
    portfolio: basePortfolio(),
    settings: { ...baseSettings(), timeStepMonths: 1, numSimulations: 120 },
    liquidityEvents: [{ id: "le-1", age: 60, description: "Bonus", amount: 25_000 }],
  },
  {
    id: "pensioniert",
    // Pensionsantritt vor heute ist in der App gesperrt (Validierung) —
    // bereits pensioniert heißt: Pensionsantritt = heutiges Alter.
    title: "Bereits in Pension (70 J, Pensionsantritt = heute)",
    client: { ...baseClient(), birthYear: 1956, currentAge: 70, retirementAge: 70 },
    inputs: { ...baseInputs(), initialCapital: 700_000, monthlySavings: 0 },
    portfolio: withPortfolio((p) => {
      p.withdrawalPhase = {
        allocations: [25, 45, 30],
        rebalancingFrequency: "annually",
        rebalancingThreshold: 5,
        cashYearsTarget: 3,
      };
    }),
    settings: baseSettings(),
    liquidityEvents: [],
  },
  {
    id: "cashlastig",
    title: "Hoher Cash-Anteil (60 %), 3 % Zins — Einlagen-KESt 25 %",
    client: baseClient(),
    inputs: baseInputs(),
    portfolio: withPortfolio((p) => {
      p.buckets[0].allocation = 60;
      p.buckets[1].allocation = 20;
      p.buckets[2].allocation = 20;
      p.buckets[0].expectedReturn = 3;
    }),
    settings: baseSettings(),
    liquidityEvents: [],
  },
  {
    id: "nominal-ohne-kest",
    title: "Nominale Eingabe, KESt 0 %, Sparsteigerung statt Inflationsanpassung",
    client: baseClient(),
    inputs: {
      ...baseInputs(),
      inflateWithdrawalToRetirement: false,
      useRealValues: false,
      annualSavingsIncrease: 3,
    },
    portfolio: withPortfolio((p) => {
      p.kestRate = 0;
      p.depositTaxRate = 0;
      p.rebalancingFrequency = "quarterly";
    }),
    settings: baseSettings(),
    liquidityEvents: [],
  },
  {
    id: "knapp",
    title: "Knapper Plan: hoher Wunsch, Pensionszahlung ab 62 (vor Pensionsantritt 65)",
    client: baseClient(),
    inputs: {
      ...baseInputs(),
      initialCapital: 150_000,
      monthlySavings: 600,
      desiredMonthlyWithdrawal: 4200,
      pensionStartAge: 62,
    },
    portfolio: basePortfolio(),
    settings: baseSettings(),
    liquidityEvents: [],
  },
];
