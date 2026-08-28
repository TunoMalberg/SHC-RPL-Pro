/**
 * Vergleichsansicht (CR 15/17): „Nicht investieren" vs. bestehende
 * Veranlagung vs. Zielstrategie (MiFID-Profil oder Optimizer-Ergebnis).
 *
 * Die Varianten bleiben strikt getrennt (CR 12): eigene Kennzahlen,
 * eigene Labels, keine Vermischung im Datenmodell. Die Baseline ist
 * deterministisch (0 % nominal) und trägt deshalb weder Erfolgsquote
 * noch Planungskorridor — ihre Zielerreichung ist binär.
 */

import type {
  ClientProfile,
  ComparisonRunResult,
  ComparisonTargetSource,
  ComparisonVariantKind,
  ComparisonVariantResult,
  FinancialInputs,
  LiquidityEvent,
  MifidProfile,
  PortfolioConfig,
  SimulationSettings,
} from "../types";
import { computePortfolioReturn } from "./portfolio";
import { runMonteCarloSimulation } from "./montecarlo";
import {
  computeCorridorWithdrawals,
  rankAgainstCorridor,
  type CorridorProgressEvent,
} from "./corridor";
import { runNoInvestProjection } from "./baseline";
import { realReturn } from "./valuation";
import { buildPortfolioFromAllocation } from "./optimizer";

/** MiFID-II Risikoprofile als [Cash %, Bonds %, Equity %].
 *  Spiegelt 1:1 die Vorgaben aus PortfolioBuilder.tsx → MIFID_PRESETS. */
export const MIFID_PRESETS: Record<MifidProfile, [number, number, number]> = {
  conservative: [30, 55, 15],
  balanced: [15, 35, 50],
  growth: [10, 20, 70],
  speculative: [5, 15, 80],
};

export const MIFID_ORDER: MifidProfile[] = [
  "conservative",
  "balanced",
  "growth",
  "speculative",
];

/** Erzeugt eine Portfolio-Variante mit MiFID-Allokation; alle übrigen
 *  Bucket-Eigenschaften (Rendite, Vola, Kosten) bleiben gleich. */
export function withMifidAllocation(
  base: PortfolioConfig,
  profile: MifidProfile,
): PortfolioConfig {
  const allocs = MIFID_PRESETS[profile];
  const newBuckets = base.buckets.map((b, i) => ({
    ...b,
    allocation: allocs[i] ?? b.allocation,
  })) as PortfolioConfig["buckets"];
  return { ...base, buckets: newBuckets, mifidProfile: profile };
}

/** Zielstrategie-Spezifikation (Dropdown in der Vergleichsansicht). */
export type ComparisonTargetSpec =
  | { type: "mifid"; profile: MifidProfile }
  | {
      type: "optimizer";
      alloc: { cash: number; bonds: number; equities: number; pe: number };
    };

/** Baut das Zielstrategie-Portfolio aus der Spezifikation. */
export function buildTargetPortfolio(
  base: PortfolioConfig,
  spec: ComparisonTargetSpec,
  initialCapital: number,
  currentAge: number,
): PortfolioConfig {
  if (spec.type === "mifid") {
    return withMifidAllocation(base, spec.profile);
  }
  return buildPortfolioFromAllocation(
    { ...spec.alloc },
    base,
    initialCapital,
    currentAge,
  );
}

/** Baseline-Variante „Nicht investieren" (deterministisch, 0 % nominal). */
export function computeNoInvestVariant(
  client: ClientProfile,
  inputs: FinancialInputs,
  liquidityEvents: LiquidityEvent[],
  label: string,
): ComparisonVariantResult {
  const baseline = runNoInvestProjection(client, inputs, liquidityEvents);
  return {
    kind: "no_invest",
    label,
    expectedReturnNominalPct: 0,
    expectedReturnRealPct:
      Math.round(realReturn(0, inputs.inflationRate) * 100) / 100,
    finalWealthNominalMedian: baseline.finalWealthNominal,
    finalWealthRealMedian: baseline.finalWealthReal,
    horizonYear: baseline.horizonYear,
    successRate: null,
    goalReached: baseline.goalReached,
    sustainableMonthlyReal: Math.max(
      0,
      baseline.sustainableMonthlyReal - inputs.monthlyPension,
    ),
    ranking: null,
    deterministic: true,
  };
}

/** MC-Variante (bestehende Veranlagung oder Zielstrategie). */
export function computeMcVariant(
  kind: Exclude<ComparisonVariantKind, "no_invest">,
  label: string,
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  liquidityEvents: LiquidityEvent[],
  onCorridorProgress?: (e: CorridorProgressEvent) => void,
): ComparisonVariantResult {
  const result = runMonteCarloSimulation(
    client,
    inputs,
    portfolio,
    settings,
    liquidityEvents,
  );
  const corridor = computeCorridorWithdrawals(
    client,
    inputs,
    portfolio,
    settings,
    liquidityEvents,
    onCorridorProgress,
  );

  const required = result.requiredMonthlyWithdrawal ?? null;
  const hasWish = inputs.desiredMonthlyWithdrawal !== null;
  const expectedNominal = computePortfolioReturn(portfolio) * 100;

  return {
    kind,
    label,
    expectedReturnNominalPct: Math.round(expectedNominal * 100) / 100,
    expectedReturnRealPct:
      Math.round(realReturn(expectedNominal, inputs.inflationRate) * 100) / 100,
    finalWealthNominalMedian: result.medianFinalWealth,
    finalWealthRealMedian:
      result.valuation?.medianFinalWealthReal ?? result.medianFinalWealth,
    horizonYear:
      result.valuation?.horizonYear ?? client.birthYear + client.lifeExpectancy,
    successRate: hasWish ? result.successRate : null,
    corridor,
    sustainableMonthlyReal: corridor.scenarios.typical.fromWealthMonthly,
    ranking:
      required !== null && required > 0
        ? rankAgainstCorridor(required, corridor)
        : null,
    deterministic: false,
  };
}

/** Fügt die Varianten zum Vergleichsergebnis zusammen (Differenzen, CR 17). */
export function assembleComparison(
  variants: ComparisonVariantResult[],
  targetSource?: ComparisonTargetSource,
): ComparisonRunResult {
  const baseline = variants.find((v) => v.kind === "no_invest");
  // Referenz für die Differenz: Zielstrategie, sonst bestehende Veranlagung.
  const reference =
    variants.find((v) => v.kind === "target") ??
    variants.find((v) => v.kind === "current");

  return {
    variants,
    targetSource,
    diffVsNoInvest:
      baseline && reference
        ? {
            nominal:
              reference.finalWealthNominalMedian -
              baseline.finalWealthNominalMedian,
            real:
              reference.finalWealthRealMedian - baseline.finalWealthRealMedian,
            monthlyReal:
              reference.sustainableMonthlyReal -
              baseline.sustainableMonthlyReal,
            horizonYear: reference.horizonYear,
          }
        : null,
    stichtag: new Date().toISOString(),
  };
}
