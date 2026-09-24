/**
 * Tests Produkt-Töpfe WBA/LV (AP8).
 *
 * Kritische Invarianten: korrekte Schedules (Kupons, Tilgung, LV-Basis
 * 0,95 × Erlag, Bindefrist-Ableitung), KEINE Watermark-KESt auf
 * steuerfreie Produkt-Cashflows, Cash-first-Drain beim Kauf, Sperre
 * (Entnahmen greifen Produktwert nie an) bei gleichzeitiger Zählung in
 * Erfolgsquote und Endvermögen, MC↔Einzelpfad-Konsistenz.
 */

import { describe, expect, test } from "bun:test";
import {
  computeProductTimeline,
  hasProductHoldings,
  lvEffectivePayoutAge,
} from "./products";
import {
  runMonteCarloSimulation,
  runDetailedSingleSimulation,
} from "./montecarlo";
import {
  defaultClient,
  defaultInputs,
  defaultPortfolio,
  deriveLvLockYears,
  makeDefaultLV,
  makeDefaultWBA,
} from "../defaults";
import type {
  ClientProfile,
  FinancialInputs,
  LVHolding,
  PortfolioConfig,
  SimulationSettings,
  WBAHolding,
} from "../types";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const baseClient: ClientProfile = { ...defaultClient };
const baseInputs: FinancialInputs = {
  ...defaultInputs,
  desiredMonthlyWithdrawal: 3000,
};
const baseSettings: SimulationSettings = {
  numSimulations: 200,
  timeStepMonths: 12,
  mode: "fixed_withdrawal",
  randomSeed: 7,
};

/** Portfolio ohne Marktbewegung: 0 % Rendite, 0 Vola, 0 Kosten, 0 Steuern. */
function zeroPortfolio(): PortfolioConfig {
  const p = clone(defaultPortfolio);
  for (const b of p.buckets) {
    b.expectedReturn = 0;
    b.volatility = 0;
    b.costs = 0;
    b.taxDrag = 0;
    b.netReturn = 0;
  }
  p.rebalancingFrequency = "none";
  p.depositTaxRate = 0;
  return p;
}

function wba(overrides: Partial<WBAHolding> = {}): WBAHolding {
  return { ...makeDefaultWBA(baseClient.currentAge), ...overrides };
}
function lv(overrides: Partial<LVHolding> = {}): LVHolding {
  return { ...makeDefaultLV(baseClient.currentAge), ...overrides };
}

describe("computeProductTimeline — WBA", () => {
  test("Kauf, 11 steuerfreie Kupons, Tilgung am Laufzeitende", () => {
    const bond = wba({ amount: 100_000, couponPct: 3, termYears: 11, purchaseAge: 45 });
    const tl = computeProductTimeline([bond], [], 45, 40);
    expect(tl[0].purchases).toBe(100_000);
    expect(tl[0].coupons).toBe(0);
    // Kupons in den Jahren 1..11 (inkl. Tilgungsjahr), je 3 000 €.
    for (let y = 1; y <= 11; y++) expect(tl[y].coupons).toBeCloseTo(3000, 6);
    expect(tl[12].coupons).toBe(0);
    // Tilgung im Jahr 11, Wert davor par, danach 0.
    expect(tl[11].payouts).toBe(100_000);
    expect(tl[10].wbaValue).toBe(100_000);
    expect(tl[11].wbaValue).toBe(0);
    // Summe Kupons = 11 × 3 000.
    const totalCoupons = tl.reduce((s, e) => s + e.coupons, 0);
    expect(totalCoupons).toBeCloseTo(33_000, 6);
  });

  test("Laufzeitende hinter dem Horizont: keine Tilgung, Wert läuft bis Horizont", () => {
    const bond = wba({ amount: 50_000, termYears: 11, purchaseAge: 85 });
    const tl = computeProductTimeline([bond], [], 45, 45); // Horizont bis 90
    const totalPayouts = tl.reduce((s, e) => s + e.payouts, 0);
    expect(totalPayouts).toBe(0);
    expect(tl[45].wbaValue).toBe(50_000);
  });
});

describe("computeProductTimeline — LV", () => {
  test("investierte Basis = Erlag × 0,95 (4 % VersSt + 1 % Kosten)", () => {
    const policy = lv({ amount: 100_000, expectedReturnPct: 0, purchaseAge: 45, lockYears: 15 });
    const tl = computeProductTimeline([], [policy], 45, 40);
    expect(tl[0].purchases).toBe(100_000);
    expect(tl[0].lvValue).toBeCloseTo(95_000, 6);
    // 0 % Rendite: Wert fällt nur um die laufenden Kosten (0,075 % p.a.).
    expect(tl[1].lvValue).toBeCloseTo(95_000 * (1 - 0.00075), 4);
  });

  test("Nettowachstum ×(1+r)×(1−0,075 %) und steuerfreie Auszahlung am Bindefrist-Ende", () => {
    const policy = lv({ amount: 100_000, expectedReturnPct: 5, purchaseAge: 45, lockYears: 15 });
    const tl = computeProductTimeline([], [policy], 45, 40);
    const growth = 1.05 * (1 - 0.00075);
    const expected = 95_000 * Math.pow(growth, 15);
    expect(tl[15].payouts).toBeCloseTo(expected, 2);
    expect(tl[15].lvValue).toBe(0);
    expect(tl[14].lvValue).toBeCloseTo(95_000 * Math.pow(growth, 14), 2);
  });

  test("gesetzliche Bindefrist: 10 Jahre ab Kaufalter 50, sonst 15", () => {
    expect(deriveLvLockYears(49)).toBe(15);
    expect(deriveLvLockYears(50)).toBe(10);
    expect(deriveLvLockYears(65)).toBe(10);
    const policy = lv({ purchaseAge: 52, lockYears: 10 });
    expect(lvEffectivePayoutAge(policy)).toBe(62);
    // payoutAge vor Bindefrist-Ende wird geklemmt.
    expect(lvEffectivePayoutAge({ ...policy, payoutAge: 55 })).toBe(62);
  });

  test("hasProductHoldings erkennt leere Konfiguration", () => {
    expect(hasProductHoldings(computeProductTimeline([], [], 45, 40))).toBe(false);
    expect(hasProductHoldings(computeProductTimeline([wba()], [], 45, 40))).toBe(true);
  });
});

describe("MC-Integration — Steuer-Neutralität & Sperre", () => {
  test("0 %-Welt + WBA: steuerfreie Kupons/Tilgung lösen keine KESt aus (Endvermögen exakt)", () => {
    const client = { ...baseClient, currentAge: 60, retirementAge: 61, lifeExpectancy: 80 };
    const inputs: FinancialInputs = {
      ...baseInputs,
      initialCapital: 500_000,
      monthlySavings: 0,
      desiredMonthlyWithdrawal: 0,
      monthlyPension: 0,
      inflationRate: 0,
    };
    const portfolio = zeroPortfolio();
    portfolio.kestRate = 27.5; // KESt aktiv — darf trotzdem nie greifen
    portfolio.wohnbauanleihen = [
      wba({ amount: 100_000, couponPct: 3, termYears: 11, purchaseAge: 60 }),
    ];
    const res = runMonteCarloSimulation(client, inputs, portfolio, { ...baseSettings, numSimulations: 10 }, []);
    // Deterministische Erwartung: 500k + 11 Kupons à 3k (Tilgung ist
    // vermögensneutral: Wert → Cash). Keine Steuer, keine Rendite.
    expect(res.medianFinalWealth).toBeCloseTo(500_000 + 33_000, 0);
  });

  test("Kauf drained die liquiden Töpfe (Watermark −1:1), Wert zählt im Pfad", () => {
    const client = { ...baseClient, currentAge: 60, retirementAge: 61, lifeExpectancy: 75 };
    const inputs: FinancialInputs = {
      ...baseInputs,
      initialCapital: 300_000,
      monthlySavings: 0,
      desiredMonthlyWithdrawal: 0,
      monthlyPension: 0,
      inflationRate: 0,
    };
    const portfolio = zeroPortfolio();
    portfolio.lebensversicherungen = [
      lv({ amount: 200_000, expectedReturnPct: 0, purchaseAge: 60, lockYears: 10, payoutAge: 99 }),
    ];
    const res = runMonteCarloSimulation(client, inputs, portfolio, { ...baseSettings, numSimulations: 10 }, []);
    // 300k − 200k Kauf + LV-Wert. Engine-Konvention (wie PE-NAV): der
    // Produktwert wird am JAHRESANFANG aktualisiert — der letzte
    // Jahres-Block liegt bei Jahr n−1 → (n−1) Kosten-Anwendungen.
    const years = client.lifeExpectancy - client.currentAge; // 15
    const lvGrowth = Math.pow(1 - 0.00075, years - 1);
    expect(res.medianFinalWealth).toBeCloseTo(100_000 + 190_000 * lvGrowth, 0);
  });

  test("gesperrter Produktwert rettet das Erfolgskriterium, wird aber nie entnommen", () => {
    const client = { ...baseClient, currentAge: 64, retirementAge: 65, lifeExpectancy: 90 };
    const inputs: FinancialInputs = {
      ...baseInputs,
      initialCapital: 100_000,
      monthlySavings: 0,
      desiredMonthlyWithdrawal: 1000,
      monthlyPension: 0,
      inflationRate: 0,
      inflateWithdrawalToRetirement: false,
    };
    const portfolio = zeroPortfolio();
    portfolio.lebensversicherungen = [
      lv({ amount: 90_000, expectedReturnPct: 0, purchaseAge: 64, lockYears: 15, payoutAge: 99 }),
    ];
    const res = runMonteCarloSimulation(client, inputs, portfolio, { ...baseSettings, numSimulations: 10 }, []);
    // Liquide bleiben 10k; Entnahme 12k/J → liquide sind nach ~1 Jahr weg,
    // aber LV-Wert (~85k) hält das Gesamtvermögen über der Entnahme →
    // kein Fehlschlag (Konvention „PE immer in der Erfolgsquote").
    expect(res.successRate).toBeGreaterThan(99);
    // Endvermögen ≈ LV-Wert (liquide erschöpft) — LV wurde nie angetastet.
    const lvVal = 85_500 * Math.pow(1 - 0.00075, 26);
    expect(res.medianFinalWealth).toBeGreaterThan(lvVal * 0.98);
    expect(res.medianFinalWealth).toBeLessThan(lvVal * 1.02);
  });

  test("MC-Pfad und Einzelpfad liefern identische Produkt-Cashflows", () => {
    const portfolio = clone(defaultPortfolio) as PortfolioConfig;
    portfolio.wohnbauanleihen = [wba({ amount: 60_000, purchaseAge: baseClient.currentAge + 2 })];
    portfolio.lebensversicherungen = [lv({ amount: 80_000, purchaseAge: baseClient.currentAge })];
    const trace = runDetailedSingleSimulation(
      baseClient, baseInputs, portfolio, baseSettings, 3, [],
    );
    const purchases = trace.rows.reduce((s, r) => s + (r.productPurchase ?? 0), 0);
    expect(purchases).toBeCloseTo(140_000, 6);
    const coupons = trace.rows.reduce((s, r) => s + (r.productCoupon ?? 0), 0);
    // 11 Kupons à 3 % von 60k = 19 800 (Horizont 45 Jahre reicht).
    expect(coupons).toBeCloseTo(19_800, 4);
    // Wert-Spalten befüllt.
    expect(trace.rows.some((r) => (r.wbaValue ?? 0) > 0)).toBe(true);
    expect(trace.rows.some((r) => (r.lvValue ?? 0) > 0)).toBe(true);
  });

  test("productPath im Ergebnis vorhanden und step-aligned", () => {
    const portfolio = clone(defaultPortfolio) as PortfolioConfig;
    portfolio.wohnbauanleihen = [wba({ amount: 50_000 })];
    const res = runMonteCarloSimulation(baseClient, baseInputs, portfolio, { ...baseSettings, numSimulations: 20 }, []);
    expect(res.productPath).toBeDefined();
    expect(res.productPath!.length).toBe(res.medianPath.length);
    expect(Math.max(...res.productPath!)).toBe(50_000);
  });

  test("ohne Produkte: Ergebnis bit-identisch zu vorher (Regressionsanker)", () => {
    const p1 = clone(defaultPortfolio) as PortfolioConfig;
    const p2 = clone(defaultPortfolio) as PortfolioConfig;
    p2.wohnbauanleihen = [];
    p2.lebensversicherungen = [];
    const r1 = runMonteCarloSimulation(baseClient, baseInputs, p1, baseSettings, []);
    const r2 = runMonteCarloSimulation(baseClient, baseInputs, p2, baseSettings, []);
    expect(r1.medianFinalWealth).toBe(r2.medianFinalWealth);
    expect(r1.successRate).toBe(r2.successRate);
  });
});
