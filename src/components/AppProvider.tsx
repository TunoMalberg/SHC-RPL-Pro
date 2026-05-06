"use client";

import { useReducer, type ReactNode } from "react";
import { AppContext, appReducer, initialState } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <I18nProvider>
      <AppContext.Provider value={{ state, dispatch }}>
        {children}
      </AppContext.Provider>
    </I18nProvider>
  );
}