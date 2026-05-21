/**
 * Private-Equity-Engine
 *
 * Modelliert eine Liste von PE-Fonds mit drei Modellierungs-Modi:
 *
 *  - 'simple'    : Klassische Compound-Balance NAV, deterministisch.
 *                  (Legacy-Modus, optimistisch — kein J-Curve-Dip.)
 *
 *  - 'realistic' : Deterministisch mit explizitem J-Curve-Overlay.
 *                  Mgmt-Fees, Setup-Costs werden vom Compound-NAV abgezogen.
 *                  Cashflows (Calls + Distributions) bleiben unverändert
 *                  auf Netto-IRR/Netto-TVPI kalibriert. Die NAV-Trajektorie
 *                  zeigt den klassischen J-Curve-Trough in den Investitions-
 *                  jahren und damit das tatsächliche Mark-to-Market-Erlebnis.
 *
 *  - 'full'      : Realistisch + Stochastik. Pro MC-Pfad werden IRR und
 *                  TVPI aus Normalverteilungen um die Zielwerte gezogen
 *                  (mit Loss-Wahrscheinlichkeit). Aus diesen Realisierungen
 *                  werden Cashflows und NAV-Pfad neu kalibriert. Das Result
 *                  liefert p25/p50/p75-NAV-Bänder und eine PE-Erfolgsquote.
 *
 * Kalibrierung der Cashflows:
 *  1. Capital-Calls (Yale-Ramp 25/25/22/16/12 für 5y, sonst front-loaded).
 *  2. Distribution-Form = exp(tilt·(t-mid)), Bisektion auf Zielniveau-IRR.
 *  3. NAV via Compound-Balance (Sub-1) bzw. mit Fee-Drag-Overlay (Sub-2/3).
 *  4. KESt auf den Anteil der Distributions über Capital-Return-Watermark.
 *
 * Annahme: PE-Ereignisse am Beginn des betreffenden Jahres.
 */

import { SeededRandom } from "./random";
import type { PEFund, PEModelingMode } from "../types";

const DEFAULT_KEST_RATE = 0.275;

const YALE_RAMP_5Y = [0.25, 0.25, 0.22, 0.16, 0.12];

// Industrie-Default-Konstanten (Spiegel von defaults.ts, hier hartcodiert
// damit die Engine ohne UI-State funktioniert, wenn ein Fonds keine
// expliziten Werte mitbringt).
const FALLBACK_MGMT_FEE = 2.0;
const FALLBACK_POSTPERIOD_FEE = 1.5;
const FALLBACK_SETUP_COST = 1.0;
const FALLBACK_IRR_VOL = 5.0;
const FALLBACK_TVPI_VOL = 0.35;
const FALLBACK_LOSS_PROB = 0.03;

/** Cashflow-Eintrag für ein einzelnes Fondsjahr (relativ zum Fonds-Start). */
export interface PEYearCashflow {
  /** Jahre seit Fonds-Start (0-indiziert). */
  year: number;
  /** Capital Call dieses Jahres (positiv). */
  call: number;
  /** Brutto-Distribution dieses Jahres (positiv). */
  distribution: number;
  /** Netto-Distribution nach KESt (positiv). */
  distributionNet: number;
  /** NAV am Ende des Jahres (≥ 0). */
  nav: number;
  /** Kumulierte Brutto-Distributions inkl. dieses Jahres. */
  cumulativeDistributions: number;
  /** Kumulierte Capital Calls inkl. dieses Jahres. */
  cumulativeCalls: number;
  /** Fee-Anteil dieses Jahres (Mgmt-Fee + Setup, in der NAV-Reduktion enthalten). */
  feeImpact?: number;
}

/** Komplettes Schedule eines Fonds. */
export interface PESchedule {
  fund: PEFund;
  cashflows: PEYearCashflow[];
  /** = commitment × callRatio/100 */
  totalCalled: number;
  /** Brutto-Total der Distributions = TVPI × totalCalled */
  totalDistributionsGross: number;
  /** Kalibrierter Tilt-Parameter (negativ = front-loaded). */
  tilt: number;
  /** Tatsächliche IRR der kalibrierten Cashflows (≈ Ziel-IRR). */
  achievedIRR: number;
  /** In dieser Realisierung verwendete IRR (in %). Bei Stochastik gezogen. */
  realizedIRRPct: number;
  /** In dieser Realisierung verwendetes TVPI. Bei Stochastik gezogen. */
  realizedTVPI: number;
}

/** Aggregierte PE-Wirkungen pro Simulationsjahr. */
export interface PETimelineEntry {
  /** Jahre seit `currentAge` (0-indiziert). */
  yearOffset: number;
  /** Investorenalter in diesem Jahr. */
  age: number;
  /** Summe aller Capital Calls in diesem Jahr (€). */
  totalCall: number;
  /** Summe aller Brutto-Distributions (€). */
  totalDistGross: number;
  /** Summe aller Netto-Distributions nach KESt (€). */
  totalDistNet: number;
  /** Aggregierte NAV aller Fonds am Ende des Jahres (€). */
  totalNav: number;
  /** Aktuell aktive Fonds in diesem Jahr (für UI). */
  activeFundIds: string[];
}

/** Stochastisches Ensemble: Median + Bänder. */
export interface PEEnsemble {
  /** Gewählte Modellierungs-Tiefe. */
  mode: PEModelingMode;
  /** Median-Timeline (für die deterministische Anwendung im UI/Trace). */
  median: PETimelineEntry[];
  /** p25/p75-NAV-Bänder pro Jahr (nur 'full', sonst leer). */
  navP25: number[];
  navP75: number[];
  /** Pool an Realisierungen (Length = ensembleSize). Für MC-Pfad-Auswahl. */
  scenarios: PETimelineEntry[][];
  /** Anteil Szenarien mit TVPI ≥ 1,0×. */
  successRate: number;
  /** Median realisierte IRR in % (über Szenarien gemittelt pro Fonds → Mittel). */
  medianIRRPct: number;
  /** Median realisierter TVPI. */
  medianTVPI: number;
}

// ---------- Helpers ----------

/** Yale-Ramp-Capital-Calls für N Jahre (Default 5y = 25/25/22/16/12). */
function buildCallSchedule(totalCalled: number, investmentPeriod: number): number[] {
  if (investmentPeriod <= 0) return [totalCalled];
  if (investmentPeriod === 5) {
    return YALE_RAMP_5Y.map((p) => p * totalCalled);
  }
  const weights: number[] = [];
  for (let t = 0; t < investmentPeriod; t++) {
    weights.push(investmentPeriod - t);
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / sum) * totalCalled);
}

function distributionStartYear(investmentPeriod: number): number {
  return Math.max(1, Math.ceil(investmentPeriod / 2) + 1);
}

function buildDistributionShape(
  fundDuration: number,
  distStart: number,
  distEnd: number,
  tilt: number,
): number[] {
  const w = new Array(fundDuration).fill(0) as number[];
  if (distEnd < distStart) return w;
  const mid = (distStart + distEnd) / 2;
  for (let t = distStart; t <= distEnd; t++) {
    w[t] = Math.exp(tilt * (t - mid));
  }
  return w;
}

/** IRR via Bisektion. */
function computeIRR(cashflows: number[]): number {
  let lo = -0.99;
  let hi = 5.0;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    let npv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      npv += cashflows[t] / Math.pow(1 + mid, t);
    }
    if (npv > 0) lo = mid;
    else hi = mid;
    if (Math.abs(hi - lo) < 1e-8) break;
  }
  return (lo + hi) / 2;
}

function sanitizeFund(fund: PEFund): PEFund {
  return {
    ...fund,
    commitment: Math.max(0, fund.commitment),
    callRatio: Math.min(100, Math.max(0, fund.callRatio)),
    irr: Math.max(-50, Math.min(100, fund.irr)),
    tvpi: Math.max(0, Math.min(10, fund.tvpi)),
    investmentPeriod: Math.max(1, Math.min(20, Math.floor(fund.investmentPeriod))),
    fundDuration: Math.max(2, Math.min(30, Math.floor(fund.fundDuration))),
    startAge: Math.max(0, Math.min(120, Math.floor(fund.startAge))),
  };
}

// ---------- Schedule-Computation (interne Variante mit override) ----------

/**
 * Interne Schedule-Berechnung. Erlaubt, IRR/TVPI zu überschreiben (für
 * Stochastik), und steuert J-Curve-Overlay über das Flag `applyJCurve`.
 */
function buildSchedule(
  rawFund: PEFund,
  kestRate: number,
  applyJCurve: boolean,
  overrideIRR?: number,
  overrideTVPI?: number,
): PESchedule {
  const fund = sanitizeFund(rawFund);
  const irrPct = overrideIRR ?? fund.irr;
  const tvpi = Math.max(0, overrideTVPI ?? fund.tvpi);
  const totalCalled = fund.commitment * (fund.callRatio / 100);
  const totalDistGross = totalCalled * tvpi;
  const irrTarget = irrPct / 100;

  // 1) Calls (Yale-Ramp), gepolstert auf fundDuration.
  const callsRaw = buildCallSchedule(totalCalled, fund.investmentPeriod);
  const calls = new Array(fund.fundDuration).fill(0) as number[];
  for (let i = 0; i < callsRaw.length && i < fund.fundDuration; i++) {
    calls[i] = callsRaw[i];
  }

  // 2) Distribution-Form & Tilt-Kalibrierung.
  const distStart = Math.min(distributionStartYear(fund.investmentPeriod), fund.fundDuration - 1);
  const distEnd = fund.fundDuration - 1;

  const evalIRR = (theta: number): { dists: number[]; irr: number } => {
    const shape = buildDistributionShape(fund.fundDuration, distStart, distEnd, theta);
    const sumShape = shape.reduce((a, b) => a + b, 0);
    const dists = shape.map((w) => (sumShape > 0 ? (w / sumShape) * totalDistGross : 0));
    const cf = calls.map((c, t) => -c + dists[t]);
    return { dists, irr: computeIRR(cf) };
  };

  let lo = -2.0;
  let hi = 2.0;
  if (totalCalled > 0 && totalDistGross > 0) {
    for (let iter = 0; iter < 80; iter++) {
      const mid = (lo + hi) / 2;
      const { irr } = evalIRR(mid);
      if (irr < irrTarget) hi = mid;
      else lo = mid;
      if (Math.abs(hi - lo) < 1e-7) break;
    }
  }
  const tilt = (lo + hi) / 2;
  const { dists: distsGross } = evalIRR(tilt);

  // 3a) Compound-Balance „fair NAV" (was die NAV ohne J-Curve wäre).
  const navFair: number[] = [];
  for (let t = 0; t < fund.fundDuration; t++) {
    let v = 0;
    for (let i = 0; i <= t; i++) {
      const factor = Math.pow(1 + irrTarget, t - i);
      v += calls[i] * factor;
      v -= distsGross[i] * factor;
    }
    navFair.push(Math.max(0, v));
  }

  // 3b) J-Curve-Overlay: Fee-Drag ramp(t) → 0 am Ende.
  // Mgmt-Fee in Investitionsperiode auf Commitment, danach auf NAV(t-1).
  // Setup-Cost im Jahr 0 einmalig.
  let nav: number[];
  const fees: number[] = new Array(fund.fundDuration).fill(0);
  if (applyJCurve && fund.commitment > 0) {
    const mgmtFeeRate = (fund.mgmtFeeRate ?? FALLBACK_MGMT_FEE) / 100;
    const postFeeRate = (fund.postPeriodFeeRate ?? FALLBACK_POSTPERIOD_FEE) / 100;
    const setupCost = (fund.setupCostPct ?? FALLBACK_SETUP_COST) / 100;
    const invPeriod = fund.investmentPeriod;
    const L = fund.fundDuration;
    // 1) Roh-Fee pro Jahr (€)
    const feeRaw: number[] = [];
    for (let t = 0; t < L; t++) {
      let f = 0;
      if (t < invPeriod) {
        f += mgmtFeeRate * fund.commitment;
        if (t === 0) f += setupCost * fund.commitment;
      } else {
        f += postFeeRate * Math.max(0, navFair[t - 1] ?? 0);
      }
      feeRaw.push(f);
    }
    // 2) Akkumulierter Fee-Drag-Stand D(t), aufgezinst mit r:
    //    D(t) = Σ_{s ≤ t} fee(s) · (1+r)^(t-s)
    const drag: number[] = [];
    let prev = 0;
    for (let t = 0; t < L; t++) {
      const updated = prev * (1 + irrTarget) + feeRaw[t];
      drag.push(updated);
      prev = updated;
    }
    // 3) Ramp: 1.0 in Investitionsperiode, danach linear → 0 am Ende.
    //    Damit NAV_jcurve(L-1) → NAV_fair(L-1) = 0 sauber konvergiert.
    const ramp = (t: number): number => {
      if (t < invPeriod) return 1.0;
      const denom = Math.max(1, L - 1 - invPeriod);
      const r = 1 - (t - invPeriod) / denom;
      return Math.max(0, Math.min(1, r));
    };
    nav = navFair.map((v, t) => Math.max(0, v - drag[t] * ramp(t)));
    // Fees pro Jahr für UI/Trace (Roh-Fee, nicht aufgezinst).
    for (let t = 0; t < L; t++) fees[t] = feeRaw[t];
  } else {
    nav = navFair;
  }

  // 4) Netto-Distributions (KESt-Watermark = totalCalled = Capital Return).
  const distsNet: number[] = [];
  let cumGross = 0;
  for (let t = 0; t < fund.fundDuration; t++) {
    const dGross = distsGross[t];
    const newCum = cumGross + dGross;
    const taxablePortion =
      Math.max(0, newCum - totalCalled) - Math.max(0, cumGross - totalCalled);
    const tax = taxablePortion * kestRate;
    distsNet.push(Math.max(0, dGross - tax));
    cumGross = newCum;
  }

  const cashflows: PEYearCashflow[] = [];
  let cumDist = 0;
  let cumCall = 0;
  for (let t = 0; t < fund.fundDuration; t++) {
    cumDist += distsGross[t];
    cumCall += calls[t];
    cashflows.push({
      year: t,
      call: calls[t],
      distribution: distsGross[t],
      distributionNet: distsNet[t],
      nav: nav[t],
      cumulativeDistributions: cumDist,
      cumulativeCalls: cumCall,
      feeImpact: fees[t],
    });
  }

  const cfFinal = calls.map((c, t) => -c + distsGross[t]);
  const achievedIRR = computeIRR(cfFinal);

  return {
    fund,
    cashflows,
    totalCalled,
    totalDistributionsGross: totalDistGross,
    tilt,
    achievedIRR,
    realizedIRRPct: irrPct,
    realizedTVPI: tvpi,
  };
}

/**
 * Public Schedule-Computation. Verwendet das im Fonds bzw. Portfolio
 * gewählte Modus-Flag (default 'realistic' → J-Curve aktiv).
 *
 * Achtung: für Stochastik bitte `buildStochasticEnsemble` benutzen, das
 * auch über mehrere Realisierungen aggregiert.
 */
export function computePESchedule(
  rawFund: PEFund,
  kestRate: number = DEFAULT_KEST_RATE,
  mode: PEModelingMode = "realistic",
): PESchedule {
  const applyJCurve = mode !== "simple";
  return buildSchedule(rawFund, kestRate, applyJCurve);
}

// ---------- Aggregation: Timeline aus Schedules ----------

function aggregateSchedulesToTimeline(
  schedules: PESchedule[],
  currentAge: number,
  totalYears: number,
): PETimelineEntry[] {
  const timeline: PETimelineEntry[] = [];
  for (let y = 0; y <= totalYears; y++) {
    const age = currentAge + y;
    let totalCall = 0;
    let totalDistGross = 0;
    let totalDistNet = 0;
    let totalNav = 0;
    const activeFundIds: string[] = [];
    for (const sched of schedules) {
      const t = age - sched.fund.startAge;
      if (t >= 0 && t < sched.fund.fundDuration) {
        const cf = sched.cashflows[t];
        totalCall += cf.call;
        totalDistGross += cf.distribution;
        totalDistNet += cf.distributionNet;
        totalNav += cf.nav;
        activeFundIds.push(sched.fund.id);
      }
    }
    timeline.push({
      yearOffset: y,
      age,
      totalCall,
      totalDistGross,
      totalDistNet,
      totalNav,
      activeFundIds,
    });
  }
  return timeline;
}

/**
 * Klassische Timeline (Median-/Default-Verlauf). Im Modus 'simple' ohne
 * J-Curve, in 'realistic' und 'full' mit J-Curve. Bei 'full' liefert
 * die Funktion den Median über die gezogenen Szenarien — für mehr
 * Detail (Bänder) bitte `buildStochasticEnsemble` benutzen.
 */
export function computePETimeline(
  funds: PEFund[],
  currentAge: number,
  totalYears: number,
  kestRate: number = DEFAULT_KEST_RATE,
  mode: PEModelingMode = "realistic",
): PETimelineEntry[] {
  if (mode !== "full") {
    const schedules = funds.map((f) => computePESchedule(f, kestRate, mode));
    return aggregateSchedulesToTimeline(schedules, currentAge, totalYears);
  }
  // 'full' → Median über Ensemble.
  const ensemble = buildStochasticEnsemble(funds, currentAge, totalYears, kestRate);
  return ensemble.median;
}

// ---------- Stochastik-Ensemble ----------

/**
 * Bell-shaped Box-Muller; clamped zu sinnvollen PE-Bereichen.
 */
function drawIRR(rng: SeededRandom, target: number, vol: number): number {
  const z = rng.nextGaussian();
  return Math.max(-30, Math.min(35, target + vol * z));
}
function drawTVPI(rng: SeededRandom, target: number, vol: number): number {
  const z = rng.nextGaussian();
  return Math.max(0.2, Math.min(4.0, target + vol * z));
}

/**
 * Zieht eine Realisierung (IRR, TVPI) für einen Fonds gemäss
 * (mu_irr, sigma_irr), (mu_tvpi, sigma_tvpi) und Loss-Wahrscheinlichkeit.
 */
function drawFundRealization(
  rng: SeededRandom,
  fund: PEFund,
): { irrPct: number; tvpi: number; isLoss: boolean } {
  const lossProb = fund.lossProbability ?? FALLBACK_LOSS_PROB;
  const u = rng.next();
  if (u < lossProb) {
    // Loss-Szenario: -10% bis -2% IRR, 0,3-0,6× TVPI.
    const irrPct = -10 + 8 * rng.next();
    const tvpi = 0.3 + 0.3 * rng.next();
    return { irrPct, tvpi, isLoss: true };
  }
  const irrSigma = fund.irrVolatility ?? FALLBACK_IRR_VOL;
  const tvpiSigma = fund.tvpiVolatility ?? FALLBACK_TVPI_VOL;
  return {
    irrPct: drawIRR(rng, fund.irr, irrSigma),
    tvpi: drawTVPI(rng, fund.tvpi, tvpiSigma),
    isLoss: false,
  };
}

/**
 * Erstellt ein Ensemble von N Stochastik-Szenarien für die übergebenen
 * Fonds. Pro Szenario werden für jeden Fonds IRR/TVPI gezogen und
 * eine vollständige Timeline berechnet (J-Curve-Overlay aktiv).
 *
 * @returns Objekt mit median-Timeline, p25/p75-NAV-Bändern und Pool an
 *          Szenarien (Mapping MC-Pfad → Szenario per modulo).
 */
export function buildStochasticEnsemble(
  funds: PEFund[],
  currentAge: number,
  totalYears: number,
  kestRate: number = DEFAULT_KEST_RATE,
  ensembleSize: number = 100,
  seed: number = 12345,
): PEEnsemble {
  const navMatrix: number[][] = []; // [scenario][year]
  const scenarios: PETimelineEntry[][] = [];
  const irrSamples: number[] = [];
  const tvpiSamples: number[] = [];
  let successCount = 0;

  const rng = new SeededRandom(seed);

  for (let s = 0; s < ensembleSize; s++) {
    const schedules: PESchedule[] = [];
    let scenarioMaxNav = 0;
    let scenarioTotalDist = 0;
    let scenarioTotalCalled = 0;
    let scenarioWeightedIRR = 0;
    let scenarioWeightedTVPI = 0;
    let weightSum = 0;

    for (const fund of funds) {
      const { irrPct, tvpi } = drawFundRealization(rng, fund);
      const sched = buildSchedule(fund, kestRate, true, irrPct, tvpi);
      schedules.push(sched);
      scenarioMaxNav = Math.max(scenarioMaxNav, ...sched.cashflows.map((c) => c.nav));
      scenarioTotalDist += sched.totalDistributionsGross;
      scenarioTotalCalled += sched.totalCalled;
      const w = sched.totalCalled;
      scenarioWeightedIRR += irrPct * w;
      scenarioWeightedTVPI += tvpi * w;
      weightSum += w;
    }

    const timeline = aggregateSchedulesToTimeline(schedules, currentAge, totalYears);
    scenarios.push(timeline);
    navMatrix.push(timeline.map((e) => e.totalNav));

    if (weightSum > 0) {
      irrSamples.push(scenarioWeightedIRR / weightSum);
      tvpiSamples.push(scenarioWeightedTVPI / weightSum);
      // Erfolg: Ensemble-Pfad liefert TVPI ≥ 1.0 auf Portfolio-Ebene
      const portfolioTVPI = scenarioTotalCalled > 0
        ? scenarioTotalDist / scenarioTotalCalled
        : 0;
      if (portfolioTVPI >= 1.0) successCount++;
    }
  }

  // Per-Year p25/p50/p75 NAV.
  const yearCount = totalYears + 1;
  const navP25: number[] = new Array(yearCount).fill(0);
  const navP50: number[] = new Array(yearCount).fill(0);
  const navP75: number[] = new Array(yearCount).fill(0);
  for (let y = 0; y < yearCount; y++) {
    const col = navMatrix.map((row) => row[y] ?? 0).sort((a, b) => a - b);
    if (col.length === 0) continue;
    navP25[y] = col[Math.floor(0.25 * (col.length - 1))];
    navP50[y] = col[Math.floor(0.50 * (col.length - 1))];
    navP75[y] = col[Math.floor(0.75 * (col.length - 1))];
  }

  // Median-Timeline: nimm den Szenario-Pfad, der am dichtesten an navP50
  // liegt (über alle Jahre summiert), damit Calls/Distributions konsistent
  // sind. Alternativ könnten wir eine synthetische Median-Timeline bauen,
  // aber das kann Cashflows zerreissen.
  let bestIdx = 0;
  let bestErr = Infinity;
  for (let s = 0; s < scenarios.length; s++) {
    let err = 0;
    for (let y = 0; y < yearCount; y++) {
      const diff = (scenarios[s][y]?.totalNav ?? 0) - navP50[y];
      err += diff * diff;
    }
    if (err < bestErr) {
      bestErr = err;
      bestIdx = s;
    }
  }
  const median = scenarios[bestIdx];

  const sortedIRR = [...irrSamples].sort((a, b) => a - b);
  const sortedTVPI = [...tvpiSamples].sort((a, b) => a - b);
  const medianIRR = sortedIRR.length
    ? sortedIRR[Math.floor(0.5 * (sortedIRR.length - 1))]
    : 0;
  const medianTVPI = sortedTVPI.length
    ? sortedTVPI[Math.floor(0.5 * (sortedTVPI.length - 1))]
    : 0;

  return {
    mode: "full",
    median,
    navP25,
    navP75,
    scenarios,
    successRate: ensembleSize > 0 ? successCount / ensembleSize : 0,
    medianIRRPct: medianIRR,
    medianTVPI,
  };
}

/** Bequemer Lookup. */
export function peTimelineAt(
  timeline: PETimelineEntry[],
  yearOffset: number,
): PETimelineEntry {
  if (yearOffset < 0 || yearOffset >= timeline.length) {
    return {
      yearOffset,
      age: -1,
      totalCall: 0,
      totalDistGross: 0,
      totalDistNet: 0,
      totalNav: 0,
      activeFundIds: [],
    };
  }
  return timeline[yearOffset];
}