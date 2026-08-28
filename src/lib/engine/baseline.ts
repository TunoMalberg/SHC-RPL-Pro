/**
 * Baseline „Nicht investieren" (CR 12/17).
 *
 * Deterministische Projektion mit 0 % nominaler Verzinsung (fachliche
 * Freigabe: Girokonto-Annahme). Kein Kapitalmarktrisiko → keine
 * Monte-Carlo-Verteilung, kein Planungskorridor; die Zielerreichung ist
 * binär und wird auch so kommuniziert. Bei 0 % Nominalverzinsung fallen
 * keine Gewinne an → keine KESt.
 *
 * Cashflow-Semantik identisch zur MC-Engine:
 *  - Sparrate: wächst mit Inflation (useRealValues) bzw. mit
 *    annualSavingsIncrease.
 *  - Entnahme/Pension: heutige Kaufkraft → inflationiert
 *    (inflateWithdrawalToRetirement, Default ON), sonst nominal konstant.
 *  - Liquiditätsereignisse: Crossing-Semantik je Jahr (wie MC/Trace).
 *
 * Die reale Entwicklung wird mit der ANGENOMMENEN Inflationsrate
 * deflationiert — bei negativer Inflation (Deflation) ist der reale
 * Liquiditätsertrag positiv, obwohl nominal 0 % verzinst wird.
 */

import type {
  BaselineResult,
  ClientProfile,
  FinancialInputs,
  LiquidityEvent,
} from "../types";
import { inflateToYear } from "./valuation";

interface ProjectionOutcome {
  pathNominal: number[];
  ages: number[];
  finalWealthNominal: number;
  depleted: boolean;
  depletionAge: number | null;
}

/** Deterministische 0 %-Projektion für einen gegebenen Gesamtbetrag/Monat. */
function projectNoInvest(
  client: ClientProfile,
  inputs: FinancialInputs,
  liquidityEvents: LiquidityEvent[],
  desiredMonthly: number,
): ProjectionOutcome {
  const accumulationYears = Math.max(0, client.retirementAge - client.currentAge);
  const withdrawalYears = Math.max(0, client.lifeExpectancy - client.retirementAge);
  const totalYears = accumulationYears + withdrawalYears;
  const inflate = inputs.inflateWithdrawalToRetirement !== false;
  const infl = inputs.inflationRate / 100;

  let wealth = inputs.initialCapital;
  let cumulativeInflation = 1;
  const pathNominal: number[] = [wealth];
  const ages: number[] = [client.currentAge];
  let depleted = false;
  let depletionAge: number | null = null;

  for (let y = 0; y < totalYears; y++) {
    const age = client.currentAge + y;
    const isAccumulation = y < accumulationYears;
    cumulativeInflation *= 1 + infl;

    if (isAccumulation) {
      const annualSavings = inputs.monthlySavings * 12;
      wealth += inputs.useRealValues
        ? annualSavings * cumulativeInflation
        : annualSavings * Math.pow(1 + inputs.annualSavingsIncrease / 100, y);
    } else {
      const annualWithdrawal = inflate
        ? desiredMonthly * 12 * cumulativeInflation
        : desiredMonthly * 12;
      const hasPension = age >= inputs.pensionStartAge;
      const annualPension = hasPension
        ? inflate
          ? inputs.monthlyPension * 12 * cumulativeInflation
          : inputs.monthlyPension * 12
        : 0;
      const netWithdrawal = Math.max(0, annualWithdrawal - annualPension);

      if (wealth <= netWithdrawal && netWithdrawal > 0 && !depleted) {
        depleted = true;
        depletionAge = age;
      }
      wealth = Math.max(0, wealth - netWithdrawal);
    }

    // Liquiditätsereignisse (Crossing-Semantik wie MC-Engine/Einzelpfad).
    for (const le of liquidityEvents) {
      if (le.age > age - 1 && le.age <= age) {
        wealth = Math.max(0, wealth + le.amount);
      }
    }

    pathNominal.push(wealth);
    ages.push(age + 1);
  }

  return {
    pathNominal,
    ages,
    finalWealthNominal: wealth,
    depleted,
    depletionAge,
  };
}

/**
 * Größter monatlicher Gesamtbetrag (Eingabebasis der Inputs), bei dem
 * das Vermögen deterministisch bis zum Planungshorizont reicht.
 * Exakte Bisektion (deterministische Zielfunktion, monoton).
 */
export function findBaselineSustainableWithdrawal(
  client: ClientProfile,
  inputs: FinancialInputs,
  liquidityEvents: LiquidityEvent[] = [],
): number {
  const survives = (monthly: number): boolean =>
    !projectNoInvest(client, inputs, liquidityEvents, monthly).depleted;

  let low = 0;
  let high = Math.max(inputs.initialCapital * 0.1, 1000);
  let expansions = 0;
  while (expansions < 8 && survives(high)) {
    low = high;
    high *= 2;
    expansions++;
  }
  let best = low;
  for (let iter = 0; iter < 40; iter++) {
    const mid = (low + high) / 2;
    if (survives(mid)) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  // Floor statt Round: Die Zielfunktion ist monoton (weniger Entnahme →
  // trägt sicher). Aufrunden könnte den Betrag knapp über die exakte
  // Tragfähigkeitsgrenze heben — der ausgewiesene Betrag muss die
  // deterministische Projektion garantiert bestehen.
  return Math.floor(best);
}

/** Vollständige „Nicht investieren"-Projektion für die Vergleichsansicht. */
export function runNoInvestProjection(
  client: ClientProfile,
  inputs: FinancialInputs,
  liquidityEvents: LiquidityEvent[] = [],
): BaselineResult {
  const desired = inputs.desiredMonthlyWithdrawal;
  const outcome = projectNoInvest(client, inputs, liquidityEvents, desired ?? 0);
  const infl = inputs.inflationRate;
  const yearsToRetirement = Math.max(0, client.retirementAge - client.currentAge);

  // Reale Serie: Deflationierung mit der angenommenen Inflationsrate.
  const pathReal = outcome.pathNominal.map(
    (v, y) => v / Math.pow(1 + infl / 100, y),
  );

  const sustainableMonthly = findBaselineSustainableWithdrawal(
    client,
    inputs,
    liquidityEvents,
  );

  return {
    pathNominal: outcome.pathNominal,
    pathReal,
    ages: outcome.ages,
    finalWealthNominal: outcome.finalWealthNominal,
    finalWealthReal: pathReal[pathReal.length - 1] ?? 0,
    horizonYear: client.birthYear + client.lifeExpectancy,
    depletionAge: outcome.depletionAge,
    // Binäre Zielerreichung — deterministische Rechnung; null ohne Wunsch.
    goalReached: desired === null ? null : !outcome.depleted,
    sustainableMonthlyReal: sustainableMonthly,
    sustainableMonthlyNominalAtRetirement:
      inputs.inflateWithdrawalToRetirement !== false
        ? Math.round(inflateToYear(sustainableMonthly, infl, yearsToRetirement))
        : sustainableMonthly,
    retirementYear: client.birthYear + client.retirementAge,
  };
}
