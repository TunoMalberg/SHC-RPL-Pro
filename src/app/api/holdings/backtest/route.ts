import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/holdings/rateLimit";
import { validateBacktestBody } from "@/lib/validation";
import type { Holding, HoldingsBacktestResult } from "@/lib/holdings/types";
import { resolveIsins, figiToYahooSymbol } from "@/lib/holdings/openfigi";
import { fetchYahooSeriesBatch, type PriceSeries } from "@/lib/holdings/yahoo";
import { fetchFxSeries, fetchFxSpot } from "@/lib/holdings/frankfurter";
import {
  runHoldingsBacktest,
  finalizeStressTestEUR,
  type BacktestTelemetry,
} from "@/lib/holdings/backtest";
import { buildBucketStats } from "@/lib/holdings/bucketStats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface BacktestRequest {
  holdings: Holding[];
  /** Optional from-date (YYYY-MM-DD). Default: 20 years back. */
  from?: string;
}

export async function POST(req: NextRequest) {
  // Audit H-3: Backtest ist die teuerste Route (bis zu 200 Yahoo-Calls + FX).
  // Bewusst eng gesetzt: 4 Backtests/Minute mit kleinem Burst.
  const limited = enforceRateLimit(req, {
    bucket: "holdings-backtest",
    capacity: 3,
    refillPerSecond: 0.07, // ~4/min
  });
  if (limited) return limited;

  let body: BacktestRequest;
  try {
    body = (await req.json()) as BacktestRequest;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  // Audit H-5: Schema-Validierung an der API-Grenze. Wir geben dem Aufrufer
  // ALLE Probleme auf einmal (Multi-Issue-Response) statt früh zu returnen.
  const v = validateBacktestBody(body);
  if (!v.ok) {
    const status = v.errors.some((e) => e.message.includes("Maximal 200")) ? 413 : 400;
    return NextResponse.json({ error: v.errors[0].message, errors: v.errors }, { status });
  }

  // Step 1 — ISIN resolution (only for holdings without explicit yahoo ticker)
  const isinsToResolve = body.holdings
    .filter((h) => h.isin && !h.ticker)
    .map((h) => h.isin!.toUpperCase());
  const figiMap = await resolveIsins(isinsToResolve);

  // Step 2 — Build resolved holding clones with yahoo symbols
  const enrichedHoldings: Holding[] = body.holdings.map((h) => {
    const next = { ...h };
    if (!next.ticker && next.isin) {
      const fr = figiMap[next.isin.toUpperCase()];
      if (fr?.ticker) {
        next.ticker = figiToYahooSymbol(fr.ticker, fr.exchCode) ?? fr.ticker;
        next.figiType = fr.securityType2;
        next.compositeFIGI = fr.compositeFIGI;
        next.resolutionStatus = "ok";
      } else {
        next.resolutionStatus = "failed";
        next.resolutionMessage = "ISIN über OpenFIGI nicht auflösbar";
      }
    } else if (next.ticker) {
      next.resolutionStatus = next.resolutionStatus === "pending" ? "ok" : next.resolutionStatus;
    }
    return next;
  });

  // Step 3 — Fetch price series
  const tickerByHoldingId = new Map<string, string | undefined>();
  for (const h of enrichedHoldings) tickerByHoldingId.set(h.id, h.ticker);

  const symbols = [...new Set(enrichedHoldings.map((h) => h.ticker).filter((s): s is string => !!s))];
  const seriesMap = await fetchYahooSeriesBatch(symbols, { concurrency: 5 });

  const priceSeriesByHoldingId = new Map<string, PriceSeries | null>();
  for (const h of enrichedHoldings) {
    if (h.ticker) {
      priceSeriesByHoldingId.set(h.id, seriesMap[h.ticker] ?? null);
      if (priceSeriesByHoldingId.get(h.id)) {
        h.priceHistorySource = "yahoo";
      }
    } else {
      priceSeriesByHoldingId.set(h.id, null);
    }
  }

  // Step 4 — Determine common window for FX series
  let minDate: string | undefined;
  let maxDate: string | undefined;
  for (const series of Object.values(seriesMap)) {
    if (!series || series.bars.length === 0) continue;
    const f = series.bars[0].date;
    const t = series.bars[series.bars.length - 1].date;
    if (!minDate || f < minDate) minDate = f;
    if (!maxDate || t > maxDate) maxDate = t;
  }
  const fromDate = body.from ?? minDate ?? new Date(Date.now() - 20 * 365 * 86400_000).toISOString().slice(0, 10);
  const toDate = maxDate ?? new Date().toISOString().slice(0, 10);

  const ccysNeeded = new Set<string>();
  for (const h of enrichedHoldings) {
    if (h.currency !== "EUR") ccysNeeded.add(h.currency);
  }
  const fxByCurrency = new Map<string, Record<string, number>>();
  await Promise.all(
    [...ccysNeeded].map(async (ccy) => {
      const series = await fetchFxSeries(ccy, fromDate, toDate);
      fxByCurrency.set(ccy, series);
    }),
  );

  // FX spots for current MV
  const fxSpotByCurrency = new Map<string, number>();
  await Promise.all(
    [...ccysNeeded].map(async (ccy) => {
      const r = await fetchFxSpot(ccy);
      fxSpotByCurrency.set(ccy, r);
    }),
  );
  fxSpotByCurrency.set("EUR", 1.0);

  // Step 5 — Run backtest, capture telemetry for bucket-stats
  const telemetry: BacktestTelemetry = {
    posReturnsById: new Map<string, number[]>(),
    mvEURById: new Map<string, number>(),
    dates: [],
  };
  const result: HoldingsBacktestResult = runHoldingsBacktest(
    {
      holdings: enrichedHoldings,
      priceSeriesByHoldingId,
      fxByCurrency,
      fxSpotByCurrency,
    },
    telemetry,
  );
  finalizeStressTestEUR(result);

  // Step 6 — Bucket-Stats (mu, sigma, Korrelationen für 3 Töpfe → Szenario-Übernahme)
  const bucketStatsFull =
    telemetry.posReturnsById.size > 0
      ? buildBucketStats({
          holdings: enrichedHoldings,
          mvEURById: telemetry.mvEURById,
          posReturnsById: telemetry.posReturnsById,
          dates: telemetry.dates,
        })
      : null;
  // Strip the daily return arrays before sending back — only the summary stats are relevant.
  const bucketStats = bucketStatsFull
    ? {
        buckets: bucketStatsFull.buckets,
        correlationMatrix: bucketStatsFull.correlationMatrix,
        daysOfHistory: bucketStatsFull.daysOfHistory,
      }
    : null;

  return NextResponse.json({
    holdings: enrichedHoldings,
    result,
    bucketStats,
  });
}