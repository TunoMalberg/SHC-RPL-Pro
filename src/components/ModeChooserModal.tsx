"use client";

import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

/**
 * Erstaufruf-Modal: Erscheint einmalig, solange `state.uiModeChosen === false`.
 * Nach Auswahl wird `SET_UI_MODE` dispatched (setzt automatisch
 * `uiModeChosen = true` und persistiert).
 */
export function ModeChooserModal() {
  const { state, dispatch } = useAppState();
  const { t } = useI18n();

  if (state.uiModeChosen) return null;

  const choose = (mode: "classic" | "pro") => {
    dispatch({ type: "SET_UI_MODE", payload: mode });
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      data-design-id="mode-chooser-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 sm:p-8"
        data-design-id="mode-chooser-card"
      >
        <h2 className="text-xl sm:text-2xl font-bold text-[#20201E] mb-1">
          {t("mode.chooser.title")}
        </h2>
        <p className="text-sm text-[#4D4A47] mb-6">
          {t("mode.chooser.subtitle")}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Klassik */}
          <button
            type="button"
            onClick={() => choose("classic")}
            className="group text-left rounded-xl border-2 border-neutral-200 hover:border-[#D31220] hover:shadow-lg transition-all p-5 bg-white"
            data-design-id="mode-chooser-classic"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-md bg-red-50 text-[#D31220] text-[10px] font-bold uppercase tracking-wide">
                {t("mode.chooser.recommended")}
              </span>
              <h3 className="text-lg font-bold text-[#20201E]">
                {t("mode.classic")}
              </h3>
            </div>
            <p className="text-xs text-[#4D4A47] mb-3">
              {t("mode.chooser.classicDesc")}
            </p>
            <ul className="text-xs text-[#4D4A47] space-y-1 mb-4">
              <li>✓ {t("mode.chooser.classicBullet1")}</li>
              <li>✓ {t("mode.chooser.classicBullet2")}</li>
              <li>✓ {t("mode.chooser.classicBullet3")}</li>
            </ul>
            <div className="text-sm font-semibold text-[#D31220] group-hover:underline">
              {t("mode.chooser.chooseClassic")} →
            </div>
          </button>

          {/* Pro */}
          <button
            type="button"
            onClick={() => choose("pro")}
            className="group text-left rounded-xl border-2 border-neutral-200 hover:border-[#20201E] hover:shadow-lg transition-all p-5 bg-white"
            data-design-id="mode-chooser-pro"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-md bg-neutral-900 text-white text-[10px] font-bold uppercase tracking-wide">
                {t("mode.chooser.advanced")}
              </span>
              <h3 className="text-lg font-bold text-[#20201E]">
                {t("mode.pro")}
              </h3>
            </div>
            <p className="text-xs text-[#4D4A47] mb-3">
              {t("mode.chooser.proDesc")}
            </p>
            <ul className="text-xs text-[#4D4A47] space-y-1 mb-4">
              <li>✓ {t("mode.chooser.proBullet1")}</li>
              <li>✓ {t("mode.chooser.proBullet2")}</li>
              <li>✓ {t("mode.chooser.proBullet3")}</li>
            </ul>
            <div className="text-sm font-semibold text-[#20201E] group-hover:underline">
              {t("mode.chooser.choosePro")} →
            </div>
          </button>
        </div>

        <p className="text-[11px] text-neutral-400 mt-5 text-center">
          {t("mode.chooser.footer")}
        </p>
      </div>
    </div>
  );
}