/**
 * Empfang der Fehlermeldungen aus dem Browser (Paket 3, Punkt C).
 *
 * Schreibt je Meldung eine JSON-Zeile ins Server-Protokoll (Vercel-Logs,
 * Filter: "client-error"). Speichert nichts, ruft keinen externen Dienst.
 * Inhalte werden hier nochmals bereinigt und gekürzt — der Server verlässt
 * sich nicht darauf, dass der Browser es getan hat.
 */

import { type NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/holdings/rateLimit";
import { sanitizeMessage, sanitizeStack } from "@/lib/errorReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 8_000;
const KINDS = new Set(["error", "unhandledrejection", "boundary", "logger"]);

function str(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : undefined;
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    bucket: "client-error",
    capacity: 20,
    refillPerSecond: 0.2,
  });
  if (limited) return limited;

  const raw = await req.text();
  if (raw.length > MAX_BODY) return new NextResponse(null, { status: 413 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const kind = str(body.kind, 30);
  if (!kind || !KINDS.has(kind)) return new NextResponse(null, { status: 400 });

  const record = {
    ts: new Date().toISOString(),
    level: "error",
    source: "client-error",
    kind,
    message: sanitizeMessage(str(body.message, 1_000) ?? ""),
    // Stack kommt bereits gekürzt; nochmals auf Code-Stellen reduzieren.
    stack: sanitizeStack(`x\n${str(body.stack, 3_000) ?? ""}`),
    scope: sanitizeMessage(str(body.scope, 80) ?? ""),
    path: (str(body.path, 120) ?? "").split("?")[0],
    version: str(body.version, 40),
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 160),
  };
  console.error(JSON.stringify(record));
  return new NextResponse(null, { status: 204 });
}
