/**
 * Portfolio-Optimizer (Pro-Mode-Feature) — wissenschaftliche Methodik
 *
 * ──────────────────────────────────────────────────────────────────
 * SUCHRAUM
 * ──────────────────────────────────────────────────────────────────
 * (cash, bonds, equities) ∈ Simplex (Summe = 100 %, Anteile des LIQUIDEN
 *                                    Portfolios — Buckets summieren immer
 *                                    auf 100 %, das ist die Engine-Konvention)
 * pe ∈ {0, 5, 10, 15, 20, 25} %    (ZIELQUOTE in % des Gesamtvermögens,
 *                                    laufend gehalten über ein rollierendes
 *                                    PE-Programm mit jährlichen Vintages —
 *                                    Pacing + Liquiditäts-Guards siehe
 *                                    peProgram.ts. Capital Calls aus Cash.)
 *
 * Beide Achsen sind orthogonal — kein 4-Simplex.
 *
 * ──────────────────────────────────────────────────────────────────
 * SUCHSTRATEGIE: Two-Stage Ranking-and-Selection (Kim & Nelson 2001)
 * ──────────────────────────────────────────────────────────────────
 * Phase 1 — Coarse Grid:
 *   10 %-Raster auf (c, b, e), pe ∈ {0, 10, 20}, plus Baseline.
 *   ≈ 165 Allokationen × 1000 MC-Pfade.
 *
 * Phase 2 — Fine Refinement:
 *   5 %-Raster ±10 % um Top-3 von Phase 1 + um Baseline.
 *   pe ∈ {0, 5, 10, 15, 20, 25}.
 *   ≈ 50–100 zusätzliche Allokationen × 1000 MC-Pfade.
 *
 * Phase 3 — Re-Evaluation der Top-10 (defeats Winner's Curse):
 *   Top-10 nach Phase 1+2 werden mit 5000 MC-Pfaden re-evaluiert.
 *   Damit wird der Optimization Bias (Goldfarb & Iyengar 2003) reduziert,
 *   der bei naive max-of-N-Selection auf 215 verrauschten Schätzern
 *   ~1–2 Pp Überschätzung des wahren Optimums erzeugen würde.
 *
 * ──────────────────────────────────────────────────────────────────
 * VARIANCE REDUCTION
 * ──────────────────────────────────────────────────────────────────
 * - Common Random Numbers (CRN): identischer randomSeed über alle
 *   Allokationen. Damit werden Allokationen auf IDENTISCHEN
 *   Marktszenarien verglichen — paarweise Differenzen sind ~5–10×
 *   präziser als unabhängige Samples (Glasserman 2004, Ch. 4).
 * - Antithetic variates und Stratified Sampling: nicht implementiert
 *   (würde Engine-Eingriff erfordern).
 *
 * ──────────────────────────────────────────────────────────────────
 * STATISTISCHE INFERENZE
 * ──────────────────────────────────────────────────────────────────
 * - 95 %-Konfidenzintervall der Erfolgsquote (Wilson Score Interval —
 *   robuster als Wald-Approximation bei Quoten nahe 0 oder 1; Wilson
 *   1927; Brown, Cai & DasGupta 2001).
 * - Multiple-Testing-Hinweis: Bei ≈215 simultanen Vergleichen kann ein
 *   beobachteter Vorsprung von 1–2 Pp durch Mehrfachvergleichs-Inflation
 *   erklärt werden (Romano-Wolf 2005). Phase 3 reduziert dies, ersetzt
 *   aber keine formale Korrektur.
 *
 * ──────────────────────────────────────────────────────────────────
 * ZIELFUNKTIONEN
 * ──────────────────────────────────────────────────────────────────
 * 'success'        : reine Erfolgsquote p ∈ [0, 1]
 * 'success_dd'     : p, abgewertet bei Markt-Drawdown > 35 % (lineare Strafe)
 * 'success_wealth' : DEFAULT. p × (W_median / W_initial) — interpretierbar
 *                    als „erwartetes Vermögensvielfaches, gewichtet mit
 *                    Erfolgswahrscheinlichkeit". Symmetrisch, einheitsfrei,
 *                    ökonomisch interpretierbar.
 *
 * ──────────────────────────────────────────────────────────────────
 * KONSISTENZ MIT HAUPT-SIMULATION
 * ──────────────────────────────────────────────────────────────────
 * Der Optimizer ruft `runMonteCarloSimulation` ohne jede Code-Änderung
 * auf. Wenn die Hauptsim für ein Portfolio X % Erfolg meldet, meldet
 * der Optimizer dasselbe (modulo Stichprobenrauschen aus reduzierter
 * Pfadzahl). Damit ist der gesamte App-Stack mathematisch konsistent.
 */

import { runMonteCarloSimulation } from "./montecarlo";
import { makeDefaultPEProgram } from "../defaults";
import type {
  ClientProfile,
  FinancialInputs,
  LiquidityEvent,
  PEProgram,
  PortfolioConfig,
  SimulationSettings,
} from "../types";

// ──────────────────────────────────────────
// Public API
// ──────────────────────────────────────────

export type OptimizerObjective = "success" | "success_dd" | "success_wealth";

export interface OptimizerOptions {
  /** Zielfunktion (Default: 'success_wealth' — Erfolg × Vermögensvielfaches). */
  objective?: OptimizerObjective;
  /**
   * MC-Pfade in Phase 1+2 (Default 1000). Liefert SE ≈ 1.6 Pp bei p=0.5.
   * Reduziert nur für schnelle Tests sinnvoll.
   */
  pathsPhase12?: number;
  /**
   * MC-Pfade in Phase 3 (Re-Evaluation Top-10). Default 5000 — passend zur
   * Haupt-Simulation. Defeats Winner's Curse.
   */
  pathsPhase3?: number;
  /** Top-N-Kandidaten für Phase-2-Verfeinerung (Default 3). */
  refinementTopN?: number;
  /** Top-N für Phase-3 Re-Evaluation mit hoher Präzision (Default 10). */
  reEvalTopN?: number;
  /** Globaler Seed für reproduzierbare Optimierungs-Läufe. */
  randomSeed?: number;
  /**
   * Minimale Cash-Allokation in % (Default 5). Für Bewahrung der
   * Liquiditätsreserve; sonst vorgeschlagene Portfolios mit 0 % Cash
   * können in der Praxis nicht rebalanced werden.
   */
  minCashPct?: number;
  /** Erlaubte PE-Stufen in Phase 1 (Default [0, 10, 20]). */
  peStepsCoarse?: number[];
  /**
   * Optionaler Progress-Callback (0..1). Wird ungefähr 10× während des Laufs
   * aufgerufen. Nicht für genaue Fortschrittsanzeige gedacht — nur für UX.
   */
  onProgress?: (pct: number, label: string) => void;
}

export interface AllocationCandidate {
  /** Cash-Allokation in % (0–100). */
  cash: number;
  /** Anleihen-Allokation in % (0–100). */
  bonds: number;
  /** Aktien-Allokation in % (0–100). */
  equities: number;
  /** PE-Zielquote in % des Gesamtvermögens (0–25), gehalten über ein rollierendes Programm. */
  pe: number;
}

export interface AllocationResult extends AllocationCandidate {
  /** Erfolgsquote in % (0..100). */
  successRate: number;
  /** 95 %-Wilson-Score-CI: untere Schranke der Erfolgsquote in %. */
  successRateCiLow: number;
  /** 95 %-Wilson-Score-CI: obere Schranke der Erfolgsquote in %. */
  successRateCiHigh: number;
  /** MC-Pfade, mit denen diese Allokation bewertet wurde (1000 oder 5000). */
  pathsUsed: number;
  /** Median-Endvermögen in €. */
  medianFinalWealth: number;
  /** Markt-Drawdown (reine Marktrendite-Komponente, ohne Cashflow-Drift), 0..1. */
  maxDrawdown: number;
  /** Score gemäß gewählter Zielfunktion (höher = besser). */
  score: number;
}

export interface OptimizerResult {
  /** Verwendete Konfiguration. */
  objective: OptimizerObjective;
  pathsPhase12: number;
  pathsPhase3: number;
  /**
   * Alle bewerteten Allokationen, **nach Score absteigend** sortiert.
   * Top-N (= reEvalTopN) wurden mit pathsPhase3 (5000) re-evaluiert,
   * der Rest mit pathsPhase12 (1000). Siehe `pathsUsed` pro Eintrag.
   */
  ranked: AllocationResult[];
  /**
   * Bewertung der aktuellen Berater-Allokation (= Ausgangs-Portfolio).
   * Wird IMMER mit pathsPhase3 (5000) bewertet, damit der angezeigte
   * Vergleich „Optimum vs. Aktuell" auf gleicher statistischer Basis steht.
   */
  baseline: AllocationResult;
  /** Anzahl ausgewerteter Allokationen (= ranked.length). */
  evaluations: number;
  /** Wallclock-Dauer in ms. */
  durationMs: number;
}

/**
 * Hauptfunktion. Synchron, kann je nach Hardware mehrere Sekunden bis
 * Minuten laufen → vom UI mit `setTimeout(0)`-Wrapping aufrufen, oder in
 * einem Web-Worker. `onProgress` ist nur ein Heuristik-Hook für die UX.
 */
export function optimizePortfolio(
  client: ClientProfile,
  inputs: FinancialInputs,
  basePortfolio: PortfolioConfig,
  settings: SimulationSettings,
  liquidityEvents: LiquidityEvent[] = [],
  options: OptimizerOptions = {},
): OptimizerResult {
  const t0 = Date.now();
  const objective = options.objective ?? "success_wealth";
  const pathsPhase12 = options.pathsPhase12 ?? 1000;
  const pathsPhase3 = options.pathsPhase3 ?? 5000;
  const minCashPct = options.minCashPct ?? 5;
  const refinementTopN = options.refinementTopN ?? 3;
  const reEvalTopN = options.reEvalTopN ?? 10;
  const seed = options.randomSeed ?? settings.randomSeed ?? 42;
  const peStepsCoarse = options.peStepsCoarse ?? [0, 10, 20];

  const evaluatedKey = new Map<string, AllocationResult>();
  const all: AllocationResult[] = [];

  /**
   * Bewertet eine Allokation und schreibt sie in `all` (oder ersetzt eine
   * vorherige Bewertung mit höherer Pfadzahl in `all`, wenn die neue
   * Bewertung präziser ist — wichtig für Phase 3).
   */
  const evaluator = (
    alloc: AllocationCandidate,
    paths: number,
  ): AllocationResult | null => {
    const key = `${alloc.cash}-${alloc.bonds}-${alloc.equities}-${alloc.pe}`;
    const previous = evaluatedKey.get(key);
    // Nur neu bewerten, wenn noch nicht bewertet ODER die neue Bewertung
    // präziser ist (mehr Pfade).
    if (previous && previous.pathsUsed >= paths) return previous;

    const r = evaluateAllocation(
      alloc,
      client,
      inputs,
      basePortfolio,
      { ...settings, numSimulations: paths, randomSeed: seed },
      liquidityEvents,
      objective,
    );
    if (previous) {
      // In-place ersetzen: gleiche Position in `all`.
      const idx = all.indexOf(previous);
      if (idx >= 0) all[idx] = r;
    } else {
      all.push(r);
    }
    evaluatedKey.set(key, r);
    return r;
  };

  // ── Phase 0: Baseline (Phase-3-Genauigkeit, da das die Vergleichs-
  // referenz für die UI ist) ──────────────────────────────────────
  options.onProgress?.(0.02, "baseline");
  const baselineAlloc = currentAllocationOf(basePortfolio, inputs.initialCapital);
  evaluator(baselineAlloc, pathsPhase3);

  // ── Phase 1: 10 %-Grid mit pathsPhase12 (1000 Pfade) ────────────
  options.onProgress?.(0.05, "phase1_start");
  const coarseGrid = enumerateAllocations(10, peStepsCoarse, minCashPct);
  for (let i = 0; i < coarseGrid.length; i++) {
    evaluator(coarseGrid[i], pathsPhase12);
    if (options.onProgress && i % 20 === 0) {
      options.onProgress(0.05 + 0.55 * (i / coarseGrid.length), "phase1_running");
    }
  }
  options.onProgress?.(0.6, "phase1_done");

  // ── Phase 2: 5 %-Grid um Top-N + Baseline (1000 Pfade) ──────────
  // Baseline wird auch als Refinement-Center genutzt, falls minimale
  // Anpassungen sie schlagen würden.
  const phase1Sorted = [...all].sort((a, b) => b.score - a.score);
  const topCandidates = phase1Sorted.slice(0, Math.max(1, refinementTopN));
  const baselineEval = evaluatedKey.get(
    `${baselineAlloc.cash}-${baselineAlloc.bonds}-${baselineAlloc.equities}-${baselineAlloc.pe}`,
  );
  const centers: AllocationResult[] =
    baselineEval && !topCandidates.includes(baselineEval)
      ? [...topCandidates, baselineEval]
      : topCandidates;

  const finerPeSteps = uniqueSorted([
    0, 5, 10, 15, 20, 25,
    ...centers.flatMap((c) => [
      Math.max(0, c.pe - 5),
      c.pe,
      Math.min(25, c.pe + 5),
    ]),
  ]);
  const refinement = neighborhoodGrid(centers, 5, minCashPct, finerPeSteps);
  for (let i = 0; i < refinement.length; i++) {
    evaluator(refinement[i], pathsPhase12);
    if (options.onProgress && i % 5 === 0) {
      options.onProgress(0.6 + 0.20 * (i / refinement.length), "phase2_running");
    }
  }
  options.onProgress?.(0.8, "phase2_done");

  // ── Phase 3: Re-Evaluation Top-N mit pathsPhase3 (5000) ─────────
  // Defeats Winner's Curse: nach naiver max-of-N-Selection auf 215
  // verrauschten Schätzern ist der "Sieger" um ~1–2 Pp überschätzt.
  // Re-Evaluation mit 5× mehr Pfaden reduziert das.
  const phase2Sorted = [...all].sort((a, b) => b.score - a.score);
  const reEvalSet = phase2Sorted.slice(0, Math.max(1, reEvalTopN));
  for (let i = 0; i < reEvalSet.length; i++) {
    evaluator(reEvalSet[i], pathsPhase3);
    if (options.onProgress) {
      options.onProgress(0.8 + 0.18 * (i / reEvalSet.length), "phase3_running");
    }
  }
  options.onProgress?.(0.99, "done");

  // Finalize Baseline-Referenz aus dem (jetzt garantiert vorhandenen) Eintrag.
  const baseline = evaluatedKey.get(
    `${baselineAlloc.cash}-${baselineAlloc.bonds}-${baselineAlloc.equities}-${baselineAlloc.pe}`,
  )!;

  options.onProgress?.(1, "done");

  return {
    objective,
    pathsPhase12,
    pathsPhase3,
    ranked: [...all].sort((a, b) => b.score - a.score),
    baseline,
    evaluations: all.length,
    durationMs: Date.now() - t0,
  };
}

// ──────────────────────────────────────────
// Internals (exportiert für Tests)
// ──────────────────────────────────────────

/**
 * Erzeugt alle Allokationen `(cash, bonds, equities, pe)` mit:
 *   - cash + bonds + equities = 100  (Buckets summieren immer auf 100 %)
 *   - pe ∈ peSteps                   (separates Commitment % des Startkapitals)
 *   - cash, bonds, equities Vielfache von `step`
 *   - cash ≥ minCashPct
 *
 * Damit ist der Suchraum ein echtes Kreuzprodukt aus (c,b,e)-Simplex und
 * pe-Stufen — getrennte Achsen, keine 4-Simplex-Constraint.
 */
export function enumerateAllocations(
  step: number,
  peSteps: number[],
  minCashPct: number = 0,
): AllocationCandidate[] {
  const out: AllocationCandidate[] = [];
  if (100 % step !== 0) return out;
  for (const pe of peSteps) {
    if (pe < 0) continue;
    for (let cash = minCashPct; cash <= 100; cash += step) {
      for (let bonds = 0; bonds + cash <= 100; bonds += step) {
        const equities = 100 - cash - bonds;
        if (equities < 0) continue;
        out.push({ cash, bonds, equities, pe });
      }
    }
  }
  return out;
}

/**
 * Erzeugt Verfeinerungs-Grid (Default 5 %) in der Umgebung jedes Top-N-Kandidaten.
 * Pro Top-Kandidat wird ein ±10 %-Window in jeder Achse durchschritten;
 * Buckets summieren weiterhin auf 100 %, PE wird getrennt durchprobiert.
 */
export function neighborhoodGrid(
  centers: AllocationCandidate[],
  step: number,
  minCashPct: number,
  peSteps: number[],
): AllocationCandidate[] {
  const seen = new Set<string>();
  const out: AllocationCandidate[] = [];
  if (100 % step !== 0) return out;
  for (const center of centers) {
    const cMin = Math.max(minCashPct, Math.floor((center.cash - 10) / step) * step);
    const cMax = Math.min(100, Math.ceil((center.cash + 10) / step) * step);
    const bMin = Math.max(0, Math.floor((center.bonds - 10) / step) * step);
    const bMax = Math.min(100, Math.ceil((center.bonds + 10) / step) * step);
    for (const pe of peSteps) {
      // pe darf ±10 % vom Center sein
      if (Math.abs(pe - center.pe) > 10) continue;
      for (let cash = cMin; cash <= cMax; cash += step) {
        for (let bonds = bMin; bonds <= bMax; bonds += step) {
          const equities = 100 - cash - bonds;
          if (equities < 0 || equities > 100) continue;
          const key = `${cash}-${bonds}-${equities}-${pe}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ cash, bonds, equities, pe });
        }
      }
    }
  }
  return out;
}

/**
 * Wertet eine konkrete Allokation aus, indem ein clone der `basePortfolio`
 * mit angepassten bucket-Allokationen + ggf. synthetischem PE-Fund zur
 * MC-Engine geschickt wird. Die Engine bleibt komplett unverändert.
 */
export function evaluateAllocation(
  alloc: AllocationCandidate,
  client: ClientProfile,
  inputs: FinancialInputs,
  basePortfolio: PortfolioConfig,
  settings: SimulationSettings,
  liquidityEvents: LiquidityEvent[],
  objective: OptimizerObjective,
): AllocationResult {
  const portfolio = buildPortfolioFromAllocation(alloc, basePortfolio, inputs.initialCapital, client.currentAge);
  const r = runMonteCarloSimulation(client, inputs, portfolio, settings, liquidityEvents);

  // r.maxDrawdown ist seit 2026-Q2 reiner Markt-Drawdown ohne Cashflow.
  const ddFraction = r.maxDrawdown / 100;

  // 95 %-Wilson-Score-CI auf der Erfolgsquote.
  const ci = wilsonScoreInterval(r.successRate / 100, settings.numSimulations);

  const score = computeObjective(
    objective,
    r.successRate,
    r.medianFinalWealth,
    ddFraction,
    inputs.initialCapital,
    r.meanFinalWealth,
  );

  return {
    ...alloc,
    successRate: r.successRate,
    successRateCiLow: ci.low * 100,
    successRateCiHigh: ci.high * 100,
    pathsUsed: settings.numSimulations,
    medianFinalWealth: r.medianFinalWealth,
    maxDrawdown: ddFraction,
    score,
  };
}

/**
 * Wilson-Score-Konfidenzintervall (95 %, z=1.96) für eine Binomial-Quote.
 * Robust an den Rändern p≈0 und p≈1 (anders als Wald-Approximation).
 *
 * Wilson, E.B. (1927): "Probable inference, the law of succession, and
 * statistical inference". JASA 22(158): 209–212.
 *
 * @param p Beobachtete Quote ∈ [0, 1]
 * @param n Stichprobengröße
 * @returns {low, high} ∈ [0, 1]
 */
export function wilsonScoreInterval(
  p: number,
  n: number,
): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 };
  const z = 1.959963984540054; // Φ⁻¹(0.975) — exakter als 1.96
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const halfwidth = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  // Floating-point-Toleranz: Werte unter 1e-12 nahe 0/1 hart clampen.
  const eps = 1e-12;
  let low = Math.max(0, center - halfwidth);
  let high = Math.min(1, center + halfwidth);
  if (low < eps) low = 0;
  if (high > 1 - eps) high = 1;
  return { low, high };
}

/**
 * Erzeugt das rollierende PE-Programm des Optimizers für eine Zielquote.
 * Template = branchenübliche Mid-Market-Defaults (IRR 10 %, TVPI 1.7×,
 * callRatio 80 %, 5/14 Jahre, Fees 2.0/1.5/1.0) — identisch zu
 * `makeDefaultPEProgram`, nur die Zielquote variiert.
 *
 * WICHTIG: Diese Fabrik wird sowohl im Scoring
 * (`buildPortfolioFromAllocation`) als auch im Adopt-Flow
 * (PortfolioOptimizer → „Portfolio übernehmen") verwendet, damit der
 * bewertete Score exakt dem übernommenen Portfolio entspricht.
 */
export function makeOptimizerPEProgram(targetQuotaPct: number): PEProgram {
  return {
    ...makeDefaultPEProgram(),
    targetQuotaPct: Math.max(0, Math.min(40, targetQuotaPct)),
  };
}

/**
 * Baut die `PortfolioConfig` für die Engine. Buckets werden auf die neuen
 * Allokationen gesetzt (cash/bonds/equities). Wenn `pe > 0`, wird ein
 * rollierendes PE-Programm mit Zielquote `pe` % gesetzt (jährliche
 * Vintages, Pacing + Liquiditäts-Guards — siehe peProgram.ts).
 *
 * Wichtig: bestehende `basePortfolio.peFunds` und ein etwaiges
 * bestehendes Programm werden ersetzt — der Optimizer bewertet die
 * PE-Achse isoliert, um den Vergleich zwischen Allokationen sauber
 * zu halten.
 */
export function buildPortfolioFromAllocation(
  alloc: AllocationCandidate,
  basePortfolio: PortfolioConfig,
  initialCapital: number,
  currentAge: number,
): PortfolioConfig {
  // Buckets: Allokationen anpassen, alles andere (Returns/Vola/Costs/Korr.)
  // bleibt aus basePortfolio. So respektiert der Optimizer die Berater-
  // Annahmen (z. B. eigene Equity-Volatilitäts-Override).
  const buckets = [
    { ...basePortfolio.buckets[0], allocation: alloc.cash },
    { ...basePortfolio.buckets[1], allocation: alloc.bonds },
    { ...basePortfolio.buckets[2], allocation: alloc.equities },
  ] as PortfolioConfig["buckets"];

  return {
    ...basePortfolio,
    buckets,
    peFunds: [],
    peProgram: alloc.pe > 0 ? makeOptimizerPEProgram(alloc.pe) : undefined,
    peModelingMode: basePortfolio.peModelingMode ?? "realistic",
  };
}

/**
 * Maximaler Drawdown auf einem einzelnen Pfad.
 * Definition: Max[(peak − value) / peak] über alle t.
 */
export function computeMaxDrawdownInPath(path: number[]): number {
  if (!path.length) return 0;
  let peak = path[0];
  let maxDD = 0;
  for (const v of path) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }
  return maxDD;
}

/**
 * Score-Berechnung pro Zielfunktion. Höher = besser.
 *
 * Ökonomisch interpretierbare Skalen:
 *   - 'success'        : Wahrscheinlichkeit ∈ [0, 1]
 *   - 'success_dd'     : Wahrscheinlichkeit, Drawdown-bestraft ∈ [0, 1]
 *   - 'success_wealth' : erwartetes Vermögensvielfaches ∈ [0, ∞)
 *                        (typisch 0.5–5 bei normalen Plänen)
 */
export function computeObjective(
  objective: OptimizerObjective,
  successRate: number,
  medianFinalWealth: number,
  maxDrawdown: number,
  initialCapital: number = 0,
  meanFinalWealth?: number,
): number {
  const success01 = successRate / 100;
  switch (objective) {
    case "success":
      return success01;

    case "success_dd": {
      // Drawdown-Penalty: bis 35 % keine Strafe; pro Pp darüber 1 % Score-
      // Abschlag. Bei 50 % DD also Score × 0.85.
      const ddPct = maxDrawdown * 100;
      const penalty = ddPct > 35 ? 1 - (ddPct - 35) / 100 : 1;
      return success01 * Math.max(0, penalty);
    }

    case "success_wealth": {
      // Score = p × (W_eff / W_initial), wo W_eff:
      //   - bevorzugt der Median (zentrale Tendenz, robust gegen Ausreißer)
      //   - bei Plänen mit Erfolg < 50 % ist der Median = 0 €. Dann fällt
      //     der Score auf null und KEINE Allokation wird unterscheidbar.
      //     Lösung: Fallback auf den Mean (= probabilitätsgewichtetes
      //     Erwartungs­vermögen, wo gescheiterte Pfade als 0 in den
      //     Mittelwert eingehen). Das macht den Score bei marginalen Plänen
      //     wieder monoton in den eigentlichen Verbesserungen (Asset-Mix,
      //     PE-Quote, Rebalancing).
      //
      // Interpretation: „erwartetes Vermögensvielfaches am Lebensende,
      // gewichtet mit Erfolgswahrscheinlichkeit". Score = 1.5 bedeutet:
      // Vermögen bleibt im Erwartungswert auf 1.5× Startkapital.
      //
      // Fallback Fallback: initialCapital ≤ 0 → log-Skala (UI-Defaultwerte).
      if (initialCapital > 0) {
        const wMedian = Math.max(0, medianFinalWealth);
        const wMean = Math.max(0, meanFinalWealth ?? 0);
        const wEff = wMedian > 0 ? wMedian : wMean;
        return success01 * (wEff / initialCapital);
      }
      const w = Math.max(1, medianFinalWealth);
      return success01 * Math.log10(w);
    }
  }
}

/**
 * Liest die aktuelle Allokation aus `basePortfolio` (als Allokations-Tupel).
 *   - cash/bonds/equities = Bucket-Allokationen (summieren auf 100 % von
 *     buckets, wird ggf. defensiv re-normalisiert).
 *   - pe = Summe aller PE-Commitments / Startkapital, in % (gerundet auf
 *     5 %-Vielfache, Clamp 0..25).
 */
export function currentAllocationOf(
  basePortfolio: PortfolioConfig,
  initialCapital: number,
): AllocationCandidate {
  let cash = Math.round(basePortfolio.buckets[0].allocation);
  let bonds = Math.round(basePortfolio.buckets[1].allocation);
  let equities = Math.round(basePortfolio.buckets[2].allocation);

  // Defensive Re-Normalisierung auf 100 (nur falls die UI-Slider einen
  // Rundungs-Drift hinterlassen haben). Die Differenz wird auf den größten
  // Bucket gepackt, damit das Verhältnis möglichst erhalten bleibt.
  const sum = cash + bonds + equities;
  if (sum !== 100 && sum > 0) {
    const delta = 100 - sum;
    if (equities >= bonds && equities >= cash) equities += delta;
    else if (bonds >= cash) bonds += delta;
    else cash += delta;
  }

  // PE-Achse: bevorzugt die Zielquote eines aktiven rollierenden
  // Programms; sonst Legacy-Heuristik (Summe der Einzel-Commitments
  // relativ zum Startkapital).
  let peRaw: number;
  if (basePortfolio.peProgram?.enabled) {
    peRaw = basePortfolio.peProgram.targetQuotaPct;
  } else {
    const peCommitments = (basePortfolio.peFunds ?? []).reduce(
      (acc, f) => acc + (f.commitment ?? 0),
      0,
    );
    peRaw = initialCapital > 0 ? (peCommitments / initialCapital) * 100 : 0;
  }
  // Auf 5 %-Vielfache runden (Suchraster ist 5 %), Clamp 0..25.
  const pe = Math.min(25, Math.max(0, Math.round(peRaw / 5) * 5));

  return { cash, bonds, equities, pe };
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function uniqueSorted(xs: number[]): number[] {
  return Array.from(new Set(xs)).sort((a, b) => a - b);
}