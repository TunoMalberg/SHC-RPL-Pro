/**
 * Self-contained SVG chart renderers for the client-facing HTML / PDF
 * report. Output is pure SVG markup (no external refs, no web fonts) so the
 * HTML export remains a single `file://`-safe document and the PDF export
 * can rasterise these via an offscreen <canvas>.
 */

import type {
  SimulationResult,
  HistoricalAnalysis,
  PortfolioConfig,
  ClientProfile,
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

function nice(x: number): number {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  const n = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return n * Math.pow(10, exp);
}

interface AxisLabels {
  xAxis: string;
  yAxis: string;
  p10p90: string;
  p25p75: string;
  median: string;
}

/* ──────────────────────────────────────────
   Monte-Carlo fan chart
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

  return `
<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Monte Carlo">
  <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
  ${yTicks.map((v) => `
    <line x1="${m.l}" x2="${m.l + W}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" stroke="${REPORT_COLORS.gridLine}" stroke-width="1"/>
    <text x="${m.l - 8}" y="${(sy(v) + 4).toFixed(1)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.muted}" text-anchor="end">${fmtEurCompact.format(v).replace(/\s/g, "\u00A0")}</text>
  `).join("")}
  <path d="${toBand(p10Path, p90Path)}" fill="${REPORT_COLORS.band10_90}" stroke="none"/>
  <path d="${toBand(p25Path, p75Path)}" fill="${REPORT_COLORS.band25_75}" stroke="none"/>
  <path d="${toPath(medianPath)}" fill="none" stroke="${REPORT_COLORS.median}" stroke-width="2.2"/>
  ${xTicks.map((i) => `
    <text x="${sx(i).toFixed(1)}" y="${m.t + H + 18}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.muted}" text-anchor="middle">${ages[i]}</text>
  `).join("")}
  <text x="${m.l + W / 2}" y="${m.t + H + 36}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}" text-anchor="middle">${labels.xAxis}</text>
  <g transform="translate(${m.l + 12}, ${m.t + 12})">
    <rect x="0" y="0" width="12" height="12" fill="${REPORT_COLORS.band10_90}"/>
    <text x="18" y="10" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}">${labels.p10p90}</text>
    <rect x="0" y="20" width="12" height="12" fill="${REPORT_COLORS.band25_75}"/>
    <text x="18" y="30" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}">${labels.p25p75}</text>
    <line x1="0" y1="46" x2="12" y2="46" stroke="${REPORT_COLORS.median}" stroke-width="2.2"/>
    <text x="18" y="50" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}">${labels.median}</text>
  </g>
</svg>`.trim();
}

/* ──────────────────────────────────────────
   Historical backtest paths
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

  // Colour-code by success (faded red for failures, muted green for successes),
  // worst + best scenarios highlighted.
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
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" opacity="${isWorst || isBest ? 1 : 0.8}"/>`;
  }).join("");

  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += tickY) yTicks.push(v);

  const ages = Array.from({ length: pathLen }, (_, i) => client.currentAge + i);
  const xTicks: number[] = [];
  const step = Math.max(1, Math.round((pathLen - 1) / 6));
  for (let i = 0; i < pathLen; i += step) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== pathLen - 1) xTicks.push(pathLen - 1);

  return `
<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Historical Backtest">
  <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
  ${yTicks.map((v) => `
    <line x1="${m.l}" x2="${m.l + W}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" stroke="${REPORT_COLORS.gridLine}" stroke-width="1"/>
    <text x="${m.l - 8}" y="${(sy(v) + 4).toFixed(1)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.muted}" text-anchor="end">${fmtEurCompact.format(v).replace(/\s/g, "\u00A0")}</text>
  `).join("")}
  ${paths}
  ${xTicks.map((i) => `
    <text x="${sx(i).toFixed(1)}" y="${m.t + H + 18}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.muted}" text-anchor="middle">${ages[i]}</text>
  `).join("")}
  <text x="${m.l + W / 2}" y="${m.t + H + 36}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${REPORT_COLORS.text}" text-anchor="middle">${labels.xAxis}</text>
</svg>`.trim();
}

/* ──────────────────────────────────────────
   Portfolio allocation — donut chart
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
    return { d, color: palette[idx % palette.length], label: b.label, pct: b.allocation };
  });

  return `
<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Portfolio allocation">
  ${slices.map((s) => `<path d="${s.d}" fill="${s.color}" stroke="white" stroke-width="2"/>`).join("")}
  <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="14" fill="${REPORT_COLORS.muted}">Portfolio</text>
  <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="18" font-weight="bold" fill="${REPORT_COLORS.text}">100%</text>
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