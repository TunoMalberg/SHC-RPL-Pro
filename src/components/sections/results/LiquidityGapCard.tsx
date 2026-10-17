"use client";

import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { fmtEur, fmtPct } from "@/lib/format";
import type { SimulationResult } from "@/lib/types";

/**
 * Liquiditätslücke: Entnahmen kommen nur aus den drei liquiden Töpfen (plus
 * dem, was im selben Jahr aus PE, Wohnbauanleihe oder LV zufließt). Fehlt
 * dort Geld, während noch gebundenes Vermögen vorhanden ist, ist der Plan
 * falsch strukturiert — zu viel gesperrt, Auszahlungen zu spät. Die Karte
 * erscheint nur in diesem Fall (sonst steckt die Lücke schon vollständig in
 * der Erfolgsquote).
 */
export function LiquidityGapCard({ result }: { result: SimulationResult }) {
  const { t } = useI18n();
  const gap = result.liquidityGap;
  if (!gap || gap.withLockedAssetsPct <= 0) return null;

  return (
    <Card className="border-rose-200 bg-rose-50/60" data-design-id="liquidity-gap-card">
      <CardContent className="pt-4 pb-4 space-y-2">
        <div className="text-sm font-semibold text-rose-800">⚠ {t("results.liqGap.title")}</div>
        <p className="text-sm text-slate-700 leading-relaxed">
          {t("results.liqGap.body")
            .replace("{pct}", fmtPct(gap.probabilityPct))
            .replace("{age}", String(Math.round(gap.medianFirstAge)))
            .replace("{unpaid}", fmtEur(gap.medianUnpaidReal))}
        </p>
        <p className="text-sm text-slate-700 leading-relaxed">
          {t("results.liqGap.locked")
            .replace("{pct}", fmtPct(gap.withLockedAssetsPct))
            .replace("{locked}", fmtEur(gap.medianLockedValue))}
        </p>
        <p className="text-xs text-slate-500">{t("results.liqGap.hint")}</p>
      </CardContent>
    </Card>
  );
}
