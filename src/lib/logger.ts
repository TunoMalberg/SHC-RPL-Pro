/**
 * Strukturierter Client/Server-Logger.
 *
 * Ziele:
 *   1. Einheitliches Format → später leicht an Sentry/Datadog/Logflare zu binden.
 *   2. Kein `console.log` mehr direkt in Komponenten/Engines.
 *   3. Serialisierbare Payloads (Error → message + stack + name).
 *
 * Bewusst klein gehalten: keine Abhängigkeiten, kein Async, keine Side-Effects
 * außer dem `console`-Aufruf. So kann der Logger in Server-Routen, Browser-
 * Komponenten und Edge-Middleware identisch verwendet werden.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  /** Komponenten- oder Modul-Tag (z. B. "ClientView", "api/holdings/search"). */
  scope?: string;
  /** Zusätzliche serialisierbare Felder (kein PII!). */
  [key: string]: unknown;
}

interface LogRecord {
  ts: string;
  level: LogLevel;
  msg: string;
  scope?: string;
  ctx?: Record<string, unknown>;
  err?: { name: string; message: string; stack?: string };
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function emit(level: LogLevel, msg: string, ctx?: LogContext, err?: unknown): void {
  const { scope, ...rest } = ctx ?? {};
  const record: LogRecord = {
    ts: new Date().toISOString(),
    level,
    msg,
    scope,
    ctx: Object.keys(rest).length > 0 ? (rest as Record<string, unknown>) : undefined,
  };
  if (err !== undefined) {
    const e = serialize(err);
    if (e && typeof e === "object" && "message" in e) {
      record.err = e as LogRecord["err"];
    } else {
      record.ctx = { ...(record.ctx ?? {}), error: e };
    }
  }

  // Use the matching console method so DevTools filters work.
  const fn =
    level === "error" ? console.error
    : level === "warn" ? console.warn
    : level === "debug" ? console.debug
    : console.info;

  // Compact form in dev, full JSON in prod for easy ingest.
  if (process.env.NODE_ENV === "production") {
    fn(JSON.stringify(record));
  } else {
    fn(`[${record.level}]${scope ? ` (${scope})` : ""} ${msg}`, record.ctx ?? "", record.err ?? "");
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info:  (msg: string, ctx?: LogContext) => emit("info",  msg, ctx),
  warn:  (msg: string, ctx?: LogContext, err?: unknown) => emit("warn",  msg, ctx, err),
  error: (msg: string, ctx?: LogContext, err?: unknown) => emit("error", msg, ctx, err),
};

export default logger;