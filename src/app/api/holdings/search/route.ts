/**
 * Yahoo Finance Live-Search-Proxy für die Bestands-Direkteingabe.
 *
 * Endpoint:    GET /api/holdings/search?q=msci+world&limit=10
 * Quelle:      https://query2.finance.yahoo.com/v1/finance/search
 * Schutz:      Server-side Proxy (kein direkter Browser-Hit auf Yahoo wegen CORS),
 *              Rate-Limit pro Session über simples Token-Bucket im Memory.
 *
 * Response:    { results: SearchResult[] }
 *
 *  SearchResult = {
 *    symbol: "IWDA.AS",
 *    name:   "iShares Core MSCI World UCITS ETF",
 *    quoteType: "ETF" | "EQUITY" | "MUTUALFUND" | "INDEX" | …,
 *    exchange:  "Amsterdam",
 *    sector?:   "Technology",
 *    industry?: "Consumer Electronics",
 *    isin?:     "IE00B4L5Y983"   (sofern Yahoo es liefert),
 *    score:     17659000.0
 *  }
 */

import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/holdings/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search";
const UA = "Mozilla/5.0 (compatible; SHC-RPL-Pro/0.3 retirement-planner)";

// 12-h In-Memory-Cache pro Query (Lambda-Instanz lokal)
const cache = new Map<string, { fetchedAt: number; results: SearchResult[] }>();
const TTL = 12 * 60 * 60 * 1000;

interface SearchResult {
  symbol: string;
  name: string;
  quoteType: string;
  exchange: string;
  sector?: string;
  industry?: string;
  isin?: string;
  score?: number;
}

interface YahooQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchDisp?: string;
  exchange?: string;
  sector?: string;
  sectorDisp?: string;
  industry?: string;
  industryDisp?: string;
  isin?: string;
  score?: number;
}

export async function GET(req: NextRequest) {
  // Audit H-3: Token-Bucket pro IP, ~30 Suchen/Minute mit Burst von 10.
  // Schützt Yahoo vor Vendor-Sperren und die App vor billigem DoS.
  const limited = enforceRateLimit(req, {
    bucket: "holdings-search",
    capacity: 10,
    refillPerSecond: 0.5,
  });
  if (limited) return limited;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "10", 10) || 10));

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }
  const key = `${q.toLowerCase()}|${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < TTL) {
    return NextResponse.json({ results: hit.results, cached: true });
  }

  const params = new URLSearchParams({
    q,
    quotesCount: String(limit),
    newsCount: "0",
    listsCount: "0",
    enableFuzzyQuery: "false",
    quotesQueryId: "tss_match_phrase_query",
    multiQuoteQueryId: "multi_quote_single_token_query",
    enableEnhancedTrivialQuery: "true",
    lang: "en-US",
    region: "DE",
  });

  let resp: Response;
  try {
    resp = await fetch(`${SEARCH_URL}?${params.toString()}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      // 8s timeout via AbortController would be nice; Vercel sets default
    });
  } catch (err) {
    return NextResponse.json(
      { results: [], error: `Yahoo unreachable: ${(err as Error).message}` },
      { status: 502 },
    );
  }
  if (!resp.ok) {
    return NextResponse.json(
      { results: [], error: `Yahoo HTTP ${resp.status}` },
      { status: 502 },
    );
  }
  let json: { quotes?: YahooQuote[] };
  try {
    json = (await resp.json()) as typeof json;
  } catch {
    return NextResponse.json({ results: [] });
  }

  const results: SearchResult[] = (json.quotes ?? [])
    .filter((q) => !!q.symbol && !!q.quoteType)
    .map((q) => ({
      symbol: q.symbol!,
      name: q.longname ?? q.shortname ?? q.symbol!,
      quoteType: q.quoteType!,
      exchange: q.exchDisp ?? q.exchange ?? "",
      sector: q.sectorDisp ?? q.sector,
      industry: q.industryDisp ?? q.industry,
      isin: q.isin,
      score: q.score,
    }))
    // Drop futures/options/cryptos that we cannot meaningfully backtest in EUR portfolio
    .filter((r) => !["FUTURE", "OPTION", "CRYPTOCURRENCY"].includes(r.quoteType))
    .slice(0, limit);

  cache.set(key, { fetchedAt: Date.now(), results });
  return NextResponse.json({ results });
}