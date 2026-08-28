/**
 * Bewertungsebene: Umrechnung zwischen nominalen Zukunftswerten und
 * Werten in heutiger Kaufkraft (CR „Heutige Kaufkraft & Planungskorridor").
 *
 * Die Engine rechnet intern nominal; diese Helper liefern exakte
 * Deflatoren, mit denen UI, Report und calculationTrace reale Werte
 * ableiten. UI und Trace verwenden dieselben Funktionen — dadurch sind
 * beide Darstellungen garantiert konsistent.
 *
 * Verbindliche Formel (CR 13):
 *   realReturn = ((1 + nominalReturn) / (1 + inflationRate)) − 1
 * Bei periodischen variablen Sätzen werden periodengleiche Faktoren
 * verkettet (chainDeflators).
 */

/**
 * Reale Rendite nach Fisher: ((1+n)/(1+i))−1.
 * Ein- und Ausgabe in Prozent (z. B. 5.0 → 5 %).
 */
export function realReturn(nominalPct: number, inflationPct: number): number {
  return ((1 + nominalPct / 100) / (1 + inflationPct / 100) - 1) * 100;
}

/**
 * Deflator-Serie für konstante Inflationsrate, step-aligned zu den
 * Pfad-Arrays der Engine (Index 0 = heute, Deflator 1.0).
 *
 * deflators[s] = (1+i)^(−s/stepsPerYear)
 *
 * realValue[s] = nominalValue[s] × deflators[s]
 *
 * @param inflationPct Inflationsrate in % p.a.
 * @param totalSteps   Anzahl Simulationsschritte (Pfadlänge = totalSteps+1)
 * @param stepsPerYear Schritte pro Jahr (12/timeStepMonths)
 */
export function buildDeflators(
  inflationPct: number,
  totalSteps: number,
  stepsPerYear: number,
): number[] {
  const perStep = Math.pow(1 + inflationPct / 100, 1 / stepsPerYear);
  const deflators = new Array<number>(totalSteps + 1);
  let cum = 1;
  deflators[0] = 1;
  for (let s = 1; s <= totalSteps; s++) {
    cum *= perStep;
    deflators[s] = 1 / cum;
  }
  return deflators;
}

/**
 * Deflator-Serie aus periodischen variablen Inflationsraten (in % je
 * Periode), durch Verkettung periodengleicher Faktoren (CR 13).
 * Ergebnislänge = perPeriodInflationPct.length + 1 (Index 0 = 1.0).
 */
export function chainDeflators(perPeriodInflationPct: number[]): number[] {
  const deflators = new Array<number>(perPeriodInflationPct.length + 1);
  deflators[0] = 1;
  let cum = 1;
  for (let p = 0; p < perPeriodInflationPct.length; p++) {
    cum *= 1 + perPeriodInflationPct[p] / 100;
    deflators[p + 1] = 1 / cum;
  }
  return deflators;
}

/** Serie elementweise deflationieren (nominal → heutige Kaufkraft). */
export function deflateSeries(series: number[], deflators: number[]): number[] {
  const n = Math.min(series.length, deflators.length);
  const out = new Array<number>(series.length);
  for (let s = 0; s < n; s++) out[s] = series[s] * deflators[s];
  // Falls die Serie länger ist als die Deflatoren (sollte nicht vorkommen),
  // letzten bekannten Deflator fortschreiben.
  for (let s = n; s < series.length; s++)
    out[s] = series[s] * (deflators[deflators.length - 1] ?? 1);
  return out;
}

/** Heutige Kaufkraft → Nominalwert in `years` Jahren. */
export function inflateToYear(
  realValue: number,
  inflationPct: number,
  years: number,
): number {
  return realValue * Math.pow(1 + inflationPct / 100, years);
}

/** Nominalwert in `years` Jahren → heutige Kaufkraft. */
export function deflateFromYear(
  nominalValue: number,
  inflationPct: number,
  years: number,
): number {
  return nominalValue / Math.pow(1 + inflationPct / 100, years);
}
