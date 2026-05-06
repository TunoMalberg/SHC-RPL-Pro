"use client";

import { useI18n, type Locale } from "@/lib/i18n";

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();

  return (
    <div
      className="relative flex items-center bg-neutral-100 rounded-full p-0.5 w-[72px] h-8 cursor-pointer select-none"
      onClick={() => setLocale(locale === "de" ? "en" : "de")}
      title={locale === "de" ? "Switch to English" : "Auf Deutsch wechseln"}
      data-design-id="language-toggle"
    >
      <div
        className="absolute top-0.5 left-0.5 h-7 w-[34px] bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out"
        style={{ transform: locale === "en" ? "translateX(32px)" : "translateX(0)" }}
      />
      <span
        className={`relative z-10 flex-1 text-center text-xs font-semibold transition-colors ${
          locale === "de" ? "text-[#D31220]" : "text-neutral-400"
        }`}
      >
        DE
      </span>
      <span
        className={`relative z-10 flex-1 text-center text-xs font-semibold transition-colors ${
          locale === "en" ? "text-[#D31220]" : "text-neutral-400"
        }`}
      >
        EN
      </span>
    </div>
  );
}