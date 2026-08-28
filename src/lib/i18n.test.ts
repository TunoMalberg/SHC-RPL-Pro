/**
 * i18n-Tests (CR 3/7/8/16): verbindliche Labels exakt, neue Keys in
 * beiden Sprachen vorhanden, keine wertende Lebensstandard-Sprache.
 */
import { describe, expect, test } from "bun:test";
import { translations } from "./i18n";

const de = translations.de;
const en = translations.en;

// Alle im CR neu eingeführten bzw. umbenannten Keys.
const NEW_KEYS = [
  "inputs.monthlyWithdrawal",
  "inputs.monthlyPension",
  "inputs.neededFromWealth",
  "inputs.purchasingPowerHint",
  "inputs.nominalEntryWarning",
  "inputs.withdrawalOptionalHint",
  "inputs.expertSection",
  "liquidity.incomeTitle",
  "liquidity.incomeExamples",
  "liquidity.expenseTitle",
  "liquidity.expenseExamples",
  "liquidity.addIncome",
  "liquidity.addExpense",
  "valuation.badgeReal",
  "valuation.badgeNominal",
  "valuation.axisReal",
  "valuation.axisNominal",
  "valuation.suffixReal",
  "valuation.suffixNominal",
  "corridor.titleReal",
  "corridor.difficult",
  "corridor.typical",
  "corridor.favorable",
  "corridor.advisorNote",
  "results.possibleModeTitle",
  "results.possibleModeDesc",
  "results.rankingBelow",
  "results.rankingWithin",
  "results.rankingAbove",
  "tab.compare",
  "compare.viewTitle",
  "compare.variantNoInvest",
  "compare.variantCurrent",
  "compare.variantTarget",
  "compare.monthlyReal",
  "compare.monthlyNominal",
  "compare.noBlanketClaim",
  "compare.cta.overCorridor",
  "compare.cta.inCorridor",
  "compare.cta.underCorridor",
  "compare.cta.possibleMode",
  "notice.dataCompleteness",
  "notice.dataCompletenessConfirm",
  "trace.title",
  "trace.download",
];

describe("i18n — CR-Keys", () => {
  test("alle neuen Keys existieren in DE und EN", () => {
    for (const key of NEW_KEYS) {
      expect(de[key], `DE fehlt: ${key}`).toBeDefined();
      expect(en[key], `EN fehlt: ${key}`).toBeDefined();
      expect(de[key].length).toBeGreaterThan(0);
      expect(en[key].length).toBeGreaterThan(0);
    }
  });

  test("verbindliche Labels exakt (CR 3)", () => {
    expect(de["inputs.monthlyWithdrawal"]).toContain(
      "Gewünschter monatlicher Gesamtbetrag in heutiger Kaufkraft",
    );
    expect(de["inputs.monthlyPension"]).toContain(
      "Welche laufenden (Pensions-)Einkünfte erwarten Sie?",
    );
    expect(de["inputs.neededFromWealth"]).toBe(
      "Benötigt aus dem Vermögen in heutiger Kaufkraft",
    );
    expect(de["inputs.purchasingPowerHint"]).toBe(
      "Bitte geben Sie die Beträge aus heutiger Sicht ein. Die Berechnung berücksichtigt die künftige Inflation automatisch.",
    );
  });

  test("verbindliches Ergebnis-Label (CR 7)", () => {
    expect(de["compare.monthlyReal"]).toBe("Monatsentnahme in heutiger Kaufkraft");
    expect(de["compare.monthlyNominal"]).toContain("Monatsentnahme nominal");
    // Nominal-Label trägt einen Jahresplatzhalter (CR 6: kein Nominalwert ohne Jahr).
    expect(de["compare.monthlyNominal"]).toContain("{year}");
    expect(de["valuation.suffixNominal"]).toContain("{year}");
  });

  test("Kundensicht-Korridorlabels + Berater-Quantilzeile (CR 9/16)", () => {
    expect(de["corridor.difficult"]).toBe("Schwierige Marktentwicklung");
    expect(de["corridor.typical"]).toBe("Typische Marktentwicklung");
    expect(de["corridor.favorable"]).toBe("Günstige Marktentwicklung");
    expect(de["corridor.advisorNote"]).toContain("{p25}");
    expect(de["corridor.advisorNote"]).toContain("Perzentil");
  });

  test("keine Lebensstandard-Wertung mehr (CR 8)", () => {
    for (const [key, value] of Object.entries(de)) {
      expect(value.includes("Lebensstandard"), `DE ${key} enthält "Lebensstandard"`).toBe(false);
    }
    for (const [key, value] of Object.entries(en)) {
      expect(
        value.toLowerCase().includes("lifestyle") || value.includes("standard of living"),
        `EN ${key} enthält Lebensstandard-Wertung`,
      ).toBe(false);
    }
  });

  test("Liquiditäts-Beispiele gemäß CR 5", () => {
    for (const example of ["Erbschaft", "Immobilienverkauf", "Lebensversicherung", "Bonuszahlung"]) {
      expect(de["liquidity.incomeExamples"]).toContain(example);
    }
    for (const example of ["Wohnungskauf", "Renovierung", "Pflegekosten", "Schenkung", "Anschaffung"]) {
      expect(de["liquidity.expenseExamples"]).toContain(example);
    }
  });
});
