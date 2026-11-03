/**
 * Ersatz für den Server in der Offline-Datei.
 *
 * Die App ruft Bilder, Schriften und /api/* über fetch ab. Offline gibt es
 * keinen Server: Bilder und Schriften liegen eingebettet vor (vom Build als
 * __RPL_ASSETS__ gesetzt), Excel-Vorlage und -Import laufen direkt im
 * Browser, alles mit Internetbedarf antwortet mit einem klaren Hinweis.
 */

import { buildHoldingsTemplate } from "@/lib/holdings/excelTemplate";
import { parseHoldingsBuffer } from "@/lib/holdings/excelParser";
import { de } from "@/lib/translations/de";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // wie /api/holdings/import

const NEEDS_INTERNET = ["/api/holdings/search", "/api/holdings/quote", "/api/holdings/backtest"];

export function offlineAssets(): Record<string, string> {
  return (globalThis as { __RPL_ASSETS__?: Record<string, string> }).__RPL_ASSETS__ ?? {};
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** data:-Adresse → Response (ohne Netzwerkzugriff). */
function dataUrlResponse(dataUrl: string): Response {
  const [head, b64] = dataUrl.split(",", 2);
  const type = head.slice(5).replace(";base64", "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(new Blob([bytes], { type }), { status: 200 });
}

async function handleApi(path: string, init?: RequestInit): Promise<Response> {
  if (NEEDS_INTERNET.some((p) => path.startsWith(p))) {
    return json({ error: de["offline.unavailable"] }, 503);
  }
  if (path.startsWith("/api/client-error")) {
    return new Response(null, { status: 204 });
  }
  if (path.startsWith("/api/holdings/template")) {
    const buf = await buildHoldingsTemplate();
    return new Response(new Blob([buf]), { status: 200 });
  }
  if (path.startsWith("/api/holdings/import")) {
    const file = init?.body instanceof FormData ? init.body.get("file") : null;
    if (!(file instanceof Blob)) return json({ error: "Keine Datei übermittelt." }, 400);
    if (file.size > MAX_IMPORT_BYTES) {
      return json({ error: `Datei zu groß (max. ${MAX_IMPORT_BYTES / 1024 / 1024} MB).` }, 413);
    }
    try {
      const name = (file as File).name ?? "import.xlsx";
      return json(await parseHoldingsBuffer(await file.arrayBuffer(), name));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      return json({ error: `Import fehlgeschlagen: ${msg}` }, 422);
    }
  }
  return json({ error: "Nicht gefunden" }, 404);
}

/** Leitet App-interne Pfade (/icons, /fonts, /api) auf den Offline-Ersatz um. */
export function installOfflineApi(): void {
  const realFetch = window.fetch.bind(window);
  const offlineFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      const path = raw.split("?")[0];
      if (path.startsWith("/api/")) return handleApi(raw, init);
      const asset = offlineAssets()[path];
      return asset ? dataUrlResponse(asset) : new Response(null, { status: 404 });
    }
    return realFetch(input, init);
  };
  window.fetch = Object.assign(offlineFetch, { preconnect: window.fetch.preconnect });
}
