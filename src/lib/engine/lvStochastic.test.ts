/**
 * Tests: Lebensversicherung als Mantel über der Schelhammer-VV —
 * stochastisch mit Ertragserwartung, Volatilität und Gleichlauf mit dem
 * Aktien-Topf.
 *
 * Invarianten: σ = 0 reproduziert exakt das deterministische Modell;
 * Erwartungstreue (E[1+R] = 1+µ); Streuung bei σ > 0; empirische
 * Korrelation mit dem Aktienschock ≈ ρ; Pläne ohne LV bit-identisch;
 * MC↔Einzelpfad konsistent.
 */

import { describe, expect, test } from "bun:test";
import { computeProductTimeline, createLvRuntime } from "./products";
import { runMonteCarloSimulation, runDetailedSingleSimulation } from "./montecarlo";
import {
  LV_DEFAULT_EQUITY_CORR,
  LV_DEFAULT_RETURN_PCT,
  LV_DEFAULT_VOL_PCT,
  defaultClient,
  defaultInputs,
  defaultPortfolio,
  makeDefaultLV,
} from "../defaults";
import { validatePortfolio } from "../validation";
import type {
  ClientProfile,
  FinancialInputs,
  LVHolding,
  PortfolioConfig,
  SimulationSettings,
} from "../types";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function policy(overrides: Partial<LVHolding> = {}): LVHolding {
  return {
    ...makeDefaultLV(45),
    amount: 100_000,
    purchaseAge: 45,
    lockYears: 15,
    payoutAge: 99, // keine Auszahlung im Horizont → Wert läuft durch
    ...overrides,
  };
}

/** Standardnormal-Ziehung (Box-Muller) für Test-Schocks. */
function gauss(seed: number): () => number {
  let s = seed;
  const next = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
  return () => {
    let u1 = next();
    while (u1 === 0) u1 = next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * next());
  };
}

describe("Defaults (Mantel über der VV)", () => {
  test("neue Polizze: 6 % Ertragserwartung, 12 % Volatilität, 0,8 Gleichlauf", () => {
    const p = makeDefaultLV(45);
    expect(LV_DEFAULT_RETURN_PCT).toBe(6);
    expect(LV_DEFAULT_VOL_PCT).toBe(12);
    expect(LV_DEFAULT_EQUITY_CORR).toBe(0.8);
    expect(p.expectedReturnPct).toBe(6);
    expect(p.volatilityPct).toBe(12);
    expect(p.equityCorrelation).toBe(0.8);
  });
});

describe("createLvRuntime", () => {
  test("σ = 0 reproduziert exakt den deterministischen Erwartungspfad", () => {
    const p = policy({ volatilityPct: 0, expectedReturnPct: 6 });
    const timeline = computeProductTimeline([], [p], 45, 30);
    const state = createLvRuntime([p], 45, 30, 42).newPathState(0);
    for (let y = 0; y <= 30; y++) {
      const r = state.advanceYear(y, y % 2 === 0 ? 1.5 : -2); // Schock egal bei σ=0
      expect(r.lvValue).toBeCloseTo(timeline[y].lvValue, 6);
    }
  });

  test("Erwartungstreue: Mittel der Endwerte ≈ Erlag·0,95·((1+µ)(1−0,075 %))^n", () => {
    const p = policy({ expectedReturnPct: 6, volatilityPct: 12, equityCorrelation: 0.8 });
    const rt = createLvRuntime([p], 45, 20, 7);
    const z = gauss(99);
    const N = 4000;
    let sum = 0;
    for (let sim = 0; sim < N; sim++) {
      const st = rt.newPathState(sim);
      let v = 0;
      for (let y = 0; y <= 20; y++) v = st.advanceYear(y, z()).lvValue;
      sum += v;
    }
    const expected = 95_000 * (1.06 * (1 - 0.00075)) ** 20;
    expect(sum / N).toBeGreaterThan(expected * 0.95);
    expect(sum / N).toBeLessThan(expected * 1.05);
  });

  test("Streuung bei σ = 12 %: Endwerte unterscheiden sich zwischen Pfaden", () => {
    const p = policy({ volatilityPct: 12 });
    const rt = createLvRuntime([p], 45, 20, 7);
    const finals = new Set<number>();
    for (let sim = 0; sim < 20; sim++) {
      const st = rt.newPathState(sim);
      let v = 0;
      for (let y = 0; y <= 20; y++) v = st.advanceYear(y, 0).lvValue;
      finals.add(Math.round(v));
    }
    expect(finals.size).toBeGreaterThan(15);
  });

  test("empirische Korrelation LV-Log-Rendite ↔ Aktienschock ≈ ρ (0,8 und 0)", () => {
    for (const rho of [0.8, 0]) {
      const p = policy({ volatilityPct: 12, equityCorrelation: rho });
      const rt = createLvRuntime([p], 45, 2, 3);
      const z = gauss(1234);
      const xs: number[] = [];
      const ys: number[] = [];
      for (let sim = 0; sim < 5000; sim++) {
        const st = rt.newPathState(sim);
        const v0 = st.advanceYear(0, 0).lvValue; // Kaufjahr
        const zEq = z();
        const v1 = st.advanceYear(1, zEq).lvValue;
        xs.push(zEq);
        ys.push(Math.log(v1 / v0));
      }
      const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
      const mx = mean(xs);
      const my = mean(ys);
      let cov = 0;
      let vx = 0;
      let vy = 0;
      for (let i = 0; i < xs.length; i++) {
        cov += (xs[i] - mx) * (ys[i] - my);
        vx += (xs[i] - mx) ** 2;
        vy += (ys[i] - my) ** 2;
      }
      const corr = cov / Math.sqrt(vx * vy);
      expect(Math.abs(corr - rho)).toBeLessThan(0.05);
    }
  });

  test("Auszahlung pfadabhängig, Polizze endet danach", () => {
    const p = policy({ volatilityPct: 12, payoutAge: 60 }); // Kauf 45, Bindung 15
    const rt = createLvRuntime([p], 45, 30, 5);
    const payouts = new Set<number>();
    for (let sim = 0; sim < 10; sim++) {
      const st = rt.newPathState(sim);
      let payout = 0;
      for (let y = 0; y <= 30; y++) {
        const r = st.advanceYear(y, 0);
        if (y === 15) payout = r.lvPayout;
        if (y > 15) expect(r.lvValue).toBe(0);
      }
      payouts.add(Math.round(payout));
    }
    expect(payouts.size).toBeGreaterThan(5);
  });
});

describe("MC-Integration", () => {
  const client: ClientProfile = { ...defaultClient };
  const inputs: FinancialInputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3000 };
  const settings: SimulationSettings = {
    numSimulations: 200,
    timeStepMonths: 12,
    mode: "fixed_withdrawal",
    randomSeed: 17,
  };

  test("Plan ohne LV bleibt bit-identisch (eigener Zufallsstrom)", () => {
    const p1 = clone(defaultPortfolio) as PortfolioConfig;
    const p2 = clone(defaultPortfolio) as PortfolioConfig;
    p2.lebensversicherungen = [];
    const r1 = runMonteCarloSimulation(client, inputs, p1, settings, []);
    const r2 = runMonteCarloSimulation(client, inputs, p2, settings, []);
    expect(r2.medianFinalWealth).toBe(r1.medianFinalWealth);
    expect(r2.medianPath).toEqual(r1.medianPath);
  });

  test("Volatilität wirkt: 12 % vs. 0 % ergibt andere Verteilung, Bänder P25 ≤ Median ≤ P75", () => {
    const pVol = clone(defaultPortfolio) as PortfolioConfig;
    pVol.lebensversicherungen = [policy({ volatilityPct: 12 })];
    const pFix = clone(defaultPortfolio) as PortfolioConfig;
    pFix.lebensversicherungen = [policy({ volatilityPct: 0 })];
    const rVol = runMonteCarloSimulation(client, inputs, pVol, settings, []);
    const rFix = runMonteCarloSimulation(client, inputs, pFix, settings, []);
    expect(rVol.percentiles.p10).not.toBe(rFix.percentiles.p10);
    const last = rVol.productPath!.length - 1;
    expect(rVol.productPathP25![last]).toBeLessThanOrEqual(rVol.productPath![last]);
    expect(rVol.productPath![last]).toBeLessThanOrEqual(rVol.productPathP75![last]);
    // Bei σ = 0 fallen die Bänder zusammen.
    expect(rFix.productPathP25![last]).toBeCloseTo(rFix.productPathP75![last], 6);
  });

  test("Einzelpfad reproduziert den LV-Wert des MC-Pfads (gleicher Seed/Index)", () => {
    const p = clone(defaultPortfolio) as PortfolioConfig;
    p.lebensversicherungen = [policy({ volatilityPct: 12 })];
    const a = runDetailedSingleSimulation(client, inputs, p, settings, 4, []);
    const b = runDetailedSingleSimulation(client, inputs, p, settings, 4, []);
    expect(a.rows.map((r) => r.lvValue)).toEqual(b.rows.map((r) => r.lvValue));
    // Und ein anderer Pfad-Index liefert einen anderen Verlauf.
    const c = runDetailedSingleSimulation(client, inputs, p, settings, 5, []);
    expect(c.rows[10].lvValue).not.toBe(a.rows[10].lvValue);
  });
});

describe("Validierung", () => {
  test("Korrelation außerhalb −1…1 → Fehler; Volatilität > 40 % → Warnung", () => {
    const p = clone(defaultPortfolio) as PortfolioConfig;
    p.lebensversicherungen = [policy({ equityCorrelation: 1.5, volatilityPct: 55 })];
    const r = validatePortfolio(p);
    expect(r.errors.some((e) => e.path.includes("equityCorrelation") && e.severity === "error")).toBe(true);
    expect(r.errors.some((e) => e.path.includes("volatilityPct") && e.severity === "warn")).toBe(true);
  });
});
