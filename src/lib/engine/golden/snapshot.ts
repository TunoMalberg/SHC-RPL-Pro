/**
 * Erzeugt den „Fingerabdruck" eines Referenzfalls: alle für Berater und
 * Kunden sichtbaren Rechenergebnisse aus Monte-Carlo, Einzelpfad,
 * historischem Backtest (und optional Korridor + Baseline).
 *
 * Pfade werden auf Jahresstützstellen reduziert, damit die Referenzdatei
 * überschaubar bleibt; die Endwerte und alle Kennzahlen sind vollständig.
 */

import { runMonteCarloSimulation, runDetailedSingleSimulation } from "../montecarlo";
import { runHistoricalBacktest } from "../historical";
import { computeCorridorWithdrawals } from "../corridor";
import { runNoInvestProjection } from "../baseline";
import type { DetailedYearRow } from "../../types";
import type { ReferenceCase } from "./referenceCases";

export type Snapshot = Record<string, unknown>;

/** Jährliche Stützstellen eines step-basierten Pfads. */
function yearly(path: number[] | undefined, stepsPerYear: number): number[] | undefined {
  if (!path) return undefined;
  const out: number[] = [];
  for (let i = 0; i < path.length; i += stepsPerYear) out.push(path[i]);
  if ((path.length - 1) % stepsPerYear !== 0) out.push(path[path.length - 1]);
  return out;
}

/** Fachlich relevante Felder einer Einzelpfad-Zeile. */
function traceRow(r: DetailedYearRow): Snapshot {
  return {
    age: r.age,
    phase: r.phase,
    startTotal: r.startTotal,
    returnCash: r.returnCash,
    returnBonds: r.returnBonds,
    returnEquities: r.returnEquities,
    cashTax: r.cashTax,
    cashflow: r.cashflow,
    cashflowLabel: r.cashflowLabel,
    liquidityEvent: r.liquidityEvent,
    rebalanced: r.rebalanced,
    rebalSource: r.rebalSource,
    withdrawalFromCash: r.withdrawalFromCash,
    withdrawalFromBonds: r.withdrawalFromBonds,
    withdrawalFromEquities: r.withdrawalFromEquities,
    endCash: r.endCash,
    endBonds: r.endBonds,
    endEquities: r.endEquities,
    endTotal: r.endTotal,
    allocationSwitched: r.allocationSwitched ?? false,
    peCall: r.peCall,
    peDistNet: r.peDistNet,
    peNav: r.peNav,
    peCommitted: r.peCommitted,
    productPurchase: r.productPurchase,
    productPayout: r.productPayout,
    lvValue: r.lvValue,
  };
}

export function computeSnapshot(c: ReferenceCase): Snapshot {
  const { client, inputs, portfolio, settings, liquidityEvents } = c;
  const stepsPerYear = 12 / settings.timeStepMonths;

  const mc = runMonteCarloSimulation(client, inputs, portfolio, settings, liquidityEvents);
  const trace0 = runDetailedSingleSimulation(client, inputs, portfolio, settings, 0, liquidityEvents);
  const traceWorst = runDetailedSingleSimulation(
    client, inputs, portfolio, settings, mc.worstSimIndex ?? 0, liquidityEvents,
  );
  const hist = runHistoricalBacktest(client, inputs, portfolio, liquidityEvents);

  const snap: Snapshot = {
    monteCarlo: {
      successRate: mc.successRate,
      medianFinalWealth: mc.medianFinalWealth,
      meanFinalWealth: mc.meanFinalWealth,
      percentiles: mc.percentiles,
      percentilesReal: mc.valuation?.percentilesReal,
      maxDrawdown: mc.maxDrawdown,
      portfolioReturn: mc.portfolioReturn,
      portfolioVolatility: mc.portfolioVolatility,
      sharpeRatio: mc.sharpeRatio,
      failureYear: mc.failureYear,
      medianFailureYear: mc.medianFailureYear,
      worstSimIndex: mc.worstSimIndex,
      bestSimIndex: mc.bestSimIndex,
      medianPath: yearly(mc.medianPath, stepsPerYear),
      p10Path: yearly(mc.p10Path, stepsPerYear),
      p25Path: yearly(mc.p25Path, stepsPerYear),
      p75Path: yearly(mc.p75Path, stepsPerYear),
      p90Path: yearly(mc.p90Path, stepsPerYear),
      worstPath: yearly(mc.worstPath, stepsPerYear),
      bestPath: yearly(mc.bestPath, stepsPerYear),
      pePath: yearly(mc.pePath, stepsPerYear),
      productPath: yearly(mc.productPath, stepsPerYear),
      annualWithdrawals: mc.annualWithdrawals,
    },
    trace: {
      sim0: {
        finalWealth: trace0.finalWealth,
        success: trace0.success,
        rows: trace0.rows.map(traceRow),
      },
      worst: {
        simIndex: traceWorst.simulationIndex,
        finalWealth: traceWorst.finalWealth,
        success: traceWorst.success,
      },
    },
    historical: {
      scenarioCount: hist.scenarios.length,
      overallSuccessRate: hist.overallSuccessRate,
      averageFinalWealth: hist.averageFinalWealth,
      medianFinalWealth: hist.medianFinalWealth,
      medianFinalWealthReal: hist.medianFinalWealthReal,
      sustainableMonthlyWorst: hist.sustainableMonthlyWorst,
      sustainableMonthlyMedian: hist.sustainableMonthlyMedian,
      worst: hist.worstScenario
        ? { startYear: hist.worstScenario.startYear, finalWealth: hist.worstScenario.finalWealth }
        : null,
      best: hist.bestScenario
        ? { startYear: hist.bestScenario.startYear, finalWealth: hist.bestScenario.finalWealth }
        : null,
      finalWealthByStartYear: Object.fromEntries(
        hist.scenarios.map((s) => [String(s.startYear), s.finalWealth]),
      ),
      failedStartYears: hist.scenarios.filter((s) => !s.success).map((s) => s.startYear),
      maxDrawdownByStartYear: Object.fromEntries(
        hist.scenarios.map((s) => [String(s.startYear), s.maxDrawdown]),
      ),
    },
  };

  if (c.withCorridor) {
    const corridor = computeCorridorWithdrawals(client, inputs, portfolio, settings, liquidityEvents);
    const baseline = runNoInvestProjection(client, inputs, liquidityEvents);
    snap.corridor = corridor.scenarios;
    snap.baseline = {
      finalWealthNominal: baseline.finalWealthNominal,
      finalWealthReal: baseline.finalWealthReal,
      depletionAge: baseline.depletionAge,
      goalReached: baseline.goalReached,
      sustainableMonthlyReal: baseline.sustainableMonthlyReal,
    };
  }

  return snap;
}

/**
 * Vergleicht zwei Fingerabdrücke rekursiv. Zahlen gelten als gleich bei
 * |a−b| ≤ 1e-6 + 1e-9·|b| (deutlich unter einem Cent; fängt nur
 * plattformbedingte Rundungsreste der letzten Nachkommastelle ab).
 * Liefert die Liste der Abweichungen (Pfad + erwartet/erhalten).
 */
export function diffSnapshots(expected: unknown, actual: unknown, path = ""): string[] {
  if (typeof expected === "number" && typeof actual === "number") {
    if (Number.isNaN(expected) && Number.isNaN(actual)) return [];
    const tol = 1e-6 + 1e-9 * Math.abs(expected);
    return Math.abs(expected - actual) <= tol ? [] : [`${path}: erwartet ${expected}, erhalten ${actual}`];
  }
  if (expected === null || actual === null || typeof expected !== "object" || typeof actual !== "object") {
    return expected === actual ? [] : [`${path}: erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`];
  }
  if (Array.isArray(expected) !== Array.isArray(actual)) {
    return [`${path}: Typ abweichend`];
  }
  const diffs: string[] = [];
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const k of keys) {
    const e = (expected as Record<string, unknown>)[k];
    const a = (actual as Record<string, unknown>)[k];
    if (e === undefined && a === undefined) continue;
    diffs.push(...diffSnapshots(e, a, path ? `${path}.${k}` : k));
  }
  return diffs;
}
