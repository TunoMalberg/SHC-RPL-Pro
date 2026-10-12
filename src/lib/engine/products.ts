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
 *  - LV (Einmalerlag, Mantel über der Schelhammer-VV): investierte Basis =
 *    Erlag × (1 − 4 % VersSt − 1 % Einmalkosten); Erträge KESt-frei;
 *    Bindefrist 15 J bzw. 10 J ab Kaufalter ≥ 50; Auszahlung steuerfrei
 *    zum payoutAge (frühestens Bindefrist-Ende).
 *    Wachstum STOCHASTISCH je Pfad (createLvRuntime):
 *      Z_lv   = ρ·Z_aktien + √(1−ρ²)·ε
 *      Faktor = exp(ln(1+µ) − σ²/2 + σ·Z_lv) × (1 − 0,075 % p.a.)
 *    mit µ = Ertragserwartung nach VV-Kosten, σ = Volatilität, ρ = Gleichlauf
 *    mit dem Aktien-Topf. E[1+R] = 1+µ; σ = 0 ergibt exakt das frühere
 *    deterministische Modell. computeProductTimeline liefert den
 *    Erwartungspfad (σ ignoriert) für Käufe, WBA und Vorschau/Tests.
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
  LV_DEFAULT_EQUITY_CORR,
  LV_DEFAULT_VOL_PCT,
  LV_INSURANCE_TAX_PCT,
  LV_UPFRONT_COST_PCT,
} from "../defaults";
import { SeededRandom } from "./random";

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
  /** Steuerfreie Tilgungen/LV-Auszahlungen in € (→ Cash, Erwartungspfad). */
  payouts: number;
  /** Davon WBA-Tilgungen (deterministisch, auch in der Simulation). */
  wbaPayouts: number;
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
      wbaPayouts: 0,
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
      entries[maturity].wbaPayouts += bond.amount;
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

// ── Stochastische LV (Mantel über der VV) ───────────────────────────

/** Ergebnis eines LV-Jahresschritts eines Pfads. */
export interface LvYearResult {
  /** Summe der LV-Werte am Jahresende (nach Kosten). */
  lvValue: number;
  /** Steuerfreie LV-Auszahlungen dieses Jahres (→ Cash). */
  lvPayout: number;
}

export interface LvPathState {
  /**
   * Genau einmal pro Simulationsjahr aufrufen (Jahres-Offset aufsteigend).
   * @param zEquityYear standardisierter Aktienschock des Jahres (für den
   *                    Gleichlauf mit dem Aktien-Topf; 0 = neutral)
   */
  advanceYear(yearIdx: number, zEquityYear: number): LvYearResult;
}

export interface LvRuntime {
  /** Gibt es überhaupt LV-Polizzen mit Erlag? */
  active: boolean;
  newPathState(simIndex: number): LvPathState;
}

interface LvPolicyPlan {
  purchaseYear: number;
  payoutYear: number;
  investedBase: number;
  /** Log-Drift ln(1+µ) − σ²/2. */
  logDrift: number;
  sigma: number;
  rho: number;
  costFactor: number;
}

/**
 * Laufzeit für die stochastische LV-Berechnung. Ein eigener Zufallsstrom
 * je Pfad (Seed = (baseSeed ^ 0x1b5e1f) + simIndex) hält den Haupt-
 * Zufallsstrom unberührt: Pläne ohne LV bleiben bit-identisch, und der
 * Einzelpfad reproduziert den MC-Pfad gleichen Index exakt.
 */
export function createLvRuntime(
  policies: LVHolding[],
  currentAge: number,
  totalYears: number,
  baseSeed: number,
): LvRuntime {
  const upfrontFactor = 1 - (LV_INSURANCE_TAX_PCT + LV_UPFRONT_COST_PCT) / 100;
  const costFactor = 1 - LV_ANNUAL_COST_PCT / 100;
  const plans: LvPolicyPlan[] = [];
  for (const p of policies) {
    if (p.amount <= 0) continue;
    const purchaseYear = Math.max(0, Math.round(p.purchaseAge - currentAge));
    if (purchaseYear > totalYears) continue;
    const sigma = Math.max(0, (p.volatilityPct ?? LV_DEFAULT_VOL_PCT) / 100);
    const rho = Math.max(-1, Math.min(1, p.equityCorrelation ?? LV_DEFAULT_EQUITY_CORR));
    plans.push({
      purchaseYear,
      payoutYear: Math.round(lvEffectivePayoutAge(p) - currentAge),
      investedBase: p.amount * upfrontFactor,
      logDrift: Math.log(1 + p.expectedReturnPct / 100) - 0.5 * sigma * sigma,
      sigma,
      rho,
      costFactor,
    });
  }

  return {
    active: plans.length > 0,
    newPathState(simIndex: number): LvPathState {
      const rng = new SeededRandom((baseSeed ^ 0x1b5e1f) + simIndex);
      const values = plans.map(() => 0);
      const done = plans.map(() => false);
      return {
        advanceYear(yearIdx: number, zEquityYear: number): LvYearResult {
          // Ein idiosynkratischer Schock je Polizze und Jahr — immer gezogen
          // (auch vor dem Kauf), damit der Strom vom Kaufzeitpunkt
          // unabhängig und reproduzierbar bleibt.
          let lvValue = 0;
          let lvPayout = 0;
          for (let i = 0; i < plans.length; i++) {
            const plan = plans[i];
            const eps = rng.nextGaussian();
            if (done[i] || yearIdx < plan.purchaseYear) continue;
            if (yearIdx === plan.purchaseYear) {
              values[i] = plan.investedBase;
            } else {
              const z =
                plan.rho * zEquityYear +
                Math.sqrt(Math.max(0, 1 - plan.rho * plan.rho)) * eps;
              values[i] *= Math.exp(plan.logDrift + plan.sigma * z) * plan.costFactor;
            }
            if (yearIdx === plan.payoutYear) {
              // Steuerfreie Auszahlung → Cash; Polizze endet.
              lvPayout += values[i];
              values[i] = 0;
              done[i] = true;
              continue;
            }
            lvValue += values[i];
          }
          return { lvValue, lvPayout };
        },
      };
    },
  };
}

/**
 * Standardisierter Schock aus einer simulierten GBM-Rendite (Inversion von
 * generateCorrelatedReturns: r = exp(µ − σ²/2 + σ·z) − 1). σ = 0 → 0.
 */
export function shockFromReturn(r: number, mean: number, vol: number): number {
  if (vol <= 0 || r <= -1) return 0;
  return (Math.log(1 + r) - (mean - 0.5 * vol * vol)) / vol;
}
