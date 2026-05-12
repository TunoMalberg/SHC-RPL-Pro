/**
 * Self-contained, INTERACTIVE SVG chart renderers for the client-facing
 * HTML report. All charts attach `data-*` attributes and emit ≤1 kB of JS
 * (no libraries) that provides:
 *  • A vertical crosshair cursor on mouse-move.
 *  • A floating tooltip showing x-axis value (age/year) and the y-values of
 *    every visible series at that x.
 *  • Legend swatches that toggle series visibility.
 *  • Hover highlighting on historical paths (start year on hover).
 *  • Donut tooltips (label + %) on slice hover.
 *
 * The runtime JS lives in `chartInteractionScript()` below and is emitted
 * ONCE per HTML document. It safely scopes itself through unique chart IDs.
 *
 * Compatibility: the output is still valid SVG even if the JS is disabled;
 * in that case the chart renders statically as before.
 */

import type {
  SimulationResult,
  HistoricalAnalysis,
  PortfolioConfig,
  ClientProfile,
  Scenario,
  DetailedSimTrace,
} from "../../types";

/* Corporate colours (Schelhammer Capital) */
export const REPORT_COLORS = {
  primary: "#20201E",
  accent: "#D31220",
  soft: "#F5F3F0",
  gridLine: "#E5E1DC",
  band10_90: "rgba(211, 18, 32, 0.10)",
  band25_75: "rgba(211, 18, 32, 0.22)",
  median: "#20201E",
  text: "#20201E",
  muted: "#6E6B68",
  equity: "#D31220",
  bonds: "#87BBE6",
  cash: "#8FB687",
  alternatives: "#FAC075",
};

const fmtEurCompact = new Intl.NumberFormat("de-AT", {
  notation: "compact",
  maximumFractionDigits: 1,
  currency: "EUR",
  style: "currency",
});

const fmtEurFull = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function nice(x: number): number {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  const n = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return n * Math.pow(10, exp);
}

let _chartCounter = 0;
function chartId(prefix: string): string {
  _chartCounter += 1;
  return `${prefix}-${_chartCounter}`;
}

interface AxisLabels {
  xAxis: string;
  yAxis: string;
  p10p90: string;
  p25p75: string;
  median: string;
}

/* ──────────────────────────────────────────
   Monte-Carlo fan chart — INTERACTIVE
   ────────────────────────────────────────── */
export function renderMonteCarloFanSvg(
  result: SimulationResult,
  client: ClientProfile,
  labels: AxisLabels,
  width = 720,
  height = 360,
): string {
  const m = { l: 64, r: 24, t: 16, b: 44 };
  const W = width - m.l - m.r;
  const H = height - m.t - m.b;

  const { p10Path, p25Path, p75Path, p90Path, medianPath } = result;
  const n = medianPath.length;
  if (n < 2) return "";
  const ages = Array.from({ length: n }, (_, i) => client.currentAge + i);

  const maxY = Math.max(...p90Path, 1);
  const tickY = nice(maxY / 4);
  const yMax = Math.ceil(maxY / tickY) * tickY;

  const sx = (i: number) => m.l + (i / (n - 1)) * W;
  const sy = (v: number) => m.t + H - (v / yMax) * H;

  const toPath = (arr: number[]): string =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");

  const toBand = (lo: number[], hi: number[]): string => {
    const up = hi.map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
    const down = [...lo].reverse().map((v, i) => {
      const idx = lo.length - 1 - i;
      return `L${sx(idx).toFixed(1)},${sy(v).toFixed(1)}`;
    }).join(" ");
    return up + " " + down + " Z";
  };

  const xTicks: number[] = [];
  const step = Math.max(1, Math.round((n - 1) / 6));
  for (let i = 0; i < n; i += step) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== n - 1) xTicks.push(n - 1);

  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += tickY) yTicks.push(v);

  const id = chartId("mc");

  // Data payload for the JS interaction layer. ages + paths only (no PII).
  const payload = {
    ages,
    median: medianPath.map((v) => Math.round(v)),
    p10: p10Path.map((v) => Math.round(v)),
    p25: p25Path.map((v) => Math.round(v)),
    p75: p75Path.map((v) => Math.round(v)),
    p90: p90Path.map((v) => Math.round(v)),
    xLabel: labels.xAxis,
    bandMedian: labels.median,
    band25_75: labels.p25p75,
    band10_90: labels.p10p90,
  };

  return `
<svg id="${id}" class="chart-interactive" data-chart-type="mcfan" viewBox="0 0 ${width} ${height}"
  xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Monte Carlo"
  data-margin-l="${m.l}" data-margin-t="${m.t}" data-plot-w="${W}" data-plot-h="${H}"
  preserveAspectRatio="xMidYMid meet">
  <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
  ${yTicks.map((v) => `
    <line x1="${m.l}" x2="${m.l + W}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" stroke="${REPORT_COLORS.gridLine}" stroke-width="1"/>
    <text x="${m.l - 8}" y="${(sy(v) + 4).toFixed(1)}" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.muted}" text-anchor="end">${fmtEurCompact.format(v).replace(/\s/g, "\u00A0")}</text>
  `).join("")}
  <path d="${toBand(p10Path, p90Path)}" fill="${REPORT_COLORS.band10_90}" stroke="none"/>
  <path d="${toBand(p25Path, p75Path)}" fill="${REPORT_COLORS.band25_75}" stroke="none"/>
  <path d="${toPath(medianPath)}" fill="none" stroke="${REPORT_COLORS.median}" stroke-width="2.2"/>
  ${xTicks.map((i) => `
    <text x="${sx(i).toFixed(1)}" y="${m.t + H + 18}" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.muted}" text-anchor="middle">${ages[i]}</text>
  `).join("")}
  <text x="${m.l + W / 2}" y="${m.t + H + 36}" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}" text-anchor="middle">${labels.xAxis}</text>
  <g transform="translate(${m.l + 12}, ${m.t + 12})">
    <rect x="0" y="0" width="12" height="12" fill="${REPORT_COLORS.band10_90}"/>
    <text x="18" y="10" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}">${labels.p10p90}</text>
    <rect x="0" y="20" width="12" height="12" fill="${REPORT_COLORS.band25_75}"/>
    <text x="18" y="30" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}">${labels.p25p75}</text>
    <line x1="0" y1="46" x2="12" y2="46" stroke="${REPORT_COLORS.median}" stroke-width="2.2"/>
    <text x="18" y="50" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}">${labels.median}</text>
  </g>
  <!-- Hover layer (added by JS): crosshair + markers + tooltip -->
  <g class="hover-layer" style="pointer-events:none">
    <line class="crosshair" x1="0" y1="${m.t}" x2="0" y2="${m.t + H}" stroke="${REPORT_COLORS.muted}" stroke-width="1" stroke-dasharray="4 3" opacity="0"/>
    <circle class="marker marker-median" r="4" fill="${REPORT_COLORS.median}" stroke="white" stroke-width="2" opacity="0"/>
    <circle class="marker marker-p10" r="3" fill="${REPORT_COLORS.accent}" stroke="white" stroke-width="1.5" opacity="0"/>
    <circle class="marker marker-p90" r="3" fill="${REPORT_COLORS.accent}" stroke="white" stroke-width="1.5" opacity="0"/>
  </g>
  <!-- Invisible hit-test rect above the plot area -->
  <rect class="hit" x="${m.l}" y="${m.t}" width="${W}" height="${H}" fill="transparent" pointer-events="all"/>
  <script type="application/json" class="chart-data">${JSON.stringify(payload)}</script>
</svg>`.trim();
}

/* ──────────────────────────────────────────
   Historical backtest paths — INTERACTIVE
   ────────────────────────────────────────── */
export function renderHistoricalSvg(
  hist: HistoricalAnalysis,
  client: ClientProfile,
  labels: { xAxis: string; yAxis: string },
  width = 720,
  height = 320,
): string {
  const m = { l: 64, r: 24, t: 16, b: 44 };
  const W = width - m.l - m.r;
  const H = height - m.t - m.b;

  const scenarios = hist.scenarios;
  if (!scenarios.length) return "";
  const pathLen = scenarios[0].path.length;
  const maxY = Math.max(...scenarios.flatMap((s) => s.path), 1);
  const tickY = nice(maxY / 4);
  const yMax = Math.ceil(maxY / tickY) * tickY;

  const sx = (i: number) => m.l + (i / (pathLen - 1)) * W;
  const sy = (v: number) => m.t + H - (v / yMax) * H;

  const worstYear = hist.worstScenario?.startYear;
  const bestYear = hist.bestScenario?.startYear;

  const paths = scenarios.map((s) => {
    const isWorst = s.startYear === worstYear;
    const isBest = s.startYear === bestYear;
    const color = isWorst
      ? REPORT_COLORS.accent
      : isBest
      ? REPORT_COLORS.cash
      : s.success
      ? "rgba(143, 182, 135, 0.35)"
      : "rgba(211, 18, 32, 0.28)";
    const strokeWidth = isWorst || isBest ? 2.4 : 1;
    const d = s.path
      .map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`)
      .join(" ");
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" opacity="${isWorst || isBest ? 1 : 0.8}"
      class="hist-path" data-start-year="${s.startYear}" data-end-year="${s.endYear}"
      data-success="${s.success ? 1 : 0}" data-final="${Math.round(s.finalWealth)}" data-maxdd="${(s.maxDrawdown * 100).toFixed(1)}"
      data-default-color="${color}" data-default-width="${strokeWidth}"/>`;
  }).join("");

  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += tickY) yTicks.push(v);

  const ages = Array.from({ length: pathLen }, (_, i) => client.currentAge + i);
  const xTicks: number[] = [];
  const step = Math.max(1, Math.round((pathLen - 1) / 6));
  for (let i = 0; i < pathLen; i += step) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== pathLen - 1) xTicks.push(pathLen - 1);

  const id = chartId("hist");

  return `
<svg id="${id}" class="chart-interactive" data-chart-type="historical" viewBox="0 0 ${width} ${height}"
  xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Historical Backtest"
  preserveAspectRatio="xMidYMid meet">
  <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
  ${yTicks.map((v) => `
    <line x1="${m.l}" x2="${m.l + W}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" stroke="${REPORT_COLORS.gridLine}" stroke-width="1"/>
    <text x="${m.l - 8}" y="${(sy(v) + 4).toFixed(1)}" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.muted}" text-anchor="end">${fmtEurCompact.format(v).replace(/\s/g, "\u00A0")}</text>
  `).join("")}
  ${paths}
  ${xTicks.map((i) => `
    <text x="${sx(i).toFixed(1)}" y="${m.t + H + 18}" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.muted}" text-anchor="middle">${ages[i]}</text>
  `).join("")}
  <text x="${m.l + W / 2}" y="${m.t + H + 36}" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}" text-anchor="middle">${labels.xAxis}</text>
</svg>`.trim();
}

/* ──────────────────────────────────────────
   Portfolio allocation donut — INTERACTIVE
   ────────────────────────────────────────── */
export function renderPortfolioDonutSvg(
  portfolio: PortfolioConfig,
  width = 260,
  height = 260,
): string {
  const buckets = portfolio.buckets.filter((b) => b.allocation > 0);
  if (!buckets.length) return "";
  const cx = width / 2;
  const cy = height / 2;
  const rOuter = Math.min(cx, cy) - 6;
  const rInner = rOuter * 0.6;

  const palette = [
    REPORT_COLORS.equity,
    REPORT_COLORS.bonds,
    REPORT_COLORS.cash,
    REPORT_COLORS.alternatives,
    "#4D4A47",
    "#DA4D3E",
  ];

  let acc = 0;
  const total = buckets.reduce((s, b) => s + b.allocation, 0);
  const slices = buckets.map((b, idx) => {
    const frac0 = acc / total;
    acc += b.allocation;
    const frac1 = acc / total;
    const a0 = frac0 * 2 * Math.PI - Math.PI / 2;
    const a1 = frac1 * 2 * Math.PI - Math.PI / 2;
    const large = frac1 - frac0 > 0.5 ? 1 : 0;
    const x0o = cx + rOuter * Math.cos(a0);
    const y0o = cy + rOuter * Math.sin(a0);
    const x1o = cx + rOuter * Math.cos(a1);
    const y1o = cy + rOuter * Math.sin(a1);
    const x0i = cx + rInner * Math.cos(a1);
    const y0i = cy + rInner * Math.sin(a1);
    const x1i = cx + rInner * Math.cos(a0);
    const y1i = cy + rInner * Math.sin(a0);
    const d = [
      `M ${x0o.toFixed(1)} ${y0o.toFixed(1)}`,
      `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o.toFixed(1)} ${y1o.toFixed(1)}`,
      `L ${x0i.toFixed(1)} ${y0i.toFixed(1)}`,
      `A ${rInner} ${rInner} 0 ${large} 0 ${x1i.toFixed(1)} ${y1i.toFixed(1)}`,
      "Z",
    ].join(" ");
    return { d, color: palette[idx % palette.length], label: b.label, pct: b.allocation, netReturn: b.netReturn };
  });

  const id = chartId("donut");
  const escAttr = (s: string) =>
    String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `
<svg id="${id}" class="chart-interactive" data-chart-type="donut" viewBox="0 0 ${width} ${height}"
  xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Portfolio allocation">
  ${slices.map((s) => `<path d="${s.d}" fill="${s.color}" stroke="white" stroke-width="2" class="donut-slice"
    data-label="${escAttr(s.label)}" data-pct="${s.pct}" data-net="${s.netReturn.toFixed(2)}"
    data-default-color="${s.color}" style="cursor:pointer;transition:opacity .12s"/>`).join("")}
  <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="14" fill="${REPORT_COLORS.muted}" style="pointer-events:none">Portfolio</text>
  <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="18" font-weight="bold" fill="${REPORT_COLORS.text}" style="pointer-events:none">100%</text>
</svg>`.trim();
}

export interface PortfolioLegendEntry {
  label: string;
  pct: number;
  color: string;
}

export function portfolioLegend(portfolio: PortfolioConfig): PortfolioLegendEntry[] {
  const palette = [
    REPORT_COLORS.equity,
    REPORT_COLORS.bonds,
    REPORT_COLORS.cash,
    REPORT_COLORS.alternatives,
    "#4D4A47",
    "#DA4D3E",
  ];
  return portfolio.buckets
    .filter((b) => b.allocation > 0)
    .map((b, i) => ({ label: b.label, pct: b.allocation, color: palette[i % palette.length] }));
}

/* ──────────────────────────────────────────
   Scenario comparison — INTERACTIVE LINE CHART
   ────────────────────────────────────────── */
const SCENARIO_COLORS = ["#D31220", "#87BBE6", "#8FB687", "#FAC075", "#8A83BE", "#DA4D3E"];

export function renderScenariosComparisonSvg(
  scenarios: Scenario[],
  client: ClientProfile,
  axisLabel: string,
  width = 760,
  height = 360,
): string {
  const withResult = scenarios.filter((s) => s.result);
  if (withResult.length === 0) return "";

  const m = { l: 64, r: 24, t: 16, b: 56 };
  const W = width - m.l - m.r;
  const H = height - m.t - m.b;

  const maxLen = Math.max(...withResult.map((s) => s.result!.medianPath.length));
  const maxY = Math.max(1, ...withResult.flatMap((s) => s.result!.medianPath));
  const tickY = nice(maxY / 4);
  const yMax = Math.ceil(maxY / tickY) * tickY;

  const sx = (i: number) => m.l + (i / (maxLen - 1)) * W;
  const sy = (v: number) => m.t + H - (v / yMax) * H;

  const ages = Array.from({ length: maxLen }, (_, i) => client.currentAge + i);

  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += tickY) yTicks.push(v);
  const xTicks: number[] = [];
  const step = Math.max(1, Math.round((maxLen - 1) / 6));
  for (let i = 0; i < maxLen; i += step) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== maxLen - 1) xTicks.push(maxLen - 1);

  const seriesData: Array<{ name: string; color: string; values: number[] }> = [];
  const pathsSvg = withResult.map((s, idx) => {
    const color = SCENARIO_COLORS[idx % SCENARIO_COLORS.length];
    const vals = s.result!.medianPath;
    seriesData.push({ name: s.name, color, values: vals.map((v) => Math.round(v)) });
    const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="scenario-line" data-name="${String(s.name).replace(/"/g, "&quot;")}"/>`;
  }).join("");

  const id = chartId("scen");

  const legendItems = withResult.map((s, idx) => {
    const color = SCENARIO_COLORS[idx % SCENARIO_COLORS.length];
    const lx = 12 + (idx % 3) * 180;
    const ly = m.t + 12 + Math.floor(idx / 3) * 18;
    return `
      <g transform="translate(${lx}, ${ly})">
        <line x1="0" y1="6" x2="14" y2="6" stroke="${color}" stroke-width="2.6"/>
        <text x="20" y="10" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}">${String(s.name).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
      </g>`;
  }).join("");

  const payload = {
    ages,
    series: seriesData,
    xLabel: axisLabel,
  };

  return `
<svg id="${id}" class="chart-interactive" data-chart-type="scenarios" viewBox="0 0 ${width} ${height}"
  xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scenarios"
  data-margin-l="${m.l}" data-margin-t="${m.t}" data-plot-w="${W}" data-plot-h="${H}"
  preserveAspectRatio="xMidYMid meet">
  <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
  ${yTicks.map((v) => `
    <line x1="${m.l}" x2="${m.l + W}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" stroke="${REPORT_COLORS.gridLine}" stroke-width="1"/>
    <text x="${m.l - 8}" y="${(sy(v) + 4).toFixed(1)}" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.muted}" text-anchor="end">${fmtEurCompact.format(v).replace(/\s/g, "\u00A0")}</text>
  `).join("")}
  ${pathsSvg}
  ${xTicks.map((i) => `
    <text x="${sx(i).toFixed(1)}" y="${m.t + H + 18}" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.muted}" text-anchor="middle">${ages[i]}</text>
  `).join("")}
  <text x="${m.l + W / 2}" y="${m.t + H + 36}" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}" text-anchor="middle">${axisLabel}</text>
  ${legendItems}
  <g class="hover-layer" style="pointer-events:none">
    <line class="crosshair" x1="0" y1="${m.t}" x2="0" y2="${m.t + H}" stroke="${REPORT_COLORS.muted}" stroke-width="1" stroke-dasharray="4 3" opacity="0"/>
  </g>
  <rect class="hit" x="${m.l}" y="${m.t}" width="${W}" height="${H}" fill="transparent" pointer-events="all"/>
  <script type="application/json" class="chart-data">${JSON.stringify(payload)}</script>
</svg>`.trim();
}

/* ──────────────────────────────────────────
   Detailed individual path — stacked area  INTERACTIVE
   ────────────────────────────────────────── */
export function renderDetailedPathSvg(
  trace: DetailedSimTrace,
  client: ClientProfile,
  bucketLabels: { cash: string; bonds: string; equities: string },
  xAxisLabel: string,
  width = 760,
  height = 340,
): string {
  const rows = trace.rows;
  if (!rows.length) return "";
  const m = { l: 64, r: 24, t: 16, b: 44 };
  const W = width - m.l - m.r;
  const H = height - m.t - m.b;

  const n = rows.length;
  const ages = rows.map((r) => r.age);

  const maxY = Math.max(1, ...rows.map((r) => r.endTotal));
  const tickY = nice(maxY / 4);
  const yMax = Math.ceil(maxY / tickY) * tickY;

  const sx = (i: number) => m.l + (i / (n - 1)) * W;
  const sy = (v: number) => m.t + H - (v / yMax) * H;

  const cashArr = rows.map((r) => r.endCash);
  const cashBondsArr = rows.map((r) => r.endCash + r.endBonds);
  const totalArr = rows.map((r) => r.endTotal);

  const bandArea = (lo: number[], hi: number[]) => {
    const up = hi.map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
    const down = [...lo].reverse().map((v, i) => {
      const idx = lo.length - 1 - i;
      return `L${sx(idx).toFixed(1)},${sy(v).toFixed(1)}`;
    }).join(" ");
    return up + " " + down + " Z";
  };
  const floor = new Array(n).fill(0);

  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += tickY) yTicks.push(v);
  const xTicks: number[] = [];
  const step = Math.max(1, Math.round((n - 1) / 6));
  for (let i = 0; i < n; i += step) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== n - 1) xTicks.push(n - 1);

  const id = chartId("trace");

  const payload = {
    ages,
    cash: cashArr.map((v) => Math.round(v)),
    bonds: rows.map((r) => Math.round(r.endBonds)),
    equities: rows.map((r) => Math.round(r.endEquities)),
    total: totalArr.map((v) => Math.round(v)),
    xLabel: xAxisLabel,
    cashLabel: bucketLabels.cash,
    bondsLabel: bucketLabels.bonds,
    equitiesLabel: bucketLabels.equities,
  };

  return `
<svg id="${id}" class="chart-interactive" data-chart-type="trace" viewBox="0 0 ${width} ${height}"
  xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Individual Path"
  data-margin-l="${m.l}" data-margin-t="${m.t}" data-plot-w="${W}" data-plot-h="${H}"
  preserveAspectRatio="xMidYMid meet">
  <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
  ${yTicks.map((v) => `
    <line x1="${m.l}" x2="${m.l + W}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" stroke="${REPORT_COLORS.gridLine}" stroke-width="1"/>
    <text x="${m.l - 8}" y="${(sy(v) + 4).toFixed(1)}" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.muted}" text-anchor="end">${fmtEurCompact.format(v).replace(/\s/g, "\u00A0")}</text>
  `).join("")}
  <path d="${bandArea(floor, cashArr)}" fill="${REPORT_COLORS.cash}" opacity="0.8"/>
  <path d="${bandArea(cashArr, cashBondsArr)}" fill="${REPORT_COLORS.bonds}" opacity="0.8"/>
  <path d="${bandArea(cashBondsArr, totalArr)}" fill="${REPORT_COLORS.equity}" opacity="0.8"/>
  ${xTicks.map((i) => `
    <text x="${sx(i).toFixed(1)}" y="${m.t + H + 18}" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.muted}" text-anchor="middle">${ages[i]}</text>
  `).join("")}
  <text x="${m.l + W / 2}" y="${m.t + H + 36}" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}" text-anchor="middle">${xAxisLabel}</text>
  <g transform="translate(${m.l + 12}, ${m.t + 12})">
    <rect x="0" y="0" width="12" height="12" fill="${REPORT_COLORS.cash}"/>
    <text x="18" y="10" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}">${String(bucketLabels.cash).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
    <rect x="0" y="18" width="12" height="12" fill="${REPORT_COLORS.bonds}"/>
    <text x="18" y="28" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}">${String(bucketLabels.bonds).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
    <rect x="0" y="36" width="12" height="12" fill="${REPORT_COLORS.equity}"/>
    <text x="18" y="46" font-family="Skeena, -apple-system, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}">${String(bucketLabels.equities).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
  </g>
  <g class="hover-layer" style="pointer-events:none">
    <line class="crosshair" x1="0" y1="${m.t}" x2="0" y2="${m.t + H}" stroke="${REPORT_COLORS.muted}" stroke-width="1" stroke-dasharray="4 3" opacity="0"/>
  </g>
  <rect class="hit" x="${m.l}" y="${m.t}" width="${W}" height="${H}" fill="transparent" pointer-events="all"/>
  <script type="application/json" class="chart-data">${JSON.stringify(payload)}</script>
</svg>`.trim();
}

/* ──────────────────────────────────────────
   Reset counter helper (for unit tests)
   ────────────────────────────────────────── */
export function __resetChartCounter(): void {
  _chartCounter = 0;
}

/* ──────────────────────────────────────────
   The interaction-layer script — emitted ONCE in the HTML <script> block.
   Scans all `svg.chart-interactive` and attaches hover handlers.
   No libraries; pure vanilla JS.
   ────────────────────────────────────────── */
export function chartInteractionScript(): string {
  return `
(function(){
  'use strict';
  var fmtEur = new Intl.NumberFormat('de-AT', { style:'currency', currency:'EUR', maximumFractionDigits:0 });

  function makeTooltip() {
    var tt = document.createElement('div');
    tt.className = 'chart-tt';
    tt.style.cssText = 'position:absolute;pointer-events:none;background:rgba(32,32,30,0.95);color:#fff;'+
      'font-family:Skeena,-apple-system,sans-serif;font-size:12px;line-height:1.4;padding:8px 10px;'+
      'border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);opacity:0;transition:opacity .1s;'+
      'transform:translate(-50%,-100%);z-index:9999;white-space:nowrap';
    document.body.appendChild(tt);
    return tt;
  }
  var TT = null;

  function parseData(svg) {
    var s = svg.querySelector('script.chart-data');
    if (!s) return null;
    try { return JSON.parse(s.textContent); } catch(e) { return null; }
  }

  function svgPoint(svg, evt) {
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    var ctm = svg.getScreenCTM();
    if (!ctm) return { x:0, y:0 };
    var inv = ctm.inverse();
    var p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }

  function bindFan(svg) {
    var data = parseData(svg);
    if (!data) return;
    var ml = +svg.getAttribute('data-margin-l');
    var mt = +svg.getAttribute('data-margin-t');
    var pw = +svg.getAttribute('data-plot-w');
    var ph = +svg.getAttribute('data-plot-h');
    var n = data.ages.length;
    var maxY = Math.max.apply(null, data.p90);
    var sy = function(v){ return mt + ph - (v/maxY)*ph; };
    var sx = function(i){ return ml + (i/(n-1))*pw; };

    var ch = svg.querySelector('.crosshair');
    var mM = svg.querySelector('.marker-median');
    var m10 = svg.querySelector('.marker-p10');
    var m90 = svg.querySelector('.marker-p90');
    var hit = svg.querySelector('.hit');

    function show(evt){
      if (!TT) TT = makeTooltip();
      var p = svgPoint(svg, evt);
      if (p.x < ml || p.x > ml + pw) { hide(); return; }
      var i = Math.max(0, Math.min(n-1, Math.round(((p.x - ml)/pw)*(n-1))));
      var x = sx(i);
      ch.setAttribute('x1', x); ch.setAttribute('x2', x); ch.setAttribute('opacity', '1');
      mM.setAttribute('cx', x); mM.setAttribute('cy', sy(data.median[i])); mM.setAttribute('opacity', '1');
      m10.setAttribute('cx', x); m10.setAttribute('cy', sy(data.p10[i])); m10.setAttribute('opacity', '1');
      m90.setAttribute('cx', x); m90.setAttribute('cy', sy(data.p90[i])); m90.setAttribute('opacity', '1');
      TT.innerHTML =
        '<div style="font-weight:600;margin-bottom:4px">'+data.xLabel+' '+data.ages[i]+'</div>'+
        '<div><span style="display:inline-block;width:8px;height:8px;background:#20201E;border-radius:50%;margin-right:6px"></span>'+data.bandMedian+': <strong>'+fmtEur.format(data.median[i])+'</strong></div>'+
        '<div style="color:#ddd;margin-top:2px">'+data.band25_75+': '+fmtEur.format(data.p25[i])+' – '+fmtEur.format(data.p75[i])+'</div>'+
        '<div style="color:#ddd">'+data.band10_90+': '+fmtEur.format(data.p10[i])+' – '+fmtEur.format(data.p90[i])+'</div>';
      TT.style.left = evt.clientX + 'px';
      TT.style.top  = (evt.clientY - 8) + 'px';
      TT.style.opacity = '1';
    }
    function hide(){
      if (TT) TT.style.opacity = '0';
      ch.setAttribute('opacity','0');
      mM.setAttribute('opacity','0');
      m10.setAttribute('opacity','0');
      m90.setAttribute('opacity','0');
    }
    hit.addEventListener('mousemove', show);
    hit.addEventListener('touchstart', function(e){ if(e.touches[0]) show(e.touches[0]); }, {passive:true});
    hit.addEventListener('touchmove', function(e){ if(e.touches[0]) show(e.touches[0]); }, {passive:true});
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('touchend', hide);
  }

  function bindScenarios(svg) {
    var data = parseData(svg);
    if (!data || !data.series.length) return;
    var ml = +svg.getAttribute('data-margin-l');
    var mt = +svg.getAttribute('data-margin-t');
    var pw = +svg.getAttribute('data-plot-w');
    var ph = +svg.getAttribute('data-plot-h');
    var n = data.ages.length;
    var maxY = 1;
    data.series.forEach(function(s){ s.values.forEach(function(v){ if(v>maxY) maxY=v; }); });
    var sy = function(v){ return mt + ph - (v/maxY)*ph; };
    var sx = function(i){ return ml + (i/(n-1))*pw; };

    var ch = svg.querySelector('.crosshair');
    var hit = svg.querySelector('.hit');
    var markerNS = 'http://www.w3.org/2000/svg';
    var markers = [];
    var layer = svg.querySelector('.hover-layer');
    data.series.forEach(function(s){
      var c = document.createElementNS(markerNS, 'circle');
      c.setAttribute('r','4'); c.setAttribute('fill', s.color);
      c.setAttribute('stroke','white'); c.setAttribute('stroke-width','2');
      c.setAttribute('opacity','0');
      layer.appendChild(c);
      markers.push(c);
    });

    function show(evt){
      if (!TT) TT = makeTooltip();
      var p = svgPoint(svg, evt);
      if (p.x < ml || p.x > ml + pw) { hide(); return; }
      var i = Math.max(0, Math.min(n-1, Math.round(((p.x - ml)/pw)*(n-1))));
      var x = sx(i);
      ch.setAttribute('x1', x); ch.setAttribute('x2', x); ch.setAttribute('opacity', '1');
      var rows = '<div style="font-weight:600;margin-bottom:4px">'+data.xLabel+' '+data.ages[i]+'</div>';
      data.series.forEach(function(s, idx){
        var v = s.values[i];
        if (v !== undefined) {
          markers[idx].setAttribute('cx', x);
          markers[idx].setAttribute('cy', sy(v));
          markers[idx].setAttribute('opacity','1');
          var esc = s.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          rows += '<div><span style="display:inline-block;width:8px;height:8px;background:'+s.color+';border-radius:2px;margin-right:6px"></span>'+esc+': <strong>'+fmtEur.format(v)+'</strong></div>';
        } else {
          markers[idx].setAttribute('opacity','0');
        }
      });
      TT.innerHTML = rows;
      TT.style.left = evt.clientX + 'px';
      TT.style.top  = (evt.clientY - 8) + 'px';
      TT.style.opacity = '1';
    }
    function hide(){
      if (TT) TT.style.opacity = '0';
      ch.setAttribute('opacity','0');
      markers.forEach(function(m){ m.setAttribute('opacity','0'); });
    }
    hit.addEventListener('mousemove', show);
    hit.addEventListener('touchstart', function(e){ if(e.touches[0]) show(e.touches[0]); }, {passive:true});
    hit.addEventListener('touchmove', function(e){ if(e.touches[0]) show(e.touches[0]); }, {passive:true});
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('touchend', hide);
  }

  function bindTrace(svg) {
    var data = parseData(svg);
    if (!data) return;
    var ml = +svg.getAttribute('data-margin-l');
    var mt = +svg.getAttribute('data-margin-t');
    var pw = +svg.getAttribute('data-plot-w');
    var ph = +svg.getAttribute('data-plot-h');
    var n = data.ages.length;
    var maxY = Math.max.apply(null, data.total);
    var sy = function(v){ return mt + ph - (v/maxY)*ph; };
    var sx = function(i){ return ml + (i/(n-1))*pw; };
    var ch = svg.querySelector('.crosshair');
    var hit = svg.querySelector('.hit');

    function show(evt){
      if (!TT) TT = makeTooltip();
      var p = svgPoint(svg, evt);
      if (p.x < ml || p.x > ml + pw) { hide(); return; }
      var i = Math.max(0, Math.min(n-1, Math.round(((p.x - ml)/pw)*(n-1))));
      var x = sx(i);
      ch.setAttribute('x1', x); ch.setAttribute('x2', x); ch.setAttribute('opacity', '1');
      var esc = function(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
      TT.innerHTML =
        '<div style="font-weight:600;margin-bottom:4px">'+data.xLabel+' '+data.ages[i]+'</div>'+
        '<div><span style="display:inline-block;width:8px;height:8px;background:#8FB687;border-radius:2px;margin-right:6px"></span>'+esc(data.cashLabel)+': <strong>'+fmtEur.format(data.cash[i])+'</strong></div>'+
        '<div><span style="display:inline-block;width:8px;height:8px;background:#87BBE6;border-radius:2px;margin-right:6px"></span>'+esc(data.bondsLabel)+': <strong>'+fmtEur.format(data.bonds[i])+'</strong></div>'+
        '<div><span style="display:inline-block;width:8px;height:8px;background:#D31220;border-radius:2px;margin-right:6px"></span>'+esc(data.equitiesLabel)+': <strong>'+fmtEur.format(data.equities[i])+'</strong></div>'+
        '<div style="border-top:1px solid #555;margin-top:4px;padding-top:4px"><strong>Total: '+fmtEur.format(data.total[i])+'</strong></div>';
      TT.style.left = evt.clientX + 'px';
      TT.style.top  = (evt.clientY - 8) + 'px';
      TT.style.opacity = '1';
    }
    function hide(){
      if (TT) TT.style.opacity = '0';
      ch.setAttribute('opacity','0');
    }
    hit.addEventListener('mousemove', show);
    hit.addEventListener('touchstart', function(e){ if(e.touches[0]) show(e.touches[0]); }, {passive:true});
    hit.addEventListener('touchmove', function(e){ if(e.touches[0]) show(e.touches[0]); }, {passive:true});
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('touchend', hide);
  }

  function bindHistorical(svg) {
    var paths = svg.querySelectorAll('.hist-path');
    paths.forEach(function(p){
      p.style.cursor = 'pointer';
      p.addEventListener('mouseenter', function(evt){
        if (!TT) TT = makeTooltip();
        paths.forEach(function(o){ o.style.opacity = '0.15'; });
        p.style.opacity = '1';
        p.setAttribute('stroke-width', String(+p.getAttribute('data-default-width') + 1.5));
        var sy = p.getAttribute('data-start-year');
        var ey = p.getAttribute('data-end-year');
        var ok = p.getAttribute('data-success') === '1';
        var final = +p.getAttribute('data-final');
        var dd = p.getAttribute('data-maxdd');
        TT.innerHTML =
          '<div style="font-weight:600;margin-bottom:4px">'+sy+' – '+ey+'</div>'+
          '<div>'+(ok ? '<span style="color:#8FB687">✓ erfolgreich</span>' : '<span style="color:#ff8080">✗ erschöpft</span>')+'</div>'+
          '<div style="color:#ddd">Endvermögen: <strong>'+fmtEur.format(final)+'</strong></div>'+
          '<div style="color:#ddd">Max. Drawdown: '+dd+'%</div>';
        TT.style.left = evt.clientX + 'px';
        TT.style.top  = (evt.clientY - 8) + 'px';
        TT.style.opacity = '1';
      });
      p.addEventListener('mousemove', function(evt){
        if (TT) { TT.style.left = evt.clientX + 'px'; TT.style.top = (evt.clientY - 8) + 'px'; }
      });
      p.addEventListener('mouseleave', function(){
        paths.forEach(function(o){ o.style.opacity = ''; o.setAttribute('stroke-width', o.getAttribute('data-default-width')); });
        if (TT) TT.style.opacity = '0';
      });
    });
  }

  function bindDonut(svg) {
    var slices = svg.querySelectorAll('.donut-slice');
    slices.forEach(function(s){
      s.addEventListener('mouseenter', function(evt){
        if (!TT) TT = makeTooltip();
        slices.forEach(function(o){ o.setAttribute('opacity', '0.35'); });
        s.setAttribute('opacity', '1');
        var lbl = s.getAttribute('data-label');
        var pct = s.getAttribute('data-pct');
        var net = s.getAttribute('data-net');
        TT.innerHTML =
          '<div style="font-weight:600;margin-bottom:4px">'+String(lbl).replace(/</g,'&lt;')+'</div>'+
          '<div>Gewicht: <strong>'+pct+'%</strong></div>'+
          '<div style="color:#ddd">Netto-Rendite: '+net+'%</div>';
        TT.style.left = evt.clientX + 'px';
        TT.style.top  = (evt.clientY - 8) + 'px';
        TT.style.opacity = '1';
      });
      s.addEventListener('mousemove', function(evt){
        if (TT) { TT.style.left = evt.clientX + 'px'; TT.style.top = (evt.clientY - 8) + 'px'; }
      });
      s.addEventListener('mouseleave', function(){
        slices.forEach(function(o){ o.setAttribute('opacity', '1'); });
        if (TT) TT.style.opacity = '0';
      });
    });
  }

  function init() {
    var svgs = document.querySelectorAll('svg.chart-interactive');
    svgs.forEach(function(svg){
      var t = svg.getAttribute('data-chart-type');
      if (t === 'mcfan') bindFan(svg);
      else if (t === 'scenarios') bindScenarios(svg);
      else if (t === 'trace') bindTrace(svg);
      else if (t === 'historical') bindHistorical(svg);
      else if (t === 'donut') bindDonut(svg);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
  `.trim();
}