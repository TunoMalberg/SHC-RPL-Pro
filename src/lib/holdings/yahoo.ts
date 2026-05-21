/**
 * Yahoo Finance v8 Chart-API (kostenfrei, ohne Auth).
 * Endpoint: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
 * Liefert Tagesschlusskurse und adjustierte Kurse (Dividenden/Splits).
 *
 * Server-side only. In-Memory Cache pro Symbol.
 */

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";
const UA = "Mozilla/5.0 (compatible; SHC-RPL-Pro/0.2 retirement-planner)";

export interface PriceBar {
  /** Unix epoch seconds. */
  t: number;
  /** YYYY-MM-DD (UTC). */
  date: string;
  /** Adjusted close (for total return). */
  adjClose: number;
  /** Raw close. */
  close: number;
  /** Currency from Yahoo meta. */
  currency: string;
}

export interface PriceSeries {
  symbol: string;
  currency: string;
  bars: PriceBar[];
  source: "yahoo";
}

interface CacheEntry {
  fetchedAt: number;
  series: PriceSeries;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function epochToYmd(epoch: number): string {
  const d = new Date(epoch * 1000);
  return d.toISOString().slice(0, 10);
}

export async function fetchYahooSeries(
  symbol: string,
  opts: { from?: Date; to?: Date; range?: string } = {},
): Promise<PriceSeries | null> {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.series;
  }

  // Yahoo down-samples to monthly when range=max + interval=1d for very long windows.
  // Force explicit period1/period2 to keep daily granularity.
  const now = opts.to ?? new Date();
  const yearsBack = 25;
  const from = opts.from ?? new Date(now.getTime() - yearsBack * 365.25 * 86400_000);
  const params = new URLSearchParams();
  params.set("interval", "1d");
  params.set("events", "div,splits");
  params.set("includeAdjustedClose", "true");
  params.set("period1", String(Math.floor(from.getTime() / 1000)));
  params.set("period2", String(Math.floor(now.getTime() / 1000)));

  const url = `${CHART_URL}${encodeURIComponent(symbol)}?${params.toString()}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
    });
  } catch {
    return null;
  }
  if (!resp.ok) return null;
  let json: {
    chart?: {
      result?: Array<{
        meta?: { currency?: string; symbol?: string };
        timestamp?: number[];
        indicators?: {
          quote?: Array<{ close?: Array<number | null> }>;
          adjclose?: Array<{ adjclose?: Array<number | null> }>;
        };
      }>;
      error?: unknown;
    };
  };
  try {
    json = (await resp.json()) as typeof json;
  } catch {
    return null;
  }
  const result = json.chart?.result?.[0];
  if (!result) return null;
  const ts = result.timestamp ?? [];
  const closeArr = result.indicators?.quote?.[0]?.close ?? [];
  const adjArr = result.indicators?.adjclose?.[0]?.adjclose ?? closeArr;
  const currency = result.meta?.currency ?? "USD";
  const bars: PriceBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = closeArr[i];
    const adj = adjArr[i] ?? close;
    if (close == null || adj == null) continue;
    if (!Number.isFinite(close) || !Number.isFinite(adj)) continue;
    bars.push({
      t: ts[i],
      date: epochToYmd(ts[i]),
      close,
      adjClose: adj,
      currency,
    });
  }
  if (bars.length === 0) return null;
  const series: PriceSeries = {
    symbol,
    currency,
    bars,
    source: "yahoo",
  };
  cache.set(symbol, { fetchedAt: Date.now(), series });
  return series;
}

/**
 * Fetch many symbols in parallel with simple throttle.
 */
export async function fetchYahooSeriesBatch(
  symbols: string[],
  opts: { from?: Date; to?: Date; concurrency?: number } = {},
): Promise<Record<string, PriceSeries | null>> {
  const out: Record<string, PriceSeries | null> = {};
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 5, 8));
  const queue = [...symbols];
  async function worker() {
    while (queue.length > 0) {
      const sym = queue.shift();
      if (!sym) break;
      out[sym] = await fetchYahooSeries(sym, opts);
      // Tiny delay to be polite to Yahoo
      await new Promise((r) => setTimeout(r, 80));
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return out;
}