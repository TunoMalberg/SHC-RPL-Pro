"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { de } from "./translations/de";
import { en } from "./translations/en";

export type Locale = "de" | "en";

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

// Export für i18n-Tests (Key-Vollständigkeit de/en, Fix-Label-Checks).
export const translations: Record<Locale, Record<string, string>> = { de, en };

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("de");

  const t = useCallback(
    (key: string): string => translations[locale][key] ?? key,
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}