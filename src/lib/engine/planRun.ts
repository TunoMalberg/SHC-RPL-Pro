/**
 * Ein Plan-Lauf mit EINER Entnahme-Regel für alle Ansichten.
 *
 * Ist kein Wunschbetrag erfasst (Modus „berechnen, was möglich ist"),
 * rechnet die App mit der typischen Korridor-Entnahme. Diese Regel galt
 * früher nur für die Hauptsimulation — Backtest, Einzelpfad, gespeicherte
 * Szenarien und der MiFID-Vergleich rechneten dann mit 0 € Entnahme und
 * zeigten deutlich zu hohe Vermögen. Alle Aufrufer verwenden jetzt diese
 * Funktionen.
 */

import type {
  ClientProfile,
  CorridorResult,
  FinancialInputs,
  LiquidityEvent,
  PortfolioConfig,
  SimulationResult,
  SimulationSettings,
} from "../types";
import { computeCorridorWithdrawals } from "./corridor";
import { runMonteCarloSimulation } from "./montecarlo";

/** Kein Wunschbetrag erfasst → Modus „berechnen, was möglich ist". */
export function isPossibleMode(inputs: FinancialInputs): boolean {
  return inputs.desiredMonthlyWithdrawal === null;
}

/**
 * Eingaben mit der tatsächlich zu rechnenden Entnahme. `monthly` ist die
 * bereits bekannte Entnahme eines früheren Laufs (z. B.
 * `result.effectiveMonthlyWithdrawal`); ohne sie bleibt die Eingabe unverändert.
 */
export function withEffectiveWithdrawal(
  inputs: FinancialInputs,
  monthly: number | null | undefined,
): FinancialInputs {
  if (!isPossibleMode(inputs) || monthly === null || monthly === undefined) return inputs;
  return { ...inputs, desiredMonthlyWithdrawal: monthly };
}

/**
 * Monte-Carlo-Lauf eines Plans. Bei leerem Wunsch wird die typische
 * Korridor-Entnahme ermittelt (oder `knownMonthly` übernommen) und das
 * Ergebnis entsprechend gekennzeichnet.
 */
export function runPlanSimulation(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  liquidityEvents: LiquidityEvent[] = [],
  opts: { corridor?: CorridorResult; knownMonthly?: number } = {},
): { result: SimulationResult; effectiveInputs: FinancialInputs; corridor?: CorridorResult } {
  const possible = isPossibleMode(inputs);
  let corridor = opts.corridor;
  let monthly = opts.knownMonthly;
  if (possible && monthly === undefined) {
    corridor ??= computeCorridorWithdrawals(client, inputs, portfolio, settings, liquidityEvents);
    monthly = corridor.scenarios.typical.totalMonthly;
  }
  const effectiveInputs = withEffectiveWithdrawal(inputs, monthly);
  const result = runMonteCarloSimulation(client, effectiveInputs, portfolio, settings, liquidityEvents);
  if (corridor) result.corridor = corridor;
  result.withdrawalAssumption = possible ? "corridor_typical" : "user";
  result.requiredMonthlyWithdrawal = possible
    ? null
    : Math.max(0, (inputs.desiredMonthlyWithdrawal ?? 0) - inputs.monthlyPension);
  return { result, effectiveInputs, corridor };
}
