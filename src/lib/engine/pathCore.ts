/**
 * Gemeinsamer Rechenkern (Paket 2, Punkt 6).
 *
 * EIN Pfad = Schritt für Schritt (Jahr oder Monat) die vollständige
 * Vermögensentwicklung eines Kunden. Monte-Carlo-Simulation, Einzelpfad und
 * historischer Backtest verwenden denselben Kern — jede Rechenregel steht
 * genau einmal hier. Der Backtest liefert statt Zufallsrenditen die echten
 * Jahresrenditen und Inflationsraten (`MarketScenario`).
 *
 * Reihenfolge je Schritt (unverändert gegenüber dem Produktivstand):
 *   1. Renditen; Zinsen der Liquidität sofort mit KESt Bankeinlagen besteuert
 *   2. Private Equity (Bestand), einmal pro Jahr am Jahresanfang
 *   3. Rollierendes PE-Programm, einmal pro Jahr
 *   4. Produkt-Töpfe (Wohnbauanleihe, LV), einmal pro Jahr
 *   5. Allokationswechsel auf das Entnahme-Portfolio (einmalig)
 *   6. Sparrate bzw. Entnahme abzüglich Pension (Liquidität zuerst)
 *   7. Liquiditätsereignisse
 *   8. Umschichtung (Zielgewichte bzw. Liquiditätspuffer in der Entnahmephase)
 *   9. KESt Wertpapiere nach dem Höchststand-Prinzip
 *
 * Der Kern kennt nur Regeln. Was festgehalten wird (nur Summen für die
 * Monte-Carlo-Statistik oder jede Buchung für die Einzelpfad-Tabelle),
 * entscheidet der Aufrufer über `PathRecorder`.
 */

import type {
  ClientProfile,
  FinancialInputs,
  LiquidityEvent,
  PortfolioConfig,
  SimulationSettings,
  WithdrawalPhaseOverride,
} from "../types";
import {
  SeededRandom,
  choleskyDecomposition,
  generateCorrelatedReturns,
} from "./random";
import { rebalancePortfolio, rebalanceThreeBuckets } from "./portfolio";
import {
  computePETimeline,
  buildStochasticEnsemble,
  type PETimelineEntry,
  type PEEnsemble,
} from "./privateEquity";
import {
  computeRemainingWithdrawals,
  createPEProgramRuntime,
  type PEProgramRuntime,
} from "./peProgram";
import {
  computeProductTimeline,
  createLvRuntime,
  hasProductHoldings,
  shockFromReturn,
  type LvRuntime,
  type ProductYearEntry,
} from "./products";
import { PE_STOCHASTIC_ENSEMBLE_SIZE } from "../defaults";

// ── Gemeinsame Bausteine ────────────────────────────────────────────

/**
 * Wendet Zahlungen an, die nicht aus dem Markt kommen (PE-Abrufe und
 * -Ausschüttungen, Produkt-Käufe, -Kupons und -Auszahlungen).
 *
 * Abflüsse werden zuerst aus der Liquidität, danach anteilig aus Anleihen
 * und Aktien bezahlt und senken den Höchststand 1:1. Zuflüsse (bereits
 * versteuert bzw. steuerfrei) gehen in die Liquidität und heben den
 * Höchststand 1:1 — so entsteht keine doppelte KESt.
 *
 * Mutiert `bucketValues` in place; gibt den neuen Höchststand zurück.
 */
export function applyExternalCashflows(
  bucketValues: number[],
  outflow: number,
  inflow: number,
  highWatermark: number,
): number {
  let hw = highWatermark;
  if (outflow > 0) {
    const cashAvail = bucketValues[0];
    if (cashAvail >= outflow) {
      bucketValues[0] -= outflow;
    } else {
      const remaining = outflow - cashAvail;
      bucketValues[0] = 0;
      const restTotal = bucketValues[1] + bucketValues[2];
      if (restTotal > 0) {
        const ratio = Math.min(1, remaining / restTotal);
        bucketValues[1] *= 1 - ratio;
        bucketValues[2] *= 1 - ratio;
      }
    }
    hw = Math.max(0, hw - outflow);
  }
  if (inflow > 0) {
    bucketValues[0] += inflow;
    hw += inflow;
  }
  return hw;
}

/**
 * Einmalige Umschichtung auf die Zielgewichte der Entnahmephase.
 * KESt fällt nur auf den tatsächlich umgeschichteten Anteil des
 * eingebetteten Gewinns an (Turnover = ½·Σ|w_ziel − w_ist|); der Rest
 * bleibt gestundet. Mutiert `bucketValues`; gibt neuen Höchststand zurück.
 */
export function switchToWithdrawalAllocation(
  bucketValues: number[],
  targetWeights: number[],
  highWatermark: number,
  kestRate: number,
): number {
  const total = bucketValues[0] + bucketValues[1] + bucketValues[2];
  if (total <= 0) return highWatermark;

  let turnover = 0;
  for (let i = 0; i < 3; i++) {
    const wIst = bucketValues[i] / total;
    turnover += Math.abs(targetWeights[i] - wIst);
  }
  turnover *= 0.5;

  const embeddedGain = Math.max(0, total - highWatermark);
  const realizedGain = embeddedGain * turnover;
  const tax = realizedGain * kestRate;
  const totalAfter = total - tax;

  for (let i = 0; i < 3; i++) {
    bucketValues[i] = targetWeights[i] * totalAfter;
  }

  const remainingUnrealizedGain = embeddedGain - realizedGain;
  return Math.max(0, totalAfter - remainingUnrealizedGain);
}

/**
 * Ist in diesem Schritt eine Umschichtung fällig?
 * Quartalsweise bei jährlichem Schritt = jeden Schritt (vorher: nie, weil
 * `step % 0` nicht definiert ist — behoben mit dem gemeinsamen Kern).
 */
export function isRebalancingStep(step: number, stepsPerYear: number, frequency: string): boolean {
  if (frequency === "none") return false;
  if (frequency === "monthly") return true;
  if (frequency === "quarterly") {
    return step % Math.max(1, Math.round(stepsPerYear / 4)) === 0;
  }
  if (frequency === "annually") return step % stepsPerYear === 0;
  return false;
}

// ── Kontext eines Simulationslaufs (einmal je Lauf aufgebaut) ───────

export interface PathContext {
  client: ClientProfile;
  inputs: FinancialInputs;
  liquidityEvents: LiquidityEvent[];
  stepsPerYear: number;
  totalYears: number;
  totalSteps: number;
  accumulationSteps: number;
  /** Ab diesem Schritt gelten die Entnahme-Gewichte (Allokations-Regime). */
  switchStep: number;
  accWeights: number[];
  wdWeights: number[];
  startWeights: number[];
  wd: WithdrawalPhaseOverride | undefined;
  accRebalFreq: string;
  wdRebalFreq: string;
  accRebalThreshold: number;
  wdCashYears: number;
  means: number[];
  vols: number[];
  cholesky: number[][];
  kestRate: number;
  depositTaxRate: number;
  inflationPerStep: number;
  savingsPerStep: number;
  withdrawalPerStep: number;
  pensionPerStep: number;
  desiredMonthly: number;
  inflateWithdrawals: boolean;
  baseSeed: number;
  // Private Equity
  hasPE: boolean;
  peEnsemble: PEEnsemble | null;
  peTimelineDefault: PETimelineEntry[];
  peRuntime: PEProgramRuntime | null;
  remainingWithdrawals: Float64Array | null;
  // Produkt-Töpfe
  productTimeline: ProductYearEntry[];
  hasProducts: boolean;
  lvRuntime: LvRuntime;
}

/**
 * Baut den Kontext. `stepsPerYear` überschreibt den Zeitschritt der
 * Einstellungen (Einzelpfad rechnet immer in Jahresschritten).
 */
export function buildPathContext(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  settings: SimulationSettings,
  liquidityEvents: LiquidityEvent[] = [],
  stepsPerYearOverride?: number,
): PathContext {
  const accumulationYears = Math.max(0, client.retirementAge - client.currentAge);
  const withdrawalYears = Math.max(0, client.lifeExpectancy - client.retirementAge);
  const totalYears = accumulationYears + withdrawalYears;
  const stepsPerYear = stepsPerYearOverride ?? 12 / settings.timeStepMonths;
  const timeStepMonths = 12 / stepsPerYear;
  const totalSteps = Math.ceil(totalYears * stepsPerYear);
  const accumulationSteps = Math.ceil(accumulationYears * stepsPerYear);

  // Phasen-Portfolios: Rendite/Vola/Kosten je Topf sind identisch, nur
  // Gewichte und Umschicht-Parameter unterscheiden sich.
  const accWeights = portfolio.buckets.map((b) => b.allocation / 100);
  const wd = portfolio.withdrawalPhase;
  const wdWeights = wd ? wd.allocations.map((a) => a / 100) : accWeights;
  const accRebalFreq = portfolio.rebalancingFrequency;
  const accCashYears = portfolio.cashYearsTarget ?? 2;
  const switchYears = Math.max(0, wd?.switchYearsBeforeRetirement ?? 0);
  const switchStep = Math.max(0, accumulationSteps - Math.ceil(switchYears * stepsPerYear));

  // Eingabe = Jahresertrag (Brutto − laufende Kosten, ohne unterjährigen
  // Zinseszins). ln(1 + r) als Drift → der Durchschnitt der Jahresrenditen
  // ist genau r (7 % − 1,5 % = 5,5 % p.a.); Zinseszins über die Jahre.
  // Gleiche Logik wie die fondsgebundene LV (products.ts). KESt separat.
  const means = portfolio.buckets.map(
    (b) => Math.log(1 + Math.max(-0.99, (b.expectedReturn - b.costs) / 100)) / stepsPerYear,
  );
  const vols = portfolio.buckets.map((b) => b.volatility / 100 / Math.sqrt(stepsPerYear));
  const kestRate = (portfolio.kestRate ?? 27.5) / 100;
  const desiredMonthly = inputs.desiredMonthlyWithdrawal ?? 0;
  const baseSeed = settings.randomSeed ?? 42;

  // Private Equity (Topf 4): 'full' → ein Stochastik-Szenario je Pfad.
  const peFunds = portfolio.peFunds ?? [];
  const peMode = portfolio.peModelingMode ?? "realistic";
  const peEnsemble =
    peMode === "full" && peFunds.length > 0
      ? buildStochasticEnsemble(
          peFunds,
          client.currentAge,
          totalYears,
          kestRate,
          PE_STOCHASTIC_ENSEMBLE_SIZE,
          baseSeed ^ 0xa17b1e,
        )
      : null;
  const peTimelineDefault =
    peFunds.length > 0
      ? peEnsemble
        ? peEnsemble.median
        : computePETimeline(peFunds, client.currentAge, totalYears, kestRate, peMode)
      : [];

  // Rollierendes PE-Programm (additiv zum Bestand).
  const peProgramCfg =
    portfolio.peProgram?.enabled && portfolio.peProgram.targetQuotaPct > 0
      ? portfolio.peProgram
      : null;
  const peRuntime = peProgramCfg
    ? createPEProgramRuntime(peProgramCfg, portfolio, totalYears, kestRate, peMode, baseSeed)
    : null;

  const productTimeline = computeProductTimeline(
    portfolio.wohnbauanleihen ?? [],
    portfolio.lebensversicherungen ?? [],
    client.currentAge,
    totalYears,
  );

  return {
    client,
    inputs,
    liquidityEvents,
    stepsPerYear,
    totalYears,
    totalSteps,
    accumulationSteps,
    switchStep,
    accWeights,
    wdWeights,
    // Wechsel-Regime gilt sofort (bereits pensioniert bzw. X ≥ Jahre bis
    // Pension) → Start direkt in den Entnahme-Gewichten.
    startWeights: switchStep > 0 || !wd ? accWeights : wdWeights,
    wd,
    accRebalFreq,
    wdRebalFreq: wd ? wd.rebalancingFrequency : accRebalFreq,
    accRebalThreshold: portfolio.rebalancingThreshold,
    wdCashYears: wd ? wd.cashYearsTarget : accCashYears,
    means,
    vols,
    cholesky: choleskyDecomposition(portfolio.correlationMatrix),
    kestRate,
    depositTaxRate: (portfolio.depositTaxRate ?? 25) / 100,
    inflationPerStep: (1 + inputs.inflationRate / 100) ** (1 / stepsPerYear) - 1,
    savingsPerStep: inputs.monthlySavings * timeStepMonths,
    withdrawalPerStep: desiredMonthly * timeStepMonths,
    pensionPerStep: inputs.monthlyPension * timeStepMonths,
    desiredMonthly,
    // Beträge in heutiger Kaufkraft → mit Inflation hochgerechnet
    // (Default an); `useRealValues` betrifft nur die Sparrate.
    inflateWithdrawals: inputs.inflateWithdrawalToRetirement !== false,
    baseSeed,
    hasPE: peTimelineDefault.length > 0,
    peEnsemble,
    peTimelineDefault,
    peRuntime,
    remainingWithdrawals: peRuntime
      ? computeRemainingWithdrawals(client, inputs, totalYears)
      : null,
    productTimeline,
    hasProducts: hasProductHoldings(productTimeline),
    lvRuntime: createLvRuntime(
      portfolio.lebensversicherungen ?? [],
      client.currentAge,
      totalYears,
      baseSeed,
    ),
  };
}

// ── Detail-Protokoll (nur Einzelpfad) ───────────────────────────────

/** Alle Buchungen eines Schritts — wird nur bei aktivem Recorder gefüllt. */
export interface StepDetail {
  step: number;
  isAccumulation: boolean;
  start: [number, number, number];
  returns: number[];
  returnAmounts: [number, number, number];
  cashTax: number;
  peCall: number;
  peDistGross: number;
  peDistNet: number;
  peNav: number;
  peCommitted?: number;
  peUnfunded?: number;
  productPurchase: number;
  productCoupon: number;
  productPayout: number;
  wbaValue: number;
  lvValue: number;
  allocationSwitched: boolean;
  /** Sparrate (positiv) bzw. Netto-Entnahme (negativ). */
  cashflow: number;
  grossWithdrawal: number;
  pension: number;
  hasPension: boolean;
  withdrawalFrom: [number, number, number];
  liquidityEvent: number;
  liquidityEventLabel: string;
  rebalanced: boolean;
  rebalDeltas: [number, number, number];
  rebalSource: string;
  end: [number, number, number];
  cumulativeInflation: number;
}

/**
 * Vorgegebener Marktverlauf statt Zufallsrenditen (historischer Backtest):
 * Netto-Rendite je Topf (nach Kosten) und Inflation des Schritts.
 */
export interface MarketScenario {
  returns(step: number): number[];
  inflation(step: number): number;
}

export interface PathRecorder {
  onStep(detail: StepDetail): void;
}

export interface PathOutcome {
  /** Vermögenspfad je Schritt (Index 0 = heute), nur bei collectPath. */
  path: number[] | null;
  finalValue: number;
  failed: boolean;
  failureStep: number;
  marketMaxDD: number;
  /** Gesamt-PE-NAV je Jahr (nur mit PE-Programm). */
  peProgNavYears: number[] | null;
  /** Produktwert je Jahr (nur mit Produkt-Töpfen). */
  productValueYears: number[] | null;
}

/**
 * Simuliert einen Pfad. `sim` ist der Pfad-Index: er bestimmt den
 * Zufallsstrom (Seed = Basis + sim), das PE-Stochastik-Szenario und die
 * Ströme von PE-Programm und LV — Monte-Carlo-Pfad N und Einzelpfad N
 * sind dadurch identisch.
 */
export function simulatePath(
  ctx: PathContext,
  sim: number,
  opts: { collectPath?: boolean; recorder?: PathRecorder; market?: MarketScenario } = {},
): PathOutcome {
  const { inputs, client, stepsPerYear } = ctx;
  const rec = opts.recorder;
  const market = opts.market;
  const rng = new SeededRandom(ctx.baseSeed + sim);
  const peTimeline: PETimelineEntry[] = !ctx.hasPE
    ? []
    : ctx.peEnsemble
      ? ctx.peEnsemble.scenarios[sim % ctx.peEnsemble.scenarios.length]
      : ctx.peTimelineDefault;
  const peState = ctx.peRuntime ? ctx.peRuntime.newPathState(sim) : null;
  const lvState = ctx.lvRuntime.active ? ctx.lvRuntime.newPathState(sim) : null;

  let bucketValues = ctx.startWeights.map((w) => w * inputs.initialCapital);
  let switchedToWithdrawal = false;
  let peNavCurrent = ctx.hasPE ? peTimeline[0].totalNav : 0;
  let peProgNavCurrent = 0;
  let productValueCurrent = 0;
  let equityShockSum = 0;
  let equityShockSteps = 0;
  const productValueYears: number[] | null = ctx.hasProducts ? [] : null;
  const peProgNavYears: number[] | null = peState ? [] : null;
  const path: number[] | null = opts.collectPath ? [inputs.initialCapital + peNavCurrent] : null;
  let marketIndex = 1;
  let marketPeak = 1;
  let marketMaxDD = 0;
  let failed = false;
  let failureStep = -1;
  let cumulativeInflation = 1;
  // Steuerlicher Höchststand — KESt nur auf Zuwächse darüber.
  let highWatermark = inputs.initialCapital;

  for (let step = 0; step < ctx.totalSteps; step++) {
    const isAccumulation = step < ctx.accumulationSteps;
    const yearStart = step % stepsPerYear === 0;
    const yIdx = Math.floor(step / stepsPerYear);
    const d: StepDetail | null = rec
      ? {
          step,
          isAccumulation,
          start: [bucketValues[0], bucketValues[1], bucketValues[2]],
          returns: [],
          returnAmounts: [0, 0, 0],
          cashTax: 0,
          peCall: 0,
          peDistGross: 0,
          peDistNet: 0,
          peNav: 0,
          productPurchase: 0,
          productCoupon: 0,
          productPayout: 0,
          wbaValue: 0,
          lvValue: 0,
          allocationSwitched: false,
          cashflow: 0,
          grossWithdrawal: 0,
          pension: 0,
          hasPension: false,
          withdrawalFrom: [0, 0, 0],
          liquidityEvent: 0,
          liquidityEventLabel: "",
          rebalanced: false,
          rebalDeltas: [0, 0, 0],
          rebalSource: "",
          end: [0, 0, 0],
          cumulativeInflation: 0,
        }
      : null;

    // ── 1. Renditen; Zinsen der Liquidität sofort besteuert ─────────
    const returns = market
      ? market.returns(step)
      : generateCorrelatedReturns(rng, ctx.cholesky, ctx.means, ctx.vols);
    const cashInterest = bucketValues[0] * returns[0];
    const cashTaxPaid = Math.max(0, cashInterest) * ctx.depositTaxRate;
    if (d) {
      d.returns = returns;
      d.returnAmounts = [cashInterest, bucketValues[1] * returns[1], bucketValues[2] * returns[2]];
      d.cashTax = cashTaxPaid;
    }
    bucketValues[0] += cashInterest - cashTaxPaid;
    bucketValues[1] *= 1 + returns[1];
    bucketValues[2] *= 1 + returns[2];
    // Netto-Zins verschiebt den Höchststand signiert (wie eine Einzahlung)
    // → die Höchststand-KESt erfasst nur noch Wertpapiergewinne.
    highWatermark = Math.max(0, highWatermark + cashInterest - cashTaxPaid);
    if (lvState) {
      equityShockSum += shockFromReturn(returns[2], ctx.means[2], ctx.vols[2]);
      equityShockSteps++;
    }

    // Reiner Marktindex (ohne Zahlungsströme) für den Markt-Drawdown.
    const mktWeights = step < ctx.switchStep ? ctx.accWeights : ctx.wdWeights;
    const marketStepReturn = mktWeights.reduce((s, w, i) => s + w * returns[i], 0);
    marketIndex *= 1 + marketStepReturn;
    if (marketIndex > marketPeak) marketPeak = marketIndex;
    const ddNow = marketPeak > 0 ? (marketPeak - marketIndex) / marketPeak : 0;
    if (ddNow > marketMaxDD) marketMaxDD = ddNow;

    cumulativeInflation *= 1 + (market ? market.inflation(step) : ctx.inflationPerStep);

    // ── 2. Private Equity (Bestand), jährlich am Jahresanfang ───────
    if (ctx.hasPE && yearStart) {
      const peEntry = peTimeline[yIdx];
      if (peEntry) {
        highWatermark = applyExternalCashflows(
          bucketValues,
          peEntry.totalCall,
          peEntry.totalDistNet,
          highWatermark,
        );
        peNavCurrent = peEntry.totalNav;
        if (d) {
          d.peCall = peEntry.totalCall;
          d.peDistGross = peEntry.totalDistGross;
          d.peDistNet = peEntry.totalDistNet;
        }
      }
    }

    // ── 3. Rollierendes PE-Programm, jährlich ───────────────────────
    if (peState && ctx.peRuntime && ctx.remainingWithdrawals && yearStart) {
      const liquidNow = bucketValues[0] + bucketValues[1] + bucketValues[2];
      const staticPeNavAtPeak = ctx.hasPE
        ? peTimeline[Math.min(yIdx + ctx.peRuntime.tPeak, peTimeline.length - 1)]?.totalNav ?? 0
        : 0;
      const remainingNow = ctx.remainingWithdrawals[yIdx] ?? 0;
      const remainingNext = ctx.remainingWithdrawals[yIdx + 1] ?? 0;
      const prog = peState.processYear({
        yearIdx: yIdx,
        liquid: liquidNow,
        staticPeNavNow: peNavCurrent,
        staticPeNavAtPeak,
        netAnnualWithdrawal: Math.max(0, remainingNow - remainingNext),
        remainingWithdrawalsNominal: remainingNow,
        isWithdrawalPhase: !isAccumulation,
      });
      highWatermark = applyExternalCashflows(bucketValues, prog.call, prog.distNet, highWatermark);
      peProgNavCurrent = prog.nav;
      peProgNavYears?.push(peNavCurrent + peProgNavCurrent);
      if (d) {
        d.peCall += prog.call;
        d.peDistGross += prog.distGross;
        d.peDistNet += prog.distNet;
        d.peCommitted = prog.committed;
        d.peUnfunded = prog.unfunded;
      }
    }
    if (d) d.peNav = peNavCurrent + peProgNavCurrent;

    // ── 4. Produkt-Töpfe (WBA/LV), jährlich ─────────────────────────
    if (ctx.hasProducts && yearStart) {
      const prodEntry = ctx.productTimeline[yIdx];
      if (prodEntry) {
        // LV schwankt mit dem Aktienschock des Jahres (Σz/√n).
        const zEq = equityShockSteps > 0 ? equityShockSum / Math.sqrt(equityShockSteps) : 0;
        equityShockSum = 0;
        equityShockSteps = 0;
        const lv = lvState ? lvState.advanceYear(yIdx, zEq) : { lvValue: 0, lvPayout: 0 };
        const payout = prodEntry.wbaPayouts + lv.lvPayout;
        highWatermark = applyExternalCashflows(
          bucketValues,
          prodEntry.purchases,
          prodEntry.coupons + payout,
          highWatermark,
        );
        productValueCurrent = prodEntry.wbaValue + lv.lvValue;
        productValueYears?.push(productValueCurrent);
        if (d) {
          d.productPurchase = prodEntry.purchases;
          d.productCoupon = prodEntry.coupons;
          d.productPayout = payout;
          d.wbaValue = prodEntry.wbaValue;
          d.lvValue = lv.lvValue;
        }
      }
    }

    // ── 5. Allokationswechsel (einmalig; nicht bei Direktstart) ─────
    if (ctx.wd && !switchedToWithdrawal && step >= ctx.switchStep && ctx.switchStep > 0) {
      highWatermark = switchToWithdrawalAllocation(
        bucketValues,
        ctx.wdWeights,
        highWatermark,
        ctx.kestRate,
      );
      switchedToWithdrawal = true;
      if (d) d.allocationSwitched = true;
    }

    // ── 6. Sparrate bzw. Entnahme ───────────────────────────────────
    if (isAccumulation) {
      const adjustedSavings = inputs.useRealValues
        ? ctx.savingsPerStep * cumulativeInflation
        : ctx.savingsPerStep *
          (1 + inputs.annualSavingsIncrease / 100 / stepsPerYear) ** step;
      // Nach vorgezogenem Wechsel fließt die Sparrate in die Entnahme-Gewichte.
      const saveWeights = step < ctx.switchStep ? ctx.accWeights : ctx.wdWeights;
      for (let i = 0; i < 3; i++) bucketValues[i] += saveWeights[i] * adjustedSavings;
      highWatermark += adjustedSavings;
      if (d) d.cashflow = adjustedSavings;
    } else {
      const adjustedWithdrawal = ctx.inflateWithdrawals
        ? ctx.withdrawalPerStep * cumulativeInflation
        : ctx.withdrawalPerStep;
      const hasPension = client.currentAge + step / stepsPerYear >= inputs.pensionStartAge;
      const adjustedPension = hasPension
        ? ctx.inflateWithdrawals
          ? ctx.pensionPerStep * cumulativeInflation
          : ctx.pensionPerStep
        : 0;
      const netWithdrawal = Math.max(0, adjustedWithdrawal - adjustedPension);
      const totalPortfolio = bucketValues.reduce((a, b) => a + b, 0);

      // Erfolgskriterium inkl. PE-NAV und Produkt-Töpfen (illiquide, aber
      // Vermögen — Vorgabe „PE immer in der Erfolgsquote").
      const totalWithIlliquid =
        totalPortfolio + peNavCurrent + peProgNavCurrent + productValueCurrent;
      if (totalWithIlliquid <= netWithdrawal && !failed) {
        failed = true;
        failureStep = step;
      }

      if (totalPortfolio > 0) {
        const cashAvailable = bucketValues[0];
        if (cashAvailable >= netWithdrawal) {
          bucketValues[0] -= netWithdrawal;
          if (d) d.withdrawalFrom[0] = netWithdrawal;
        } else {
          const remaining = netWithdrawal - cashAvailable;
          bucketValues[0] = 0;
          const restTotal = bucketValues[1] + bucketValues[2];
          if (d) d.withdrawalFrom[0] = cashAvailable;
          if (restTotal > 0) {
            const ratio = Math.min(1, remaining / restTotal);
            if (d) {
              d.withdrawalFrom[1] = bucketValues[1] * ratio;
              d.withdrawalFrom[2] = bucketValues[2] * ratio;
            }
            bucketValues[1] *= 1 - ratio;
            bucketValues[2] *= 1 - ratio;
          }
        }
      }
      highWatermark = Math.max(0, highWatermark - netWithdrawal);
      if (d) {
        d.cashflow = -netWithdrawal;
        d.grossWithdrawal = adjustedWithdrawal;
        d.pension = adjustedPension;
        d.hasPension = hasPension;
      }
    }

    // ── 7. Liquiditätsereignisse (im Schritt fällig) ────────────────
    const currentAgeAtStep = client.currentAge + step / stepsPerYear;
    const prevAge = client.currentAge + (step - 1) / stepsPerYear;
    for (const le of ctx.liquidityEvents) {
      if (!(currentAgeAtStep >= le.age && prevAge < le.age)) continue;
      const amount = le.amount;
      if (d) {
        d.liquidityEvent += amount;
        d.liquidityEventLabel += (d.liquidityEventLabel ? "; " : "") + le.description;
      }
      if (amount > 0) {
        const injectWeights = step < ctx.switchStep ? ctx.accWeights : ctx.wdWeights;
        for (let i = 0; i < 3; i++) bucketValues[i] += injectWeights[i] * amount;
        highWatermark += amount;
      } else {
        const totalPortfolio = bucketValues.reduce((a, b) => a + b, 0);
        if (totalPortfolio > 0) {
          const withdrawRatio = Math.min(1, Math.abs(amount) / totalPortfolio);
          for (let i = 0; i < 3; i++) {
            if (d) d.withdrawalFrom[i] += bucketValues[i] * withdrawRatio;
            bucketValues[i] *= 1 - withdrawRatio;
          }
        }
        highWatermark = Math.max(0, highWatermark - Math.abs(amount));
      }
    }

    // ── 8. Umschichtung ──────────────────────────────────────────────
    const freq = step < ctx.switchStep ? ctx.accRebalFreq : ctx.wdRebalFreq;
    if (isRebalancingStep(step, stepsPerYear, freq)) {
      const before = d ? [bucketValues[0], bucketValues[1], bucketValues[2]] : null;
      if (step < ctx.switchStep || step < ctx.accumulationSteps) {
        // Bis zum Wechsel auf die Anspar-Gewichte; im Fenster Wechsel →
        // Pensionsantritt auf die Entnahme-Gewichte mit Entnahme-Schwelle.
        const inWindow = step >= ctx.switchStep;
        const next = rebalancePortfolio(
          bucketValues,
          inWindow ? ctx.wdWeights : ctx.accWeights,
          inWindow ? (ctx.wd?.rebalancingThreshold ?? ctx.accRebalThreshold) : ctx.accRebalThreshold,
        );
        if (d && before && (next[0] !== before[0] || next[1] !== before[1] || next[2] !== before[2])) {
          d.rebalanced = true;
          d.rebalDeltas = [next[0] - before[0], next[1] - before[1], next[2] - before[2]];
          d.rebalSource = "Zielallokation";
        }
        bucketValues = next;
      } else {
        // Entnahmephase: Liquiditätspuffer auffüllen (Verlustschutz).
        const annualWithdrawalForTarget = ctx.inflateWithdrawals
          ? ctx.desiredMonthly * 12 * cumulativeInflation
          : ctx.desiredMonthly * 12;
        const pensionForTarget =
          client.currentAge + step / stepsPerYear >= inputs.pensionStartAge
            ? ctx.inflateWithdrawals
              ? inputs.monthlyPension * 12 * cumulativeInflation
              : inputs.monthlyPension * 12
            : 0;
        const netAnnualWithdrawal = Math.max(0, annualWithdrawalForTarget - pensionForTarget);
        const result = rebalanceThreeBuckets(
          bucketValues,
          netAnnualWithdrawal / stepsPerYear,
          ctx.wdCashYears,
          returns[2],
        );
        if (d && result.rebalanced) {
          d.rebalanced = true;
          d.rebalDeltas = [result.cashDelta, result.bondsDelta, result.equitiesDelta];
          d.rebalSource = result.source;
        }
        bucketValues = result.values;
      }
    }

    // ── 9. KESt Wertpapiere nach dem Höchststand-Prinzip ────────────
    const beforeTaxTotal = bucketValues.reduce((a, b) => a + b, 0);
    if (beforeTaxTotal > highWatermark && beforeTaxTotal > 0) {
      const taxableGain = beforeTaxTotal - highWatermark;
      const tax = taxableGain * ctx.kestRate;
      const factor = (beforeTaxTotal - tax) / beforeTaxTotal;
      bucketValues = bucketValues.map((v) => v * factor);
      highWatermark = beforeTaxTotal - tax;
    }
    // Töpfe können rechnerisch nicht negativ werden; abgesichert für die Anzeige.
    bucketValues = [
      Math.max(0, bucketValues[0]),
      Math.max(0, bucketValues[1]),
      Math.max(0, bucketValues[2]),
    ];

    const totalLiquid = bucketValues[0] + bucketValues[1] + bucketValues[2];
    path?.push(totalLiquid + peNavCurrent + peProgNavCurrent + productValueCurrent);
    if (d) {
      d.end = [bucketValues[0], bucketValues[1], bucketValues[2]];
      d.cumulativeInflation = cumulativeInflation;
      rec?.onStep(d);
    }
  }

  const finalLiquid = bucketValues[0] + bucketValues[1] + bucketValues[2];
  return {
    path,
    finalValue: finalLiquid + peNavCurrent + peProgNavCurrent + productValueCurrent,
    failed,
    failureStep,
    marketMaxDD,
    peProgNavYears,
    productValueYears,
  };
}
