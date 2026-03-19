import type {
  HistoricalData,
  HistoricalResult,
  HistoricalAnalysis,
  FinancialInputs,
  PortfolioConfig,
  ClientProfile,
} from "../types";

export const historicalData: HistoricalData[] = [
  { year: 1970, equityReturn: -1.0, bondReturn: 5.2, cashReturn: 6.5, inflation: 5.6 },
  { year: 1971, equityReturn: 14.3, bondReturn: 8.7, cashReturn: 4.3, inflation: 5.3 },
  { year: 1972, equityReturn: 18.5, bondReturn: 5.1, cashReturn: 3.8, inflation: 5.1 },
  { year: 1973, equityReturn: -14.7, bondReturn: -1.1, cashReturn: 7.0, inflation: 7.1 },
  { year: 1974, equityReturn: -26.5, bondReturn: -3.1, cashReturn: 8.0, inflation: 7.0 },
  { year: 1975, equityReturn: 37.2, bondReturn: 7.8, cashReturn: 5.8, inflation: 5.9 },
  { year: 1976, equityReturn: 23.8, bondReturn: 12.9, cashReturn: 5.1, inflation: 4.3 },
  { year: 1977, equityReturn: -7.2, bondReturn: 1.4, cashReturn: 5.1, inflation: 3.7 },
  { year: 1978, equityReturn: 6.6, bondReturn: -0.2, cashReturn: 7.2, inflation: 2.7 },
  { year: 1979, equityReturn: 18.4, bondReturn: -1.2, cashReturn: 10.4, inflation: 4.1 },
  { year: 1980, equityReturn: 32.5, bondReturn: -3.9, cashReturn: 11.2, inflation: 5.4 },
  { year: 1981, equityReturn: -4.9, bondReturn: 1.9, cashReturn: 14.7, inflation: 6.3 },
  { year: 1982, equityReturn: 21.6, bondReturn: 32.6, cashReturn: 10.5, inflation: 5.3 },
  { year: 1983, equityReturn: 22.4, bondReturn: 7.4, cashReturn: 8.8, inflation: 3.3 },
  { year: 1984, equityReturn: 6.3, bondReturn: 15.5, cashReturn: 9.6, inflation: 2.4 },
  { year: 1985, equityReturn: 41.7, bondReturn: 30.9, cashReturn: 7.5, inflation: 2.2 },
  { year: 1986, equityReturn: 18.7, bondReturn: 24.5, cashReturn: 6.2, inflation: -0.1 },
  { year: 1987, equityReturn: 5.3, bondReturn: -2.7, cashReturn: 5.5, inflation: 0.2 },
  { year: 1988, equityReturn: 16.6, bondReturn: 9.7, cashReturn: 6.4, inflation: 1.2 },
  { year: 1989, equityReturn: 31.7, bondReturn: 15.0, cashReturn: 8.4, inflation: 2.8 },
  { year: 1990, equityReturn: -3.3, bondReturn: 6.9, cashReturn: 7.8, inflation: 2.7 },
  { year: 1991, equityReturn: 30.5, bondReturn: 15.5, cashReturn: 5.6, inflation: 3.5 },
  { year: 1992, equityReturn: 7.6, bondReturn: 7.4, cashReturn: 3.5, inflation: 4.0 },
  { year: 1993, equityReturn: 22.5, bondReturn: 18.2, cashReturn: 2.9, inflation: 3.6 },
  { year: 1994, equityReturn: 1.3, bondReturn: -7.8, cashReturn: 3.9, inflation: 2.7 },
  { year: 1995, equityReturn: 25.1, bondReturn: 18.5, cashReturn: 5.6, inflation: 1.7 },
  { year: 1996, equityReturn: 23.0, bondReturn: 3.6, cashReturn: 5.2, inflation: 1.2 },
  { year: 1997, equityReturn: 35.8, bondReturn: 9.9, cashReturn: 5.3, inflation: 1.5 },
  { year: 1998, equityReturn: 28.6, bondReturn: 8.7, cashReturn: 4.9, inflation: 0.6 },
  { year: 1999, equityReturn: 21.0, bondReturn: -0.8, cashReturn: 4.7, inflation: 0.5 },
  { year: 2000, equityReturn: -9.1, bondReturn: 7.5, cashReturn: 5.9, inflation: 1.4 },
  { year: 2001, equityReturn: -11.9, bondReturn: 3.7, cashReturn: 4.1, inflation: 1.8 },
  { year: 2002, equityReturn: -22.1, bondReturn: 10.3, cashReturn: 1.7, inflation: 1.3 },
  { year: 2003, equityReturn: 28.7, bondReturn: 4.1, cashReturn: 1.2, inflation: 1.9 },
  { year: 2004, equityReturn: 14.7, bondReturn: 7.9, cashReturn: 1.3, inflation: 2.1 },
  { year: 2005, equityReturn: 9.5, bondReturn: 5.9, cashReturn: 2.1, inflation: 2.3 },
  { year: 2006, equityReturn: 18.0, bondReturn: 1.2, cashReturn: 2.8, inflation: 1.5 },
  { year: 2007, equityReturn: 5.5, bondReturn: 2.2, cashReturn: 4.3, inflation: 2.2 },
  { year: 2008, equityReturn: -37.0, bondReturn: 12.4, cashReturn: 4.7, inflation: 2.6 },
  { year: 2009, equityReturn: 26.5, bondReturn: 3.0, cashReturn: 0.5, inflation: 0.5 },
  { year: 2010, equityReturn: 15.1, bondReturn: 1.4, cashReturn: 0.3, inflation: 1.6 },
  { year: 2011, equityReturn: -2.4, bondReturn: 9.7, cashReturn: 0.3, inflation: 2.5 },
  { year: 2012, equityReturn: 16.0, bondReturn: 11.2, cashReturn: 0.1, inflation: 2.1 },
  { year: 2013, equityReturn: 26.7, bondReturn: -0.1, cashReturn: 0.0, inflation: 1.3 },
  { year: 2014, equityReturn: 5.5, bondReturn: 13.2, cashReturn: 0.0, inflation: 0.4 },
  { year: 2015, equityReturn: -0.9, bondReturn: 1.5, cashReturn: 0.0, inflation: 0.1 },
  { year: 2016, equityReturn: 7.5, bondReturn: 3.3, cashReturn: -0.3, inflation: 0.2 },
  { year: 2017, equityReturn: 22.4, bondReturn: 0.7, cashReturn: -0.3, inflation: 1.6 },
  { year: 2018, equityReturn: -8.7, bondReturn: 0.4, cashReturn: -0.4, inflation: 1.8 },
  { year: 2019, equityReturn: 27.7, bondReturn: 6.8, cashReturn: -0.4, inflation: 1.2 },
  { year: 2020, equityReturn: 15.9, bondReturn: 4.1, cashReturn: -0.5, inflation: 0.3 },
  { year: 2021, equityReturn: 21.8, bondReturn: -3.5, cashReturn: -0.5, inflation: 2.6 },
  { year: 2022, equityReturn: -18.1, bondReturn: -17.2, cashReturn: 0.0, inflation: 8.4 },
  { year: 2023, equityReturn: 23.8, bondReturn: 6.2, cashReturn: 3.4, inflation: 5.7 },
  { year: 2024, equityReturn: 18.7, bondReturn: 2.1, cashReturn: 3.8, inflation: 2.9 },
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