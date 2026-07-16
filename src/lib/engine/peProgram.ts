/**
 * Rollierendes PE-Programm mit Zielquote.
 *
 * Steuert die PE-Quote über wiederkehrende Commitments (Vintages):
 * Pro MC-Pfad wird jährlich (im Vintage-Rhythmus) entschieden, ob und
 * in welcher Höhe ein neues Commitment gezeichnet wird, um die
 * Zielquote (% des Gesamtvermögens auf NAV-Basis) zu erreichen und
 * zu halten.
 *
 * Kern-Mechanik — Unit-Schedule:
 *   `buildSchedule` in privateEquity.ts ist linear im Commitment
 *   (Yale-Ramp, Tilt-Kalibrierung nur form-, nicht niveauabhängig;
 *   Fees ∝ Commitment bzw. NAV; KESt-Watermark = totalCalled skaliert
 *   linear). Daher genügt EIN normiertes Schedule für 1 € Commitment;
 *   jedes Vintage mit Commitment C ist exakt C × unit — inklusive
 *   korrekter per-Vintage-KESt-Nettung.
 *
 * Pacing (forward-looking Gap-Regel, steady-state-exakt):
 *   targetNav*  = Zielquote × W × (1+g)^tPeak
 *   futureShare = Σ_{t<tPeak} uNav[t] / Σ uNav
 *                 (Steady-State-NAV-Anteil der NOCH ZU zeichnenden
 *                 Vintages am Peak-Horizont — ohne diesen Abzug würde
 *                 die Regel systematisch über-committen)
 *   pipelineNav = künftiger NAV aller bereits committeten Vintages
 *                 (+ Bestand) am NAV-Peak-Horizont
 *   C_raw       = (targetNav* × (1 − futureShare) − pipelineNav) / uNav[tPeak]
 *   → Fixpunkt ist exakt C_ss = targetNav × cadence / Σ uNav
 *     (aggregierter NAV = Zielquote × W im eingeschwungenen Zustand).
 *
 * Guards (Illiquiditäts-Schutz, pro Pfad):
 *   - Ansparphase: liquide ≥ offene Abrufe + Puffer.
 *   - Entnahmephase (Deckungs-Check): Commitment nur, wenn
 *     liquide − offene Abrufe ≥ Coverage × restliche Netto-Entnahmen.
 *     Kein Altersstopp — reiche Pfade halten die Quote, arme gliden
 *     automatisch über den natürlichen Runoff ab, bevor Entnahmen
 *     unmöglich werden.
 */

import { SeededRandom } from "./random";
import {
  computePESchedule,
  computePEScheduleWithRealization,
  computePETimeline,
  drawFundRealization,
  type PESchedule,
} from "./privateEquity";
import { computePortfolioReturn } from "./portfolio";
import type {
  ClientProfile,
  FinancialInputs,
  PEFund,
  PEModelingMode,
  PEProgram,
  PortfolioConfig,
} from "../types";

/** Anteil des Gesamtvermögens, unter dem ein Vintage übersprungen wird (Dust). */
const MIN_COMMITMENT_FRACTION = 0.0025;
/** Ensemble-Grösse für den Modus 'full' (Realisierungen je Vintage-Pool). */
const PROGRAM_ENSEMBLE_SIZE = 100;
/** Seed-Salt, damit der Programm-RNG den Markt-RNG-Strom nicht berührt. */
const PROGRAM_SEED_SALT = 0x5eba11;

/** Normiertes Schedule für 1 € Commitment (linear skalierbar). */
export interface PEUnitSchedule {
  /** Capital Call je Fondsjahr (€ pro 1 € Commitment). */
  call: Float64Array;
  /** Brutto-Distribution je Fondsjahr. */
  distGross: Float64Array;
  /** Netto-Distribution nach KESt je Fondsjahr. */
  distNet: Float64Array;
  /** NAV am Ende jedes Fondsjahres. */
  nav: Float64Array;
  /** = fundDuration (Länge aller Arrays). */
  duration: number;
  /** Fondsjahr mit maximalem NAV (typ. Investitionsperiode + 2–4). */
  tPeak: number;
  /** Σ nav[t] — Steady-State-NAV pro 1 €/Jahr wiederkehrendem Commitment. */
  sumNav: number;
}

function scheduleToUnit(sched: PESchedule): PEUnitSchedule {
  const n = sched.cashflows.length;
  const call = new Float64Array(n);
  const distGross = new Float64Array(n);
  const distNet = new Float64Array(n);
  const nav = new Float64Array(n);
  let tPeak = 0;
  let sumNav = 0;
  for (let t = 0; t < n; t++) {
    const cf = sched.cashflows[t];
    call[t] = cf.call;
    distGross[t] = cf.distribution;
    distNet[t] = cf.distributionNet;
    nav[t] = cf.nav;
    sumNav += cf.nav;
    if (cf.nav > nav[tPeak]) tPeak = t;
  }
  return { call, distGross, distNet, nav, duration: n, tPeak, sumNav };
}

/** Synthetischer 1-€-Fonds aus dem Programm-Template. */
function unitFund(template: PEProgram["fundTemplate"]): PEFund {
  return {
    ...template,
    id: "pe-program-unit",
    name: "PE-Programm (Unit)",
    commitment: 1,
    startAge: 0,
  };
}

/**
 * Normiertes Schedule (1 € Commitment) für das Programm-Template.
 * Deterministisch — dient sowohl als Pacing-Grundlage als auch als
 * realisiertes Schedule in den Modi 'simple'/'realistic'.
 */
export function computeUnitSchedule(
  template: PEProgram["fundTemplate"],
  kestRate: number,
  mode: PEModelingMode,
): PEUnitSchedule {
  // Für Pacing/Realisierung im Programm gilt: 'full' nutzt als
  // Erwartungs-Grundlage das 'realistic'-Schedule (J-Curve aktiv).
  const schedMode: PEModelingMode = mode === "simple" ? "simple" : "realistic";
  return scheduleToUnit(computePESchedule(unitFund(template), kestRate, schedMode));
}

/**
 * Unit-Ensemble für Modus 'full': `size` Realisierungen (IRR/TVPI
 * gezogen inkl. Loss-Branch), jede als normiertes 1-€-Schedule.
 */
export function buildUnitEnsemble(
  template: PEProgram["fundTemplate"],
  kestRate: number,
  size = PROGRAM_ENSEMBLE_SIZE,
  seed = 12345,
): PEUnitSchedule[] {
  const fund = unitFund(template);
  const rng = new SeededRandom(seed);
  const members: PEUnitSchedule[] = [];
  for (let s = 0; s < size; s++) {
    const { irrPct, tvpi } = drawFundRealization(rng, fund);
    members.push(
      scheduleToUnit(computePEScheduleWithRealization(fund, kestRate, irrPct, tvpi)),
    );
  }
  return members;
}

/** Eingaben der jährlichen Programm-Entscheidung (alles pfad-aktuell). */
export interface PEProgramYearInput {
  /** Jahres-Index seit Simulationsstart (0-indiziert). */
  yearIdx: number;
  /** Liquides Vermögen (Cash + Anleihen + Aktien) zum Entscheidungszeitpunkt. */
  liquid: number;
  /** NAV der Bestand-Fonds (manuelle peFunds) in diesem Jahr. */
  staticPeNavNow: number;
  /** NAV der Bestand-Fonds in tPeak Jahren (aus der statischen Timeline). */
  staticPeNavAtPeak: number;
  /** Aktuelle Netto-Jahresentnahme (0 in der Ansparphase). */
  netAnnualWithdrawal: number;
  /** Summe der restlichen nominalen Netto-Entnahmen bis Horizont (inkl. dieses Jahres). */
  remainingWithdrawalsNominal: number;
  /** Befinden wir uns in der Entnahmephase? */
  isWithdrawalPhase: boolean;
}

/** Ergebnis eines Programm-Jahres (nur Programm-Vintages, ohne Bestand). */
export interface PEProgramYearResult {
  /** Capital Calls der Programm-Vintages in diesem Jahr (€). */
  call: number;
  /** Brutto-Distributions (€). */
  distGross: number;
  /** Netto-Distributions nach KESt (€). */
  distNet: number;
  /** Aggregierter Programm-NAV am Ende des Jahres (€). */
  nav: number;
  /** Neues Commitment dieses Jahres (€, 0 wenn keins). */
  committed: number;
  /** Offene (noch nicht abgerufene) Commitments am Jahresende (€). */
  unfunded: number;
}

/** Interner Zustand eines MC-Pfads. */
export class PEProgramPathState {
  private readonly aggCall: Float64Array;
  private readonly aggDistGross: Float64Array;
  private readonly aggDistNet: Float64Array;
  private readonly aggNav: Float64Array;
  private unfunded = 0;

  constructor(
    private readonly program: PEProgram,
    private readonly unitExpected: PEUnitSchedule,
    private readonly ensemble: PEUnitSchedule[] | null,
    private readonly rng: SeededRandom | null,
    private readonly growthNet: number,
    totalYears: number,
  ) {
    const horizon = totalYears + this.unitExpected.duration + 1;
    this.aggCall = new Float64Array(horizon);
    this.aggDistGross = new Float64Array(horizon);
    this.aggDistNet = new Float64Array(horizon);
    this.aggNav = new Float64Array(horizon);
  }

  /** Addiert C × unit an Offset y auf die Aggregat-Arrays. */
  private addVintage(commitment: number, yearIdx: number, unit: PEUnitSchedule): void {
    for (let t = 0; t < unit.duration; t++) {
      const y = yearIdx + t;
      if (y >= this.aggCall.length) break;
      this.aggCall[y] += commitment * unit.call[t];
      this.aggDistGross[y] += commitment * unit.distGross[t];
      this.aggDistNet[y] += commitment * unit.distNet[t];
      this.aggNav[y] += commitment * unit.nav[t];
    }
  }

  /**
   * Jährliche Programm-Entscheidung + Cashflows. Genau einmal pro
   * Simulationsjahr aufrufen (am Jahresanfang, nach den Renditen,
   * vor Sparrate/Entnahme — konsistent mit dem statischen PE-Block).
   */
  processYear(input: PEProgramYearInput): PEProgramYearResult {
    const { program, unitExpected } = this;
    const y = input.yearIdx;
    let committed = 0;

    const cadence = Math.max(1, Math.floor(program.vintageCadenceYears));
    const isVintageYear = y % cadence === 0;
    const uPeak = unitExpected.nav[unitExpected.tPeak];

    if (isVintageYear && uPeak > 0 && program.targetQuotaPct > 0) {
      // Gesamtvermögen auf NAV-Basis (liquide + Bestand + Programm).
      const W = Math.max(0, input.liquid) + input.staticPeNavNow + this.aggNav[y];
      if (W > 0) {
        // Forward-looking Gap: Ziel-NAV am Peak-Horizont vs. Pipeline.
        // Vintages der KOMMENDEN Jahre (y+1..y+tPeak) tragen am Horizont
        // ebenfalls NAV bei (Alter 0..tPeak−1); ihr Steady-State-Anteil
        // wird vom Ziel abgezogen, sonst über-committet die Regel.
        const growth = (1 + this.growthNet) ** unitExpected.tPeak;
        const targetNavAtPeak = (program.targetQuotaPct / 100) * W * growth;
        let navBeforePeak = 0;
        for (let t = 0; t < unitExpected.tPeak; t++) navBeforePeak += unitExpected.nav[t];
        const futureShare =
          unitExpected.sumNav > 0 ? navBeforePeak / unitExpected.sumNav : 0;
        const pipelineNav =
          this.aggNav[Math.min(y + unitExpected.tPeak, this.aggNav.length - 1)] +
          input.staticPeNavAtPeak;
        let c = Math.max(
          0,
          (targetNavAtPeak * (1 - futureShare) - pipelineNav) / uPeak,
        );

        // Kappung je Vintage.
        c = Math.min(c, (program.maxVintageQuotaPct / 100) * W);

        // Liquiditäts-Guards. callRatio bestimmt die tatsächlich
        // abzurufende Quote des Commitments.
        const callFrac = Math.max(0.01, program.fundTemplate.callRatio / 100);
        if (input.isWithdrawalPhase) {
          // Deckungs-Check: liquide − offene Abrufe (neu) müssen die
          // restlichen Netto-Entnahmen (× Coverage) decken.
          const coverageNeed =
            (program.withdrawalCoveragePct / 100) * input.remainingWithdrawalsNominal;
          const headroom = input.liquid - this.unfunded - coverageNeed;
          c = Math.min(c, Math.max(0, headroom) / callFrac);
        } else {
          // Ansparphase: Puffer = N Jahres-Nettoentnahmen (i. d. R. 0
          // vor der Pension) + Deckung aller offenen Abrufe.
          const bufferNeed =
            program.liquidityBufferYears * input.netAnnualWithdrawal;
          const headroom = input.liquid - this.unfunded - bufferNeed;
          c = Math.min(c, Math.max(0, headroom) / callFrac);
        }

        // Dust-Schwelle: Mini-Commitments überspringen.
        if (c >= MIN_COMMITMENT_FRACTION * W && c > 0) {
          const unit =
            this.ensemble && this.rng
              ? this.ensemble[Math.floor(this.rng.next() * this.ensemble.length)]
              : unitExpected;
          this.addVintage(c, y, unit);
          this.unfunded += c * (program.fundTemplate.callRatio / 100);
          committed = c;
        }
      }
    }

    const call = this.aggCall[y] ?? 0;
    this.unfunded = Math.max(0, this.unfunded - call);

    return {
      call,
      distGross: this.aggDistGross[y] ?? 0,
      distNet: this.aggDistNet[y] ?? 0,
      nav: this.aggNav[y] ?? 0,
      committed,
      unfunded: this.unfunded,
    };
  }
}

/** Fabrik für Pfad-Zustände (einmal pro Simulation erzeugen). */
export interface PEProgramRuntime {
  /** Fondsjahr des NAV-Peaks (für die statische Pipeline-Abfrage). */
  tPeak: number;
  /** Neuer, unabhängiger Zustand für MC-Pfad `simIndex`. */
  newPathState(simIndex: number): PEProgramPathState;
}

/**
 * Erzeugt die Programm-Laufzeitumgebung. Unit-Schedule (und im Modus
 * 'full' das Unit-Ensemble) werden EINMAL kalibriert; jeder Pfad
 * bekommt einen eigenen, günstigen Zustand (nur Aggregat-Arrays).
 *
 * RNG: eigener Seed-Strom (baseSeed ⊻ Salt + simIndex) — der
 * Markt-RNG der MC-Engine bleibt unberührt, bestehende Ergebnisse
 * ohne Programm bleiben bit-identisch.
 */
export function createPEProgramRuntime(
  program: PEProgram,
  portfolio: PortfolioConfig,
  totalYears: number,
  kestRate: number,
  mode: PEModelingMode,
  baseSeed: number,
): PEProgramRuntime {
  const prog = sanitizeProgram(program);
  const unitExpected = computeUnitSchedule(prog.fundTemplate, kestRate, mode);
  const ensemble =
    mode === "full"
      ? buildUnitEnsemble(
          prog.fundTemplate,
          kestRate,
          PROGRAM_ENSEMBLE_SIZE,
          (baseSeed ^ PROGRAM_SEED_SALT) + 7919,
        )
      : null;
  const growthNet = computePortfolioReturn(portfolio);

  return {
    tPeak: unitExpected.tPeak,
    newPathState(simIndex: number): PEProgramPathState {
      const rng = ensemble
        ? new SeededRandom((baseSeed ^ PROGRAM_SEED_SALT) + simIndex)
        : null;
      return new PEProgramPathState(
        prog,
        unitExpected,
        ensemble,
        rng,
        growthNet,
        totalYears,
      );
    },
  };
}

/** Clamps analog zu `sanitizeFund` in privateEquity.ts. */
export function sanitizeProgram(program: PEProgram): PEProgram {
  return {
    ...program,
    targetQuotaPct: Math.max(0, Math.min(40, program.targetQuotaPct)),
    vintageCadenceYears: Math.max(1, Math.min(3, Math.floor(program.vintageCadenceYears))),
    liquidityBufferYears: Math.max(0, Math.min(10, program.liquidityBufferYears)),
    withdrawalCoveragePct: Math.max(0, Math.min(300, program.withdrawalCoveragePct)),
    maxVintageQuotaPct: Math.max(1, Math.min(40, program.maxVintageQuotaPct)),
  };
}

/**
 * Restliche nominale Netto-Entnahmen je Simulationsjahr (inkl. Jahr y)
 * — deterministisch, daher einmal pro Simulation vorberechenbar.
 * Repliziert die Entnahme-/Pensions-/Inflations-Logik der Engine
 * (siehe runMonteCarloSimulation / runDetailedSingleSimulation).
 */
export function computeRemainingWithdrawals(
  client: ClientProfile,
  inputs: FinancialInputs,
  totalYears: number,
): Float64Array {
  const accumulationYears = Math.max(0, client.retirementAge - client.currentAge);
  const inflate = inputs.inflateWithdrawalToRetirement !== false;
  const infl = inputs.inflationRate / 100;

  // Netto-Entnahme je Jahr (Entnahme − Pension, ≥ 0).
  const net = new Float64Array(totalYears + 1);
  for (let y = 0; y < totalYears; y++) {
    if (y < accumulationYears) continue;
    const cumInflation = (1 + infl) ** (y + 1);
    const withdrawal = inflate
      ? inputs.desiredMonthlyWithdrawal * 12 * cumInflation
      : inputs.desiredMonthlyWithdrawal * 12;
    const age = client.currentAge + y;
    const pension =
      age >= inputs.pensionStartAge
        ? inflate
          ? inputs.monthlyPension * 12 * cumInflation
          : inputs.monthlyPension * 12
        : 0;
    net[y] = Math.max(0, withdrawal - pension);
  }

  // Suffix-Summe: remaining[y] = Σ_{t ≥ y} net[t].
  const remaining = new Float64Array(totalYears + 1);
  let acc = 0;
  for (let y = totalYears; y >= 0; y--) {
    acc += net[y] ?? 0;
    remaining[y] = acc;
  }
  return remaining;
}

/** Ergebnis der deterministischen Programm-Vorschau (Erwartungspfad). */
export interface PEProgramPreview {
  /** Geplante Vintages als PEFund-Objekte (für den bestehenden Timeline-Chart). */
  vintages: PEFund[];
  /** Ist-Quote (inkl. Bestand) und NAV je Jahr auf dem Erwartungspfad. */
  quotaPath: { age: number; quotaPct: number; nav: number; committed: number }[];
}

/**
 * Deterministische Vorschau für UI/Report: simuliert den Erwartungspfad
 * (Netto-Portfoliorendite, Sparraten, Entnahmen — ohne Stochastik) und
 * wendet exakt dieselbe Programm-Logik an wie die MC-Engine.
 */
export function planProgramVintagesDeterministic(
  program: PEProgram,
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
): PEProgramPreview {
  const prog = sanitizeProgram(program);
  const accumulationYears = Math.max(0, client.retirementAge - client.currentAge);
  const withdrawalYears = Math.max(0, client.lifeExpectancy - client.retirementAge);
  const totalYears = accumulationYears + withdrawalYears;
  const kestRate = (portfolio.kestRate ?? 27.5) / 100;
  const mode = portfolio.peModelingMode ?? "realistic";
  const gNet = computePortfolioReturn(portfolio);
  const inflate = inputs.inflateWithdrawalToRetirement !== false;
  const infl = inputs.inflationRate / 100;

  // Bestand-Fonds (statische Timeline) zählen in die Ist-Quote.
  const staticFunds = portfolio.peFunds ?? [];
  const staticTimeline =
    staticFunds.length > 0
      ? computePETimeline(staticFunds, client.currentAge, totalYears, kestRate, mode)
      : [];
  const staticNavAt = (y: number): number =>
    staticTimeline[Math.min(y, Math.max(0, staticTimeline.length - 1))]?.totalNav ?? 0;

  const runtime = createPEProgramRuntime(
    { ...prog, fundTemplate: { ...prog.fundTemplate } },
    portfolio,
    totalYears,
    kestRate,
    // Vorschau ist immer deterministisch — auch im 'full'-Modus.
    mode === "full" ? "realistic" : mode,
    42,
  );
  const state = runtime.newPathState(0);
  const remaining = computeRemainingWithdrawals(client, inputs, totalYears);

  const vintages: PEFund[] = [];
  const quotaPath: PEProgramPreview["quotaPath"] = [];
  let liquid = inputs.initialCapital;

  for (let y = 0; y < totalYears; y++) {
    const age = client.currentAge + y;
    const isAccumulation = y < accumulationYears;
    const cumInflation = (1 + infl) ** (y + 1);

    // Rendite auf das liquide Vermögen (Erwartungswert, netto Kosten).
    liquid *= 1 + gNet;

    // Netto-Entnahme dieses Jahres (für Guard + Cashflow).
    let netWithdrawal = 0;
    if (!isAccumulation) {
      const withdrawal = inflate
        ? inputs.desiredMonthlyWithdrawal * 12 * cumInflation
        : inputs.desiredMonthlyWithdrawal * 12;
      const pension =
        age >= inputs.pensionStartAge
          ? inflate
            ? inputs.monthlyPension * 12 * cumInflation
            : inputs.monthlyPension * 12
          : 0;
      netWithdrawal = Math.max(0, withdrawal - pension);
    }

    // Statische PE-Cashflows (Bestand) auf den Erwartungspfad anwenden.
    const staticEntry = staticTimeline[y];
    if (staticEntry) {
      liquid -= staticEntry.totalCall;
      liquid += staticEntry.totalDistNet;
    }

    const result = state.processYear({
      yearIdx: y,
      liquid,
      staticPeNavNow: staticNavAt(y),
      staticPeNavAtPeak: staticNavAt(y + runtime.tPeak),
      netAnnualWithdrawal: netWithdrawal,
      remainingWithdrawalsNominal: remaining[y] ?? 0,
      isWithdrawalPhase: !isAccumulation,
    });

    liquid -= result.call;
    liquid += result.distNet;

    if (result.committed > 0) {
      vintages.push({
        ...prog.fundTemplate,
        id: `pe-program-vintage-${y}`,
        name: `Programm-Vintage ${age}`,
        commitment: result.committed,
        startAge: age,
      });
    }

    // Sparrate / Entnahme.
    if (isAccumulation) {
      const annualSavings = inputs.monthlySavings * 12;
      liquid += inputs.useRealValues
        ? annualSavings * cumInflation
        : annualSavings * (1 + inputs.annualSavingsIncrease / 100) ** y;
    } else {
      liquid = Math.max(0, liquid - netWithdrawal);
    }

    const nav = result.nav + staticNavAt(y);
    const total = liquid + nav;
    quotaPath.push({
      age,
      quotaPct: total > 0 ? (nav / total) * 100 : 0,
      nav,
      committed: result.committed,
    });
  }

  return { vintages, quotaPath };
}
