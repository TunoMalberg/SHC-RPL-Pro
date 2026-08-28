/**
 * Planungskorridor (CR 9/10): mögliche Monatsentnahme in heutiger
 * Kaufkraft je Marktentwicklung, mathematisch aus der Monte-Carlo-
 * Verteilung hergeleitet.
 *
 * Mathematik (Dualität): Das q-Perzentil des Endvermögens ist genau dann
 * ≥ 0 (Plan trägt), wenn die Erfolgsquote ≥ (100 − q) % ist. Die mögliche
 * Entnahme der „schwierigen Marktentwicklung" (P25) ist daher der größte
 * Betrag mit Erfolgsquote ≥ 75 %, der Median (P50) der größte Betrag mit
 * ≥ 50 %, die „günstige Marktentwicklung" (P75) der größte mit ≥ 25 %.
 * Die Bisektion nutzt die bestehende `findSustainableWithdrawal`-Engine.
 *
 * Bisektiert wird der monatliche GESAMTBETRAG D (heutige Kaufkraft,
 * Pension wie erfasst — die Engine verrechnet sie zeitrichtig). Das ist
 * symmetrisch zur Vergleichskennzahl requiredMonthlyWithdrawal =
 * desiredMonthlyIncome − externalMonthlyIncome. Ausgewiesen werden
 * beide Größen: Gesamtbetrag und „aus dem Vermögen" (= D − Pension).
 *
 * Alle drei Läufe verwenden denselben abgeleiteten Seed → Monotonie
 * schwierig ≤ typisch ≤ günstig ist strukturell garantiert.
 */

import type {
  ClientProfile,
  CorridorResult,
  CorridorScenarioKey,
  CorridorScenarioValue,
  FinancialInputs,
  LiquidityEvent,
  PortfolioConfig,
  SimulationSettings,
} from "../types";
import { DISPLAY_CONFIG } from "../displayConfig";
import { findSustainableWithdrawal } from "./montecarlo";
import { inflateToYear } from "./valuation";

export interface CorridorProgressEvent {
  /** Szenario, das gerade bisektiert wird. */
  scenario: CorridorScenarioKey;
  /** Abgeschlossene Iterationen über alle Szenarien. */
  done: number;
  /** Geplante Iterationen gesamt. */
  total: number;
}

/**
 * Berechnet den Planungskorridor. Perzentile kommen zentral aus
 * DISPLAY_CONFIG.planningCorridorPercentiles (CR 9: 25/50/75) —
 * hier keine stillschweigend abweichenden Schwellen setzen.
 */
export function computeCorridorWithdrawals(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  liquidityEvents: LiquidityEvent[] = [],
  onProgress?: (e: CorridorProgressEvent) => void,
): CorridorResult {
  const pct = DISPLAY_CONFIG.planningCorridorPercentiles;
  const tech = DISPLAY_CONFIG.technical.corridorBisection;
  // Fester Seed für alle drei Bisektionen: gleiche Zufallspfade →
  // strukturell monotone Ergebnisse und reproduzierbare Zahlen.
  const seedUsed = (settings.randomSeed ?? 42) ^ 0xc0f21d;
  const corridorSettings: SimulationSettings = {
    ...settings,
    randomSeed: seedUsed,
  };

  const yearsToRetirement = Math.max(
    0,
    client.retirementAge - client.currentAge,
  );
  const retirementYear = client.birthYear + client.retirementAge;
  // Eingabebasis: Standard heutige Kaufkraft; Experten-Toggle OFF →
  // die bisektierten Beträge sind nominale Beträge (CR 6: Basis ausweisen).
  const basis: CorridorResult["basis"] =
    inputs.inflateWithdrawalToRetirement !== false ? "real" : "nominal";

  const scenarioDefs: { key: CorridorScenarioKey; percentile: number }[] = [
    { key: "difficult", percentile: pct.difficult },
    { key: "typical", percentile: pct.typical },
    { key: "favorable", percentile: pct.favorable },
  ];

  const totalIterations = scenarioDefs.length * tech.iterations;
  let iterationsDone = 0;

  const scenarios = {} as Record<CorridorScenarioKey, CorridorScenarioValue>;
  for (const def of scenarioDefs) {
    const targetSuccessRate = 100 - def.percentile;
    const totalMonthly = findSustainableWithdrawal(
      client,
      inputs,
      portfolio,
      corridorSettings,
      targetSuccessRate,
      liquidityEvents,
      {
        maxSimulations: tech.maxSimulations,
        iterations: tech.iterations,
        onIteration: (done) => {
          iterationsDone++;
          onProgress?.({
            scenario: def.key,
            done: iterationsDone,
            total: totalIterations,
          });
        },
      },
    );
    const fromWealthMonthly = Math.max(0, totalMonthly - inputs.monthlyPension);
    scenarios[def.key] = {
      percentile: def.percentile,
      targetSuccessRate,
      totalMonthly,
      fromWealthMonthly,
      totalMonthlyNominalAtRetirement:
        basis === "real"
          ? Math.round(
              inflateToYear(totalMonthly, inputs.inflationRate, yearsToRetirement),
            )
          : totalMonthly,
      fromWealthMonthlyNominalAtRetirement:
        basis === "real"
          ? Math.round(
              inflateToYear(
                fromWealthMonthly,
                inputs.inflationRate,
                yearsToRetirement,
              ),
            )
          : fromWealthMonthly,
    };
  }

  return {
    basis,
    retirementYear,
    yearsToRetirement,
    scenarios,
    simulationsUsed: Math.min(settings.numSimulations, tech.maxSimulations),
    iterations: tech.iterations,
    seedUsed,
  };
}

/**
 * Einordnung des Bedarfs „Benötigt aus dem Vermögen" gegen den Korridor
 * (CR 10). Verglichen wird konsistent „aus dem Vermögen" gegen
 * „aus dem Vermögen" — ohne zusätzliche fachliche Schwellenwerte.
 */
export function rankAgainstCorridor(
  requiredFromWealthMonthly: number,
  corridor: CorridorResult,
): "below_difficult" | "within_corridor" | "above_favorable" {
  if (requiredFromWealthMonthly <= corridor.scenarios.difficult.fromWealthMonthly) {
    return "below_difficult";
  }
  if (requiredFromWealthMonthly > corridor.scenarios.favorable.fromWealthMonthly) {
    return "above_favorable";
  }
  return "within_corridor";
}
