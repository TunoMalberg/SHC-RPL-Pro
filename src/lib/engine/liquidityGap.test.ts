/**
 * Liquiditätslücke (Vorgabe 10/2026):
 *  - Entnahmen nur aus Liquidität — die drei Töpfe plus das, was im selben
 *    Jahr aus PE, Wohnbauanleihe oder LV tatsächlich zufließt.
 *  - Gebundenes Vermögen rettet kein Jahr (zählt aber zum Endvermögen).
 *  - Käufe nur in Höhe der vorhandenen Liquidität; nur der bezahlte Teil zählt.
 */

import { describe, expect, test } from "bun:test";
import { defaultClient, defaultInputs, defaultPortfolio, defaultSettings } from "../defaults";
import { runDetailedSingleSimulation, runMonteCarloSimulation } from "./montecarlo";
import { validatePlanInputs } from "../validation";

const settings = { ...defaultSettings, numSimulations: 400, timeStepMonths: 12 };

// 60 J, Pension mit 63, 600.000 €, davon 300.000 € in einer FLV mit Auszahlung erst mit 75.
const client = { ...defaultClient, currentAge: 60, birthYear: 1966, retirementAge: 63, lifeExpectancy: 90 };
const inputs = {
  ...defaultInputs,
  initialCapital: 600_000,
  monthlySavings: 0,
  desiredMonthlyWithdrawal: 3_600,
  monthlyPension: 1_500,
  pensionStartAge: 63,
};
const lvPortfolio = {
  ...defaultPortfolio,
  lebensversicherungen: [
    { id: "l", name: "FLV", purchaseAge: 60, amount: 300_000, expectedReturnPct: 6, volatilityPct: 12, equityCorrelation: 0.8, lockYears: 15 },
  ],
};

describe("Liquiditätslücke", () => {
  const mc = runMonteCarloSimulation(client, inputs, lvPortfolio, settings, []);

  test("Lücke vor der Polizzen-Auszahlung wird erkannt und zählt nicht als Erfolg", () => {
    const gap = mc.liquidityGap;
    expect(gap).toBeTruthy();
    if (!gap) return;
    expect(gap.withLockedAssetsPct).toBeGreaterThan(0);
    expect(gap.medianFirstAge).toBeLessThan(75); // vor der Auszahlung mit 75
    expect(gap.medianLockedValue).toBeGreaterThan(0);
    // Jeder Pfad mit Lücke ist gescheitert (± Randfall exakt gleicher Betrag)
    expect(mc.successRate + gap.probabilityPct).toBeCloseTo(100, 0);
  });

  test("Einzelpfad: nicht gedeckter Betrag je Jahr, Polizze rettet das Jahr nicht", () => {
    // Ersten Verlauf suchen, in dem die Lücke noch VOR der Polizzen-Auszahlung liegt.
    let found: { trace: ReturnType<typeof runDetailedSingleSimulation>; row: ReturnType<typeof runDetailedSingleSimulation>["rows"][number] } | null = null;
    for (let sim = 0; sim < settings.numSimulations && !found; sim++) {
      const tr = runDetailedSingleSimulation(client, inputs, lvPortfolio, settings, sim, []);
      const row = tr.rows.find((r) => (r.unpaidWithdrawal ?? 0) > 0 && (r.lvValue ?? 0) > 0);
      if (row) found = { trace: tr, row };
    }
    expect(found).not.toBeNull();
    if (!found) return;
    const { trace, row: gapRow } = found;
    expect(trace.success).toBe(false);
    // Polizze in diesem Jahr noch gebunden (Wert > 0), trotzdem Lücke
    expect(gapRow.lvValue ?? 0).toBeGreaterThan(0);
    // Gezahlt + nicht gedeckt = benötigte Entnahme
    const paid = gapRow.withdrawalFromCash + gapRow.withdrawalFromBonds + gapRow.withdrawalFromEquities;
    expect(paid + (gapRow.unpaidWithdrawal ?? 0)).toBeCloseTo(-gapRow.cashflow, 2);
  });

  test("Plan ohne gebundenes Vermögen: keine Karte nötig (keine Lücke mit gebundenem Vermögen)", () => {
    const plain = runMonteCarloSimulation(client, inputs, defaultPortfolio, settings, []);
    expect(plain.liquidityGap?.withLockedAssetsPct ?? 0).toBe(0);
  });
});

describe("Reihenfolge am Jahresanfang", () => {
  test("100 % in eine Wohnbauanleihe: Kauf vor der Marktrendite, kein Aktienbestand", () => {
    const allIn = { ...defaultInputs, initialCapital: 250_000, monthlySavings: 0, desiredMonthlyWithdrawal: 3_000 };
    const portfolio = {
      ...defaultPortfolio,
      wohnbauanleihen: [{ id: "w", name: "WBA", purchaseAge: defaultClient.currentAge, amount: 250_000, couponPct: 3, termYears: 11 }],
    };
    const trace = runDetailedSingleSimulation(defaultClient, allIn, portfolio, settings, 0, []);
    const first = trace.rows[0];
    expect(first.productPurchase).toBe(250_000);
    // Keine Rendite auf das bereits investierte Geld im Kaufjahr
    expect(first.returnEquities).toBe(0);
    expect(first.returnBonds).toBe(0);
    expect(first.endTotal).toBeCloseTo(0, 6);
    // Ab dem Folgejahr: nur Zinsen (7.500 €) werden laut Aufteilung angelegt
    expect(trace.rows[1].productCoupon).toBe(7_500);
    expect(trace.rows[1].startTotal).toBeCloseTo(0, 6);
  });
});

describe("Kauf größer als Liquidität", () => {
  // 30.000 € Kapital, Wohnbauanleihe über 50.000 € heute → nur 60 % kaufbar.
  const smallInputs = { ...defaultInputs, initialCapital: 30_000, monthlySavings: 0, desiredMonthlyWithdrawal: 1_000 };
  const wbaPortfolio = {
    ...defaultPortfolio,
    wohnbauanleihen: [{ id: "w", name: "WBA", purchaseAge: defaultClient.currentAge, amount: 50_000, couponPct: 3, termYears: 11 }],
  };

  test("nur der bezahlte Teil wird gekauft, verzinst und bewertet", () => {
    const trace = runDetailedSingleSimulation(defaultClient, smallInputs, wbaPortfolio, settings, 0, []);
    const first = trace.rows[0];
    const paid = first.productPurchase ?? 0;
    expect(paid).toBeLessThan(50_000);
    expect(paid).toBeGreaterThan(0);
    const share = paid / 50_000;
    expect(first.wbaValue ?? 0).toBeCloseTo(50_000 * share, 4);
    expect(trace.rows[1].productCoupon ?? 0).toBeCloseTo(1_500 * share, 4);
    // Kein Vermögen aus dem Nichts: Endstand Jahr 0 ≤ Startkapital + Rendite
    expect((first.wbaValue ?? 0) + first.endTotal).toBeLessThan(30_000 * 1.2);
  });

  test("Eingabe-Hinweis, wenn heutige Käufe das Anfangskapital übersteigen", () => {
    const v = validatePlanInputs(defaultClient, smallInputs, wbaPortfolio, []);
    expect(v.errors.some((e) => e.path === "portfolio.products" && e.severity === "warn")).toBe(true);
    const ok = validatePlanInputs(defaultClient, { ...smallInputs, initialCapital: 100_000 }, wbaPortfolio, []);
    expect(ok.errors.some((e) => e.path === "portfolio.products")).toBe(false);
  });
});
