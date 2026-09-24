/**
 * Tests Cash-Zins-KESt (AP7): Zinsen auf Bankeinlagen werden jährlich
 * bei Zufluss besteuert (Default 25 %) und sind aus der Höchststand-
 * Logik herausgenommen — keine Verrechnung mit Kursverlusten, keine
 * Doppelbesteuerung.
 */

import { describe, expect, test } from "bun:test";
import {
  runMonteCarloSimulation,
  runDetailedSingleSimulation,
} from "./montecarlo";
import { runHistoricalBacktest } from "./historical";
import {
  defaultClient,
  defaultInputs,
  defaultPortfolio,
} from "../defaults";
import type {
  ClientProfile,
  FinancialInputs,
  PortfolioConfig,
  SimulationSettings,
} from "../types";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const client: ClientProfile = {
  ...defaultClient,
  currentAge: 60,
  retirementAge: 61,
  lifeExpectancy: 80,
};
const inputs: FinancialInputs = {
  ...defaultInputs,
  initialCapital: 100_000,
  monthlySavings: 0,
  desiredMonthlyWithdrawal: 0,
  monthlyPension: 0,
  inflationRate: 0,
};
const settings: SimulationSettings = {
  numSimulations: 10,
  timeStepMonths: 12,
  mode: "fixed_withdrawal",
  randomSeed: 11,
};

/** 100 % Cash mit fixem Zins, 0 Vola — deterministisch prüfbar. */
function cashOnlyPortfolio(cashReturnPct: number, depositTaxRate?: number): PortfolioConfig {
  const p = clone(defaultPortfolio) as PortfolioConfig;
  p.buckets[0].allocation = 100;
  p.buckets[1].allocation = 0;
  p.buckets[2].allocation = 0;
  for (const b of p.buckets) {
    b.expectedReturn = 0;
    b.volatility = 0;
    b.costs = 0;
  }
  p.buckets[0].expectedReturn = cashReturnPct;
  p.rebalancingFrequency = "none";
  if (depositTaxRate !== undefined) p.depositTaxRate = depositTaxRate;
  return p;
}

describe("Cash-Zins-KESt (AP7)", () => {
  // Die Engine zieht Renditen lognormal (GBM mit Itô-Korrektur): bei
  // 0 Vola ist die effektive Jahresrendite e^µ − 1, nicht µ.
  const effRate = (pct: number) => Math.exp(pct / 100) - 1;

  test("100 % Cash, 2 % Zins: Endwert = Kapital × (1 + zins·0,75)^Jahre — keine zusätzliche Watermark-KESt", () => {
    const p = cashOnlyPortfolio(2, 25);
    const res = runMonteCarloSimulation(client, inputs, p, settings, []);
    const years = client.lifeExpectancy - client.currentAge;
    const expected = 100_000 * Math.pow(1 + effRate(2) * 0.75, years);
    expect(res.medianFinalWealth).toBeCloseTo(expected, -1);
  });

  test("depositTaxRate = 0: voller Zins bleibt (und keine Watermark-KESt auf Cash mehr)", () => {
    const p = cashOnlyPortfolio(2, 0);
    p.kestRate = 27.5; // aktiv, darf aber ohne Wertpapiergewinne nie greifen
    const res = runMonteCarloSimulation(client, inputs, p, settings, []);
    const years = client.lifeExpectancy - client.currentAge;
    const expected = 100_000 * Math.pow(1 + effRate(2), years);
    expect(res.medianFinalWealth).toBeCloseTo(expected, -1);
  });

  test("Negativzins: keine Steuer, Vermögen sinkt exakt um den Zins", () => {
    const p = cashOnlyPortfolio(-1, 25);
    const res = runMonteCarloSimulation(client, inputs, p, settings, []);
    const years = client.lifeExpectancy - client.currentAge;
    const expected = 100_000 * Math.pow(1 + effRate(-1), years);
    expect(res.medianFinalWealth).toBeCloseTo(expected, -1);
  });

  test("höherer Einlagen-Satz → niedrigeres Endvermögen (Satz wirkt)", () => {
    const r25 = runMonteCarloSimulation(client, inputs, cashOnlyPortfolio(2, 25), settings, []);
    const r50 = runMonteCarloSimulation(client, inputs, cashOnlyPortfolio(2, 50), settings, []);
    expect(r50.medianFinalWealth).toBeLessThan(r25.medianFinalWealth);
  });

  test("Einzelpfad: cashTax-Spalte konsistent (Steuer = 25 % des positiven Brutto-Zinses)", () => {
    const p = cashOnlyPortfolio(2, 25);
    const trace = runDetailedSingleSimulation(client, inputs, p, settings, 0, []);
    for (const row of trace.rows) {
      expect(row.cashTax ?? 0).toBeCloseTo(Math.max(0, row.returnCash) * 0.25, 4);
    }
  });

  test("historischer Backtest wendet den Einlagen-Satz ebenfalls an", () => {
    const p0 = cashOnlyPortfolio(0, 0);
    const p25 = cashOnlyPortfolio(0, 25);
    // Backtest nutzt historische Cash-Renditen — Satz 25 % muss das
    // Ergebnis gegenüber 0 % senken.
    const h0 = runHistoricalBacktest(client, inputs, p0, []);
    const h25 = runHistoricalBacktest(client, inputs, p25, []);
    expect(h25.averageFinalWealth).toBeLessThan(h0.averageFinalWealth);
  });
});
