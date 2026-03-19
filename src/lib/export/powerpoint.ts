import type {
  ClientProfile,
  FinancialInputs,
  PortfolioConfig,
  SimulationResult,
  HistoricalAnalysis,
} from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Pptx = any;
type Slide = any;

const COLORS = {
  primary: "1B2A4A",
  secondary: "2E5090",
  accent: "E8913A",
  success: "2E7D32",
  danger: "C62828",
  light: "F5F7FA",
  white: "FFFFFF",
  text: "333333",
  muted: "6B7280",
  blue: "1565C0",
  teal: "00897B",
};

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("de-AT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtEur(n: number): string {
  return `€ ${fmt(n)}`;
}

function fmtPct(n: number, decimals = 1): string {
  return `${fmt(n, decimals)}%`;
}

function addTitleSlide(pptx: Pptx, client: ClientProfile) {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.primary };

  slide.addText("RETIREMENT PLANNING", {
    x: 0.8,
    y: 1.2,
    w: 8.4,
    h: 1,
    fontSize: 36,
    fontFace: "Calibri",
    color: COLORS.white,
    bold: true,
  });

  slide.addText("Professional Analysis Report", {
    x: 0.8,
    y: 2.1,
    w: 8.4,
    h: 0.6,
    fontSize: 20,
    fontFace: "Calibri",
    color: COLORS.accent,
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 2.8,
    w: 2,
    h: 0.04,
    fill: { color: COLORS.accent },
  });

  slide.addText(
    [
      { text: "Prepared for: ", options: { color: "9CA3AF", fontSize: 14 } },
      { text: client.name, options: { color: COLORS.white, fontSize: 14, bold: true } },
    ],
    { x: 0.8, y: 3.4, w: 8.4, h: 0.4, fontFace: "Calibri" }
  );

  slide.addText(`Date: ${new Date().toLocaleDateString("de-AT")}`, {
    x: 0.8,
    y: 3.9,
    w: 8.4,
    h: 0.4,
    fontSize: 12,
    fontFace: "Calibri",
    color: "9CA3AF",
  });

  slide.addText("Three-Bucket Portfolio Strategy  |  Monte Carlo Simulation  |  Historical Backtest", {
    x: 0.8,
    y: 4.8,
    w: 8.4,
    h: 0.4,
    fontSize: 10,
    fontFace: "Calibri",
    color: "6B7280",
  });
}

function addSectionSlide(pptx: Pptx, title: string, subtitle: string) {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.secondary };

  slide.addText(title, {
    x: 0.8,
    y: 2,
    w: 8.4,
    h: 1,
    fontSize: 32,
    fontFace: "Calibri",
    color: COLORS.white,
    bold: true,
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 3.1,
    w: 1.5,
    h: 0.04,
    fill: { color: COLORS.accent },
  });

  slide.addText(subtitle, {
    x: 0.8,
    y: 3.4,
    w: 8.4,
    h: 0.6,
    fontSize: 16,
    fontFace: "Calibri",
    color: "B0BEC5",
  });
}

function addSlideHeader(slide: Slide, title: string) {
  slide.addShape("rect" as any, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.9,
    fill: { color: COLORS.primary },
  });

  slide.addText(title, {
    x: 0.5,
    y: 0.15,
    w: 9,
    h: 0.6,
    fontSize: 20,
    fontFace: "Calibri",
    color: COLORS.white,
    bold: true,
  });
}

function addFinancialSummary(
  pptx: Pptx,
  client: ClientProfile,
  inputs: FinancialInputs
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Financial Situation Overview");

  const leftData = [
    ["Current Age", `${client.currentAge} years`],
    ["Retirement Age", `${client.retirementAge} years`],
    ["Life Expectancy", `${client.lifeExpectancy} years`],
    ["Years to Retirement", `${client.retirementAge - client.currentAge} years`],
    ["Withdrawal Period", `${client.lifeExpectancy - client.retirementAge} years`],
  ];

  const rightData = [
    ["Initial Capital", fmtEur(inputs.initialCapital)],
    ["Monthly Savings", fmtEur(inputs.monthlySavings)],
    ["Desired Withdrawal", fmtEur(inputs.desiredMonthlyWithdrawal) + " /month"],
    ["Pension Income", fmtEur(inputs.monthlyPension) + " /month"],
    ["Inflation Rate", fmtPct(inputs.inflationRate)],
  ];

  slide.addText("Personal Profile", {
    x: 0.5,
    y: 1.2,
    w: 4,
    h: 0.4,
    fontSize: 14,
    fontFace: "Calibri",
    color: COLORS.secondary,
    bold: true,
  });

  const leftRows: any[] = leftData.map(([k, v]) => [
    { text: k, options: { fontSize: 11, color: COLORS.muted, fontFace: "Calibri" } },
    { text: v, options: { fontSize: 11, color: COLORS.text, bold: true, fontFace: "Calibri" } },
  ]);

  slide.addTable(leftRows, {
    x: 0.5,
    y: 1.7,
    w: 4.2,
    colW: [2.2, 2],
    border: { type: "none" },
    rowH: 0.35,
  });

  slide.addText("Financial Parameters", {
    x: 5.2,
    y: 1.2,
    w: 4,
    h: 0.4,
    fontSize: 14,
    fontFace: "Calibri",
    color: COLORS.secondary,
    bold: true,
  });

  const rightRows: any[] = rightData.map(([k, v]) => [
    { text: k, options: { fontSize: 11, color: COLORS.muted, fontFace: "Calibri" } },
    { text: v, options: { fontSize: 11, color: COLORS.text, bold: true, fontFace: "Calibri" } },
  ]);

  slide.addTable(rightRows, {
    x: 5.2,
    y: 1.7,
    w: 4.2,
    colW: [2.2, 2],
    border: { type: "none" },
    rowH: 0.35,
  });

  const annualContrib = inputs.monthlySavings * 12;
  const yearsToRet = client.retirementAge - client.currentAge;
  const totalContrib = inputs.initialCapital + annualContrib * yearsToRet;

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5,
    y: 4.0,
    w: 9,
    h: 1.1,
    fill: { color: "F0F4F8" },
    rectRadius: 0.1,
  });

  slide.addText(
    `Total planned contributions over ${yearsToRet} years: ${fmtEur(totalContrib)} (excl. returns)`,
    {
      x: 0.8,
      y: 4.15,
      w: 8.4,
      h: 0.35,
      fontSize: 12,
      fontFace: "Calibri",
      color: COLORS.blue,
      bold: true,
    }
  );

  slide.addText(
    `Net monthly income need: ${fmtEur(inputs.desiredMonthlyWithdrawal - inputs.monthlyPension)} (withdrawal minus pension)`,
    {
      x: 0.8,
      y: 4.55,
      w: 8.4,
      h: 0.35,
      fontSize: 11,
      fontFace: "Calibri",
      color: COLORS.text,
    }
  );
}

function addPortfolioSlide(pptx: Pptx, portfolio: PortfolioConfig) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Portfolio Structure — Three-Bucket Model");

  const headerRow: any = [
    { text: "Asset Class", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: "Calibri" } },
    { text: "Allocation", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: "Calibri", align: "center" } },
    { text: "Expected Return", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: "Calibri", align: "center" } },
    { text: "Volatility", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: "Calibri", align: "center" } },
    { text: "Net Return", options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11, fontFace: "Calibri", align: "center" } },
  ];

  const dataRows: any[] = portfolio.buckets.map((b, i) => {
    const colors = [COLORS.teal, COLORS.blue, COLORS.accent];
    return [
      { text: b.label, options: { fontSize: 11, fontFace: "Calibri", color: colors[i], bold: true } },
      { text: fmtPct(b.allocation), options: { fontSize: 11, fontFace: "Calibri", align: "center" as const } },
      { text: fmtPct(b.expectedReturn), options: { fontSize: 11, fontFace: "Calibri", align: "center" as const } },
      { text: fmtPct(b.volatility), options: { fontSize: 11, fontFace: "Calibri", align: "center" as const } },
      { text: fmtPct(b.netReturn), options: { fontSize: 11, fontFace: "Calibri", align: "center" as const } },
    ];
  });

  slide.addTable([headerRow, ...dataRows], {
    x: 0.5,
    y: 1.3,
    w: 9,
    colW: [2.5, 1.5, 1.8, 1.5, 1.7],
    border: { type: "solid", pt: 0.5, color: "DEE2E6" },
    rowH: 0.4,
  });

  slide.addText("The Three-Bucket Strategy", {
    x: 0.5,
    y: 3.2,
    w: 9,
    h: 0.35,
    fontSize: 14,
    fontFace: "Calibri",
    color: COLORS.secondary,
    bold: true,
  });

  const bucketDescriptions = [
    { title: "Bucket 1: Cash / Liquidity", desc: "Short-term reserves (1-2 years of expenses). Provides stability and covers immediate needs. Low return but near-zero volatility.", color: COLORS.teal },
    { title: "Bucket 2: Bonds / Fixed Income", desc: "Medium-term stability (3-7 years). Government and corporate bonds provide regular income and act as a buffer against equity volatility.", color: COLORS.blue },
    { title: "Bucket 3: Equities / Stocks", desc: "Long-term growth engine. Diversified global equities (e.g., MSCI World) provide inflation-beating returns over decades.", color: COLORS.accent },
  ];

  let yPos = 3.6;
  for (const b of bucketDescriptions) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: yPos,
      w: 0.1,
      h: 0.55,
      fill: { color: b.color },
    });

    slide.addText(b.title, {
      x: 0.8,
      y: yPos,
      w: 8.5,
      h: 0.25,
      fontSize: 11,
      fontFace: "Calibri",
      color: b.color,
      bold: true,
    });

    slide.addText(b.desc, {
      x: 0.8,
      y: yPos + 0.22,
      w: 8.5,
      h: 0.3,
      fontSize: 9,
      fontFace: "Calibri",
      color: COLORS.muted,
    });

    yPos += 0.65;
  }
}

function addAssumptionsSlide(
  pptx: Pptx,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  result: SimulationResult
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Key Assumptions & Portfolio Metrics");

  const metrics = [
    { label: "Portfolio Return (p.a.)", value: fmtPct(result.portfolioReturn), color: COLORS.success },
    { label: "Portfolio Volatility (p.a.)", value: fmtPct(result.portfolioVolatility), color: COLORS.danger },
    { label: "Sharpe Ratio", value: fmt(result.sharpeRatio, 2), color: COLORS.blue },
    { label: "Inflation Assumption", value: fmtPct(inputs.inflationRate), color: COLORS.accent },
  ];

  let xPos = 0.4;
  for (const m of metrics) {
    slide.addShape(pptx.ShapeType.rect, {
      x: xPos,
      y: 1.2,
      w: 2.2,
      h: 1.1,
      fill: { color: "F8F9FA" },
      rectRadius: 0.08,
      line: { color: "E5E7EB", width: 0.5 },
    });

    slide.addText(m.value, {
      x: xPos,
      y: 1.3,
      w: 2.2,
      h: 0.5,
      fontSize: 22,
      fontFace: "Calibri",
      color: m.color,
      bold: true,
      align: "center",
    });

    slide.addText(m.label, {
      x: xPos,
      y: 1.85,
      w: 2.2,
      h: 0.35,
      fontSize: 9,
      fontFace: "Calibri",
      color: COLORS.muted,
      align: "center",
    });

    xPos += 2.4;
  }

  slide.addText("Correlation Matrix", {
    x: 0.5,
    y: 2.7,
    w: 4,
    h: 0.4,
    fontSize: 14,
    fontFace: "Calibri",
    color: COLORS.secondary,
    bold: true,
  });

  const labels = ["Cash", "Bonds", "Equities"];
  const corrHeader: any = [
    { text: "", options: { fill: { color: COLORS.primary }, color: COLORS.white, fontSize: 10, fontFace: "Calibri" } },
    ...labels.map((l) => ({
      text: l,
      options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 10, fontFace: "Calibri", align: "center" as const },
    })),
  ];

  const corrRows: any[] = labels.map((l, i) => [
    { text: l, options: { bold: true, fontSize: 10, fontFace: "Calibri", fill: { color: "F0F4F8" } } },
    ...portfolio.correlationMatrix[i].map((v) => ({
      text: fmt(v, 2),
      options: { fontSize: 10, fontFace: "Calibri", align: "center" as const },
    })),
  ]);

  slide.addTable([corrHeader, ...corrRows], {
    x: 0.5,
    y: 3.15,
    w: 5,
    colW: [1.2, 1.2, 1.2, 1.2],
    border: { type: "solid", pt: 0.5, color: "DEE2E6" },
    rowH: 0.35,
  });

  slide.addText("Methodology Notes", {
    x: 5.8,
    y: 2.7,
    w: 3.8,
    h: 0.4,
    fontSize: 14,
    fontFace: "Calibri",
    color: COLORS.secondary,
    bold: true,
  });

  const notes = [
    "• Returns are modeled as correlated log-normal processes",
    "• Cholesky decomposition ensures proper correlation structure",
    "• Costs and tax drag are deducted to show net returns",
    "• Inflation adjustments applied to withdrawals and pensions",
    `• Rebalancing: ${portfolio.rebalancingFrequency} (${portfolio.rebalancingThreshold}% threshold)`,
  ];

  slide.addText(notes.join("\n"), {
    x: 5.8,
    y: 3.15,
    w: 3.8,
    h: 2.0,
    fontSize: 9,
    fontFace: "Calibri",
    color: COLORS.text,
    lineSpacing: 16,
  });
}

function addMonteCarloResults(
  pptx: Pptx,
  result: SimulationResult,
  inputs: FinancialInputs,
  client: ClientProfile
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Monte Carlo Simulation Results");

  const successColor = result.successRate >= 90
    ? COLORS.success
    : result.successRate >= 70
      ? COLORS.accent
      : COLORS.danger;

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5,
    y: 1.2,
    w: 3,
    h: 1.6,
    fill: { color: "F0FFF4" },
    rectRadius: 0.1,
    line: { color: successColor, width: 1 },
  });

  slide.addText(fmtPct(result.successRate), {
    x: 0.5,
    y: 1.35,
    w: 3,
    h: 0.8,
    fontSize: 42,
    fontFace: "Calibri",
    color: successColor,
    bold: true,
    align: "center",
  });

  slide.addText("Success Probability", {
    x: 0.5,
    y: 2.2,
    w: 3,
    h: 0.35,
    fontSize: 12,
    fontFace: "Calibri",
    color: COLORS.muted,
    align: "center",
  });

  const rightMetrics = [
    ["Median Final Wealth", fmtEur(result.medianFinalWealth)],
    ["Best Case (90th pctl)", fmtEur(result.percentiles.p90)],
    ["Worst Case (10th pctl)", fmtEur(result.percentiles.p10)],
    ["Max Drawdown (median)", fmtPct(result.maxDrawdown)],
  ];

  let yPos = 1.3;
  for (const [label, value] of rightMetrics) {
    slide.addText(label, {
      x: 4.0,
      y: yPos,
      w: 3,
      h: 0.3,
      fontSize: 10,
      fontFace: "Calibri",
      color: COLORS.muted,
    });
    slide.addText(value, {
      x: 7.0,
      y: yPos,
      w: 2.5,
      h: 0.3,
      fontSize: 11,
      fontFace: "Calibri",
      color: COLORS.text,
      bold: true,
      align: "right",
    });
    yPos += 0.38;
  }

  slide.addText("Final Wealth Distribution (Percentiles)", {
    x: 0.5,
    y: 3.2,
    w: 9,
    h: 0.4,
    fontSize: 14,
    fontFace: "Calibri",
    color: COLORS.secondary,
    bold: true,
  });

  const pctRows: any[] = [
    ["5th", "10th", "25th", "50th (Median)", "75th", "90th", "95th"].map((p) => ({
      text: p,
      options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 10, fontFace: "Calibri", align: "center" as const },
    })),
    [
      result.percentiles.p5,
      result.percentiles.p10,
      result.percentiles.p25,
      result.percentiles.p50,
      result.percentiles.p75,
      result.percentiles.p90,
      result.percentiles.p95,
    ].map((v) => ({
      text: fmtEur(v),
      options: { fontSize: 10, fontFace: "Calibri", align: "center" as const },
    })),
  ];

  slide.addTable(pctRows, {
    x: 0.5,
    y: 3.65,
    w: 9,
    colW: [1.28, 1.28, 1.28, 1.3, 1.28, 1.28, 1.28],
    border: { type: "solid", pt: 0.5, color: "DEE2E6" },
    rowH: 0.4,
  });

  slide.addText(
    `Based on ${fmt(5000)} simulations with ${inputs.useRealValues ? "inflation-adjusted" : "nominal"} withdrawals of ${fmtEur(inputs.desiredMonthlyWithdrawal)}/month (minus ${fmtEur(inputs.monthlyPension)} pension).`,
    {
      x: 0.5,
      y: 4.65,
      w: 9,
      h: 0.35,
      fontSize: 9,
      fontFace: "Calibri",
      color: COLORS.muted,
      italic: true,
    }
  );
}

function addSuccessProbabilitySlide(pptx: Pptx, result: SimulationResult) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Success Probability — What Does It Mean?");

  slide.addText(
    "The success probability indicates the percentage of simulated scenarios in which your portfolio sustains " +
    "all planned withdrawals throughout your entire retirement period without running out of funds.",
    {
      x: 0.5,
      y: 1.3,
      w: 9,
      h: 0.6,
      fontSize: 11,
      fontFace: "Calibri",
      color: COLORS.text,
      lineSpacing: 16,
    }
  );

  const interpretations = [
    { range: "> 95%", meaning: "Very high confidence — conservative plan", color: COLORS.success },
    { range: "85–95%", meaning: "Good confidence — reasonable plan with some flexibility", color: COLORS.teal },
    { range: "70–85%", meaning: "Moderate confidence — consider reducing withdrawals or increasing savings", color: COLORS.accent },
    { range: "< 70%", meaning: "Elevated risk — significant plan adjustments recommended", color: COLORS.danger },
  ];

  let yPos = 2.2;
  for (const item of interpretations) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: yPos,
      w: 9,
      h: 0.4,
      fill: { color: "F8F9FA" },
      rectRadius: 0.05,
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: yPos,
      w: 0.08,
      h: 0.4,
      fill: { color: item.color },
    });

    slide.addText(item.range, {
      x: 0.8,
      y: yPos,
      w: 1.5,
      h: 0.4,
      fontSize: 11,
      fontFace: "Calibri",
      color: item.color,
      bold: true,
    });

    slide.addText(item.meaning, {
      x: 2.5,
      y: yPos,
      w: 7,
      h: 0.4,
      fontSize: 11,
      fontFace: "Calibri",
      color: COLORS.text,
    });

    yPos += 0.5;
  }

  slide.addText("Important Caveats", {
    x: 0.5,
    y: yPos + 0.3,
    w: 9,
    h: 0.4,
    fontSize: 13,
    fontFace: "Calibri",
    color: COLORS.secondary,
    bold: true,
  });

  slide.addText(
    "• Monte Carlo simulations model future uncertainty but cannot predict exact outcomes.\n" +
    "• Results depend heavily on input assumptions (returns, volatility, correlations).\n" +
    "• Black swan events and structural market changes are not fully captured.\n" +
    "• Regular plan reviews (annually) are essential to adjust for actual market conditions.",
    {
      x: 0.5,
      y: yPos + 0.7,
      w: 9,
      h: 1.2,
      fontSize: 10,
      fontFace: "Calibri",
      color: COLORS.text,
      lineSpacing: 15,
    }
  );
}

function addWithdrawalSlide(
  pptx: Pptx,
  result: SimulationResult,
  inputs: FinancialInputs,
  client: ClientProfile
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Sustainable Withdrawal Rate Analysis");

  const accYears = client.retirementAge - client.currentAge;
  const retIdx = Math.min(accYears, result.medianPath.length - 1);
  const capitalAtRet = result.medianPath[retIdx];
  const annualWithdrawal = inputs.desiredMonthlyWithdrawal * 12;
  const withdrawalRate = capitalAtRet > 0 ? (annualWithdrawal / capitalAtRet) * 100 : 0;

  slide.addText("Your Withdrawal Rate", {
    x: 0.5,
    y: 1.2,
    w: 4,
    h: 0.4,
    fontSize: 14,
    fontFace: "Calibri",
    color: COLORS.secondary,
    bold: true,
  });

  slide.addText(fmtPct(withdrawalRate), {
    x: 0.5,
    y: 1.65,
    w: 2,
    h: 0.7,
    fontSize: 36,
    fontFace: "Calibri",
    color: withdrawalRate <= 4 ? COLORS.success : COLORS.danger,
    bold: true,
  });

  slide.addText(`Initial withdrawal rate\n(${fmtEur(annualWithdrawal)} / ${fmtEur(capitalAtRet)} projected capital)`, {
    x: 2.5,
    y: 1.65,
    w: 3,
    h: 0.7,
    fontSize: 10,
    fontFace: "Calibri",
    color: COLORS.muted,
  });

  slide.addText("The 4% Rule (Trinity Study)", {
    x: 0.5,
    y: 2.8,
    w: 9,
    h: 0.4,
    fontSize: 14,
    fontFace: "Calibri",
    color: COLORS.secondary,
    bold: true,
  });

  slide.addText(
    "The famous '4% rule' originates from the 1998 Trinity Study by Cooley, Hubbard, and Walz. " +
    "It suggests that retirees can withdraw 4% of their initial portfolio value annually (adjusted for inflation) " +
    "with a high probability of the portfolio lasting at least 30 years.\n\n" +
    "However, this rule has significant limitations:\n" +
    "• Based on US historical data (1926–1995) — may not apply to European markets\n" +
    "• Assumes a 50/50 stock/bond portfolio\n" +
    "• Does not account for fees, taxes, or behavioral mistakes\n" +
    "• 30-year horizon may be too short for early retirees\n" +
    "• Current low-yield environment may require more conservative rates (3.0–3.5%)",
    {
      x: 0.5,
      y: 3.2,
      w: 9,
      h: 2.2,
      fontSize: 10,
      fontFace: "Calibri",
      color: COLORS.text,
      lineSpacing: 14,
    }
  );
}

function addRiskAnalysis(pptx: Pptx, result: SimulationResult) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Risk Analysis — Sequence of Returns Risk");

  slide.addText(
    "Sequence of returns risk (SoRR) is the danger that the timing of poor investment returns " +
    "can significantly impact the sustainability of retirement withdrawals. A bear market in the early " +
    "years of retirement is far more damaging than one later, because withdrawals deplete a smaller portfolio base.",
    {
      x: 0.5,
      y: 1.2,
      w: 9,
      h: 0.8,
      fontSize: 11,
      fontFace: "Calibri",
      color: COLORS.text,
      lineSpacing: 16,
    }
  );

  slide.addText("Why It Matters", {
    x: 0.5,
    y: 2.2,
    w: 9,
    h: 0.35,
    fontSize: 14,
    fontFace: "Calibri",
    color: COLORS.secondary,
    bold: true,
  });

  const points = [
    "Two retirees with identical average returns but different sequences can have vastly different outcomes.",
    "The three-bucket strategy helps mitigate SoRR by maintaining cash reserves for 1–2 years of expenses.",
    "This allows the equity bucket to recover from downturns without forced selling at depressed prices.",
    `Your worst-case scenario (10th percentile) ends with ${fmtEur(result.percentiles.p10)}.`,
    `Maximum portfolio drawdown (median across simulations): ${fmtPct(result.maxDrawdown)}.`,
  ];

  let yPos = 2.6;
  for (const point of points) {
    slide.addText(`→  ${point}`, {
      x: 0.5,
      y: yPos,
      w: 9,
      h: 0.35,
      fontSize: 10,
      fontFace: "Calibri",
      color: COLORS.text,
    });
    yPos += 0.4;
  }

  slide.addText("Mitigation Strategies", {
    x: 0.5,
    y: yPos + 0.2,
    w: 9,
    h: 0.35,
    fontSize: 14,
    fontFace: "Calibri",
    color: COLORS.secondary,
    bold: true,
  });

  slide.addText(
    "1. Maintain adequate cash reserves (Bucket 1) to cover 1–2 years of expenses\n" +
    "2. Reduce withdrawal rate in years following significant market declines\n" +
    "3. Consider dynamic withdrawal strategies (guardrails approach)\n" +
    "4. Delay non-essential spending during bear markets\n" +
    "5. Rebalance regularly to maintain target allocation",
    {
      x: 0.5,
      y: yPos + 0.55,
      w: 9,
      h: 1.2,
      fontSize: 10,
      fontFace: "Calibri",
      color: COLORS.text,
      lineSpacing: 15,
    }
  );
}

function addHistoricalSlide(
  pptx: Pptx,
  historical: HistoricalAnalysis | null
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Historical Backtest Results");

  if (!historical) {
    slide.addText("Historical backtest was not performed.", {
      x: 0.5,
      y: 2.5,
      w: 9,
      h: 0.5,
      fontSize: 14,
      fontFace: "Calibri",
      color: COLORS.muted,
      align: "center",
    });
    return;
  }

  const successColor = historical.overallSuccessRate >= 90 ? COLORS.success : COLORS.danger;

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5,
    y: 1.2,
    w: 2.5,
    h: 1.2,
    fill: { color: "F0FFF4" },
    rectRadius: 0.08,
  });

  slide.addText(fmtPct(historical.overallSuccessRate), {
    x: 0.5,
    y: 1.3,
    w: 2.5,
    h: 0.6,
    fontSize: 32,
    fontFace: "Calibri",
    color: successColor,
    bold: true,
    align: "center",
  });

  slide.addText("Historical Success Rate", {
    x: 0.5,
    y: 1.95,
    w: 2.5,
    h: 0.35,
    fontSize: 10,
    fontFace: "Calibri",
    color: COLORS.muted,
    align: "center",
  });

  const summaryData = [
    ["Total Scenarios Tested", `${historical.scenarios.length}`],
    ["Average Final Wealth", fmtEur(historical.averageFinalWealth)],
    ["Best Start Year", `${historical.bestScenario?.startYear ?? "N/A"}`],
    ["Worst Start Year", `${historical.worstScenario?.startYear ?? "N/A"}`],
    ["Worst Final Wealth", fmtEur(historical.worstScenario?.finalWealth ?? 0)],
  ];

  let yPos = 1.25;
  for (const [label, value] of summaryData) {
    slide.addText(label, {
      x: 3.5,
      y: yPos,
      w: 3,
      h: 0.3,
      fontSize: 10,
      fontFace: "Calibri",
      color: COLORS.muted,
    });
    slide.addText(value, {
      x: 6.5,
      y: yPos,
      w: 3,
      h: 0.3,
      fontSize: 11,
      fontFace: "Calibri",
      color: COLORS.text,
      bold: true,
      align: "right",
    });
    yPos += 0.34;
  }

  slide.addText(
    "The historical backtest uses actual market returns (MSCI World, European bonds, EUR cash rates) " +
    "to simulate rolling retirement scenarios. Each scenario starts in a different year, applying the same " +
    "withdrawal plan to real historical returns. This reveals how sequence-of-returns risk would have " +
    "affected outcomes in actual market conditions.",
    {
      x: 0.5,
      y: 3.1,
      w: 9,
      h: 0.8,
      fontSize: 10,
      fontFace: "Calibri",
      color: COLORS.text,
      lineSpacing: 15,
    }
  );

  slide.addText("Note: Past performance is not a reliable indicator of future results. Historical backtests are illustrative only.", {
    x: 0.5,
    y: 4.5,
    w: 9,
    h: 0.3,
    fontSize: 9,
    fontFace: "Calibri",
    color: COLORS.muted,
    italic: true,
  });
}

function addEducationalSlides(pptx: Pptx) {
  // Modern Portfolio Theory
  let slide = pptx.addSlide();
  addSlideHeader(slide, "Modern Portfolio Theory & Diversification");

  slide.addText(
    "Modern Portfolio Theory (MPT), developed by Harry Markowitz in 1952, demonstrates that investors can construct " +
    "portfolios to optimize expected return for a given level of risk through diversification.\n\n" +
    "Key Principles:\n\n" +
    "1. Diversification Benefit: By combining assets with low or negative correlations, the portfolio's overall " +
    "volatility can be reduced below the weighted average of individual asset volatilities.\n\n" +
    "2. Efficient Frontier: The set of portfolios offering the maximum expected return for each level of risk. " +
    "Our three-bucket model is positioned on this frontier.\n\n" +
    "3. Correlation Matters: The correlation between asset classes determines the diversification benefit. " +
    "Stocks and high-quality bonds have historically exhibited low or negative correlation during crises, " +
    "providing crucial downside protection.\n\n" +
    "4. Risk-Adjusted Returns: The Sharpe Ratio measures excess return per unit of risk. Higher Sharpe Ratios " +
    "indicate better risk-adjusted performance.",
    {
      x: 0.5,
      y: 1.2,
      w: 9,
      h: 4.0,
      fontSize: 10,
      fontFace: "Calibri",
      color: COLORS.text,
      lineSpacing: 14,
    }
  );

  // Monte Carlo Explanation
  slide = pptx.addSlide();
  addSlideHeader(slide, "Monte Carlo Simulation — How It Works");

  slide.addText(
    "Monte Carlo simulation is a computational technique that uses random sampling to model the probability " +
    "of different outcomes in a process that involves uncertainty.\n\n" +
    "How We Use It:\n\n" +
    "1. We define return distributions for each asset class (mean return and volatility)\n\n" +
    "2. We generate thousands of possible future return scenarios using correlated random draws\n\n" +
    "3. For each scenario, we simulate your entire financial plan: savings phase, retirement, withdrawals, " +
    "pension income, inflation, and rebalancing\n\n" +
    "4. We analyze all outcomes statistically: What percentage of scenarios end successfully? What is the " +
    "range of possible outcomes? At what age does the worst case run out of money?\n\n" +
    "Why Monte Carlo?\n\n" +
    "Unlike deterministic projections (which assume constant returns), Monte Carlo captures the reality that " +
    "markets are volatile. A portfolio earning 7% on average does not earn exactly 7% each year — it might " +
    "earn +25% one year and −15% the next. This volatility, combined with withdrawals, creates a wide range " +
    "of possible outcomes that simple projections miss.",
    {
      x: 0.5,
      y: 1.2,
      w: 9,
      h: 4.2,
      fontSize: 10,
      fontFace: "Calibri",
      color: COLORS.text,
      lineSpacing: 14,
    }
  );

  // Risks
  slide = pptx.addSlide();
  addSlideHeader(slide, "Key Retirement Risks");

  const risks = [
    {
      title: "Inflation Risk",
      desc: "Even modest inflation of 2–3% can halve the purchasing power of savings over 25 years. " +
        "All projections should use real (inflation-adjusted) values. State pensions in Austria have partial inflation protection.",
    },
    {
      title: "Longevity Risk",
      desc: "The risk of outliving one's assets. Austrian life expectancy continues to rise — " +
        "planning to age 90+ is prudent. A 65-year-old Austrian has roughly a 20% chance of reaching 95.",
    },
    {
      title: "Sequence of Returns Risk",
      desc: "Early retirement losses are disproportionately damaging. A −30% return in year 1 of retirement " +
        "is far worse than in year 20, because withdrawals compound the loss on a depleted portfolio.",
    },
    {
      title: "Behavioral Risk",
      desc: "Panic selling during market downturns, overconfidence in bull markets, and failure to rebalance " +
        "are common mistakes. A disciplined, systematic approach (like the three-bucket strategy) helps mitigate these risks.",
    },
    {
      title: "Regulatory & Tax Risk",
      desc: "Tax laws and pension regulations (KESt in Austria, social security contributions) may change. " +
        "This model uses flexible assumptions but should be reviewed periodically with a tax advisor.",
    },
  ];

  let yPos2 = 1.2;
  for (const risk of risks) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: yPos2,
      w: 0.08,
      h: 0.7,
      fill: { color: COLORS.accent },
    });

    slide.addText(risk.title, {
      x: 0.8,
      y: yPos2,
      w: 8.5,
      h: 0.25,
      fontSize: 11,
      fontFace: "Calibri",
      color: COLORS.secondary,
      bold: true,
    });

    slide.addText(risk.desc, {
      x: 0.8,
      y: yPos2 + 0.25,
      w: 8.5,
      h: 0.45,
      fontSize: 9,
      fontFace: "Calibri",
      color: COLORS.text,
      lineSpacing: 13,
    });

    yPos2 += 0.85;
  }
}

function addRecommendationsSlide(
  pptx: Pptx,
  result: SimulationResult,
  inputs: FinancialInputs,
  client: ClientProfile
) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Recommendations");

  const recommendations: string[] = [];

  if (result.successRate >= 95) {
    recommendations.push(
      "Your plan shows a very high success probability. You may have room to increase spending or reduce risk."
    );
  } else if (result.successRate >= 80) {
    recommendations.push(
      "Your plan has a good success probability but consider building additional buffers."
    );
  } else {
    recommendations.push(
      "Your plan carries significant risk. Consider reducing planned withdrawals, increasing savings, or delaying retirement."
    );
  }

  const accYears = client.retirementAge - client.currentAge;
  const retIdx = Math.min(accYears, result.medianPath.length - 1);
  const capitalAtRet = result.medianPath[retIdx];
  const withdrawalRate = capitalAtRet > 0
    ? (inputs.desiredMonthlyWithdrawal * 12 / capitalAtRet) * 100
    : 0;

  if (withdrawalRate > 4) {
    recommendations.push(
      `Your initial withdrawal rate of ${fmtPct(withdrawalRate)} exceeds the recommended 3.5–4.0% range. Consider reducing monthly withdrawals or accumulating more capital.`
    );
  }

  recommendations.push(
    "Review this plan annually and after major life events (job change, inheritance, health changes)."
  );
  recommendations.push(
    "Consider a dynamic withdrawal strategy: reduce spending by 10–15% in years following market declines of >15%."
  );
  recommendations.push(
    "Ensure your cash bucket (Bucket 1) covers at least 12–24 months of expenses before retirement."
  );
  recommendations.push(
    "Consult a qualified financial advisor and tax professional before implementing this plan."
  );

  let yPos = 1.3;
  for (let i = 0; i < recommendations.length; i++) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: yPos,
      w: 9,
      h: 0.55,
      fill: { color: i % 2 === 0 ? "F8F9FA" : COLORS.white },
      rectRadius: 0.05,
    });

    slide.addText(`${i + 1}.`, {
      x: 0.6,
      y: yPos,
      w: 0.4,
      h: 0.55,
      fontSize: 14,
      fontFace: "Calibri",
      color: COLORS.secondary,
      bold: true,
    });

    slide.addText(recommendations[i], {
      x: 1.1,
      y: yPos,
      w: 8.2,
      h: 0.55,
      fontSize: 10,
      fontFace: "Calibri",
      color: COLORS.text,
      lineSpacing: 14,
      valign: "middle",
    });

    yPos += 0.65;
  }
}

function addAppendixSlide(pptx: Pptx) {
  const slide = pptx.addSlide();
  addSlideHeader(slide, "Appendix — Methodology");

  slide.addText(
    "Simulation Methodology\n\n" +
    "• Asset returns are modeled as correlated geometric Brownian motion processes\n" +
    "• Correlation structure is enforced via Cholesky decomposition of the correlation matrix\n" +
    "• Returns are generated in the specified time step (monthly or annually)\n" +
    "• Withdrawals are deducted proportionally from all buckets after applying returns\n" +
    "• Portfolio is rebalanced to target weights based on selected frequency and threshold\n" +
    "• Inflation adjustments are applied cumulatively to withdrawals and pension income\n" +
    "• A scenario is classified as 'failure' when portfolio value drops to zero or below\n\n" +
    "Historical Backtest\n\n" +
    "• Uses actual annual returns for global equities (MSCI World proxy), European government bonds, " +
    "and EUR/ATS short-term rates from 1970 to 2024\n" +
    "• Rolling windows test every possible start year with the defined plan parameters\n" +
    "• Costs and tax drag are deducted from historical gross returns\n\n" +
    "Limitations\n\n" +
    "• Past performance does not guarantee future results\n" +
    "• Model assumes constant correlations and return distributions (regime changes are not modeled)\n" +
    "• Transaction costs are approximated, not precisely modeled\n" +
    "• Tax calculations are simplified — actual Austrian KESt and social security may vary\n" +
    "• Tail risks (black swans) may not be fully captured by normal distribution assumptions\n\n" +
    "This report is for informational purposes only and does not constitute investment advice.",
    {
      x: 0.5,
      y: 1.1,
      w: 9,
      h: 4.5,
      fontSize: 9,
      fontFace: "Calibri",
      color: COLORS.text,
      lineSpacing: 13,
    }
  );
}

export async function generatePowerPointReport(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  result: SimulationResult,
  historical: HistoricalAnalysis | null
): Promise<Blob> {
  const mod = await import(/* webpackIgnore: true */ "pptxgenjs");
  const PptxGenJS = mod.default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Retirement Planner Pro";
  pptx.title = `Retirement Plan — ${client.name}`;

  addTitleSlide(pptx, client);
  addFinancialSummary(pptx, client, inputs);
  addPortfolioSlide(pptx, portfolio);
  addAssumptionsSlide(pptx, inputs, portfolio, result);
  addSectionSlide(pptx, "Simulation Results", "Monte Carlo Analysis & Withdrawal Sustainability");
  addMonteCarloResults(pptx, result, inputs, client);
  addSuccessProbabilitySlide(pptx, result);
  addWithdrawalSlide(pptx, result, inputs, client);
  addRiskAnalysis(pptx, result);
  addSectionSlide(pptx, "Historical Analysis", "Backtesting with Real Market Data");
  addHistoricalSlide(pptx, historical);
  addSectionSlide(pptx, "Education & Context", "Understanding the Key Concepts");
  addEducationalSlides(pptx);
  addRecommendationsSlide(pptx, result, inputs, client);
  addAppendixSlide(pptx);

  const output = await pptx.write({ outputType: "blob" });
  return output as Blob;
}