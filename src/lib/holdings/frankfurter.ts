/**
 * Frankfurter — kostenfreier Wrapper um die EZB Reference Rates.
 * https://api.frankfurter.app
 *
 * Endpunkte:
 *   GET /{date}?from=USD&to=EUR
 *   GET /{from}..{to}?from=USD&to=EUR    (Zeitreihe)
 *
 * Server-side only. Cache pro (date,from,to).
 */

const BASE = "https://api.frankfurter.app";

interface RangeResp {
  start_date: string;
  end_date: string;
  base: string;
  rates: Record<string, Record<string, number>>;
}

interface SingleResp {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

const seriesCache = new Map<string, Record<string, number>>();
const singleCache = new Map<string, number>();

const CCY_FALLBACK: Record<string, number> = {
  EUR: 1.0,
  USD: 0.92,
  CHF: 1.05,
  GBP: 1.17,
  JPY: 0.0061,
  CAD: 0.68,
  AUD: 0.6,
};

/**
 * Fetch a date-keyed FX series from `from` to EUR.
 * Returns map { "YYYY-MM-DD": rate }.
 */
export async function fetchFxSeries(
  from: string,
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  if (from === "EUR") return {};
  const key = `${from}_${startDate}_${endDate}`;
  if (seriesCache.has(key)) return seriesCache.get(key)!;

  const url = `${BASE}/${startDate}..${endDate}?from=${from}&to=EUR`;
  try {
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return {};
    const json = (await resp.json()) as RangeResp;
    const out: Record<string, number> = {};
    for (const [date, ccyMap] of Object.entries(json.rates ?? {})) {
      if (typeof ccyMap.EUR === "number") {
        out[date] = ccyMap.EUR;
      }
    }
    seriesCache.set(key, out);
    return out;
  } catch {
    return {};
  }
}

export async function fetchFxSpot(from: string, on?: string): Promise<number> {
  if (from === "EUR") return 1.0;
  const date = on ?? "latest";
  const key = `${from}_${date}`;
  if (singleCache.has(key)) return singleCache.get(key)!;

  const url = `${BASE}/${date}?from=${from}&to=EUR`;
  try {
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return CCY_FALLBACK[from] ?? 1.0;
    const json = (await resp.json()) as SingleResp;
    const r = json.rates?.EUR;
    if (typeof r === "number") {
      singleCache.set(key, r);
      return r;
    }
  } catch {}
  return CCY_FALLBACK[from] ?? 1.0;
}