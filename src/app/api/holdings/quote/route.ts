/**
 * Yahoo-Quote-Proxy: liefert für ein Symbol die aktuelle Notierungswährung
 * sowie den letzten Schlusskurs (regularMarketPrice). Wird nach Auswahl
 * eines Suchergebnisses aufgerufen, um die Holding-Zeile vollständig auto-
 * matisch zu befüllen.
 *
 * Endpoint: GET /api/holdings/quote?symbol=AAPL
 * Quelle:   https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d
 *           (chart.meta enthält currency + regularMarketPrice + longName)
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";
const UA = "Mozilla/5.0 (compatible; SHC-RPL-Pro/0.3 retirement-planner)";

const cache = new Map<string, { fetchedAt: number; data: QuoteResult }>();
const TTL = 60 * 60 * 1000; // 1h

export interface QuoteResult {
  symbol: string;
  currency: string;
  price: number;
  longName?: string;
  exchangeName?: string;
  instrumentType?: string;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.fetchedAt < TTL) {
    return NextResponse.json(hit.data);
  }

  const params = new URLSearchParams({ interval: "1d", range: "5d" });
  let resp: Response;
  try {
    resp = await fetch(`${CHART_URL}${encodeURIComponent(symbol)}?${params.toString()}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Yahoo unreachable: ${(err as Error).message}` },
      { status: 502 },
    );
  }
  if (!resp.ok) {
    return NextResponse.json({ error: `Yahoo HTTP ${resp.status}` }, { status: 502 });
  }
  type YahooMeta = {
    currency?: string;
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    longName?: string;
    shortName?: string;
    exchangeName?: string;
    instrumentType?: string;
    symbol?: string;
  };
  let json: { chart?: { result?: Array<{ meta?: YahooMeta }> } };
  try {
    json = (await resp.json()) as typeof json;
  } catch {
    return NextResponse.json({ error: "Yahoo invalid JSON" }, { status: 502 });
  }
  const m = json.chart?.result?.[0]?.meta;
  if (!m) return NextResponse.json({ error: "no quote data" }, { status: 404 });

  const data: QuoteResult = {
    symbol: m.symbol ?? symbol,
    currency: m.currency ?? "USD",
    price: m.regularMarketPrice ?? m.chartPreviousClose ?? 0,
    longName: m.longName ?? m.shortName,
    exchangeName: m.exchangeName,
    instrumentType: m.instrumentType,
  };
  cache.set(symbol, { fetchedAt: Date.now(), data });
  return NextResponse.json(data);
}