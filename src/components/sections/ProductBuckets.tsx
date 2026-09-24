"use client";

import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fmtEur } from "@/lib/format";
import {
  MAX_PRODUCT_HOLDINGS,
  WBA_MIN_TERM_YEARS,
  deriveLvLockYears,
  makeDefaultLV,
  makeDefaultWBA,
} from "@/lib/defaults";
import type { LVHolding, WBAHolding } from "@/lib/types";

/**
 * Produkt-Töpfe (AP8): Wohnbauanleihe & fondsgebundene Lebensversicherung.
 *
 * Additive Töpfe nach dem PE-Muster — eigene Karten im Portfolio-Reiter
 * (Pro-Modus). Steuer-/Produktregeln laut fachlicher Freigabe; alle
 * Parameter je Position editierbar. Die LV-Bindefrist wird bei Änderung
 * des Kaufalters automatisch gesetzt (10 J ab Alter 50, sonst 15 J) und
 * bleibt danach editierbar (Validierung erzwingt das gesetzliche Minimum).
 */
export function ProductBuckets() {
  const { state, dispatch } = useAppState();
  const { portfolio, client } = state;
  const { t } = useI18n();

  const wbas = portfolio.wohnbauanleihen ?? [];
  const lvs = portfolio.lebensversicherungen ?? [];

  const setWbas = (next: WBAHolding[]) =>
    dispatch({ type: "SET_PORTFOLIO", payload: { wohnbauanleihen: next } });
  const setLvs = (next: LVHolding[]) =>
    dispatch({ type: "SET_PORTFOLIO", payload: { lebensversicherungen: next } });

  const updateWba = (id: string, patch: Partial<WBAHolding>) =>
    setWbas(wbas.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const updateLv = (id: string, patch: Partial<LVHolding>) =>
    setLvs(lvs.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  return (
    <Card className="border-[#FAC075]/50 bg-gradient-to-br from-[#FAC075]/10 to-white" data-design-id="product-buckets-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2" data-design-id="product-buckets-title">
          <span className="w-8 h-8 rounded-lg bg-[#FAC075]/25 text-[#b8863b] flex items-center justify-center text-sm font-bold">P</span>
          {t("products.title")}
        </CardTitle>
        <p className="text-xs text-slate-500 mt-1">{t("products.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Wohnbauanleihen ─────────────────────────────────────── */}
        <div className="rounded-lg border border-[#87BBE6]/40 bg-[#87BBE6]/5 p-3" data-design-id="wba-section">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-[#3a7cb8]">{t("products.wbaTitle")}</div>
              <p className="text-[11px] text-slate-400 mt-0.5">{t("products.wbaRules")}</p>
            </div>
            <Button
              size="sm"
              onClick={() => setWbas([...wbas, makeDefaultWBA(client.currentAge, wbas.length)])}
              disabled={wbas.length >= MAX_PRODUCT_HOLDINGS}
              className="h-8 bg-[#3a7cb8] hover:bg-[#2f6494]"
              data-design-id="add-wba-button"
            >
              + {t("products.addWba")}
            </Button>
          </div>

          {wbas.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-3">{t("products.wbaEmpty")}</p>
          ) : (
            <div className="space-y-3 mt-3">
              {wbas.map((w) => {
                const maturityAge = w.purchaseAge + w.termYears;
                return (
                  <div key={w.id} className="rounded-lg bg-white border border-slate-200 p-3" data-design-id={`wba-row-${w.id}`}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Input
                        type="text"
                        value={w.name}
                        onChange={(e) => updateWba(w.id, { name: e.target.value })}
                        maxLength={40}
                        className="h-8 text-sm font-medium max-w-60"
                      />
                      <button
                        onClick={() => setWbas(wbas.filter((x) => x.id !== w.id))}
                        className="text-slate-400 hover:text-rose-600 text-lg leading-none"
                        title={t("products.remove")}
                      >
                        ×
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <Label className="text-xs">{t("products.amount")}</Label>
                        <FormattedNumberInput value={w.amount} onChange={(v) => updateWba(w.id, { amount: v })} prefix="€ " className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">{t("products.coupon")}</Label>
                        <Input type="number" value={w.couponPct} onChange={(e) => updateWba(w.id, { couponPct: parseFloat(e.target.value) || 0 })} step={0.1} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">{t("products.termYears")}</Label>
                        <Input
                          type="number"
                          value={w.termYears}
                          onChange={(e) => updateWba(w.id, { termYears: Math.max(WBA_MIN_TERM_YEARS, parseInt(e.target.value) || WBA_MIN_TERM_YEARS) })}
                          min={WBA_MIN_TERM_YEARS}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t("products.purchaseAge")}</Label>
                        <Input
                          type="number"
                          value={w.purchaseAge}
                          onChange={(e) => updateWba(w.id, { purchaseAge: Math.max(client.currentAge, parseInt(e.target.value) || client.currentAge) })}
                          min={client.currentAge}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      {t("products.wbaRowHint")
                        .replace("{coupon}", fmtEur((w.amount * w.couponPct) / 100))
                        .replace("{maturityAge}", String(maturityAge))}
                      {maturityAge > client.lifeExpectancy && (
                        <span className="text-amber-700"> {t("products.beyondHorizonWarn")}</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Lebensversicherungen ────────────────────────────────── */}
        <div className="rounded-lg border border-[#8FB687]/40 bg-[#8FB687]/5 p-3" data-design-id="lv-section">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-[#5a8a50]">{t("products.lvTitle")}</div>
              <p className="text-[11px] text-slate-400 mt-0.5">{t("products.lvRules")}</p>
            </div>
            <Button
              size="sm"
              onClick={() => setLvs([...lvs, makeDefaultLV(client.currentAge, lvs.length)])}
              disabled={lvs.length >= MAX_PRODUCT_HOLDINGS}
              className="h-8 bg-[#5a8a50] hover:bg-[#4a7342]"
              data-design-id="add-lv-button"
            >
              + {t("products.addLv")}
            </Button>
          </div>

          {lvs.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-3">{t("products.lvEmpty")}</p>
          ) : (
            <div className="space-y-3 mt-3">
              {lvs.map((l) => {
                const lockEndAge = l.purchaseAge + l.lockYears;
                const payoutAge = Math.max(lockEndAge, l.payoutAge ?? lockEndAge);
                return (
                  <div key={l.id} className="rounded-lg bg-white border border-slate-200 p-3" data-design-id={`lv-row-${l.id}`}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Input
                        type="text"
                        value={l.name}
                        onChange={(e) => updateLv(l.id, { name: e.target.value })}
                        maxLength={40}
                        className="h-8 text-sm font-medium max-w-60"
                      />
                      <button
                        onClick={() => setLvs(lvs.filter((x) => x.id !== l.id))}
                        className="text-slate-400 hover:text-rose-600 text-lg leading-none"
                        title={t("products.remove")}
                      >
                        ×
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <div>
                        <Label className="text-xs">{t("products.lvAmount")}</Label>
                        <FormattedNumberInput value={l.amount} onChange={(v) => updateLv(l.id, { amount: v })} prefix="€ " className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">{t("products.lvReturn")}</Label>
                        <Input type="number" value={l.expectedReturnPct} onChange={(e) => updateLv(l.id, { expectedReturnPct: parseFloat(e.target.value) || 0 })} step={0.1} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">{t("products.purchaseAge")}</Label>
                        <Input
                          type="number"
                          value={l.purchaseAge}
                          onChange={(e) => {
                            const age = Math.max(client.currentAge, parseInt(e.target.value) || client.currentAge);
                            // Gesetzliche Bindefrist bei Kaufalter-Änderung
                            // automatisch neu ableiten (10 J ab 50, sonst 15 J).
                            updateLv(l.id, { purchaseAge: age, lockYears: deriveLvLockYears(age) });
                          }}
                          min={client.currentAge}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t("products.lockYears")}</Label>
                        <Input
                          type="number"
                          value={l.lockYears}
                          onChange={(e) => {
                            const minLock = deriveLvLockYears(l.purchaseAge);
                            updateLv(l.id, { lockYears: Math.max(minLock, parseInt(e.target.value) || minLock) });
                          }}
                          min={deriveLvLockYears(l.purchaseAge)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t("products.payoutAge")}</Label>
                        <Input
                          type="number"
                          value={payoutAge}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || lockEndAge;
                            updateLv(l.id, { payoutAge: Math.max(lockEndAge, v) });
                          }}
                          min={lockEndAge}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      {t("products.lvRowHint")
                        .replace("{invested}", fmtEur(Math.round(l.amount * 0.95)))
                        .replace("{lockEndAge}", String(lockEndAge))}
                      {payoutAge > client.lifeExpectancy && (
                        <span className="text-amber-700"> {t("products.beyondHorizonWarn")}</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400" data-design-id="products-liquidity-note">
          ℹ️ {t("products.liquidityNote")}
        </p>
      </CardContent>
    </Card>
  );
}
