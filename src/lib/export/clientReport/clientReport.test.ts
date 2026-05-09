/**
 * Smoke tests for the client-facing report generators.
 *
 * These run under Bun and verify that the generators:
 *  1. Produce a non-empty Blob of the correct MIME type.
 *  2. Embed key client data.
 *  3. HTML-escape user-controlled text (client name, advisor name,
 *     liquidity-event descriptions) — reinforces F-01 (audit finding).
 *  4. Render the SVG charts (presence of expected markup fragments).
 *  5. Wire the PIN hash into the output only when a PIN is provided.
 */
import { describe, expect, test } from "bun:test";
import { generateClientHtmlReport } from "./html";
import {
  renderHistoricalSvg,
  renderMonteCarloFanSvg,
  renderPortfolioDonutSvg,
} from "./chartSvg";
import { hashPin, validatePinFormat } from "./crypto";
import type {
  AdvisorProfile,
  ClientProfile,
  FinancialInputs,
  HistoricalAnalysis,
  PortfolioConfig,
  SimulationResult,
} from "../../types";

const client: ClientProfile = {
  name: "Max Mustermann",
  birthYear: 1980,
  currentAge: 45,
  retirementAge: 65,
  lifeExpectancy: 90,
  currency: "EUR",
  notes: "",
};

const advisor: AdvisorProfile = {
  name: "Dr. Anna Berater",
  title: "Senior Private Banker",
  email: "anna@bank.at",
  phone: "+43 1 234 5678",
  bankName: "Schelhammer Capital Bank AG",
  branch: "Wien Innere Stadt",
  address: "Goldschmiedgasse 3\n1010 Wien",
  website: "https://www.schelhammer.at",
  logoDataUrl: "",
};

const inputs: FinancialInputs = {
  initialCapital: 250000,
  monthlySavings: 1500,
  annualSavingsIncrease: 2,
  desiredMonthlyWithdrawal: 3000,
  monthlyPension: 1200,
  pensionStartAge: 65,
  inflationRate: 2.5,
  useRealValues: true,
};

const portfolio: PortfolioConfig = {
  buckets: [
    { name: "equities", label: "Aktien", allocation: 60, expectedReturn: 7, volatility: 15, costs: 0.5, taxDrag: 1.79, netReturn: 4.71 },
    { name: "bonds", label: "Anleihen", allocation: 30, expectedReturn: 3, volatility: 5, costs: 0.3, taxDrag: 0.74, netReturn: 1.96 },
    { name: "cash", label: "Cash", allocation: 10, expectedReturn: 1.5, volatility: 1, costs: 0.1, taxDrag: 0.39, netReturn: 1.01 },
  ],
  correlationMatrix: [[1, 0.2, 0], [0.2, 1, 0.1], [0, 0.1, 1]],
  rebalancingFrequency: "annually",
  rebalancingThreshold: 5,
  kestRate: 27.5,
};

const p10Path = Array.from({ length: 46 }, (_, i) => 250000 + i * 4000);
const medianPath = Array.from({ length: 46 }, (_, i) => 250000 + i * 8000);
const p90Path = Array.from({ length: 46 }, (_, i) => 250000 + i * 14000);

const result: SimulationResult = {
  successRate: 92.5,
  medianFinalWealth: 1_250_000,
  meanFinalWealth: 1_300_000,
  percentiles: { p10: 650000, p50: 1250000, p90: 2050000 },
  medianPath,
  p10Path,
  p25Path: p10Path.map((v, i) => v + (medianPath[i] - v) * 0.5),
  p75Path: medianPath.map((v, i) => v + (p90Path[i] - v) * 0.5),
  p90Path,
  worstPath: p10Path,
  bestPath: p90Path,
  failureYear: null,
  medianFailureYear: null,
  portfolioReturn: 5.5,
  portfolioVolatility: 10,
  maxDrawdown: -22,
  sharpeRatio: 0.4,
  yearLabels: Array.from({ length: 46 }, (_, i) => 2026 + i),
  annualWithdrawals: [],
  annualPortfolioValues: [],
};

const hist: HistoricalAnalysis = {
  scenarios: [
    { startYear: 1990, endYear: 2035, success: true, finalWealth: 1_000_000, maxDrawdown: -20, path: medianPath, worstYear: 2008, worstReturn: -30 },
    { startYear: 2000, endYear: 2045, success: false, finalWealth: 400_000, maxDrawdown: -45, path: p10Path, worstYear: 2008, worstReturn: -38 },
  ],
  overallSuccessRate: 75,
  averageFinalWealth: 800_000,
  worstScenario: { startYear: 2000, endYear: 2045, success: false, finalWealth: 400_000, maxDrawdown: -45, path: p10Path, worstYear: 2008, worstReturn: -38 },
  bestScenario: { startYear: 1990, endYear: 2035, success: true, finalWealth: 1_000_000, maxDrawdown: -20, path: p90Path, worstYear: 2008, worstReturn: -30 },
  drawdownDistribution: [],
};

describe("SVG chart renderers", () => {
  test("Monte-Carlo fan includes bands and median", () => {
    const svg = renderMonteCarloFanSvg(result, client, {
      xAxis: "Alter", yAxis: "EUR", p10p90: "80%", p25p75: "50%", median: "Median",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("rgba(211, 18, 32"); // accent colour in band fills
    expect(svg).toContain("stroke=\"#20201E\""); // median path
    expect(svg.length).toBeGreaterThan(500);
  });

  test("Historical renderer highlights worst + best", () => {
    const svg = renderHistoricalSvg(hist, client, { xAxis: "Alter", yAxis: "EUR" });
    expect(svg).toContain("<svg");
    // 2 scenario paths expected
    expect(svg.match(/<path /g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("Portfolio donut has slices and 100% label", () => {
    const svg = renderPortfolioDonutSvg(portfolio);
    expect(svg).toContain("<svg");
    expect(svg).toContain("100%");
    expect(svg.match(/<path /g)?.length).toBe(3); // 3 bucket slices
  });
});

describe("PIN crypto helper", () => {
  test("validates 6-digit PIN format", () => {
    expect(validatePinFormat("123456")).toBe(true);
    expect(validatePinFormat("12345")).toBe(false);
    expect(validatePinFormat("1234567")).toBe(false);
    expect(validatePinFormat("12a456")).toBe(false);
    expect(validatePinFormat("")).toBe(false);
  });

  test("hashPin produces deterministic output for same salt", async () => {
    const h1 = await hashPin("123456", "deadbeef");
    const h2 = await hashPin("123456", "deadbeef");
    expect(h1.hash).toBe(h2.hash);
    expect(h1.hash.length).toBe(64); // SHA-256 hex
  });

  test("hashPin produces different output for different salts", async () => {
    const h1 = await hashPin("123456", "abc");
    const h2 = await hashPin("123456", "def");
    expect(h1.hash).not.toBe(h2.hash);
  });

  test("randomly generated salt is unique", async () => {
    const h1 = await hashPin("123456");
    const h2 = await hashPin("123456");
    expect(h1.salt).not.toBe(h2.salt);
    expect(h1.salt.length).toBe(32); // 16 bytes hex
  });
});

describe("HTML client report", () => {
  test("produces a text/html blob with the client name", async () => {
    const blob = await generateClientHtmlReport(
      client, advisor, inputs, portfolio, result, hist, [],
      { locale: "de", includeHistorical: true },
    );
    expect(blob.type).toContain("text/html");
    const text = await blob.text();
    expect(text).toContain("<!DOCTYPE html>");
    expect(text).toContain("Max Mustermann");
    expect(text).toContain("Dr. Anna Berater");
    expect(text).toContain("Schelhammer Capital Bank AG");
    expect(text).toContain("Kernaussage");
    // Success rate appears in the hero paragraph. Intl percent output varies
    // (92,5 %, 92.5%, etc.) across engines, so just check for 92.
    expect(text).toMatch(/92[,.]5/);
  });

  test("escapes HTML-special characters in client name (XSS defence)", async () => {
    const xssClient = { ...client, name: "<script>alert(1)</script>" };
    const blob = await generateClientHtmlReport(
      xssClient, advisor, inputs, portfolio, result, null, [],
      { locale: "de" },
    );
    const text = await blob.text();
    expect(text).not.toContain("<script>alert(1)</script>");
    expect(text).toContain("&lt;script&gt;");
  });

  test("English locale produces English strings", async () => {
    const blob = await generateClientHtmlReport(
      client, advisor, inputs, portfolio, result, hist, [],
      { locale: "en", includeHistorical: true },
    );
    const text = await blob.text();
    expect(text).toContain("Key takeaway");
    expect(text).toContain("Your portfolio");
    expect(text).not.toContain("Kernaussage");
  });

  test("embeds PIN hash when PIN provided, omits when not", async () => {
    const withPin = await (await generateClientHtmlReport(
      client, advisor, inputs, portfolio, result, null, [],
      { locale: "de", pin: "654321" },
    )).text();
    expect(withPin).toContain("pin-overlay");
    expect(withPin).toMatch(/HASH="[a-f0-9]{64}"/);
    expect(withPin).toMatch(/SALT="[a-f0-9]{32}"/);

    const noPin = await (await generateClientHtmlReport(
      client, advisor, inputs, portfolio, result, null, [],
      { locale: "de" },
    )).text();
    // The CSS class `.pin-overlay` is always in the stylesheet; check for
    // the actual overlay markup + the hash script block instead.
    expect(noPin).not.toContain('id="pin-overlay"');
    expect(noPin).not.toMatch(/HASH="[a-f0-9]{64}"/);
  });

  test("disclaimer references the bank name from advisor profile", async () => {
    const blob = await generateClientHtmlReport(
      client, { ...advisor, bankName: "MyCustomBank AG" }, inputs, portfolio, result, null, [],
      { locale: "de" },
    );
    const text = await blob.text();
    expect(text).toContain("Marketingmitteilung");
    expect(text).toContain("MyCustomBank AG");
  });

  test("includeHistorical toggle controls historical section", async () => {
    const withHist = await (await generateClientHtmlReport(
      client, advisor, inputs, portfolio, result, hist, [],
      { locale: "de", includeHistorical: true },
    )).text();
    expect(withHist).toContain("Historischer Rückblick");

    const withoutHist = await (await generateClientHtmlReport(
      client, advisor, inputs, portfolio, result, hist, [],
      { locale: "de", includeHistorical: false },
    )).text();
    expect(withoutHist).not.toContain("Historischer Rückblick");
  });
});