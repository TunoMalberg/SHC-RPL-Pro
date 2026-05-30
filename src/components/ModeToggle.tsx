"use client";

import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

/**
 * Header-Pille zur Umschaltung zwischen Klassik- und Pro-Modus.
 *
 * Anzeige im Header: "Ruhestandsplaner —  Klassik · Pro" (nicht-aktiver Modus
 * ausgegraut). Beide Labels sind klickbar, ein Klick auf den bereits aktiven
 * Modus ist no-op.
 */
export function ModeToggle() {
  const { state, dispatch } = useAppState();
  const { t } = useI18n();
  const mode = state.uiMode;

  const setMode = (next: "classic" | "pro") => {
    if (next !== mode) {
      dispatch({ type: "SET_UI_MODE", payload: next });
    }
  };

  return (
    <div
      className="flex items-center gap-1 select-none"
      data-design-id="mode-toggle"
      title={t("mode.toggleTitle")}
    >
      <span
        className="text-xs font-semibold text-[#20201E] mr-1"
        data-design-id="mode-toggle-prefix"
      >
        {t("app.titleShort")}
        <span className="text-neutral-400"> —</span>
      </span>
      <button
        type="button"
        onClick={() => setMode("classic")}
        aria-pressed={mode === "classic"}
        className={`text-xs font-semibold px-2 py-1 rounded-md transition-colors ${
          mode === "classic"
            ? "text-[#D31220] bg-red-50"
            : "text-neutral-400 hover:text-neutral-600"
        }`}
        data-design-id="mode-toggle-classic"
      >
        {t("mode.classic")}
      </button>
      <span className="text-neutral-300 text-xs">·</span>
      <button
        type="button"
        onClick={() => setMode("pro")}
        aria-pressed={mode === "pro"}
        className={`text-xs font-semibold px-2 py-1 rounded-md transition-colors ${
          mode === "pro"
            ? "text-[#D31220] bg-red-50"
            : "text-neutral-400 hover:text-neutral-600"
        }`}
        data-design-id="mode-toggle-pro"
      >
        {t("mode.pro")}
      </button>
    </div>
  );
}