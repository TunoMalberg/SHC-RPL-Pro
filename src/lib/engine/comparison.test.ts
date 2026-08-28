/**
 * Tests der Vergleichsansicht-Engine (CR 12/15/17): Variantentrennung,
 * Baseline-Charakteristika, Zielstrategie-Bau, Differenzen, Modus
 * „was möglich ist".
 */
import { describe, expect, test } from "bun:test";
import type { FinancialInputs, SimulationSettings } from "../types";
import { defaultClient, defaultInputs, defaultPortfolio } from "../defaults";
import {
  MIFID_PRESETS,
  assembleComparison,
  buildTargetPortfolio,
  computeMcVariant,
  computeNoInvestVariant,
  withMifidAllocation,
} from "./comparison";
import { realReturn } from "./valuation";

const client = { ...defaultClient };
const inputs: FinancialInputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3000 };
const settings: SimulationSettings = {
  numSimulations: 300,
  timeStepMonths: 12,
  mode: "fixed_withdrawal",
  randomSeed: 11,
};

describe("computeNoInvestVariant — Baseline strikt getrennt (CR 12)", () => {
  const v = computeNoInvestVariant(client, inputs, [], "Nicht investieren");

  test("deterministisch, 0 % nominal, keine Erfolgsquote, kein Korridor", () => {
    expect(v.kind).toBe("no_invest");
    expect(v.deterministic).toBe(true);
    expect(v.expectedReturnNominalPct).toBe(0);
    expect(v.successRate).toBeNull();
    expect(v.corridor).toBeUndefined();
    expect(v.goalReached).not.toBeNull(); // Wunsch erfasst → binär
  });

  test("reale Ertragserwartung nach Fisher (0 % nominal, 2,5 % Inflation → negativ)", () => {
    expect(v.expectedReturnRealPct).toBeCloseTo(
      Math.round(realReturn(0, inputs.inflationRate) * 100) / 100,
      6,
    );
    expect(v.expectedReturnRealPct).toBeLessThan(0);
  });

  test("sustainableMonthly = aus dem Vermögen (abzgl. Pension)", () => {
    expect(v.sustainableMonthlyReal).toBeGreaterThanOrEqual(0);
  });
});

describe("computeMcVariant + assembleComparison", () => {
  const baseline = computeNoInvestVariant(client, inputs, [], "Nicht investieren");
  const current = computeMcVariant(
    "current", "Bestehende Veranlagung",
    client, inputs, defaultPortfolio, settings, [],
  );

  test("MC-Variante trägt Korridor, Erfolgsquote, Einordnung, Horizontjahr", () => {
    expect(current.kind).toBe("current");
    expect(current.deterministic).toBe(false);
    expect(current.corridor).toBeDefined();
    expect(current.successRate).not.toBeNull();
    expect(current.horizonYear).toBe(client.birthYear + client.lifeExpectancy);
    expect(current.finalWealthRealMedian).toBeLessThan(current.finalWealthNominalMedian);
    expect(["below_difficult", "within_corridor", "above_favorable"]).toContain(
      current.ranking ?? "",
    );
  });

  test("Differenz vs. Nicht-investieren korrekt berechnet (CR 17)", () => {
    const run = assembleComparison([baseline, current]);
    expect(run.diffVsNoInvest).not.toBeNull();
    expect(run.diffVsNoInvest!.nominal).toBeCloseTo(
      current.finalWealthNominalMedian - baseline.finalWealthNominalMedian, 6,
    );
    expect(run.diffVsNoInvest!.real).toBeCloseTo(
      current.finalWealthRealMedian - baseline.finalWealthRealMedian, 6,
    );
    expect(run.diffVsNoInvest!.monthlyReal).toBeCloseTo(
      current.sustainableMonthlyReal - baseline.sustainableMonthlyReal, 6,
    );
    expect(run.variants.length).toBe(2);
    expect(new Date(run.stichtag).toString()).not.toBe("Invalid Date");
  });

  test("Zielstrategie hat Vorrang als Referenz der Differenz", () => {
    const target = { ...current, kind: "target" as const, label: "Ziel", finalWealthNominalMedian: current.finalWealthNominalMedian + 1000 };
    const run = assembleComparison([baseline, current, target]);
    expect(run.diffVsNoInvest!.nominal).toBeCloseTo(
      target.finalWealthNominalMedian - baseline.finalWealthNominalMedian, 6,
    );
  });

  test("Modus was-moeglich-ist: keine Erfolgsquote, kein Ranking (CR 4)", () => {
    const possible = computeMcVariant(
      "current", "Bestand",
      client, { ...inputs, desiredMonthlyWithdrawal: null },
      defaultPortfolio, settings, [],
    );
    expect(possible.successRate).toBeNull();
    expect(possible.ranking).toBeNull();
    expect(possible.sustainableMonthlyReal).toBeGreaterThan(0);
  });
});

describe("buildTargetPortfolio", () => {
  test("MiFID-Profil setzt Allokationen, Rest bleibt", () => {
    const p = buildTargetPortfolio(defaultPortfolio, { type: "mifid", profile: "growth" }, 250_000, 45);
    expect(p.buckets.map((b) => b.allocation)).toEqual([...MIFID_PRESETS.growth]);
    expect(p.buckets[0].expectedReturn).toBe(defaultPortfolio.buckets[0].expectedReturn);
    expect(p.mifidProfile).toBe("growth");
  });

  test("Optimizer-Allokation mit PE → rollierendes Programm", () => {
    const p = buildTargetPortfolio(
      defaultPortfolio,
      { type: "optimizer", alloc: { cash: 10, bonds: 30, equities: 60, pe: 15 } },
      250_000, 45,
    );
    expect(p.buckets.map((b) => b.allocation)).toEqual([10, 30, 60]);
    expect(p.peProgram?.enabled).toBe(true);
    expect(p.peProgram?.targetQuotaPct).toBe(15);
    expect(p.peFunds).toEqual([]);
  });

  test("withMifidAllocation verändert das Basisportfolio nicht (Immutability)", () => {
    const before = defaultPortfolio.buckets.map((b) => b.allocation);
    withMifidAllocation(defaultPortfolio, "speculative");
    expect(defaultPortfolio.buckets.map((b) => b.allocation)).toEqual(before);
  });
});
