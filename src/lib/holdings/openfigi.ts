/**
 * OpenFIGI ISIN→Ticker Resolver.
 *
 * Endpoint: POST https://api.openfigi.com/v3/mapping
 * Rate-Limit: ohne Key 25/6s, mit Key 250/6s.
 * Server-side only (DSGVO).
 *
 * In-Memory Cache lebt pro Lambda-Instanz. Reicht für
 * Single-Session Berater-Use; persistenter Cache kann
 * später per Postgres ergänzt werden.
 */

const FIGI_URL = "https://api.openfigi.com/v3/mapping";

export interface FigiResolved {
  ticker?: string;
  exchCode?: string;
  compositeFIGI?: string;
  securityType2?: string;
  marketSector?: string;
  name?: string;
  source: "openfigi";
}

const cache = new Map<string, FigiResolved | null>();

function pickPreferred(items: Array<Record<string, string>>): Record<string, string> | null {
  if (items.length === 0) return null;
  // Preferred exchange order: GR/GY (Germany Xetra), FR (Frankfurt), GA (Gettex), LN (London), NA (Amsterdam), UN/UQ/US (US)
  const order = ["GY", "GR", "FR", "GA", "VI", "EB", "BB", "EO", "MM", "NA", "LN", "UN", "UQ", "US"];
  for (const ex of order) {
    const m = items.find((it) => (it.exchCode ?? "").toUpperCase() === ex);
    if (m) return m;
  }
  return items[0];
}

export async function resolveIsins(isins: string[]): Promise<Record<string, FigiResolved | null>> {
  const out: Record<string, FigiResolved | null> = {};
  const todo: string[] = [];

  for (const isin of isins) {
    const u = isin.toUpperCase();
    if (cache.has(u)) {
      out[u] = cache.get(u) ?? null;
    } else {
      todo.push(u);
    }
  }

  if (todo.length === 0) return out;

  const apiKey = process.env.OPENFIGI_API_KEY;
  // OpenFIGI accepts up to 100 jobs per request without key, 100 with key — same.
  const chunks: string[][] = [];
  for (let i = 0; i < todo.length; i += 50) chunks.push(todo.slice(i, i + 50));

  for (const chunk of chunks) {
    const body = chunk.map((isin) => ({ idType: "ID_ISIN", idValue: isin }));
    let resp: Response;
    try {
      resp = await fetch(FIGI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-OPENFIGI-APIKEY": apiKey } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // Network error → mark all in chunk as failed
      for (const i of chunk) {
        out[i] = null;
        cache.set(i, null);
      }
      continue;
    }
    if (!resp.ok) {
      for (const i of chunk) {
        out[i] = null;
        cache.set(i, null);
      }
      continue;
    }
    let json: Array<{ data?: Array<Record<string, string>>; warning?: string; error?: string }>;
    try {
      json = await resp.json();
    } catch {
      for (const i of chunk) {
        out[i] = null;
        cache.set(i, null);
      }
      continue;
    }

    json.forEach((entry, idx) => {
      const isin = chunk[idx];
      if (!entry || entry.warning || entry.error || !entry.data || entry.data.length === 0) {
        out[isin] = null;
        cache.set(isin, null);
        return;
      }
      const pref = pickPreferred(entry.data);
      if (!pref) {
        out[isin] = null;
        cache.set(isin, null);
        return;
      }
      const resolved: FigiResolved = {
        ticker: pref.ticker,
        exchCode: pref.exchCode,
        compositeFIGI: pref.compositeFIGI,
        securityType2: pref.securityType2,
        marketSector: pref.marketSector,
        name: pref.name,
        source: "openfigi",
      };
      out[isin] = resolved;
      cache.set(isin, resolved);
    });
  }

  return out;
}

/**
 * Map an OpenFIGI exchCode + raw ticker to a Yahoo Finance symbol.
 * Yahoo uses suffixes like .DE (Xetra), .F (Frankfurt), .L (London), .PA (Paris)…
 */
export function figiToYahooSymbol(ticker: string | undefined, exchCode: string | undefined): string | undefined {
  if (!ticker) return undefined;
  if (!exchCode) return ticker;
  const ex = exchCode.toUpperCase();
  const suffixMap: Record<string, string> = {
    GY: ".DE",
    GR: ".DE",
    XE: ".DE",
    FR: ".F",
    GA: ".DE",
    LN: ".L",
    NA: ".AS",
    PA: ".PA",
    SE: ".ST",
    EO: ".AS",
    MM: ".MC",
    SW: ".SW",
    EB: ".VI",
    VI: ".VI",
    BB: ".BR",
    HK: ".HK",
    JP: ".T",
    CN: ".SS",
    AU: ".AX",
    UN: "",
    UQ: "",
    US: "",
    UA: "",
    UB: "",
    UC: "",
    UP: "",
    PQ: "",
  };
  const suf = suffixMap[ex];
  if (suf === undefined) return ticker;
  if (suf === "") return ticker;
  if (ticker.includes(".")) return ticker;
  return `${ticker}${suf}`;
}