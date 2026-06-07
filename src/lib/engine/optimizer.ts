/**
 * Portfolio-Optimizer (Pro-Mode-Feature)
 *
 * Sucht über einen 4-dimensionalen Allokations-Raum (Cash, Anleihen, Aktien
 * — als Anteil des LIQUIDEN Portfolios, summieren auf 100 % — sowie PE als
 * separates Commitment in % des Startkapitals) das Portfolio mit der
 * höchsten Erfolgsquote.
 *
 * WICHTIG: Mental-Modell der Engine
 *   - bucket.allocation SUMMIERT IMMER AUF 100 % (Anteile am liquiden Topf).
 *   - peFund.commitment ist ein zusätzliches € Commitment, das über Capital
 *     Calls aus dem Cash-Bucket gezogen wird. Es "verbraucht" also Liquidität,
 *     ändert aber nicht die Bucket-Allokationen.
 *   - Daher: Optimizer-Suche enumeriert (c, b, e) ∈ Simplex sum=100 UND
 *     getrennt davon pe ∈ {0, 5, 10, 15, 20, 25} %. Das sind zwei unabhängige
 *     Achsen — nicht ein 4-Simplex.
 *
 * Suchstrategie: Coarse-to-Fine
 *   Phase 1: 10 %-Grid (c,b,e) × pe ∈ {0, 10, 20}  → ~165 Kombinationen
 *   Phase 2: 5 %-Grid um die Top-N + um die Baseline → ~30-100 Kombinationen
 *
 * Pro Kombination wird `runMonteCarloSimulation` mit reduzierter Pfadzahl
 * (Default 200) aufgerufen. Das ist 25× schneller als die Standard-Sim
 * (5000 Pfade) und liefert für das *Ranking* hinreichend stabile
 * Erfolgsquoten (95 %-KI ≈ ±3 Pp bei Erfolgsquote ~50 %).
 *
 * Zielfunktionen:
 *   'success'         : reine Erfolgsquote
 *   'success_dd'      : Erfolg mit Drawdown-Penalty (DD > 35 % wird abgewertet)
 *   'success_wealth'  : Erfolg × normalisiertes Median-Endvermögen
 *
 * Wichtig: Die Engine bleibt unverändert. Der Optimizer ist eine reine
 * Hülle, die viele Konfigurationen durchprobiert. Damit ist der Code im
 * gesamten App-Stack mathematisch konsistent — wenn die Hauptsim für ein
 * Portfolio 87 % Erfolg sagt, sagt sie das auch hier (mit ggf. ±3 Pp
 * Sample-Rauschen wegen kleinerer Pfadzahl).
 */

import { runMonteCarloSimulation } from "./montecarlo";
import type {
  ClientProfile,
  FinancialInputs,
  LiquidityEvent,
  PortfolioConfig,
  SimulationSettings,
  PEFund,
} from "../types";

// ──────────────────────────────────────────
// Public API
// ──────────────────────────────────────────

export type OptimizerObjective = "success" | "success_dd" | "success_wealth";

export interface OptimizerOptions {
  /** Zielfunktion (Default: 'success'). */
  objective?: OptimizerObjective;
  /** MC-Pfade pro Allokation (Default 200). Höher = stabiler, langsamer. */
  pathsPerEval?: number;
  /** Top-N-Kandidaten für Phase-2-Verfeinerung (Default 3). */
  refinementTopN?: number;
  /** Globaler Seed für reproduzierbare Optimierungs-Läufe. */
  randomSeed?: number;
  /**
   * Minimale Cash-Allokation in % (Default 5). Für Bewahrung der
   * Liquiditätsreserve; sonst vorgeschlagene Portfolios mit 0 % Cash
   * können in der Praxis nicht rebalanced werden.
   */
  minCashPct?: number;
  /**
   * Erlaubte PE-Stufen in % (Default [0, 10, 20]; in Phase 2 verfeinert).
   * Bei MIFID 'defensive' wird das automatisch auf [0] reduziert (siehe
   * `applyMifidGuards`).
   */
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
  /** PE-Commitment in % des Startkapitals (0–25). */
  pe: number;
}

export interface AllocationResult extends AllocationCandidate {
  /** Erfolgsquote in % aus der Mini-MC. */
  successRate: number;
  /** Median-Endvermögen in €. */
  medianFinalWealth: number;
  /** Maximaler Drawdown im Median-Pfad, als Anteil (0..1). */
  maxDrawdown: number;
  /** Score gemäß gewählter Zielfunktion (höher = besser). */
  score: number;
}

export interface OptimizerResult {
  /** Verwendete Konfiguration. */
  objective: OptimizerObjective;
  pathsPerEval: number;
  /** Alle bewerteten Allokationen, **nach Score absteigend** sortiert. */
  ranked: AllocationResult[];
  /**
   * Bewertung der aktuellen Berater-Allokation (= Ausgangs-Portfolio). Mit
   * derselben Pfadzahl, gleichem Seed → fair vergleichbar mit den `ranked`-
   * Einträgen.
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
  const objective = options.objective ?? "success";
  const pathsPerEval = options.pathsPerEval ?? 200;
  const minCashPct = options.minCashPct ?? 5;
  const refinementTopN = options.refinementTopN ?? 3;
  const seed = options.randomSeed ?? settings.randomSeed ?? 42;
  const peStepsCoarse = options.peStepsCoarse ?? [0, 10, 20];

  const evaluatedKey = new Set<string>();
  const all: AllocationResult[] = [];
  const evaluator = (alloc: AllocationCandidate): AllocationResult | null => {
    const key = `${alloc.cash}-${alloc.bonds}-${alloc.equities}-${alloc.pe}`;
    if (evaluatedKey.has(key)) return null;
    evaluatedKey.add(key);
    const r = evaluateAllocation(
      alloc,
      client,
      inputs,
      basePortfolio,
      { ...settings, numSimulations: pathsPerEval, randomSeed: seed },
      liquidityEvents,
      objective,
    );
    all.push(r);
    return r;
  };

  // ── Baseline IMMER zuerst auswerten ─────────────────────────────
  // Garantiert, dass die aktuelle Allokation im Suchraum erscheint und mit
  // identischer Pfadzahl + Seed bewertet wird. Sonst kann (durch Sampling-
  // Rauschen) das beste gefundene Optimum schlechter als die Baseline
  // erscheinen, obwohl der Suchraum die Baseline mathematisch enthält.
  options.onProgress?.(0.05, "baseline");
  const baselineAlloc = currentAllocationOf(basePortfolio, inputs.initialCapital);
  evaluator(baselineAlloc);

  // ── Phase 1: 10 %-Grid ──────────────────────────────────────────
  options.onProgress?.(0.08, "phase1_start");
  const coarseGrid = enumerateAllocations(10, peStepsCoarse, minCashPct);
  for (let i = 0; i < coarseGrid.length; i++) {
    evaluator(coarseGrid[i]);
    if (options.onProgress && i % 20 === 0) {
      options.onProgress(0.08 + 0.62 * (i / coarseGrid.length), "phase1_running");
    }
  }
  options.onProgress?.(0.7, "phase1_done");

  // ── Phase 2: 5 %-Grid um die Top-N + um die Baseline ────────────
  // Baseline wird IMMER als Refinement-Center hinzugefügt — auch wenn ihr
  // Score nicht in den Top-N liegt — damit das 5%-Raster die Region um die
  // aktuelle Allokation ebenfalls abdeckt. Sonst übersieht der Optimizer
  // ggf. minimale Anpassungen, die die Baseline schlagen würden.
  const phase1Sorted = [...all].sort((a, b) => b.score - a.score);
  const topCandidates = phase1Sorted.slice(0, Math.max(1, refinementTopN));
  const baselineEval = all.find(
    (r) =>
      r.cash === baselineAlloc.cash &&
      r.bonds === baselineAlloc.bonds &&
      r.equities === baselineAlloc.equities &&
      r.pe === baselineAlloc.pe,
  );
  const centers: AllocationResult[] =
    baselineEval && !topCandidates.includes(baselineEval)
      ? [...topCandidates, baselineEval]
      : topCandidates;

  const finerPeSteps = uniqueSorted(
    centers.flatMap((c) => [
      Math.max(0, c.pe - 5),
      c.pe,
      Math.min(25, c.pe + 5),
    ]),
  );
  const refinement = neighborhoodGrid(centers, 5, minCashPct, finerPeSteps);
  for (let i = 0; i < refinement.length; i++) {
    evaluator(refinement[i]);
    if (options.onProgress && i % 5 === 0) {
      options.onProgress(0.7 + 0.27 * (i / refinement.length), "phase2_running");
    }
  }
  options.onProgress?.(0.99, "done");

  // Finalize Baseline-Referenz aus dem (jetzt garantiert vorhandenen) Eintrag.
  const baseline = all.find(
    (r) =>
      r.cash === baselineAlloc.cash &&
      r.bonds === baselineAlloc.bonds &&
      r.equities === baselineAlloc.equities &&
      r.pe === baselineAlloc.pe,
  )!;

  options.onProgress?.(1, "done");

  return {
    objective,
    pathsPerEval,
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

  // FIX: r.maxDrawdown ist bereits der reine Markt-Drawdown (in % von 0–100,
  // ohne Cashflow-Effekte). Vorher wurde computeMaxDrawdownInPath(medianPath)
  // verwendet — das mischte den geplanten Vermögens-Spend-Down (Vermögen →
  // €0 am Lebensende) mit Markt-Drawdown und produzierte „Drawdowns" von
  // 90–100 % auf jedem Portfolio. Das Ranking war damit unsinnig.
  const ddFraction = r.maxDrawdown / 100; // engine returns %, internally we want 0..1

  const score = computeObjective(objective, r.successRate, r.medianFinalWealth, ddFraction);
  return {
    ...alloc,
    successRate: r.successRate,
    medianFinalWealth: r.medianFinalWealth,
    maxDrawdown: ddFraction,
    score,
  };
}

/**
 * Baut die `PortfolioConfig` für die Engine. Buckets werden auf die neuen
 * Allokationen gesetzt (cash/bonds/equities). Wenn `pe > 0`, wird ein
 * synthetischer PE-Fonds mit Default-Parametern erzeugt:
 *   - Commitment = initialCapital × pe/100
 *   - IRR 10 %, TVPI 1.7×, callRatio 80 %, investmentPeriod 5 Jahre,
 *     fundDuration 14 Jahre, startAge = currentAge
 * Diese Werte sind branchenübliche Defaults für Mid-Market-PE-Fonds.
 *
 * Wichtig: bestehende `basePortfolio.peFunds` werden ersetzt — der
 * Optimizer arbeitet mit *einer einzelnen* synthetischen PE-Position, um
 * den Vergleich zwischen Allokationen sauber zu halten.
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

  // Synthetischer PE-Fund (siehe oben für Begründung der Defaults)
  const peFunds: PEFund[] =
    alloc.pe > 0
      ? [
          {
            id: "optimizer-pe",
            name: "Optimizer PE",
            commitment: Math.max(0, initialCapital * alloc.pe / 100),
            callRatio: 80,
            irr: 10,
            tvpi: 1.7,
            investmentPeriod: 5,
            fundDuration: 14,
            startAge: currentAge,
            mgmtFeeRate: 2.0,
            postPeriodFeeRate: 1.5,
            setupCostPct: 1.0,
          },
        ]
      : [];

  return {
    ...basePortfolio,
    buckets,
    peFunds,
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
 */
export function computeObjective(
  objective: OptimizerObjective,
  successRate: number,
  medianFinalWealth: number,
  maxDrawdown: number,
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
      // Erfolg × normalisiertes Endvermögen. Wir log-skalieren das Vermögen,
      // damit ein 10× größeres Endvermögen ~Faktor 2.3 stärker gewichtet
      // wird statt 10×; sonst dominieren extreme Outlier.
      const w = Math.max(1, medianFinalWealth);
      const logW = Math.log10(w); // typisch 5–8 für €100k–€100M
      return success01 * logW;
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

  const peCommitments = (basePortfolio.peFunds ?? []).reduce(
    (acc, f) => acc + (f.commitment ?? 0),
    0,
  );
  // Auf 5 %-Vielfache runden (Suchraster ist 5 %), Clamp 0..25.
  const peRaw = initialCapital > 0 ? (peCommitments / initialCapital) * 100 : 0;
  const pe = Math.min(25, Math.max(0, Math.round(peRaw / 5) * 5));

  return { cash, bonds, equities, pe };
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function uniqueSorted(xs: number[]): number[] {
  return Array.from(new Set(xs)).sort((a, b) => a - b);
}