import type {
  HistoricalData,
  HistoricalResult,
  HistoricalAnalysis,
  FinancialInputs,
  PortfolioConfig,
  ClientProfile,
} from "../types";

// Historische Marktdaten 1970–2024
// Aktien: MSCI World Total Return in EUR (vor 1999: umgerechnet über DEM/ATS-Wechselkurs)
//   Quellen: MSCI Factsheets (EUR, ab 2012), Wikipedia MSCI World USD + Bundesbank DEM/USD Kurse
// Anleihen: Europäische Staatsanleihen Gesamtrendite (DE Bunds / EUR Gov Bonds)
//   Quellen: Bundesbank, OECD, Credit Suisse Global Investment Returns Yearbook
// Cash: Österreichische Geldmarktzinsen (OeNB Diskontrate 1970-1998, EURIBOR/EZB ab 1999)
//   Quellen: OeNB, EZB, FRED
// Inflation: Österreichischer VPI (Verbraucherpreisindex)
//   Quellen: Statistik Austria, Weltbank, macrotrends.net
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

export function runHistoricalBacktest(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig
): HistoricalAnalysis {
  const withdrawalYears = client.lifeExpectancy - client.retirementAge;
  const accumulationYears = client.retirementAge - client.currentAge;
  const totalYears = accumulationYears + withdrawalYears;
  const weights = portfolio.buckets.map((b) => b.allocation / 100);
  const costs = portfolio.buckets.map((b) => b.costs / 100 + b.taxDrag / 100);

  const scenarios: HistoricalResult[] = [];

  for (
    let startIdx = 0;
    startIdx <= historicalData.length - totalYears;
    startIdx++
  ) {
    const startYear = historicalData[startIdx].year;
    let capital = inputs.initialCapital;
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

      if (isAccumulation) {
        const inflationFactor = Math.pow(1 + data.inflation / 100, y);
        const savings = inputs.monthlySavings * 12 * (inputs.useRealValues ? inflationFactor : 1);
        capital = capital * (1 + portfolioReturn) + savings;
      } else {
        const withdrawalYear = y - accumulationYears;
        const inflationFactor = Math.pow(
          1 + inputs.inflationRate / 100,
          withdrawalYear
        );
        const withdrawal = inputs.useRealValues
          ? inputs.desiredMonthlyWithdrawal * 12 * inflationFactor
          : inputs.desiredMonthlyWithdrawal * 12;

        const currentAge = client.currentAge + y;
        const pension =
          currentAge >= inputs.pensionStartAge
            ? inputs.useRealValues
              ? inputs.monthlyPension * 12 * inflationFactor
              : inputs.monthlyPension * 12
            : 0;

        const netWithdrawal = Math.max(0, withdrawal - pension);
        capital = capital * (1 + portfolioReturn) - netWithdrawal;
      }

      if (capital > maxVal) maxVal = capital;
      const dd = maxVal > 0 ? (maxVal - capital) / maxVal : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;

      if (capital <= 0) {
        success = false;
        capital = 0;
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
    worstScenario: sortedByWealth[0],
    bestScenario: sortedByWealth[sortedByWealth.length - 1],
    drawdownDistribution: scenarios.map((s) => s.maxDrawdown * 100),
  };
}