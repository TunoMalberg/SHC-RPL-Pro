/**
 * Fehlerprotokoll im Betrieb (Paket 3, Punkt C).
 *
 * Fehler im Browser eines Beraters werden an die eigene Route
 * `/api/client-error` gemeldet und landen im Server-Protokoll (Vercel-Logs).
 * Kein externer Dienst.
 *
 * Datenschutz: Es werden NIE Eingaben, Ergebnisse oder Kundendaten
 * gesendet — nur Fehlerart, bereinigte Fehlermeldung, gekürzte Code-Stelle,
 * Seitenpfad (ohne Parameter) und App-Version. Ziffernfolgen ab drei
 * Stellen (Beträge, Jahreszahlen, Konto-/Telefonnummern) und E-Mail-Adressen
 * werden in der Meldung unkenntlich gemacht — clientseitig UND serverseitig.
 */

export interface ClientErrorReport {
  kind: "error" | "unhandledrejection" | "boundary" | "logger";
  message: string;
  stack?: string;
  scope?: string;
  path: string;
  version?: string;
}

const MAX_MESSAGE = 300;
const MAX_STACK_LINES = 8;
const MAX_REPORTS_PER_PAGE = 10;

/** Meldungstext ohne personen- oder betragsbezogene Inhalte. */
export function sanitizeMessage(raw: unknown): string {
  const text = typeof raw === "string" ? raw : String(raw ?? "");
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "<email>")
    .replace(/\d[\d.,' ]*\d{2,}|\d{3,}/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE);
}

/**
 * Nur Code-Stellen behalten: Funktionsname + Dateiname:Zeile:Spalte.
 * Pfade werden auf den Dateinamen gekürzt, Abfrageparameter entfernt.
 */
export function sanitizeStack(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  const lines = raw
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, MAX_STACK_LINES)
    .map((l) => {
      const m = l.match(/^(?:at\s+)?(.*?)\s*\(?((?:[a-z]+:\/\/)?[^\s()]*?):(\d+):(\d+)\)?$/i);
      if (!m) return sanitizeMessage(l).slice(0, 120);
      const fn = (m[1] || "<anonym>").replace(/[^\w$.<>\[\] ]/g, "").slice(0, 60);
      const file = (m[2].split("?")[0].split("/").pop() ?? "").slice(0, 80);
      return `${fn} (${file}:${m[3]}:${m[4]})`;
    });
  return lines.length > 0 ? lines.join("\n") : undefined;
}

let sent = 0;
const seen = new Set<string>();

/** Meldet einen Fehler (nur im Browser; doppelte Meldungen werden verworfen). */
export function reportClientError(
  kind: ClientErrorReport["kind"],
  error: unknown,
  scope?: string,
): void {
  if (typeof window === "undefined" || sent >= MAX_REPORTS_PER_PAGE) return;
  const err = error instanceof Error ? error : null;
  const report: ClientErrorReport = {
    kind,
    message: sanitizeMessage(err ? `${err.name}: ${err.message}` : error),
    stack: sanitizeStack(err?.stack),
    scope: scope?.slice(0, 80),
    path: window.location.pathname.slice(0, 120),
    version: process.env.NEXT_PUBLIC_APP_VERSION,
  };
  const key = `${report.kind}|${report.message}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent++;
  try {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => {
      /* Meldung darf nie selbst einen Fehler auslösen */
    });
  } catch {
    /* ebenso */
  }
}

let installed = false;

/** Globale Fänger für nicht abgefangene Fehler (einmal beim App-Start). */
export function installGlobalErrorReporting(): void {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  window.addEventListener("error", (e) => {
    reportClientError("error", e.error ?? e.message, "window");
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportClientError("unhandledrejection", e.reason, "promise");
  });
}
