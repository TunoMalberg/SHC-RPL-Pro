"use client";

import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { AppContext, appReducer, initialState } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";
import { loadPersistedState, persistState } from "@/lib/persistence";
import type { UIMode, AppState } from "@/lib/types";

const STORAGE_KEY = "veyder.uiMode";
const STORAGE_KEY_CHOSEN = "veyder.uiModeChosen";

function readPersistedMode(): { mode: UIMode | null; chosen: boolean } {
  if (typeof window === "undefined") return { mode: null, chosen: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const chosen = window.localStorage.getItem(STORAGE_KEY_CHOSEN) === "1";
    if (raw === "classic" || raw === "pro") return { mode: raw, chosen };
    return { mode: null, chosen };
  } catch {
    return { mode: null, chosen: false };
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const hydratedRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Beim Mount: Modus aus localStorage hydratisieren und Session-Snapshot laden.
  useEffect(() => {
    const { mode, chosen } = readPersistedMode();
    if (mode) {
      dispatch({ type: "SET_UI_MODE", payload: mode });
      if (!chosen) dispatch({ type: "MARK_UI_MODE_CHOSEN" });
    }

    // Session-Persistenz: Beratungsstand wiederherstellen, falls vorhanden.
    // Wir setzen jeden bekannten Slice einzeln per dispatch — robuster als
    // ein Bulk-RESET-Hydrate, weil dadurch keine Action-Erweiterung nötig ist.
    const persisted = loadPersistedState();
    if (persisted) {
      if (persisted.client) dispatch({ type: "SET_CLIENT", payload: persisted.client });
      if (persisted.advisor) dispatch({ type: "SET_ADVISOR", payload: persisted.advisor });
      if (persisted.inputs) dispatch({ type: "SET_INPUTS", payload: persisted.inputs });
      if (persisted.portfolio) dispatch({ type: "SET_PORTFOLIO", payload: persisted.portfolio });
      if (persisted.settings) dispatch({ type: "SET_SETTINGS", payload: persisted.settings });
      if (persisted.liquidityEvents) dispatch({ type: "SET_LIQUIDITY_EVENTS", payload: persisted.liquidityEvents });
      if (persisted.holdings) dispatch({ type: "SET_HOLDINGS", payload: persisted.holdings });
      if (persisted.activeTab) dispatch({ type: "SET_TAB", payload: persisted.activeTab });
      // Szenarien einzeln hinzufügen, damit kein Type-Mismatch entsteht.
      if (Array.isArray(persisted.scenarios)) {
        for (const s of persisted.scenarios) {
          dispatch({ type: "ADD_SCENARIO", payload: s });
        }
      }
    }
    hydratedRef.current = true;
  }, []);

  // UI-Modus persistieren.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, state.uiMode);
      if (state.uiModeChosen) {
        window.localStorage.setItem(STORAGE_KEY_CHOSEN, "1");
      }
    } catch {
      /* noop – z. B. Inkognito-Modus mit blockiertem Storage */
    }
  }, [state.uiMode, state.uiModeChosen]);

  // Session-State debounced (300 ms) persistieren.
  // Erst nach Hydration, damit der frische Snapshot nicht überschrieben wird.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistState(state as AppState);
    }, 300);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [state]);

  return (
    <I18nProvider>
      <AppContext.Provider value={{ state, dispatch }}>
        {children}
      </AppContext.Provider>
    </I18nProvider>
  );
}