/**
 * Session-Persistenz für den App-State.
 *
 * Hintergrund:
 *   Vor dieser Datei lebte der gesamte Beratungsstand (Kundenprofil,
 *   Eingaben, Portfolio, Holdings …) ausschließlich in `useReducer`.
 *   Ein Browser-Refresh oder ein versehentliches Tab-Schließen löschte alles.
 *   Für ein Bank-Tool, das während eines 90-Min-Termins live bedient wird,
 *   ist das ein Showstopper (Audit C-2).
 *
 * Strategie:
 *   - `sessionStorage` (nicht `localStorage`) → Daten verschwinden mit dem
 *     Tab-Close, was DSGVO-freundlich ist und Banker-Sitzungen sauber
 *     trennt. Im Bank-Setup ist das genau richtig.
 *   - Nicht serialisiert: gigantische Trace-Strukturen (`detailedTrace`,
 *     `withdrawalHeatmap`), die teils 5 MB+ erreichen können. Sie werden
 *     nach Reload neu berechnet, wenn der Banker das wirklich braucht.
 *   - Schema-Versionierung über `__v`: Bei künftigen State-Migrationen
 *     erkennen wir alte Snapshots und verwerfen sie still.
 *
 * Aufruf:
 *   - `loadPersistedState()` in `AppProvider`-Mount-Effect.
 *   - `persistState(state)` debounced bei jedem Reducer-Tick.
 */

import type { AppState } from "./types";
import { logger } from "./logger";

const STORAGE_KEY = "veyder.session.v1";
const SCHEMA_VERSION = 1;

/** Felder, die *nicht* persistiert werden — zu groß und neu rechenbar. */
type PersistedState = Omit<
  AppState,
  "result" | "historicalResult" | "detailedTrace" | "comparisonResult"
> & {
  /** Hinweis-Flag: Hat es eine Simulation gegeben? Dann darf der UI-Layer
   *  einen Banner zeigen „Bitte Simulation neu berechnen". */
  hadResults?: boolean;
};

interface Envelope {
  __v: number;
  __ts: string;
  state: PersistedState;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function loadPersistedState(): Partial<AppState> | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope;
    if (!parsed || parsed.__v !== SCHEMA_VERSION || !parsed.state) {
      logger.info("Discarding incompatible persisted state", {
        scope: "persistence",
        version: parsed?.__v,
      });
      return null;
    }
    // Convert PersistedState back into Partial<AppState>:
    // result/historicalResult/detailedTrace bleiben null (nicht persistiert).
    const { hadResults: _hadResults, ...rest } = parsed.state;
    return rest;
  } catch (err) {
    logger.warn("Failed to load persisted state — starting fresh", { scope: "persistence" }, err);
    return null;
  }
}

export function persistState(state: AppState): void {
  if (!isBrowser()) return;
  try {
    const {
      result,
      historicalResult,
      detailedTrace,
      comparisonResult: _comparisonResult,
      ...rest
    } = state;
    const envelope: Envelope = {
      __v: SCHEMA_VERSION,
      __ts: new Date().toISOString(),
      state: { ...rest, hadResults: !!result || !!historicalResult || !!detailedTrace },
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (err) {
    // Quota überschritten oder Inkognito mit blockiertem Storage:
    // nicht crashen, nur loggen.
    logger.warn("Failed to persist state", { scope: "persistence" }, err);
  }
}

export function clearPersistedState(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}