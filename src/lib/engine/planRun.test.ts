/**
 * Leerer Wunschbetrag („berechnen, was möglich ist"): alle Ansichten
 * rechnen mit derselben typischen Korridor-Entnahme — nie mit 0 €.
 */

import { describe, expect, test } from "bun:test";
import { defaultClient, defaultInputs, defaultPortfolio, defaultSettings } from "../defaults";
import { runHistoricalBacktest } from "./historical";
import { runDetailedSingleSimulation, runMonteCarloSimulation } from "./montecarlo";
import { isPossibleMode, runPlanSimulation, withEffectiveWithdrawal } from "./planRun";

const settings = { ...defaultSettings, numSimulations: 300 };
const emptyWish = { ...defaultInputs, desiredMonthlyWithdrawal: null };

describe("Entnahme bei leerem Wunschbetrag", () => {
  test("erfasster Wunsch bleibt unverändert", () => {
    const withWish = { ...defaultInputs, desiredMonthlyWithdrawal: 2800 };
    expect(isPossibleMode(withWish)).toBe(false);
    expect(withEffectiveWithdrawal(withWish, 9999)).toBe(withWish);
  });

  test("leerer Wunsch → bekannte Entnahme wird übernommen und gekennzeichnet", () => {
    const { result, effectiveInputs } = runPlanSimulation(
      defaultClient, emptyWish, defaultPortfolio, settings, [], { knownMonthly: 3100 },
    );
    expect(effectiveInputs.desiredMonthlyWithdrawal).toBe(3100);
    expect(result.effectiveMonthlyWithdrawal).toBe(3100);
    expect(result.withdrawalAssumption).toBe("corridor_typical");
    expect(result.requiredMonthlyWithdrawal).toBeNull();
  });

  test("leerer Wunsch ohne Vorwissen → typische Korridor-Entnahme (> 0)", () => {
    const { result } = runPlanSimulation(defaultClient, emptyWish, defaultPortfolio, settings, []);
    expect(result.effectiveMonthlyWithdrawal).toBeGreaterThan(0);
    expect(result.effectiveMonthlyWithdrawal).toBe(result.corridor?.scenarios.typical.totalMonthly);
  });

  test("Backtest mit wirksamer Entnahme liegt deutlich unter dem Lauf ohne Entnahme", () => {
    const eff = withEffectiveWithdrawal(emptyWish, 3000);
    const without = runHistoricalBacktest(defaultClient, emptyWish, defaultPortfolio, []);
    const withW = runHistoricalBacktest(defaultClient, eff, defaultPortfolio, []);
    expect(withW.medianFinalWealth).toBeLessThan(without.medianFinalWealth * 0.6);
  });

  test("Einzelpfad mit wirksamer Entnahme = Monte-Carlo-Pfad gleicher Nummer", () => {
    const annual = { ...settings, timeStepMonths: 12 };
    const eff = withEffectiveWithdrawal(emptyWish, 3000);
    const mc = runMonteCarloSimulation(defaultClient, eff, defaultPortfolio, annual, []);
    const trace = runDetailedSingleSimulation(
      defaultClient, eff, defaultPortfolio, annual, mc.worstSimIndex ?? 0, [],
    );
    expect(trace.finalWealth).toBeCloseTo(mc.worstPath[mc.worstPath.length - 1], 6);
    expect(trace.rows.some((r) => r.cashflow < 0)).toBe(true);
  });
});
