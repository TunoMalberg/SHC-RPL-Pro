export interface LiquidityEvent {
  id: string;
  age: number;
  description: string;
  amount: number; // positive = inflow, negative = outflow
}

export interface ClientProfile {
  name: string;
  birthYear: number;
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  currency: string;
  notes: string;
  advisoryDate: string;
  advisoryMeetingType: string;
  advisoryNotes: string;
  advisoryNextSteps: string;
  advisoryRiskDisclosed: boolean;
  advisoryMifidConfirmed: boolean;
}

export interface FinancialInputs {
  initialCapital: number;
  monthlySavings: number;
  annualSavingsIncrease: number;
  /**
   * Gewünschter monatlicher Gesamtbetrag in heutiger Kaufkraft (€).
   *
   * `null` = kein Wunschbetrag erfasst → Modus „berechnen, was möglich
   * ist": Die Kundensicht zeigt je Variante die mögliche Monatsentnahme
   * in heutiger Kaufkraft (Planungskorridor), ohne Einordnung gegen
   * einen Wunschbetrag. (CR 4)
   */
  desiredMonthlyWithdrawal: number | null;
  monthlyPension: number;
  pensionStartAge: number;
  inflationRate: number;
  useRealValues: boolean;
  /**
   * Wenn aktiv, wird der eingegebene `desiredMonthlyWithdrawal` (heutige
   * Kaufkraft) bis zum Pensionsbeginn um die Inflation hochgerechnet, sodass
   * die Simulation an Tag 1 der Entnahmephase mit dem inflationsangepassten
   * zukünftigen Nominalbetrag startet.
   *
   * Beispiel: 18.000 € heute, 2,5 % Inflation, 15 Jahre Ansparphase
   *   → Start-Entnahme = 18.000 × 1,025^15 ≈ 26.085 € p.a. zum Pensionsbeginn.
   *
   * Default false (Rückwärtskompatibilität: bestehende Pläne arbeiten
   * unverändert mit den eingegebenen Nominalwerten).
   */
  inflateWithdrawalToRetirement?: boolean;
}

export interface AssetBucket {
  name: string;
  label: string;
  allocation: number;
  expectedReturn: number;
  volatility: number;
  costs: number;
  taxDrag: number;
  netReturn: number;
}

export type MifidProfile = 'conservative' | 'balanced' | 'growth' | 'speculative';

/**
 * Private-Equity-Fonds (Topf 4 — deterministisch).
 *
 * Eingaben werden im Portfolio-Bereich als 4. Topf gepflegt; die
 * Engine berechnet Capital Calls (Yale-Ramp), Brutto-Distributions
 * (kalibriert auf Ziel-IRR) und NAV (Compound-Balance) deterministisch.
 *
 * Steuerstatus: KESt-endbesteuert (27,5 %) auf den Gewinnanteil
 * jeder Distribution, sobald die kumulierten Brutto-Distributions
 * das tatsächlich abgerufene Kapital (= commitment × callRatio/100)
 * übersteigen.
 */
export interface PEFund {
  /** Stable id (uuid/random). */
  id: string;
  /** Anzeigename / Bezeichnung des Fonds. */
  name: string;
  /** Commitment in € (Zeichnungssumme). */
  commitment: number;
  /** Abrufquote in % (Default 80). */
  callRatio: number;
  /** Ziel-IRR in % (Default 10). */
  irr: number;
  /** Ziel-TVPI als Multiple (Default 1.7). */
  tvpi: number;
  /** Investitionsperiode in Jahren (Default 5). */
  investmentPeriod: number;
  /** Fondslaufzeit in Jahren (Default 14). */
  fundDuration: number;
  /** Investorenalter beim Fonds-Start. */
  startAge: number;
  // ---- J-Curve / Fee-Drag (für Modus „Realistisch" und „Vollständig") ----
  /** Mgmt-Fee p.a. in % auf Commitment während der Investitionsperiode. Default 2.0. */
  mgmtFeeRate?: number;
  /** Mgmt-Fee p.a. in % auf NAV nach Investitionsperiode. Default 1.5. */
  postPeriodFeeRate?: number;
  /** Einmalige Set-up-Kosten in % auf Commitment im Jahr 0. Default 1.0. */
  setupCostPct?: number;
  // ---- Stochastik (nur Modus „Vollständig") ----
  /** Standardabweichung der realisierten IRR in Prozentpunkten (1σ). Default 5. */
  irrVolatility?: number;
  /** Standardabweichung des realisierten TVPI als Multiple (1σ). Default 0.35. */
  tvpiVolatility?: number;
  /** Wahrscheinlichkeit eines Total-/Quasi-Loss pro Fonds (0–1). Default 0.03. */
  lossProbability?: number;
}

/**
 * PE-Modellierungs-Modus (drei Stufen):
 * - 'simple'    : Compound-Balance NAV, deterministisch (Legacy).
 * - 'realistic' : J-Curve über Fee-Drag, deterministisch (Default).
 * - 'full'      : J-Curve + Stochastik (IRR/TVPI variieren je MC-Pfad).
 */
export type PEModelingMode = 'simple' | 'realistic' | 'full';

/**
 * Rollierendes PE-Programm mit Zielquote.
 *
 * Statt einzelner, manuell gepflegter Fonds steuert das Programm die
 * PE-Quote über wiederkehrende Commitments (Vintages): Die Engine
 * entscheidet pro MC-Pfad jährlich (im Vintage-Rhythmus), ob und in
 * welcher Höhe ein neues Commitment gezeichnet wird, um die Zielquote
 * (% des Gesamtvermögens auf NAV-Basis) zu erreichen und zu halten.
 *
 * Illiquiditäts-Schutz: In der Entnahmephase wird nur committet, wenn
 * das liquide Vermögen nach dem Commitment die restlichen geplanten
 * Entnahmen noch deckt (Deckungs-Check). Reiche Pfade halten so die
 * Quote, arme Pfade stoppen automatisch — die PE-Quote sinkt dann
 * pfad-adaptiv über den natürlichen Runoff (Distributions), bevor
 * Entnahmen unmöglich werden.
 *
 * Programm-Vintages sind Laufzeitobjekte der Engine und erscheinen
 * nicht in `peFunds`; manuell gepflegte Fonds laufen parallel als
 * Bestand weiter und zählen in die Ist-Quote.
 */
export interface PEProgram {
  /** Programm aktiv? */
  enabled: boolean;
  /** Ziel-PE-Quote in % des Gesamtvermögens (NAV-Basis: liquide + PE-NAV). 1–40. */
  targetQuotaPct: number;
  /** Vintage-Rhythmus in Jahren (1–3). Default 1. */
  vintageCadenceYears: number;
  /** Liquiditäts-Guard Ansparphase: liquide ≥ offene Abrufe + N Jahres-Nettoentnahmen. Default 3. */
  liquidityBufferYears: number;
  /**
   * Deckungs-Check Entnahmephase: Commitment nur, wenn
   * liquide − offene Abrufe ≥ (Coverage %) × restliche nominale Netto-Entnahmen.
   * Default 100.
   */
  withdrawalCoveragePct: number;
  /** Kappung je Vintage in % des Gesamtvermögens. Default 10. */
  maxVintageQuotaPct: number;
  /** Fondsparameter aller Vintages (ein Template statt N Einzel-Fonds). */
  fundTemplate: Omit<PEFund, 'id' | 'name' | 'commitment' | 'startAge'>;
}

export type RebalancingFrequency = 'monthly' | 'quarterly' | 'annually' | 'none';

/**
 * Abweichendes Entnahme-Portfolio (Ruhestandsphase).
 *
 * Ermöglicht eine andere strategische Gewichtung + eigenes Rebalancing/
 * Cash-Puffer in der Entnahmephase als in der Ansparphase. Die Rendite-,
 * Volatilitäts- und Kosten-Annahmen je Anlageklasse bleiben identisch
 * (sie stammen weiterhin aus `PortfolioConfig.buckets`) — nur die
 * Gewichtung und die Rebalancing-Parameter unterscheiden sich.
 *
 * Beim Übergang (Pensionsantritt) schichtet die Engine einmalig auf diese
 * Zielgewichte um. Der dabei realisierte Gewinnanteil löst KESt aus
 * (konsistent mit dem High-Watermark-Steuermodell der Engine).
 *
 * `undefined` auf der `PortfolioConfig` = ein einheitliches Portfolio für
 * beide Phasen (Default, vollständig rückwärtskompatibel).
 */
export interface WithdrawalPhaseOverride {
  /** Zielgewichte der Entnahmephase in % [Cash, Anleihen, Aktien]. Summe = 100. */
  allocations: [number, number, number];
  /** Rebalancing-Frequenz in der Entnahmephase. */
  rebalancingFrequency: RebalancingFrequency;
  /** Rebalancing-Schwelle in % (Abweichung von Zielgewicht). */
  rebalancingThreshold: number;
  /** Cash-Puffer in Jahresentnahmen (1–5). */
  cashYearsTarget: number;
}

export interface PortfolioConfig {
  buckets: [AssetBucket, AssetBucket, AssetBucket];
  correlationMatrix: number[][];
  rebalancingFrequency: RebalancingFrequency;
  rebalancingThreshold: number;
  cashYearsTarget: number; // 1-3 years of withdrawals held as cash in withdrawal phase
  kestRate: number; // Austrian KESt / capital gains tax rate in percent (default 27.5)
  mifidProfile?: MifidProfile;
  /** Liste der PE-Fonds (Topf 4). Leer = keine PE-Beteiligung. */
  peFunds?: PEFund[];
  /** PE-Modellierungs-Modus. Default 'realistic'. */
  peModelingMode?: PEModelingMode;
  /**
   * Rollierendes PE-Programm mit Zielquote. `undefined` oder
   * `enabled: false` = kein Programm (nur manuelle `peFunds`).
   */
  peProgram?: PEProgram;
  /**
   * Optionales, abweichendes Entnahme-Portfolio. Wenn gesetzt, nutzt die
   * Engine ab Pensionsantritt diese Gewichte + Rebalancing-Parameter.
   * `undefined` = einheitliches Portfolio für beide Phasen (Default).
   */
  withdrawalPhase?: WithdrawalPhaseOverride;
}

export interface SimulationSettings {
  numSimulations: number;
  timeStepMonths: number;
  mode: SimulationMode;
  randomSeed?: number;
}

export type SimulationMode =
  | 'fixed_withdrawal'
  | 'sustainable_withdrawal'
  | 'required_capital'
  | 'required_savings'
  | 'scenario_comparison';

/**
 * Duale Bewertung (CR 6): Deflatoren + reale Skalare zum nominalen
 * Ergebnis. Reale Serien werden per `deflateSeries(nominal, deflators)`
 * abgeleitet (exakt, keine Array-Duplikate im Result).
 */
export interface ResultValuation {
  /** Inflationsannahme in % p.a., mit der die Deflatoren gebaut wurden. */
  inflationRatePct: number;
  /** Schritte pro Jahr (12 / timeStepMonths). */
  stepsPerYear: number;
  /** Deflator je Simulationsschritt: real[s] = nominal[s] × deflators[s]. */
  deflators: number[];
  /** Kalenderjahr des Planungshorizonts (Lebenserwartung). */
  horizonYear: number;
  /** Kalenderjahr des Pensionsantritts. */
  retirementYear: number;
  /** Jahre vom Stichtag bis zum Planungshorizont. */
  yearsToHorizon: number;
  /** Median-Endvermögen in heutiger Kaufkraft. */
  medianFinalWealthReal: number;
  /** Mittleres Endvermögen in heutiger Kaufkraft. */
  meanFinalWealthReal: number;
  /** Endvermögens-Perzentile in heutiger Kaufkraft (p5…p95). */
  percentilesReal: Record<string, number>;
}

export type CorridorScenarioKey = 'difficult' | 'typical' | 'favorable';

/** Ein Korridor-Szenario (schwierige/typische/günstige Marktentwicklung). */
export interface CorridorScenarioValue {
  /** Perzentil der Simulationsverteilung (z. B. 25). */
  percentile: number;
  /** Ziel-Erfolgsquote der Bisektion (Dualität: 100 − Perzentil). */
  targetSuccessRate: number;
  /** Möglicher monatlicher Gesamtbetrag in heutiger Kaufkraft (€). */
  totalMonthly: number;
  /** Davon aus dem Vermögen: max(0, Gesamtbetrag − Pensionseinkünfte). */
  fromWealthMonthly: number;
  /** Nominaler Zwilling des Gesamtbetrags zum Pensionsantritt. */
  totalMonthlyNominalAtRetirement: number;
  /** Nominaler Zwilling des Vermögensanteils zum Pensionsantritt. */
  fromWealthMonthlyNominalAtRetirement: number;
}

/**
 * Planungskorridor (CR 9/10): mögliche Monatsentnahme in heutiger
 * Kaufkraft je Marktentwicklung, mathematisch aus der Monte-Carlo-
 * Verteilung hergeleitet (Bisektion mit Ziel-Erfolgsquote 100 − q).
 */
export interface CorridorResult {
  /** Eingabebasis: 'real' (Standard) oder 'nominal' (Experten-Toggle OFF). */
  basis: 'real' | 'nominal';
  /** Kalenderjahr des Pensionsantritts (für Nominalangaben, CR 6). */
  retirementYear: number;
  /** Jahre vom Stichtag bis zum Pensionsantritt. */
  yearsToRetirement: number;
  scenarios: Record<CorridorScenarioKey, CorridorScenarioValue>;
  /** Technische Parameter des Laufs (Transparenz, keine fachlichen Schwellen). */
  simulationsUsed: number;
  iterations: number;
  seedUsed: number;
}

/**
 * Baseline „Nicht investieren" (CR 12/17): deterministische Projektion
 * mit 0 % nominaler Verzinsung. Strikt getrennt von bestehender
 * Veranlagung und Zielstrategie.
 */
export interface BaselineResult {
  /** Nominale Vermögensentwicklung je Jahr (Index 0 = heute). */
  pathNominal: number[];
  /** Entwicklung in heutiger Kaufkraft je Jahr. */
  pathReal: number[];
  /** Alter je Stützstelle. */
  ages: number[];
  finalWealthNominal: number;
  finalWealthReal: number;
  /** Kalenderjahr des Planungshorizonts (für Nominalangaben). */
  horizonYear: number;
  /** Alter, ab dem das Vermögen erschöpft ist (null = reicht bis Horizont). */
  depletionAge: number | null;
  /**
   * Zielerreichung bei erfasstem Wunschbetrag — binär, da deterministisch
   * (kein Kapitalmarktrisiko). null = kein Wunschbetrag erfasst.
   */
  goalReached: boolean | null;
  /** Mögliche Monatsentnahme in heutiger Kaufkraft (deterministische Bisektion). */
  sustainableMonthlyReal: number;
  /** Nominaler Zwilling zum Pensionsantritt. */
  sustainableMonthlyNominalAtRetirement: number;
  retirementYear: number;
}

/** Einordnung des Bedarfs gegen den Planungskorridor (CR 10, keine Zusatz-Schwellen). */
export type CorridorRanking =
  | 'below_difficult'   // Bedarf ≤ Entnahme der schwierigen Marktentwicklung
  | 'within_corridor'   // zwischen schwierig und günstig
  | 'above_favorable';  // Bedarf > Entnahme der günstigen Marktentwicklung

export type ComparisonVariantKind = 'no_invest' | 'current' | 'target';

/** Eine Variante der Vergleichsansicht (CR 15). */
export interface ComparisonVariantResult {
  kind: ComparisonVariantKind;
  /** Anzeigename (z. B. „Nicht investieren", MiFID-Profilname). */
  label: string;
  /** Erwartete Rendite nominal in % p.a. (0 bei Nicht investieren). */
  expectedReturnNominalPct: number;
  /** Erwartete Rendite real in % p.a. (Fisher). */
  expectedReturnRealPct: number;
  /** Median-Endvermögen nominal (Nicht investieren: deterministischer Endwert). */
  finalWealthNominalMedian: number;
  /** Median-Endvermögen in heutiger Kaufkraft. */
  finalWealthRealMedian: number;
  horizonYear: number;
  /** Erfolgsquote in % — null bei Nicht investieren (binär) oder ohne Wunschbetrag. */
  successRate: number | null;
  /** Nur Nicht investieren: binäre Zielerreichung (null ohne Wunschbetrag). */
  goalReached?: boolean | null;
  /** Planungskorridor (nicht für die deterministische Baseline). */
  corridor?: CorridorResult;
  /** Zentrale Kennzahl: mögliche Monatsentnahme in heutiger Kaufkraft
   *  (typische Marktentwicklung bzw. deterministisch bei Baseline). */
  sustainableMonthlyReal: number;
  /** Einordnung des Bedarfs (nur bei erfasstem Wunsch > 0 und Korridor). */
  ranking?: CorridorRanking | null;
  /** Deterministische Rechnung (Baseline) statt Monte-Carlo. */
  deterministic: boolean;
}

/** Quelle der Zielstrategie in der Vergleichsansicht. */
export interface ComparisonTargetSource {
  type: 'mifid' | 'optimizer';
  id: string;
  label: string;
}

/** Ergebnis eines Vergleichslaufs (Tab „Vergleich"). */
export interface ComparisonRunResult {
  variants: ComparisonVariantResult[];
  targetSource?: ComparisonTargetSource;
  /** Differenz gewählte/bestehende Veranlagung vs. Nicht investieren am Horizont. */
  diffVsNoInvest: {
    nominal: number;
    real: number;
    /** Differenz der möglichen Monatsentnahme in heutiger Kaufkraft. */
    monthlyReal: number;
    horizonYear: number;
  } | null;
  /** ISO-Zeitstempel des Laufs. */
  stichtag: string;
}

/**
 * Vollständiger Berechnungsnachweis (CR 19). Wird nach jedem
 * Simulationslauf assembliert und hängt am SimulationResult; als
 * JSON exportierbar und im Experten-Bereich einsehbar.
 */
export interface CalculationTrace {
  /** Stichtag des Laufs (ISO). */
  stichtag: string;
  /** Version der Anzeige-Konfiguration (displayConfig.ts). */
  configVersion: string;
  assumptions: {
    buckets: {
      name: string;
      label: string;
      allocationPct: number;
      expectedReturnNominalPct: number;
      expectedReturnRealPct: number;
      volatilityPct: number;
      costsPct: number;
      taxDragPct: number;
      netReturnPct: number;
    }[];
    correlationMatrix: number[][];
    inflationRatePct: number;
    kestRatePct: number;
    /** Abweichendes Entnahme-Portfolio, falls konfiguriert. */
    withdrawalPhase: WithdrawalPhaseOverride | null;
  };
  simulation: {
    numSimulations: number;
    timeStepMonths: number;
    mode: SimulationMode;
    seed: number | null;
  };
  valuation: {
    /** Aktive Standard-Bewertungsbasis. */
    defaultMode: 'real' | 'nominal';
    /** Eingabebasis der monatlichen Beträge. */
    inputBasis: 'real' | 'nominal';
    formulaRealReturn: string;
    /** Deflator je Simulationsschritt. */
    deflators: number[];
  };
  /** Herleitung requiredMonthlyWithdrawal (CR 19). */
  derivation: {
    desiredMonthlyIncome: number | null;
    externalMonthlyIncome: number;
    /** = max(0, desired − external); null wenn kein Wunsch erfasst. */
    requiredMonthlyWithdrawal: number | null;
    formula: string;
  };
  /** Verwendete Korridor-Perzentile + Bisektionslogik. */
  corridor: {
    percentiles: { difficult: number; typical: number; favorable: number };
    method: string;
    technical: { maxSimulations: number; iterations: number };
    result: CorridorResult | null;
  };
  /** Einordnung gegen „Benötigt aus dem Vermögen" (null im Modus „was möglich ist"). */
  ranking: {
    requiredFromWealthMonthly: number;
    comparedAgainst: Record<CorridorScenarioKey, number>;
    result: CorridorRanking;
  } | null;
  /** Cashflow-Zeitreihe (nominal, je Jahr). */
  cashflows: {
    ages: number[];
    savingsNominal: number[];
    grossWithdrawalsNominal: number[];
    pensionNominal: number[];
    netWithdrawalsNominal: number[];
  };
  /** Nominale und reale Ergebnis-Zeitreihen (Median + Korridor-Perzentile). */
  series: {
    ageLabels: number[];
    medianNominal: number[];
    medianReal: number[];
    p25Nominal: number[];
    p25Real: number[];
    p75Nominal: number[];
    p75Real: number[];
  };
  /** Liquiditätsereignisse, getrennt nach zusätzlichen Einnahmen/Ausgaben. */
  liquidityEvents: {
    additionalIncomes: LiquidityEvent[];
    additionalExpenses: LiquidityEvent[];
    totalIncomes: number;
    totalExpenses: number;
  };
  /** Rundungsregeln der Anzeige. */
  rounding: {
    locale: string;
    currency: string;
    displayDecimals: number;
    corridorRounding: string;
  };
}

export interface SimulationResult {
  successRate: number;
  medianFinalWealth: number;
  meanFinalWealth: number;
  percentiles: Record<string, number>;
  medianPath: number[];
  p10Path: number[];
  p25Path: number[];
  p75Path: number[];
  p90Path: number[];
  worstPath: number[];
  bestPath: number[];
  allPaths?: number[][];
  failureYear: number | null;
  medianFailureYear: number | null;
  sustainableWithdrawal?: number;
  requiredCapital?: number;
  requiredSavings?: number;
  portfolioReturn: number;
  portfolioVolatility: number;
  maxDrawdown: number;
  sharpeRatio: number;
  yearLabels: number[];
  annualWithdrawals: number[];
  annualPortfolioValues: number[];
  withdrawalHeatmap?: { withdrawal: number; successRate: number }[];
  /** PE-NAV-Pfad (Median über Stochastik bzw. deterministisch). */
  pePath?: number[];
  /** PE-NAV-Pfad p25 (nur im stochastischen Modus). */
  pePathP25?: number[];
  /** PE-NAV-Pfad p75 (nur im stochastischen Modus). */
  pePathP75?: number[];
  /** Anteil PE-Pfade mit TVPI ≥ 1,0× (Erfolgsquote PE-Tranche). */
  peSuccessRate?: number;
  /** Median realisierte PE-IRR über alle Stochastik-Pfade (in %). */
  peMedianIRR?: number;
  /** Median realisierter PE-TVPI über alle Stochastik-Pfade. */
  peMedianTVPI?: number;
  /**
   * Simulationsindex des Pfades mit dem niedrigsten Endvermögen
   * (= Worst-Case-Szenario). Wird im Reiter „Einzelpfad" genutzt,
   * um diesen exakten Pfad reproduzierbar nachzuzeichnen.
   */
  worstSimIndex?: number;
  /**
   * Simulationsindex des Pfades mit dem höchsten Endvermögen
   * (= Best-Case-Szenario). Wird im Reiter „Einzelpfad" genutzt.
   */
  bestSimIndex?: number;
  /** Duale Bewertung: Deflatoren + reale Skalare (CR 6). */
  valuation?: ResultValuation;
  /** Planungskorridor: mögliche Monatsentnahme je Marktentwicklung (CR 9/10). */
  corridor?: CorridorResult;
  /**
   * Benötigt aus dem Vermögen in heutiger Kaufkraft (monatlich):
   * max(0, Gesamtbetrag − Pensionseinkünfte). null = kein Wunsch erfasst.
   */
  requiredMonthlyWithdrawal?: number | null;
  /**
   * Welche Entnahmeannahme dem Lauf zugrunde liegt:
   * 'user' = erfasster Wunschbetrag, 'corridor_typical' = Modus
   * „berechnen, was möglich ist" (Pfaddarstellung mit typischer
   * Korridor-Entnahme; Erfolgsquote/Einordnung werden unterdrückt).
   */
  withdrawalAssumption?: 'user' | 'corridor_typical';
  /** Vollständiger Berechnungsnachweis (CR 19). */
  calculationTrace?: CalculationTrace;
}

export interface HistoricalData {
  year: number;
  equityReturn: number;
  bondReturn: number;
  cashReturn: number;
  inflation: number;
}

export interface HistoricalResult {
  startYear: number;
  endYear: number;
  success: boolean;
  finalWealth: number;
  maxDrawdown: number;
  path: number[];
  worstYear: number;
  worstReturn: number;
}

export interface HistoricalAnalysis {
  scenarios: HistoricalResult[];
  overallSuccessRate: number;
  averageFinalWealth: number;
  /** Median-Endvermögen über alle rollierenden Szenarien (für Vergleich mit MC-Median). */
  medianFinalWealth: number;
  worstScenario: HistoricalResult;
  bestScenario: HistoricalResult;
  drawdownDistribution: number[];
}

export interface DetailedYearRow {
  year: number;
  age: number;
  phase: "Anspar" | "Entnahme";
  startTotal: number;
  startCash: number;
  startBonds: number;
  startEquities: number;
  returnCash: number;
  returnBonds: number;
  returnEquities: number;
  returnCashPct: number;
  returnBondsPct: number;
  returnEquitiesPct: number;
  cashflow: number;
  cashflowLabel: string;
  liquidityEvent: number;
  liquidityEventLabel: string;
  rebalanced: boolean;
  rebalCashDelta: number;
  rebalBondsDelta: number;
  rebalEquitiesDelta: number;
  rebalSource: string; // e.g. "Aktien → Liquidität", "Anleihen → Liquidität (Verlustschutz)"
  /**
   * Tatsächliche Herkunft des Cashflows (Entnahme oder Liquiditätsereignis-
   * Auszahlung). Werte sind ≥ 0 und summieren sich zu |cashflow + min(0, liquidityEvent)|.
   * Wenn der Bargeld-Topf nicht ausreicht, wird der Rest proportional aus
   * Anleihen + Aktien verkauft (= „impliziter Verkauf"), den die Engine
   * sonst nicht in den Δ-Spalten anzeigt.
   * Bei reinen Sparrate-/Einzahlungs-Jahren (cashflow ≥ 0) sind alle
   * Felder 0.
   */
  withdrawalFromCash: number;
  withdrawalFromBonds: number;
  withdrawalFromEquities: number;
  endCash: number;
  endBonds: number;
  endEquities: number;
  endTotal: number;
  cumulativeInflation: number;
  /** Capital Calls aus PE-Fonds in diesem Jahr (positiv, drainen Cash). */
  peCall?: number;
  /** Brutto-Distributions in diesem Jahr (positiv). */
  peDistGross?: number;
  /** Netto-Distributions nach KESt in diesem Jahr (positiv). */
  peDistNet?: number;
  /** Aggregierter NAV aller PE-Fonds am Ende des Jahres. */
  peNav?: number;
  /** Neues Commitment des rollierenden PE-Programms in diesem Jahr (€). */
  peCommitted?: number;
  /** Offene (noch nicht abgerufene) Commitments des Programms am Jahresende (€). */
  peUnfunded?: number;
}

export interface DetailedSimTrace {
  rows: DetailedYearRow[];
  simulationIndex: number;
  seed: number;
  finalWealth: number;
  success: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  inputs: FinancialInputs;
  portfolio: PortfolioConfig;
  result?: SimulationResult;
  /** Quelle: "manual" = vom Berater gespeichert, "multirun" = automatisch
   *  vom Modus „Szenariovergleich" erzeugt (4 MiFID-Profile). Wird verwendet,
   *  damit Multi-Runs nur ihre eigenen Szenarien ersetzen, nicht die manuell
   *  gespeicherten. */
  source?: "manual" | "multirun";
}

/**
 * Advisor profile — used as letterhead / contact block on the client-facing
 * report (HTML + PDF). Not persisted to localStorage per the audit's positive
 * finding („Kein localStorage / sessionStorage / Cookie-Schreiben →
 * keine PII-Persistenz im Browser"). The advisor re-enters once per session,
 * or the bank can pre-fill via build-time env vars.
 */
export interface AdvisorProfile {
  /** Full name incl. title, e.g. "Dr. Anna Berater" */
  name: string;
  /** Job title, e.g. "Senior Private Banker" */
  title: string;
  /** E-Mail for the "arrange appointment" button */
  email: string;
  /** Phone incl. country code */
  phone: string;
  /** Bank / institution legal name */
  bankName: string;
  /** Branch name, e.g. "Niederlassung Wien Innere Stadt" */
  branch: string;
  /** Postal address of the branch, multi-line (\n) */
  address: string;
  /** Optional website URL */
  website: string;
  /** Logo as data URL (PNG/SVG). Inlined so the HTML stays self-contained. */
  logoDataUrl: string;
}

/**
 * UI-Bedienmodus.
 * - 'classic' : Reduzierte Oberfläche für Standardberatung (10 Tabs, ohne
 *   Bestandsportfolio, ohne Korrelationsmatrix, ohne 4. Topf, ohne
 *   Rebalancing-Eingaben). Dafür mehr Inline-Erklärungen.
 * - 'pro'     : Voller Funktionsumfang (11 Tabs, alle Profi-Eingaben,
 *   minimierte Erklärtexte).
 *
 * Beide Modi nutzen dieselbe Engine. Klassik liefert für ausgeblendete
 * Pro-Eingaben fest verdrahtete Best-Practice-Defaults (Korrelationen,
 * Rebalancing jährlich/5 %), sodass Ergebnisse, Quantile, MaxDrawdown
 * und Exporte bei identischen sichtbaren Eingaben bitidentisch zu Pro
 * sind.
 */
export type UIMode = 'classic' | 'pro';

export interface AppState {
  client: ClientProfile;
  advisor: AdvisorProfile;
  inputs: FinancialInputs;
  portfolio: PortfolioConfig;
  settings: SimulationSettings;
  liquidityEvents: LiquidityEvent[];
  result: SimulationResult | null;
  historicalResult: HistoricalAnalysis | null;
  detailedTrace: DetailedSimTrace | null;
  scenarios: Scenario[];
  activeTab: string;
  /** Bestandsportfolio (Excel-Import + ISIN-Backtest). Optional. */
  holdings?: import("./holdings/types").HoldingsState;
  /** UI-Modus (Klassik/Pro). Default 'classic'. Persistiert in localStorage. */
  uiMode: UIMode;
  /** Wurde der Modus beim Erstaufruf bereits gewählt? Wenn nicht, zeigt die
   *  App einmalig ein Auswahl-Modal. */
  uiModeChosen: boolean;
  /**
   * Aktive Bewertungsbasis der Kundensicht (CR 6/11). Default aus
   * DISPLAY_CONFIG.defaultValuationMode ('real'). Dauerhaft sichtbar
   * als Badge im Header, dort umschaltbar.
   */
  valuationMode: import("./displayConfig").ValuationMode;
  /**
   * Beste Allokation des letzten Optimizer-Laufs (für die Zielstrategie-
   * Auswahl in der Vergleichsansicht). null = Optimizer nicht gelaufen.
   */
  optimizerBestAllocation: {
    cash: number;
    bonds: number;
    equities: number;
    pe: number;
    objective: string;
    timestamp: string;
  } | null;
  /** Ergebnis des letzten Vergleichslaufs (Tab „Vergleich"). Nicht persistiert. */
  comparisonResult: ComparisonRunResult | null;
  /**
   * dataCompletenessNotice (CR 18): Berater hat die Vollständigkeit der
   * Einkommens-/Vermögens-/Versorgungsquellen mit dem Kunden besprochen.
   * Solange false, zeigen Eingaben/Vergleich/Report den Hinweis.
   */
  dataCompletenessConfirmed: boolean;
}