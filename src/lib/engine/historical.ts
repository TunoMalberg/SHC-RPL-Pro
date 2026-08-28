import type {
  HistoricalData,
  HistoricalResult,
  HistoricalAnalysis,
  FinancialInputs,
  PortfolioConfig,
  ClientProfile,
  LiquidityEvent,
} from "../types";

// Historische Marktdaten 1970–2024
// Aktien: MSCI World Total Return in EUR (vor 1999: umgerechnet über DEM/ATS-Wechselkurs)
//   Quellen: MSCI Factsheets (EUR, ab 2012), Wikipedia MSCI World USD + Bundesbank DEM/USD Kurse
// Anleihen: Europäische Staatsanleihen Gesamtrendite (DE Bunds / EUR Gov Bonds)
//   Quellen: Bundesbank, OECD, Credit Suisse Global Investment Returns Yearbook
// Cash: Österreichische Geldmarktzinsen (OeNB Diskontrate 1970-1998, EURIBOR/EZB ab 1999)
//   Quellen: OeNB, EZB, FRED
// Inflation: Österreichischer VPI (Verbraucherpreisindex, Statistik Austria Basis 2020/Kettenindex)
//   Quellen: Statistik Austria VPI-Jahreswerte 1970–2024
//   Diese Jahresinflationsraten werden im Backtest kumulativ verkettet
//   (Produkt über alle Jahre) und nicht mehr als Einzelwert potenziert.
export const historicalData: HistoricalData[] = [
  { year: 1970, equityReturn: -9.1, bondReturn: 1.2, cashReturn: 5.0, inflation: 4.4 },
  { year: 1971, equityReturn: 14.0, bondReturn: 5.8, cashReturn: 5.0, inflation: 4.7 },
  { year: 1972, equityReturn: 13.3, bondReturn: 4.2, cashReturn: 4.5, inflation: 6.4 },
  { year: 1973, equityReturn: -29.0, bondReturn: 2.1, cashReturn: 5.5, inflation: 7.5 },
  { year: 1974, equityReturn: -26.4, bondReturn: -1.5, cashReturn: 6.5, inflation: 9.5 },
  { year: 1975, equityReturn: 27.9, bondReturn: 9.8, cashReturn: 6.0, inflation: 8.4 },
  { year: 1976, equityReturn: 17.6, bondReturn: 10.2, cashReturn: 5.0, inflation: 7.3 },
  { year: 1977, equityReturn: -3.2, bondReturn: 8.5, cashReturn: 5.5, inflation: 5.5 },
  { year: 1978, equityReturn: 2.1, bondReturn: 6.4, cashReturn: 4.5, inflation: 3.6 },
  { year: 1979, equityReturn: 3.1, bondReturn: 1.8, cashReturn: 5.0, inflation: 3.7 },
  { year: 1980, equityReturn: 26.6, bondReturn: -1.2, cashReturn: 6.5, inflation: 6.3 },
  { year: 1981, equityReturn: 20.4, bondReturn: -1.8, cashReturn: 8.0, inflation: 6.8 },
  { year: 1982, equityReturn: 19.4, bondReturn: 12.5, cashReturn: 7.5, inflation: 5.4 },
  { year: 1983, equityReturn: 29.7, bondReturn: 7.8, cashReturn: 5.5, inflation: 3.3 },
  { year: 1984, equityReturn: 17.8, bondReturn: 8.2, cashReturn: 5.0, inflation: 5.7 },
  { year: 1985, equityReturn: 46.6, bondReturn: 14.5, cashReturn: 4.5, inflation: 3.2 },
  { year: 1986, equityReturn: 5.4, bondReturn: 10.8, cashReturn: 4.0, inflation: 1.7 },
  { year: 1987, equityReturn: -3.3, bondReturn: 2.5, cashReturn: 3.5, inflation: 1.4 },
  { year: 1988, equityReturn: 21.1, bondReturn: 5.2, cashReturn: 4.0, inflation: 1.9 },
  { year: 1989, equityReturn: 25.5, bondReturn: 3.8, cashReturn: 5.5, inflation: 2.6 },
  { year: 1990, equityReturn: -28.2, bondReturn: -0.5, cashReturn: 7.0, inflation: 3.3 },
  { year: 1991, equityReturn: 22.2, bondReturn: 5.2, cashReturn: 7.5, inflation: 3.3 },
  { year: 1992, equityReturn: -10.3, bondReturn: 7.8, cashReturn: 8.0, inflation: 4.0 },
  { year: 1993, equityReturn: 30.5, bondReturn: 14.2, cashReturn: 6.0, inflation: 3.6 },
  { year: 1994, equityReturn: 3.5, bondReturn: -4.5, cashReturn: 5.0, inflation: 3.0 },
  { year: 1995, equityReturn: 7.1, bondReturn: 17.5, cashReturn: 4.5, inflation: 2.2 },
  { year: 1996, equityReturn: 19.8, bondReturn: 8.2, cashReturn: 3.5, inflation: 1.9 },
  { year: 1997, equityReturn: 34.0, bondReturn: 6.5, cashReturn: 3.3, inflation: 1.3 },
  { year: 1998, equityReturn: 26.6, bondReturn: 12.8, cashReturn: 3.4, inflation: 0.9 },
  { year: 1999, equityReturn: 30.7, bondReturn: -2.1, cashReturn: 2.9, inflation: 0.6 },
  { year: 2000, equityReturn: 0.5, bondReturn: 7.5, cashReturn: 4.4, inflation: 2.3 },
  { year: 2001, equityReturn: -13.9, bondReturn: 5.2, cashReturn: 4.3, inflation: 2.7 },
  { year: 2002, equityReturn: -23.8, bondReturn: 9.4, cashReturn: 3.3, inflation: 1.8 },
  { year: 2003, equityReturn: 11.8, bondReturn: 4.2, cashReturn: 2.3, inflation: 1.4 },
  { year: 2004, equityReturn: 4.8, bondReturn: 7.5, cashReturn: 2.1, inflation: 2.1 },
  { year: 2005, equityReturn: 10.0, bondReturn: 5.9, cashReturn: 2.2, inflation: 2.3 },
  { year: 2006, equityReturn: 19.5, bondReturn: 0.3, cashReturn: 3.1, inflation: 1.4 },
  { year: 2007, equityReturn: 0.4, bondReturn: 1.5, cashReturn: 4.3, inflation: 2.2 },
  { year: 2008, equityReturn: -44.4, bondReturn: 9.2, cashReturn: 4.6, inflation: 3.2 },
  { year: 2009, equityReturn: 37.9, bondReturn: 4.3, cashReturn: 1.2, inflation: 0.5 },
  { year: 2010, equityReturn: 18.2, bondReturn: 1.0, cashReturn: 0.8, inflation: 1.8 },
  { year: 2011, equityReturn: -9.5, bondReturn: 3.4, cashReturn: 1.4, inflation: 3.3 },
  { year: 2012, equityReturn: 14.1, bondReturn: 11.2, cashReturn: 0.6, inflation: 2.5 },
  { year: 2013, equityReturn: 21.2, bondReturn: 2.4, cashReturn: 0.2, inflation: 2.0 },
  { year: 2014, equityReturn: 19.5, bondReturn: 13.2, cashReturn: 0.2, inflation: 1.6 },
  { year: 2015, equityReturn: 10.4, bondReturn: 1.6, cashReturn: 0.0, inflation: 0.9 },
  { year: 2016, equityReturn: 10.7, bondReturn: 3.2, cashReturn: -0.3, inflation: 0.9 },
  { year: 2017, equityReturn: 7.5, bondReturn: 0.2, cashReturn: -0.3, inflation: 2.1 },
  { year: 2018, equityReturn: -4.1, bondReturn: 0.9, cashReturn: -0.3, inflation: 2.0 },
  { year: 2019, equityReturn: 30.0, bondReturn: 6.8, cashReturn: -0.4, inflation: 1.5 },
  { year: 2020, equityReturn: 6.3, bondReturn: 4.9, cashReturn: -0.4, inflation: 1.4 },
  { year: 2021, equityReturn: 31.1, bondReturn: -3.5, cashReturn: -0.5, inflation: 2.8 },
  { year: 2022, equityReturn: -12.8, bondReturn: -18.5, cashReturn: 0.3, inflation: 8.6 },
  { year: 2023, equityReturn: 19.6, bondReturn: 7.2, cashReturn: 3.4, inflation: 7.8 },
  { year: 2024, equityReturn: 26.6, bondReturn: 2.6, cashReturn: 3.6, inflation: 2.9 },
];

/**
 * Historischer Backtest mit rollierenden Ruhestandsszenarien.
 *
 * Steuer- und Kostenmodell (seit 2025-11-11):
 *  • Kosten werden jedes Jahr vom Bruttoertrag abgezogen (Fondskosten, TER).
 *  • Die österreichische KESt (portfolio.kestRate, Default 27,5 %) wird
 *    AUSSCHLIESSLICH dann realisiert, wenn das Portfolio einen neuen
 *    Höchststand (High-Watermark) überschreitet. Nur der Zuwachs über dem
 *    letzten Höchststand wird besteuert; Verluste und Erholungen bis zum
 *    vorherigen Hoch bleiben steuerfrei.
 *  • Einzahlungen (Sparraten, positive Liquiditätsereignisse) erhöhen den
 *    Höchststand 1:1 (kein Steuerereignis). Entnahmen senken ihn 1:1.
 *
 * Inflation:
 *  • Die Sparraten und Entnahmen werden mit dem KUMULATIVEN Produkt der
 *    historischen österreichischen VPI-Jahresraten des jeweiligen Zeit-
 *    fensters skaliert (vorher: Einzeljahres-Inflation hoch y — falsch).
 */
/**
 * Geometrische Mittelwerte (annualisierte Brutto-Renditen) pro Topf
 * über den gesamten hinterlegten Datensatz (1970–2024).
 *
 * Wird im UI angezeigt, um die vom Berater eingegebenen Brutto-Renditen
 * mit den tatsächlich realisierten Marktrenditen zu vergleichen.
 */
export interface HistoricalGrossReturns {
  cash: number;       // % p.a.
  bonds: number;      // % p.a.
  equities: number;   // % p.a.
  inflation: number;  // % p.a.
  startYear: number;
  endYear: number;
  years: number;
}

export function computeHistoricalGrossReturns(
  data: HistoricalData[] = historicalData,
): HistoricalGrossReturns {
  if (!data.length) {
    return { cash: 0, bonds: 0, equities: 0, inflation: 0, startYear: 0, endYear: 0, years: 0 };
  }
  const geo = (rates: number[]): number => {
    const product = rates.reduce((acc, r) => acc * (1 + r / 100), 1);
    return (Math.pow(product, 1 / rates.length) - 1) * 100;
  };
  return {
    cash: geo(data.map((d) => d.cashReturn)),
    bonds: geo(data.map((d) => d.bondReturn)),
    equities: geo(data.map((d) => d.equityReturn)),
    inflation: geo(data.map((d) => d.inflation)),
    startYear: data[0].year,
    endYear: data[data.length - 1].year,
    years: data.length,
  };
}

export function runHistoricalBacktest(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  liquidityEvents: LiquidityEvent[] = []
): HistoricalAnalysis {
  const withdrawalYears = client.lifeExpectancy - client.retirementAge;
  const accumulationYears = client.retirementAge - client.currentAge;
  const totalYears = accumulationYears + withdrawalYears;
  const weights = portfolio.buckets.map((b) => b.allocation / 100);
  // KORREKTUR: Nur Kosten (TER) als laufender Drag — KESt läuft separat über Watermark.
  const costs = portfolio.buckets.map((b) => b.costs / 100);
  const kestRate = (portfolio.kestRate ?? 27.5) / 100;
  const cashYearsTarget = portfolio.cashYearsTarget ?? 2;

  const scenarios: HistoricalResult[] = [];

  for (
    let startIdx = 0;
    startIdx <= historicalData.length - totalYears;
    startIdx++
  ) {
    const startYear = historicalData[startIdx].year;
    let buckets = weights.map((w) => w * inputs.initialCapital);
    let capital = inputs.initialCapital;
    // FIX B: Steuerlicher Höchststand (High-Watermark) — initial = Startkapital.
    let highWatermark = inputs.initialCapital;
    // FIX A: Kumulative Inflation als Produkt der tatsächlichen VPI-Jahresraten.
    let cumulativeInflation = 1;
    const path: number[] = [capital];
    let success = true;
    let maxVal = capital;
    let maxDrawdown = 0;
    let worstYear = startYear;
    let worstReturn = 0;

    for (let y = 0; y < totalYears; y++) {
      const data = historicalData[startIdx + y];

      const returns = [
        data.cashReturn / 100 - costs[0],
        data.bondReturn / 100 - costs[1],
        data.equityReturn / 100 - costs[2],
      ];

      const portfolioReturn = weights.reduce(
        (sum, w, i) => sum + w * returns[i],
        0
      );

      if (portfolioReturn < worstReturn) {
        worstReturn = portfolioReturn;
        worstYear = data.year;
      }

      const isAccumulation = y < accumulationYears;

      buckets[0] *= 1 + returns[0];
      buckets[1] *= 1 + returns[1];
      buckets[2] *= 1 + returns[2];

      // FIX A: VPI-Rate dieses Jahres in den kumulativen Index multiplizieren.
      // Damit skalieren Sparraten/Entnahmen mit dem echten historischen
      // Preisniveau des jeweiligen Zeitfensters (z. B. 1970–2015 mit
      // Ölkrisen-Hochs Anfang der 1970er).
      cumulativeInflation *= 1 + data.inflation / 100;

      if (isAccumulation) {
        const savings =
          inputs.monthlySavings *
          12 *
          (inputs.useRealValues ? cumulativeInflation : 1);
        for (let i = 0; i < 3; i++) {
          buckets[i] += weights[i] * savings;
        }
        // Einzahlung hebt den Höchststand 1:1 (kein Steuerereignis).
        highWatermark += savings;

        const total = buckets.reduce((a, b) => a + b, 0);
        const currentWeights = buckets.map((v) => v / total);
        const needsRebalance = currentWeights.some(
          (w, i) => Math.abs(w - weights[i]) > portfolio.rebalancingThreshold / 100
        );
        if (needsRebalance && portfolio.rebalancingFrequency !== "none") {
          buckets = weights.map((w) => w * total);
        }
      } else {
        // KONSISTENZ-FIX (CR 14): Entnahme + Pension folgen — wie in der
        // MC-Engine seit dem FIX 2026-Q4 (Commit e967b66) — dem Schalter
        // `inflateWithdrawalToRetirement`, nicht mehr `useRealValues`
        // (das nur die Sparphase steuert). Vorher konnten Backtest und
        // Monte-Carlo bei identischen Eingaben auseinanderlaufen.
        const inflateWithdrawalsHist =
          inputs.inflateWithdrawalToRetirement !== false;
        const desiredMonthlyHist = inputs.desiredMonthlyWithdrawal ?? 0;
        const withdrawal = inflateWithdrawalsHist
          ? desiredMonthlyHist * 12 * cumulativeInflation
          : desiredMonthlyHist * 12;

        const ageNow = client.currentAge + y;
        const pension =
          ageNow >= inputs.pensionStartAge
            ? inflateWithdrawalsHist
              ? inputs.monthlyPension * 12 * cumulativeInflation
              : inputs.monthlyPension * 12
            : 0;

        const netWithdrawal = Math.max(0, withdrawal - pension);

        const totalPortfolio = buckets.reduce((a, b) => a + b, 0);
        if (totalPortfolio > 0) {
          if (buckets[0] >= netWithdrawal) {
            buckets[0] -= netWithdrawal;
          } else {
            const remaining = netWithdrawal - buckets[0];
            buckets[0] = 0;
            const restTotal = buckets[1] + buckets[2];
            if (restTotal > 0) {
              const ratio = Math.min(1, remaining / restTotal);
              buckets[1] *= 1 - ratio;
              buckets[2] *= 1 - ratio;
            }
          }
        }
        // Entnahme senkt den steuerlichen Höchststand 1:1 (vereinfachte
        // Durchschnittsbetrachtung — der im Entnahmebetrag enthaltene
        // Gewinn­anteil wurde bereits über Watermark-Events besteuert).
        highWatermark = Math.max(0, highWatermark - netWithdrawal);

        if (portfolio.rebalancingFrequency !== "none") {
          const targetCash = netWithdrawal * cashYearsTarget;
          const deficit = targetCash - buckets[0];
          if (deficit > 0) {
            if (returns[2] > 0) {
              const transferFromEquities = Math.min(deficit, buckets[2]);
              buckets[2] -= transferFromEquities;
              buckets[0] += transferFromEquities;
              const stillNeeded = deficit - transferFromEquities;
              if (stillNeeded > 0 && buckets[1] > 0) {
                const transferFromBonds = Math.min(stillNeeded, buckets[1]);
                buckets[1] -= transferFromBonds;
                buckets[0] += transferFromBonds;
              }
            } else {
              const transferFromBonds = Math.min(deficit, buckets[1]);
              buckets[1] -= transferFromBonds;
              buckets[0] += transferFromBonds;
            }
          }
        }
      }

      const ageAtStep = client.currentAge + y;
      for (const le of liquidityEvents) {
        if (le.age === ageAtStep) {
          if (le.amount > 0) {
            for (let i = 0; i < 3; i++) {
              buckets[i] += weights[i] * le.amount;
            }
            highWatermark += le.amount;
          } else {
            const tp = buckets.reduce((a, b) => a + b, 0);
            if (tp > 0) {
              const wr = Math.min(1, Math.abs(le.amount) / tp);
              for (let i = 0; i < 3; i++) {
                buckets[i] *= 1 - wr;
              }
            }
            highWatermark = Math.max(0, highWatermark - Math.abs(le.amount));
          }
        }
      }

      // FIX B: High-Watermark-KESt — NUR wenn ein neuer Höchststand erreicht wird,
      // wird der Zuwachs über dem bisherigen Höchststand mit KESt versteuert.
      // Verlustjahre und Erholungen unter dem letzten Hoch lösen keine Steuer aus.
      const endTotal = buckets.reduce((a, b) => a + b, 0);
      if (endTotal > highWatermark && endTotal > 0) {
        const taxableGain = endTotal - highWatermark;
        const tax = taxableGain * kestRate;
        const factor = (endTotal - tax) / endTotal;
        buckets[0] *= factor;
        buckets[1] *= factor;
        buckets[2] *= factor;
        highWatermark = endTotal - tax;
      }

      capital = Math.max(0, buckets.reduce((a, b) => a + b, 0));
      buckets = buckets.map((b) => Math.max(0, b));

      if (capital > maxVal) maxVal = capital;
      const dd = maxVal > 0 ? (maxVal - capital) / maxVal : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;

      if (capital <= 0) {
        success = false;
        capital = 0;
        buckets = [0, 0, 0];
      }
      path.push(capital);
    }

    scenarios.push({
      startYear,
      endYear: startYear + totalYears,
      success,
      finalWealth: Math.max(0, capital),
      maxDrawdown,
      path,
      worstYear,
      worstReturn: worstReturn * 100,
    });
  }

  const successfulScenarios = scenarios.filter((s) => s.success);
  const sortedByWealth = [...scenarios].sort(
    (a, b) => a.finalWealth - b.finalWealth
  );

  const medianFinalWealth =
    sortedByWealth.length > 0
      ? sortedByWealth.length % 2 === 1
        ? sortedByWealth[Math.floor(sortedByWealth.length / 2)].finalWealth
        : (sortedByWealth[sortedByWealth.length / 2 - 1].finalWealth +
            sortedByWealth[sortedByWealth.length / 2].finalWealth) /
          2
      : 0;

  return {
    scenarios,
    overallSuccessRate:
      scenarios.length > 0
        ? (successfulScenarios.length / scenarios.length) * 100
        : 0,
    averageFinalWealth:
      scenarios.length > 0
        ? scenarios.reduce((s, sc) => s + sc.finalWealth, 0) / scenarios.length
        : 0,
    medianFinalWealth,
    worstScenario: sortedByWealth[0],
    bestScenario: sortedByWealth[sortedByWealth.length - 1],
    drawdownDistribution: scenarios.map((s) => s.maxDrawdown * 100),
  };
}