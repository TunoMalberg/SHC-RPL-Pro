/**
 * Produkt-Töpfe (AP8): Wohnbauanleihe & fondsgebundene Lebensversicherung.
 *
 * Additive Töpfe nach dem PE-Muster: eine DETERMINISTISCHE, pfadunabhängige
 * Jahres-Timeline wird einmal vor der Monte-Carlo-Schleife berechnet; die
 * Engine wendet je Jahr Käufe (drainen die Cash-Kaskade), steuerfreie
 * Kupons und Auszahlungen (fließen in Cash) an und führt den Produktwert
 * als zusätzliches — nicht entnehmbares — Vermögen.
 *
 * Steuer-/Produktregeln (fachliche Freigabe Vorstand, 09/2026):
 *  - WBA: Fixkupon zu par, Zinsen steuerfrei, Mindestlaufzeit 11 Jahre,
 *    Tilgung (steuerfrei) am Laufzeitende. Keine Kursmodellierung.
 *  - LV (Einmalerlag): investierte Basis = Erlag × (1 − 4 % VersSt − 1 %
 *    Einmalkosten); Wachstum × (1 + r) × (1 − 0,075 % p.a.); Erträge
 *    KESt-frei; Bindefrist 15 J bzw. 10 J ab Kaufalter ≥ 50; Auszahlung
 *    steuerfrei zum payoutAge (frühestens Bindefrist-Ende). Deterministisch
 *    (v1, keine Volatilität) — dokumentiert im Methodiktext.
 *
 * Liquiditätssperre strukturell: Der Entnahme-Waterfall der Engine greift
 * nur auf die drei liquiden Töpfe zu; Produktwerte zählen (wie PE-NAV) im
 * Erfolgskriterium und Endvermögen, sind aber nie Entnahmequelle.
 *
 * Steuer-Neutralität (kritische Invariante): Käufe senken den
 * High-Watermark 1:1, steuerfreie Zuflüsse heben ihn 1:1 (identische
 * Semantik wie PE-Calls/-Distributions via applyPECashflowsToBuckets) —
 * dadurch löst kein steuerfreier Produkt-Cashflow Watermark-KESt aus.
 */

import type { LVHolding, WBAHolding } from "../types";
import {
  LV_ANNUAL_COST_PCT,
  LV_INSURANCE_TAX_PCT,
  LV_UPFRONT_COST_PCT,
} from "../defaults";

/** Aggregierte Produkt-Cashflows/-Werte eines Kalenderjahres. */
export interface ProductYearEntry {
  /** Jahres-Offset ab aktuellem Alter (0-indexiert). */
  yearOffset: number;
  /** Investorenalter in diesem Jahr. */
  age: number;
  /** Käufe in € (drainen die liquiden Töpfe, Cash zuerst). */
  purchases: number;
  /** Steuerfreie WBA-Kupons in € (→ Cash). */
  coupons: number;
  /** Steuerfreie Tilgungen/LV-Auszahlungen in € (→ Cash). */
  payouts: number;
  /** Nominale ausstehender WBA am Jahresende (par). */
  wbaValue: number;
  /** LV-Wert am Jahresende (nach Kosten). */
  lvValue: number;
  /** Gesamtwert der Produkt-Töpfe am Jahresende. */
  totalValue: number;
}

/** Effektives LV-Auszahlungsalter: payoutAge, geklemmt auf ≥ Bindefrist-Ende. */
export function lvEffectivePayoutAge(lv: LVHolding): number {
  const lockEnd = lv.purchaseAge + lv.lockYears;
  return Math.max(lockEnd, lv.payoutAge ?? lockEnd);
}

/**
 * Deterministische Jahres-Timeline aller Produkt-Positionen.
 * Länge totalYears + 1 (Index = Jahres-Offset ab currentAge).
 * Käufe vor currentAge werden auf das Jahr 0 geklemmt (Bestandskauf).
 */
export function computeProductTimeline(
  wba: WBAHolding[],
  lv: LVHolding[],
  currentAge: number,
  totalYears: number,
): ProductYearEntry[] {
  const entries: ProductYearEntry[] = Array.from(
    { length: totalYears + 1 },
    (_, y) => ({
      yearOffset: y,
      age: currentAge + y,
      purchases: 0,
      coupons: 0,
      payouts: 0,
      wbaValue: 0,
      lvValue: 0,
      totalValue: 0,
    }),
  );
  if (wba.length === 0 && lv.length === 0) return entries;

  // ── Wohnbauanleihen ───────────────────────────────────────────────
  for (const bond of wba) {
    if (bond.amount <= 0) continue;
    const y0 = Math.max(0, Math.round(bond.purchaseAge - currentAge));
    if (y0 > totalYears) continue;
    const maturity = y0 + Math.max(1, Math.round(bond.termYears));
    entries[y0].purchases += bond.amount;
    for (let y = y0 + 1; y <= Math.min(maturity, totalYears); y++) {
      entries[y].coupons += (bond.amount * bond.couponPct) / 100;
    }
    if (maturity <= totalYears) {
      entries[maturity].payouts += bond.amount;
    }
    // Wert: Nominale (par) vom Kaufjahr bis vor die Tilgung; hinter dem
    // Horizont laufende Anleihen zählen bis zum Horizont im Vermögen.
    for (let y = y0; y < Math.min(maturity, totalYears + 1); y++) {
      entries[y].wbaValue += bond.amount;
    }
  }

  // ── Lebensversicherungen ──────────────────────────────────────────
  const upfrontFactor = 1 - (LV_INSURANCE_TAX_PCT + LV_UPFRONT_COST_PCT) / 100;
  for (const policy of lv) {
    if (policy.amount <= 0) continue;
    const y0 = Math.max(0, Math.round(policy.purchaseAge - currentAge));
    if (y0 > totalYears) continue;
    const payoutYear = Math.round(lvEffectivePayoutAge(policy) - currentAge);
    entries[y0].purchases += policy.amount;
    let value = policy.amount * upfrontFactor;
    const growth =
      (1 + policy.expectedReturnPct / 100) * (1 - LV_ANNUAL_COST_PCT / 100);
    for (let y = y0; y <= totalYears; y++) {
      if (y > y0) value *= growth;
      if (y === payoutYear && payoutYear <= totalYears) {
        // Steuerfreie Auszahlung → Cash; Wert ab hier 0.
        entries[y].payouts += value;
        value = 0;
        entries[y].lvValue += 0;
        break;
      }
      entries[y].lvValue += value;
    }
  }

  for (const e of entries) {
    e.totalValue = e.wbaValue + e.lvValue;
  }
  return entries;
}

/** Gibt es überhaupt wirksame Produkt-Positionen? */
export function hasProductHoldings(entries: ProductYearEntry[]): boolean {
  return entries.some(
    (e) => e.purchases > 0 || e.totalValue > 0 || e.coupons > 0 || e.payouts > 0,
  );
}
