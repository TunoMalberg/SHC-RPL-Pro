"use client";

/**
 * Globale Error-Boundary (Next.js App Router).
 *
 * Greift bei JS-Fehlern in jeder Route der App. Zeigt ein freundliches
 * deutsch/englisches Fallback statt der gecrashten Seite.
 *
 * Hinweis: Die meisten Render-Fehler in Recharts/Engine landen hier.
 * Wir loggen mit dem strukturierten Logger (vgl. src/lib/logger.ts), damit
 * spätere Sentry/Datadog-Anbindung trivial bleibt.
 */

import { useEffect } from "react";
import { logger } from "@/lib/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("App-level error boundary triggered", { scope: "app/error", digest: error.digest }, error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 via-white to-red-50/30 p-6">
      <div className="max-w-lg w-full bg-white border border-red-200 rounded-2xl shadow-lg p-8">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="w-12 h-12 rounded-full bg-[#D31220]/10 text-[#D31220] flex items-center justify-center text-2xl font-bold flex-shrink-0"
          >
            !
          </span>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">
              Ein unerwarteter Fehler ist aufgetreten
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              An unexpected error occurred — Ihre Eingaben sind nicht verloren,
              wir versuchen es erneut.
            </p>

            <div className="mt-4 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-mono text-slate-600 break-words">
              {error.message || "Unknown error"}
              {error.digest && (
                <span className="block mt-1 text-slate-400">Ref: {error.digest}</span>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                className="bg-[#D31220] hover:bg-[#a80e19] text-white px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#D31220] focus:ring-offset-2"
              >
                Erneut versuchen / Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
              >
                Seite neu laden / Reload page
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}