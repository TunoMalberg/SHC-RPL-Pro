"use client";

import { useEffect, useReducer, type ReactNode } from "react";
import { AppContext, appReducer, initialState } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";
import type { UIMode } from "@/lib/types";

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

  // Beim Mount: Modus aus localStorage hydratisieren (nur wenn vorhanden).
  useEffect(() => {
    const { mode, chosen } = readPersistedMode();
    if (mode) {
      dispatch({ type: "SET_UI_MODE", payload: mode });
      if (!chosen) dispatch({ type: "MARK_UI_MODE_CHOSEN" });
    }
    // Falls beide Keys leer sind: kein Dispatch → uiModeChosen bleibt false →
    // Erstaufruf-Modal wird gezeigt. Default-Modus ist "classic".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bei Änderung: persistieren.
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

  return (
    <I18nProvider>
      <AppContext.Provider value={{ state, dispatch }}>
        {children}
      </AppContext.Provider>
    </I18nProvider>
  );
}