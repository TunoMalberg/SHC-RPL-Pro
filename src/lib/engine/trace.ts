/**
 * calculationTrace (CR 19): vollständiger, JSON-serialisierbarer
 * Berechnungsnachweis eines Simulationslaufs. Pure Assemblierung —
 * keine eigenen Berechnungen außer der Ableitung realer Serien über
 * dieselben Deflatoren, die auch die UI verwendet (Konsistenzgarantie).
 */

import type {
  CalculationTrace,
  ClientProfile,
  CorridorResult,
  FinancialInputs,
  LiquidityEvent,
  PortfolioConfig,
  SimulationResult,
  SimulationSettings,
} from "../types";
import { DISPLAY_CONFIG } from "../displayConfig";
import {
  LV_ANNUAL_COST_PCT,
  LV_INSURANCE_TAX_PCT,
  LV_UPFRONT_COST_PCT,
} from "../defaults";
import { deflateSeries, realReturn } from "./valuation";
import { rankAgainstCorridor } from "./corridor";

export function buildCalculationTrace(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  liquidityEvents: LiquidityEvent[],
  result: SimulationResult,
  corridor: CorridorResult | null,
): CalculationTrace {
  const inflate = inputs.inflateWithdrawalToRetirement !== false;
  const accumulationYears = Math.max(0, client.retirementAge - client.currentAge);
  const totalYears =
    accumulationYears + Math.max(0, client.lifeExpectancy - client.retirementAge);
  const desired = inputs.desiredMonthlyWithdrawal;

  // ── Cashflow-Zeitreihe (nominal, je Jahr) ─────────────────────────
  const ages: number[] = [];
  const savingsNominal: number[] = [];
  const grossWithdrawalsNominal: number[] = [];
  const pensionNominal: number[] = [];
  const netWithdrawalsNominal: number[] = [];
  for (let y = 0; y < totalYears; y++) {
    const age = client.currentAge + y;
    ages.push(age);
    const cumInflation = Math.pow(1 + inputs.inflationRate / 100, y + 1);
    if (y < accumulationYears) {
      const annualSavings = inputs.monthlySavings * 12;
      savingsNominal.push(
        inputs.useRealValues
          ? annualSavings * cumInflation
          : annualSavings * Math.pow(1 + inputs.annualSavingsIncrease / 100, y),
      );
      grossWithdrawalsNominal.push(0);
      pensionNominal.push(0);
      netWithdrawalsNominal.push(0);
    } else {
      savingsNominal.push(0);
      const gross = inflate
        ? (desired ?? 0) * 12 * cumInflation
        : (desired ?? 0) * 12;
      const pension =
        age >= inputs.pensionStartAge
          ? inflate
            ? inputs.monthlyPension * 12 * cumInflation
            : inputs.monthlyPension * 12
          : 0;
      grossWithdrawalsNominal.push(gross);
      pensionNominal.push(pension);
      netWithdrawalsNominal.push(Math.max(0, gross - pension));
    }
  }

  // ── Nominale + reale Ergebnis-Serien (CR 6/19) ────────────────────
  const deflators = result.valuation?.deflators ?? [];
  const medianNominal = result.medianPath;
  const p25Nominal = result.p25Path;
  const p75Nominal = result.p75Path;

  const requiredMonthly =
    desired === null ? null : Math.max(0, desired - inputs.monthlyPension);

  const additionalIncomes = liquidityEvents.filter((e) => e.amount >= 0);
  const additionalExpenses = liquidityEvents.filter((e) => e.amount < 0);

  return {
    stichtag: new Date().toISOString(),
    configVersion: DISPLAY_CONFIG.version,
    assumptions: {
      buckets: portfolio.buckets.map((b) => ({
        name: b.name,
        label: b.label,
        allocationPct: b.allocation,
        expectedReturnNominalPct: b.expectedReturn,
        expectedReturnRealPct:
          Math.round(realReturn(b.expectedReturn, inputs.inflationRate) * 100) /
          100,
        volatilityPct: b.volatility,
        costsPct: b.costs,
        taxDragPct: b.taxDrag,
        netReturnPct: b.netReturn,
      })),
      correlationMatrix: portfolio.correlationMatrix,
      inflationRatePct: inputs.inflationRate,
      kestRatePct: portfolio.kestRate ?? 27.5,
      depositTaxRatePct: portfolio.depositTaxRate ?? 25,
      withdrawalPhase: portfolio.withdrawalPhase ?? null,
      // Produkt-Töpfe WBA/LV (AP8): alle Parameter + Sperr-Alter.
      products:
        (portfolio.wohnbauanleihen?.length ?? 0) > 0 ||
        (portfolio.lebensversicherungen?.length ?? 0) > 0
          ? {
              wohnbauanleihen: (portfolio.wohnbauanleihen ?? []).map((w) => ({
                name: w.name,
                amountEur: w.amount,
                couponPct: w.couponPct,
                termYears: w.termYears,
                purchaseAge: w.purchaseAge,
                maturityAge: w.purchaseAge + w.termYears,
              })),
              lebensversicherungen: (portfolio.lebensversicherungen ?? []).map((l) => ({
                name: l.name,
                erlagEur: l.amount,
                expectedReturnPct: l.expectedReturnPct,
                insuranceTaxPct: LV_INSURANCE_TAX_PCT,
                upfrontCostPct: LV_UPFRONT_COST_PCT,
                annualCostPct: LV_ANNUAL_COST_PCT,
                lockYears: l.lockYears,
                lockEndAge: l.purchaseAge + l.lockYears,
                payoutAge: l.payoutAge ?? null,
              })),
            }
          : null,
    },
    simulation: {
      numSimulations: settings.numSimulations,
      timeStepMonths: settings.timeStepMonths,
      mode: settings.mode,
      seed: settings.randomSeed ?? null,
    },
    valuation: {
      defaultMode: DISPLAY_CONFIG.defaultValuationMode,
      inputBasis: inflate ? "real" : "nominal",
      formulaRealReturn:
        "realReturn = ((1 + nominalReturn) / (1 + inflationRate)) - 1; " +
        "periodische variable Sätze: Verkettung periodengleicher Faktoren",
      deflators,
    },
    derivation: {
      desiredMonthlyIncome: desired,
      externalMonthlyIncome: inputs.monthlyPension,
      requiredMonthlyWithdrawal: requiredMonthly,
      formula:
        "requiredMonthlyWithdrawal = max(0, desiredMonthlyIncome - externalMonthlyIncome); " +
        "null, wenn kein Wunschbetrag erfasst (Modus 'berechnen, was möglich ist')",
    },
    corridor: {
      percentiles: { ...DISPLAY_CONFIG.planningCorridorPercentiles },
      method:
        "Bisektion des monatlichen Gesamtbetrags (Eingabebasis) mit Ziel-Erfolgsquote " +
        "(100 - Perzentil) %; Dualität: Quantil_q(Endvermögen) >= 0 <=> Erfolgsquote >= (100 - q) %. " +
        "Monatsentnahme nominal = Monatsentnahme in heutiger Kaufkraft x (1 + Inflation)^(Jahre bis Pensionsantritt).",
      technical: { ...DISPLAY_CONFIG.technical.corridorBisection },
      result: corridor,
    },
    ranking:
      corridor && requiredMonthly !== null && requiredMonthly > 0
        ? {
            requiredFromWealthMonthly: requiredMonthly,
            comparedAgainst: {
              difficult: corridor.scenarios.difficult.fromWealthMonthly,
              typical: corridor.scenarios.typical.fromWealthMonthly,
              favorable: corridor.scenarios.favorable.fromWealthMonthly,
            },
            result: rankAgainstCorridor(requiredMonthly, corridor),
          }
        : null,
    cashflows: {
      ages,
      savingsNominal,
      grossWithdrawalsNominal,
      pensionNominal,
      netWithdrawalsNominal,
    },
    series: {
      ageLabels: result.yearLabels,
      medianNominal,
      medianReal: deflateSeries(medianNominal, deflators),
      p25Nominal,
      p25Real: deflateSeries(p25Nominal, deflators),
      p75Nominal,
      p75Real: deflateSeries(p75Nominal, deflators),
    },
    liquidityEvents: {
      additionalIncomes,
      additionalExpenses,
      totalIncomes: additionalIncomes.reduce((s, e) => s + e.amount, 0),
      totalExpenses: additionalExpenses.reduce((s, e) => s + e.amount, 0),
    },
    rounding: {
      locale: "de-AT",
      currency: "EUR",
      displayDecimals: 0,
      corridorRounding:
        "Monatsentnahmen auf ganze Euro gerundet (Math.round nach Bisektion)",
    },
  };
}
