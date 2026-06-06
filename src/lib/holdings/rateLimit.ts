/**
 * Token-Bucket Rate-Limiter für /api/holdings/*.
 *
 * Schützt:
 *   - Yahoo Finance & OpenFIGI vor Vendor-Sperren (zu viele Calls).
 *   - Die App vor DoS, falls die Domain ohne Auth erreichbar ist.
 *
 * Scope:
 *   In-Memory, pro Lambda-Instanz. Auf Vercel mit Auto-Scale heißt das:
 *   ein Angreifer kann durch viele Cold-Starts mehrere Buckets bekommen.
 *   Für die nächste Stufe ist Vercel-KV / Upstash-Redis vorgesehen
 *   (siehe AUDIT_2026_06_06.md → H-3).
 *
 * Vertrag:
 *   `enforceRateLimit(req, opts)` gibt entweder `null` zurück (= ok, weiter)
 *   oder eine bereits fertige `NextResponse` mit 429.
 */

import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitOptions {
  /** Bucket-Name → trennt Search/Quote/Backtest-Quoten voneinander. */
  bucket: string;
  /** Maximale Tokens (= Burst-Kapazität). */
  capacity: number;
  /** Token-Nachfüllrate (Tokens pro Sekunde). */
  refillPerSecond: number;
}

const buckets = new Map<string, Bucket>();

function clientKey(req: NextRequest, bucket: string): string {
  // Header-Ketten, die Vercel/Cloudflare/Proxies setzen.
  const xff = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  // NextRequest.ip wurde in Next 15 entfernt — Header sind die einzige Quelle.
  const ip = (xff?.split(",")[0] ?? realIp ?? "anon").trim();
  return `${bucket}:${ip}`;
}

export function enforceRateLimit(
  req: NextRequest,
  opts: RateLimitOptions,
): NextResponse | null {
  const key = clientKey(req, opts.bucket);
  const now = Date.now();
  const existing = buckets.get(key);
  const refill = (now - (existing?.lastRefill ?? now)) / 1000 * opts.refillPerSecond;

  const tokens = Math.min(
    opts.capacity,
    (existing?.tokens ?? opts.capacity) + refill,
  );

  if (tokens < 1) {
    const retryAfterSeconds = Math.max(1, Math.ceil((1 - tokens) / opts.refillPerSecond));
    logger.warn("Rate limit hit", { scope: `rateLimit/${opts.bucket}`, key, retryAfterSeconds });
    return NextResponse.json(
      { error: "Zu viele Anfragen — bitte kurz warten." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  buckets.set(key, { tokens: tokens - 1, lastRefill: now });
  return null;
}