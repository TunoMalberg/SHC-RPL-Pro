/**
 * Tests für das rollierende PE-Programm.
 *
 * Kern-Invarianten:
 *   1. Linearität: C × Unit-Schedule == computePESchedule(commitment C)
 *      je Jahr (inkl. KESt-Watermark-Skalierung).
 *   2. Steady-State: Ist-Quote konvergiert gegen die Zielquote.
 *   3. Deckungs-Check: keine Commitments, wenn die restlichen
 *      Entnahmen nicht mehr gedeckt sind; Quote sinkt via Runoff.
 *   4. Glide-Down: nach dem letzten Commitment fällt der Programm-NAV
 *      auf 0 (spätestens nach fundDuration Jahren).
 *   5. Reproduzierbarkeit im 'full'-Modus (Seed-Determinismus).
 *
 * Aufruf: `bun test src/lib/engine/peProgram.test.ts`
 */

import { describe, expect, test } from "bun:test";
import {
  buildUnitEnsemble,
  computeRemainingWithdrawals,
  computeUnitSchedule,
  createPEProgramRuntime,
  planProgramVintagesDeterministic,
  sanitizeProgram,
  type PEProgramYearInput,
} from "./peProgram";
import { computePESchedule } from "./privateEquity";
import { runMonteCarloSimulation, runDetailedSingleSimulation } from "./montecarlo";
import { defaultClient, defaultInputs, defaultPortfolio, makeDefaultPEProgram } from "../defaults";
import type { ClientProfile, FinancialInputs, PEProgram, PortfolioConfig } from "../types";

const KEST = 0.275;

const baseProgram: PEProgram = makeDefaultPEProgram();
const basePortfolio: PortfolioConfig = JSON.parse(JSON.stringify(defaultPortfolio));
const baseClient: ClientProfile = { ...defaultClient };
const baseInputs: FinancialInputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3000 };

/** Bequemer Default-Input für processYear. */
function yearInput(overrides: Partial<PEProgramYearInput>): PEProgramYearInput {
  return {
    yearIdx: 0,
    liquid: 1_000_000,
    staticPeNavNow: 0,
    staticPeNavAtPeak: 0,
    netAnnualWithdrawal: 0,
    remainingWithdrawalsNominal: 0,
    isWithdrawalPhase: false,
    ...overrides,
  };
}

describe("computeUnitSchedule — Linearität", () => {
  test("C × Unit == computePESchedule(commitment C) je Jahr (tol 1e-9)", () => {
    const unit = computeUnitSchedule(baseProgram.fundTemplate, KEST, "realistic");
    const C = 250_000;
    const sched = computePESchedule(
      {
        ...baseProgram.fundTemplate,
        id: "test",
        name: "test",
        commitment: C,
        startAge: 0,
      },
      KEST,
      "realistic",
    );
    expect(sched.cashflows.length).toBe(unit.duration);
    for (let t = 0; t < unit.duration; t++) {
      const cf = sched.cashflows[t];
      expect(Math.abs(C * unit.call[t] - cf.call)).toBeLessThan(1e-6);
      expect(Math.abs(C * unit.distGross[t] - cf.distribution)).toBeLessThan(1e-6);
      expect(Math.abs(C * unit.distNet[t] - cf.distributionNet)).toBeLessThan(1e-6);
      expect(Math.abs(C * unit.nav[t] - cf.nav)).toBeLessThan(1e-6);
    }
  });

  test("Unit-Kennzahlen sind plausibel", () => {
    const unit = computeUnitSchedule(baseProgram.fundTemplate, KEST, "realistic");
    // Gesamt-Calls = callRatio (80 % von 1 €).
    const sumCalls = Array.from(unit.call).reduce((a, b) => a + b, 0);
    expect(Math.abs(sumCalls - 0.8)).toBeLessThan(1e-9);
    // NAV-Peak liegt nach der halben Investitionsperiode, vor Fondsende.
    expect(unit.tPeak).toBeGreaterThan(0);
    expect(unit.tPeak).toBeLessThan(unit.duration - 1);
    expect(unit.sumNav).toBeGreaterThan(0);
  });
});

describe("PEProgramPathState — Build-up & Steady-State", () => {
  test("Ist-Quote konvergiert gegen Zielquote (±2 pp) bei 0 % Rendite", () => {
    // Portfolio ohne Rendite → W bleibt (bis auf PE-Flüsse) konstant.
    const flat: PortfolioConfig = JSON.parse(JSON.stringify(basePortfolio));
    for (const b of flat.buckets) {
      b.expectedReturn = 0;
      b.costs = 0;
      b.netReturn = 0;
    }
    const totalYears = 45;
    const runtime = createPEProgramRuntime(baseProgram, flat, totalYears, KEST, "realistic", 42);
    const state = runtime.newPathState(0);

    let liquid = 1_000_000;
    let lastQuota = 0;
    const quotas: number[] = [];
    for (let y = 0; y < totalYears; y++) {
      const res = state.processYear(
        yearInput({ yearIdx: y, liquid }),
      );
      liquid -= res.call;
      liquid += res.distNet;
      const total = liquid + res.nav;
      lastQuota = total > 0 ? (res.nav / total) * 100 : 0;
      quotas.push(lastQuota);
    }
    // Nach ≥ fundDuration Jahren: Quote ≈ Ziel (15 %) ± 2 pp.
    for (let y = baseProgram.fundTemplate.fundDuration; y < totalYears; y++) {
      expect(quotas[y]).toBeGreaterThan(baseProgram.targetQuotaPct - 2);
      expect(quotas[y]).toBeLessThan(baseProgram.targetQuotaPct + 2);
    }
  });

  test("kein Commitment bei targetQuotaPct = 0", () => {
    const prog: PEProgram = { ...baseProgram, targetQuotaPct: 0 };
    const runtime = createPEProgramRuntime(prog, basePortfolio, 30, KEST, "realistic", 42);
    const state = runtime.newPathState(0);
    for (let y = 0; y < 30; y++) {
      const res = state.processYear(yearInput({ yearIdx: y }));
      expect(res.committed).toBe(0);
      expect(res.nav).toBe(0);
    }
  });

  test("Vintage-Rhythmus: Commitments nur in Cadence-Jahren", () => {
    const prog: PEProgram = { ...baseProgram, vintageCadenceYears: 2 };
    const runtime = createPEProgramRuntime(prog, basePortfolio, 20, KEST, "realistic", 42);
    const state = runtime.newPathState(0);
    for (let y = 0; y < 20; y++) {
      const res = state.processYear(yearInput({ yearIdx: y }));
      if (y % 2 === 1) expect(res.committed).toBe(0);
    }
  });
});

describe("PEProgramPathState — Deckungs-Check (Entnahmephase)", () => {
  test("kein Commitment, wenn restliche Entnahmen nicht gedeckt sind", () => {
    const runtime = createPEProgramRuntime(baseProgram, basePortfolio, 30, KEST, "realistic", 42);
    const state = runtime.newPathState(0);
    // Liquid 500k, restliche Entnahmen 600k → Deckung verletzt → kein Commitment.
    const res = state.processYear(
      yearInput({
        liquid: 500_000,
        remainingWithdrawalsNominal: 600_000,
        netAnnualWithdrawal: 40_000,
        isWithdrawalPhase: true,
      }),
    );
    expect(res.committed).toBe(0);
  });

  test("Commitment erfolgt, wenn Deckung großzügig vorhanden ist", () => {
    const runtime = createPEProgramRuntime(baseProgram, basePortfolio, 30, KEST, "realistic", 42);
    const state = runtime.newPathState(0);
    // Liquid 5 Mio., restliche Entnahmen 1 Mio. → reichlich Headroom.
    const res = state.processYear(
      yearInput({
        liquid: 5_000_000,
        remainingWithdrawalsNominal: 1_000_000,
        netAnnualWithdrawal: 50_000,
        isWithdrawalPhase: true,
      }),
    );
    expect(res.committed).toBeGreaterThan(0);
  });

  test("Reduktionsformel exakt an der Grenze: Commitment ≤ Headroom / callRatio", () => {
    const runtime = createPEProgramRuntime(baseProgram, basePortfolio, 30, KEST, "realistic", 42);
    const state = runtime.newPathState(0);
    const liquid = 2_000_000;
    const remaining = 1_800_000;
    const res = state.processYear(
      yearInput({
        liquid,
        remainingWithdrawalsNominal: remaining,
        isWithdrawalPhase: true,
      }),
    );
    // Headroom = 2 Mio. − 0 − 1,8 Mio. = 200k; callRatio 80 % → C ≤ 250k.
    const cap = (liquid - remaining) / 0.8;
    expect(res.committed).toBeLessThanOrEqual(cap + 1e-6);
    expect(res.committed).toBeGreaterThan(0);
  });

  test("Ansparphase-Guard: Puffer × Netto-Entnahme wird respektiert", () => {
    const runtime = createPEProgramRuntime(baseProgram, basePortfolio, 30, KEST, "realistic", 42);
    const state = runtime.newPathState(0);
    // Liquid 100k, Puffer 3 × 40k = 120k > Liquid → kein Commitment.
    const res = state.processYear(
      yearInput({
        liquid: 100_000,
        netAnnualWithdrawal: 40_000,
        isWithdrawalPhase: false,
      }),
    );
    expect(res.committed).toBe(0);
  });
});

describe("PEProgramPathState — Glide-Down / Runoff", () => {
  test("nach letztem Commitment läuft der NAV auf 0 aus", () => {
    const totalYears = 40;
    const runtime = createPEProgramRuntime(baseProgram, basePortfolio, totalYears, KEST, "realistic", 42);
    const state = runtime.newPathState(0);
    const dur = baseProgram.fundTemplate.fundDuration;

    let lastCommitYear = -1;
    const navs: number[] = [];
    for (let y = 0; y < totalYears; y++) {
      // Ab Jahr 10: Entnahmephase ohne Deckung → keine Commitments mehr.
      const inWd = y >= 10;
      const res = state.processYear(
        yearInput({
          yearIdx: y,
          liquid: inWd ? 100_000 : 1_000_000,
          remainingWithdrawalsNominal: inWd ? 2_000_000 : 0,
          netAnnualWithdrawal: inWd ? 60_000 : 0,
          isWithdrawalPhase: inWd,
        }),
      );
      if (res.committed > 0) lastCommitYear = y;
      navs.push(res.nav);
    }
    expect(lastCommitYear).toBeLessThan(10);
    // Spätestens fundDuration Jahre nach dem letzten Commitment: NAV = 0.
    for (let y = lastCommitYear + dur; y < totalYears; y++) {
      expect(navs[y]).toBe(0);
    }
    // Runoff: ab Peak fällt der NAV monoton (keine neuen Vintages mehr).
    const peakIdx = navs.indexOf(Math.max(...navs));
    for (let y = Math.max(peakIdx, 10); y < lastCommitYear + dur; y++) {
      expect(navs[y + 1]).toBeLessThanOrEqual(navs[y] + 1e-9);
    }
  });

  test("unfunded fällt nach Commitment-Stopp auf 0 (keine Calls in der Tiefe der Entnahme)", () => {
    const totalYears = 40;
    const runtime = createPEProgramRuntime(baseProgram, basePortfolio, totalYears, KEST, "realistic", 42);
    const state = runtime.newPathState(0);
    const invPeriod = baseProgram.fundTemplate.investmentPeriod;

    let lastCommitYear = -1;
    const calls: number[] = [];
    for (let y = 0; y < totalYears; y++) {
      const inWd = y >= 10;
      const res = state.processYear(
        yearInput({
          yearIdx: y,
          liquid: inWd ? 50_000 : 1_000_000,
          remainingWithdrawalsNominal: inWd ? 3_000_000 : 0,
          isWithdrawalPhase: inWd,
        }),
      );
      if (res.committed > 0) lastCommitYear = y;
      calls.push(res.call);
      if (y >= 10 && res.committed === 0 && y > lastCommitYear + invPeriod) {
        expect(res.unfunded).toBeLessThan(1e-6);
      }
    }
    // Keine Calls mehr nach letztem Commitment + Investitionsperiode.
    for (let y = lastCommitYear + invPeriod; y < totalYears; y++) {
      expect(calls[y]).toBeLessThan(1e-6);
    }
  });
});

describe("buildUnitEnsemble — 'full'-Modus", () => {
  test("Ensemble ist seed-reproduzierbar", () => {
    const a = buildUnitEnsemble(baseProgram.fundTemplate, KEST, 20, 777);
    const b = buildUnitEnsemble(baseProgram.fundTemplate, KEST, 20, 777);
    expect(a.length).toBe(20);
    for (let s = 0; s < a.length; s++) {
      for (let t = 0; t < a[s].duration; t++) {
        expect(a[s].nav[t]).toBe(b[s].nav[t]);
        expect(a[s].distNet[t]).toBe(b[s].distNet[t]);
      }
    }
  });

  test("PathStates im 'full'-Modus sind je simIndex reproduzierbar", () => {
    const run = () => {
      const runtime = createPEProgramRuntime(baseProgram, basePortfolio, 30, KEST, "full", 42);
      const state = runtime.newPathState(3);
      const navs: number[] = [];
      for (let y = 0; y < 30; y++) {
        navs.push(state.processYear(yearInput({ yearIdx: y })).nav);
      }
      return navs;
    };
    const a = run();
    const b = run();
    for (let y = 0; y < a.length; y++) expect(a[y]).toBe(b[y]);
  });
});

describe("computeRemainingWithdrawals", () => {
  test("Suffix-Summe ist monoton fallend und 0 nach Horizont", () => {
    const totalYears =
      baseClient.lifeExpectancy - baseClient.currentAge;
    const remaining = computeRemainingWithdrawals(baseClient, baseInputs, totalYears);
    for (let y = 0; y < totalYears; y++) {
      expect(remaining[y]).toBeGreaterThanOrEqual(remaining[y + 1] ?? 0);
    }
    expect(remaining[totalYears]).toBe(0);
    // In der Ansparphase ist die Summe aller künftigen Entnahmen enthalten.
    expect(remaining[0]).toBeGreaterThan(0);
  });
});

describe("planProgramVintagesDeterministic — Vorschau", () => {
  test("liefert Vintages und eine Quote nahe Ziel im eingeschwungenen Zustand", () => {
    const preview = planProgramVintagesDeterministic(
      baseProgram,
      baseClient,
      baseInputs,
      basePortfolio,
    );
    expect(preview.vintages.length).toBeGreaterThan(1);
    // Erstes Vintage startet im ersten Jahr.
    expect(preview.vintages[0].startAge).toBe(baseClient.currentAge);
    // Quote erreicht die Zielzone während der Ansparphase (±3 pp Toleranz
    // auf dem wachsenden Erwartungspfad).
    const accYears = baseClient.retirementAge - baseClient.currentAge;
    const steady = preview.quotaPath.slice(
      baseProgram.fundTemplate.fundDuration,
      accYears,
    );
    expect(steady.length).toBeGreaterThan(0);
    for (const q of steady) {
      expect(q.quotaPct).toBeGreaterThan(baseProgram.targetQuotaPct - 3);
      expect(q.quotaPct).toBeLessThan(baseProgram.targetQuotaPct + 3);
    }
  });
});

describe("MC-Integration (runMonteCarloSimulation + Trace)", () => {
  const settings = {
    numSimulations: 300,
    timeStepMonths: 12,
    mode: "fixed_withdrawal" as const,
    randomSeed: 42,
  };

  test("ohne Programm: enabled:false und undefined liefern identische Ergebnisse", () => {
    const pNone: PortfolioConfig = JSON.parse(JSON.stringify(basePortfolio));
    const pOff: PortfolioConfig = {
      ...JSON.parse(JSON.stringify(basePortfolio)),
      peProgram: { ...makeDefaultPEProgram(), enabled: false },
    };
    const a = runMonteCarloSimulation(baseClient, baseInputs, pNone, settings, []);
    const b = runMonteCarloSimulation(baseClient, baseInputs, pOff, settings, []);
    expect(a.successRate).toBe(b.successRate);
    expect(a.medianFinalWealth).toBe(b.medianFinalWealth);
    expect(a.pePath).toBeUndefined();
  });

  test("mit Programm: reproduzierbar, PE-Pfad vorhanden, Bänder geordnet", () => {
    const p: PortfolioConfig = {
      ...JSON.parse(JSON.stringify(basePortfolio)),
      peProgram: makeDefaultPEProgram(),
    };
    const a = runMonteCarloSimulation(baseClient, baseInputs, p, settings, []);
    const b = runMonteCarloSimulation(baseClient, baseInputs, p, settings, []);
    expect(a.successRate).toBe(b.successRate);
    expect(a.medianFinalWealth).toBe(b.medianFinalWealth);
    expect(a.successRate).toBeGreaterThanOrEqual(0);
    expect(a.successRate).toBeLessThanOrEqual(100);
    expect(a.pePath).toBeDefined();
    expect(a.pePathP25).toBeDefined();
    expect(a.pePathP75).toBeDefined();
    const pe = a.pePath ?? [];
    // Programm baut NAV auf: irgendwann > 0.
    expect(Math.max(...pe)).toBeGreaterThan(0);
    for (let i = 0; i < pe.length; i++) {
      expect(a.pePathP25?.[i] ?? 0).toBeLessThanOrEqual((a.pePath?.[i] ?? 0) + 1e-9);
      expect(a.pePath?.[i] ?? 0).toBeLessThanOrEqual((a.pePathP75?.[i] ?? 0) + 1e-9);
    }
  });

  test("Trace: Programm-Jahre enthalten Commitments und PE-NAV; Deckungs-Check greift", () => {
    const p: PortfolioConfig = {
      ...JSON.parse(JSON.stringify(basePortfolio)),
      peProgram: makeDefaultPEProgram(),
    };
    const trace = runDetailedSingleSimulation(baseClient, baseInputs, p, settings, 0, []);
    const committedYears = trace.rows.filter((r) => (r.peCommitted ?? 0) > 0);
    expect(committedYears.length).toBeGreaterThan(0);
    // Erstes Commitment im ersten Jahr (Build-up).
    expect(trace.rows[0].peCommitted ?? 0).toBeGreaterThan(0);
    const maxNav = Math.max(...trace.rows.map((r) => r.peNav ?? 0));
    expect(maxNav).toBeGreaterThan(0);
    // Ist-Quote (NAV / Gesamt) bleibt unter maxVintage+Ziel-Kappe (Sanity).
    for (const r of trace.rows) {
      const total = r.endTotal + (r.peNav ?? 0);
      if (total > 0) {
        expect(((r.peNav ?? 0) / total) * 100).toBeLessThan(45);
      }
    }
  });

  test("Programm + Bestand-Fonds laufen additiv", () => {
    const p: PortfolioConfig = {
      ...JSON.parse(JSON.stringify(basePortfolio)),
      peFunds: [
        {
          id: "bestand-1",
          name: "Bestand",
          commitment: 100_000,
          callRatio: 80,
          irr: 10,
          tvpi: 1.7,
          investmentPeriod: 5,
          fundDuration: 14,
          startAge: baseClient.currentAge,
        },
      ],
      peProgram: makeDefaultPEProgram(),
    };
    const r = runMonteCarloSimulation(baseClient, baseInputs, p, settings, []);
    expect(r.pePath).toBeDefined();
    expect(Math.max(...(r.pePath ?? [0]))).toBeGreaterThan(0);
    expect(r.successRate).toBeGreaterThanOrEqual(0);
  });
});

describe("sanitizeProgram", () => {
  test("clampt alle Felder in gültige Bereiche", () => {
    const wild: PEProgram = {
      ...baseProgram,
      targetQuotaPct: 99,
      vintageCadenceYears: 0,
      liquidityBufferYears: -5,
      withdrawalCoveragePct: 9999,
      maxVintageQuotaPct: 0,
    };
    const s = sanitizeProgram(wild);
    expect(s.targetQuotaPct).toBe(40);
    expect(s.vintageCadenceYears).toBe(1);
    expect(s.liquidityBufferYears).toBe(0);
    expect(s.withdrawalCoveragePct).toBe(300);
    expect(s.maxVintageQuotaPct).toBe(1);
  });
});
