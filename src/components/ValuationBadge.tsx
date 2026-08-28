"use client";

import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { DISPLAY_CONFIG } from "@/lib/displayConfig";

/**
 * Bewertungsbasis-Badge (CR 6/11): dauerhaft sichtbar im Sticky-Header,
 * klickbar zum Umschalten zwischen „heutiger Kaufkraft" (Default) und
 * „nominal". Kein realer Wert ohne Kennzeichnung, kein Nominalwert ohne
 * Jahresbezug — die konsumierenden Ansichten lesen `state.valuationMode`.
 */
export function ValuationBadge() {
  const { state, dispatch } = useAppState();
  const { t } = useI18n();
  const isReal = state.valuationMode === "real";

  const toggle = () => {
    const modes = DISPLAY_CONFIG.availableValuationModes;
    const next = modes[(modes.indexOf(state.valuationMode) + 1) % modes.length];
    dispatch({ type: "SET_VALUATION_MODE", payload: next });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`px-2 py-1 rounded-md font-medium text-xs transition-colors border ${
        isReal
          ? "bg-[#8FB687]/15 text-[#3d5c38] border-[#8FB687]/40 hover:bg-[#8FB687]/25"
          : "bg-[#FAC075]/20 text-[#5d4a1f] border-[#FAC075]/50 hover:bg-[#FAC075]/30"
      }`}
      title={t("valuation.badgeTooltip")}
      data-design-id="valuation-badge"
    >
      {isReal ? t("valuation.badgeReal") : t("valuation.badgeNominal")} ⇄
    </button>
  );
}
