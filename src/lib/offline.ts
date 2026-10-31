/**
 * Offline-Fassung (eine einzelne HTML-Datei, siehe scripts/offline/build.ts).
 *
 * Der Build setzt NEXT_PUBLIC_OFFLINE=1; in der Online-App ist der Wert
 * nicht gesetzt. Funktionen, die Kursdaten aus dem Internet brauchen
 * (Wertpapiersuche, Kurse, Rückrechnung), zeigen offline einen Hinweis.
 */
export const IS_OFFLINE = process.env.NEXT_PUBLIC_OFFLINE === "1";

/** Stand der Offline-Datei (TT.MM.JJJJ), vom Build gesetzt. */
export const OFFLINE_BUILD_DATE = process.env.NEXT_PUBLIC_OFFLINE_BUILD_DATE ?? "";

/**
 * Eingebetteter Rechenkern für den Web Worker (Blob-Adresse). Eine Datei
 * auf der Festplatte darf keine weiteren Skriptdateien nachladen.
 */
export function offlineWorkerUrl(): string | undefined {
  return (globalThis as { __RPL_WORKER_URL__?: string }).__RPL_WORKER_URL__;
}
