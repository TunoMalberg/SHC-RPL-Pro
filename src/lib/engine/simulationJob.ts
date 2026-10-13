/**
 * Vollständiger Simulationslauf (Paket 4: Rechnen im Hintergrund).
 *
 * Enthält alle Berechnungen hinter „Simulation starten" — Korridor,
 * Monte-Carlo, Zielwert-Suchen, Heatmap, Berechnungsnachweis, Backtest
 * bzw. den MiFID-Szenariovergleich. Läuft im Web Worker (simulation.worker.ts),
 * damit die Oberfläche währenddessen bedienbar bleibt; ohne Worker-Unterstützung
 * läuft dieselbe Funktion direkt im Browser (simulationClient.ts).
 *
 * Reine Rechenlogik: keine Übersetzungen, kein React — Fortschritt wird als
 * Schlüssel gemeldet, die Oberfläche übersetzt.
 */

import type {
  ClientProfile,
  FinancialInputs,
  HistoricalAnalysis,
  LiquidityEvent,
  MifidProfile,
  PortfolioConfig,
  SimulationResult,
  SimulationSettings,
} from "../types";
import {
  findRequiredCapital,
  findRequiredSavingsRate,
  findSustainableWithdrawal,
  generateWithdrawalHeatmap,
  runMonteCarloSimulation,
} from "./montecarlo";
import { runHistoricalBacktest } from "./historical";
import { computeCorridorWithdrawals } from "./corridor";
import { buildCalculationTrace } from "./trace";
import { MIFID_ORDER, withMifidAllocation } from "./comparison";
import { isPossibleMode, runPlanSimulation, withEffectiveWithdrawal } from "./planRun";
import { computeConfigHash } from "../configHash";

export interface SimulationJobRequest {
  client: ClientProfile;
  inputs: FinancialInputs;
  portfolio: PortfolioConfig;
  settings: SimulationSettings;
  liquidityEvents: LiquidityEvent[];
}

/** Fortschritt: Prozent + Schlüssel des Arbeitsschritts (Übersetzung in der UI). */
export interface SimulationProgress {
  pct: number;
  step:
    | "corridor"
    | "main"
    | "sustainable"
    | "requiredCapital"
    | "requiredSavings"
    | "heatmap"
    | "historical"
    | "multirun";
  /** Nur bei „multirun": laufende Nummer (1–4) und Profil. */
  index?: number;
  profile?: MifidProfile;
}

export interface MultirunVariant {
  profile: MifidProfile;
  portfolio: PortfolioConfig;
  result: SimulationResult;
}

export type SimulationJobResult =
  | { kind: "single"; result: SimulationResult; historical: HistoricalAnalysis }
  | {
      kind: "multirun";
      variants: MultirunVariant[];
      /** Index der Variante, die als Hauptergebnis angezeigt wird. */
      mainIndex: number;
      historical: HistoricalAnalysis;
    };

export function runSimulationJob(
  req: SimulationJobRequest,
  onProgress: (p: SimulationProgress) => void = () => {},
): SimulationJobResult {
  const { client, inputs, portfolio, settings, liquidityEvents } = req;
  const configHash = computeConfigHash(client, inputs, portfolio, liquidityEvents);

  // ── MiFID-Szenariovergleich: alle vier Risikoprofile ──────────────
  if (settings.mode === "scenario_comparison") {
    // Leerer Wunsch: alle Profile mit derselben typischen Entnahme des
    // aktuellen Portfolios vergleichen (sonst liefen sie mit 0 €).
    const runInputs = isPossibleMode(inputs)
      ? withEffectiveWithdrawal(
          inputs,
          computeCorridorWithdrawals(client, inputs, portfolio, settings, liquidityEvents)
            .scenarios.typical.totalMonthly,
        )
      : inputs;
    const variants: MultirunVariant[] = [];
    for (const [i, profile] of MIFID_ORDER.entries()) {
      onProgress({ pct: 10 + i * 22, step: "multirun", index: i + 1, profile });
      const variantPortfolio = withMifidAllocation(portfolio, profile);
      const result = runMonteCarloSimulation(client, runInputs, variantPortfolio, settings, liquidityEvents);
      result.withdrawalAssumption = isPossibleMode(inputs) ? "corridor_typical" : "user";
      result.withdrawalHeatmap = generateWithdrawalHeatmap(
        client, runInputs, variantPortfolio, settings, liquidityEvents,
      );
      variants.push({ profile, portfolio: variantPortfolio, result });
    }
    // Hauptergebnis = aktuell gewähltes Profil (sonst „Ausgewogen").
    const activeProfile: MifidProfile = portfolio.mifidProfile ?? "balanced";
    const found = variants.findIndex((v) => v.portfolio.mifidProfile === activeProfile);
    const mainIndex = found >= 0 ? found : 1;
    // Fingerabdruck des Arbeitsstands (nicht des Variantenportfolios) —
    // Änderungen danach sollen den Stale-Hinweis auslösen.
    variants[mainIndex].result.configHash = configHash;

    onProgress({ pct: 92, step: "historical" });
    const historical = runHistoricalBacktest(
      client, runInputs, variants[mainIndex].portfolio, liquidityEvents,
    );
    return { kind: "multirun", variants, mainIndex, historical };
  }

  // ── Planungskorridor: mögliche Monatsentnahme P25/P50/P75 ─────────
  onProgress({ pct: 10, step: "corridor" });
  const corridor = computeCorridorWithdrawals(client, inputs, portfolio, settings, liquidityEvents);

  // Hauptsimulation (bei leerem Wunsch mit der typischen Korridor-Entnahme).
  onProgress({ pct: 30, step: "main" });
  const possibleMode = isPossibleMode(inputs);
  const { result, effectiveInputs } = runPlanSimulation(
    client, inputs, portfolio, settings, liquidityEvents, { corridor },
  );
  result.corridor = corridor;

  if (settings.mode === "sustainable_withdrawal") {
    onProgress({ pct: 40, step: "sustainable" });
    result.sustainableWithdrawal = findSustainableWithdrawal(
      client, inputs, portfolio, settings, 95, liquidityEvents,
    );
  }
  if (settings.mode === "required_capital") {
    onProgress({ pct: 40, step: "requiredCapital" });
    result.requiredCapital = findRequiredCapital(
      client, effectiveInputs, portfolio, settings, 95, liquidityEvents,
    );
  }
  if (settings.mode === "required_savings") {
    onProgress({ pct: 40, step: "requiredSavings" });
    result.requiredSavings = findRequiredSavingsRate(
      client, effectiveInputs, portfolio, settings, 95, liquidityEvents,
    );
  }

  onProgress({ pct: 65, step: "heatmap" });
  result.withdrawalHeatmap = generateWithdrawalHeatmap(
    client, effectiveInputs, portfolio, settings, liquidityEvents,
  );

  // Berechnungsnachweis (CR 19).
  const trace = buildCalculationTrace(
    client, effectiveInputs, portfolio, settings, liquidityEvents, result, corridor,
  );
  if (possibleMode) {
    // Herleitung spiegelt die ERFASSTEN Eingaben (kein Wunschbetrag);
    // die Cashflow-Serie basiert auf der typischen Korridor-Entnahme.
    trace.derivation.desiredMonthlyIncome = null;
    trace.derivation.requiredMonthlyWithdrawal = null;
    trace.derivation.formula +=
      " — Lauf im Modus 'berechnen, was möglich ist': Cashflow-Serie basiert auf der typischen Korridor-Entnahme.";
    trace.ranking = null;
  }
  result.calculationTrace = trace;
  result.configHash = configHash;

  // Backtest mit derselben Entnahme wie die Hauptsimulation.
  onProgress({ pct: 85, step: "historical" });
  const historical = runHistoricalBacktest(client, effectiveInputs, portfolio, liquidityEvents);

  return { kind: "single", result, historical };
}
