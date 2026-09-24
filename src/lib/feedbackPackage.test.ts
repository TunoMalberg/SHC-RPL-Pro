/**
 * Tests Schulungsfeedback-Paket (Querschnitt):
 *  - AP2: „Spekulativ" → „Dynamisch" (Label, keine Alt-Reste in der de-Map)
 *  - AP4: verbindliche Pensionsbegriffe
 *  - AP6: KESt-Wirkung (kestRate 0 → höheres Endvermögen) + configHash
 *  - AP8: Validierung WBA/LV (Mindestlaufzeit, gesetzliche Bindefrist)
 *  - i18n: neue Keys in DE und EN vorhanden
 */

import { describe, expect, test } from "bun:test";
import { translations } from "./i18n";
import { computeConfigHash } from "./configHash";
import { validatePortfolio } from "./validation";
import { runMonteCarloSimulation } from "./engine/montecarlo";
import {
  defaultClient,
  defaultInputs,
  defaultPortfolio,
  makeDefaultLV,
  makeDefaultWBA,
} from "./defaults";
import type { FinancialInputs, PortfolioConfig, SimulationSettings } from "./types";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("AP2 — MiFID-Label Dynamisch", () => {
  test("Label umbenannt, ID bleibt 'speculative'", () => {
    expect(translations.de["portfolio.mifidSpeculative"]).toBe("Dynamisch");
    expect(translations.en["portfolio.mifidSpeculative"]).toBe("Dynamic");
  });

  test("kein Alt-Label mehr in der deutschen Textbasis", () => {
    const offenders = Object.entries(translations.de).filter(([, v]) =>
      v.includes("Spekulativ"),
    );
    expect(offenders).toEqual([]);
  });
});

describe("AP4 — Pensionsbegriffe", () => {
  test("verbindliche Labels für beide Felder", () => {
    expect(translations.de["client.retirementAge"]).toBe(
      "Pensionsantritt (Beginn der Entnahmephase)",
    );
    expect(translations.de["inputs.pensionStartAge"]).toBe(
      "Beginn der Pensionszahlung (Alter)",
    );
  });

  test("EN-Fanchart-Marker sagt nicht mehr faelschlich Retirement fuer die Pensionszahlung", () => {
    expect(translations.en["results.pension"]).toBe("Pension payments");
    expect(translations.de["results.retirementMarker"]).toBe("Pensionsantritt");
  });
});

describe("AP6 — KESt-Wirkung & Stale-Hinweis", () => {
  const settings: SimulationSettings = {
    numSimulations: 300,
    timeStepMonths: 12,
    mode: "fixed_withdrawal",
    randomSeed: 5,
  };
  const inputs: FinancialInputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3000 };

  test("kestRate 0 → höheres Median-Endvermögen als 27,5 % (nach Neulauf)", () => {
    const pTax = clone(defaultPortfolio) as PortfolioConfig;
    pTax.kestRate = 27.5;
    const pFree = clone(defaultPortfolio) as PortfolioConfig;
    pFree.kestRate = 0;
    const rTax = runMonteCarloSimulation(defaultClient, inputs, pTax, settings, []);
    const rFree = runMonteCarloSimulation(defaultClient, inputs, pFree, settings, []);
    expect(rFree.medianFinalWealth).toBeGreaterThan(rTax.medianFinalWealth);
  });

  test("configHash: deterministisch, ändert sich bei KESt-Änderung", () => {
    const p1 = clone(defaultPortfolio) as PortfolioConfig;
    const h1 = computeConfigHash(defaultClient, inputs, p1, []);
    const h1b = computeConfigHash(defaultClient, inputs, p1, []);
    expect(h1).toBe(h1b);
    const p2 = clone(p1);
    p2.kestRate = 0;
    expect(computeConfigHash(defaultClient, inputs, p2, [])).not.toBe(h1);
  });

  test("Engine schreibt configHash nicht selbst (Panel setzt ihn) — Feld optional", () => {
    const res = runMonteCarloSimulation(defaultClient, inputs, clone(defaultPortfolio), settings, []);
    expect(res.configHash).toBeUndefined();
  });
});

describe("AP8 — Validierung Produkt-Töpfe", () => {
  test("WBA-Laufzeit < 11 Jahre → Fehler", () => {
    const p = clone(defaultPortfolio) as PortfolioConfig;
    p.wohnbauanleihen = [{ ...makeDefaultWBA(50), termYears: 8 }];
    const r = validatePortfolio(p);
    expect(r.errors.some((e) => e.path.includes("termYears") && e.severity === "error")).toBe(true);
  });

  test("LV-Bindefrist unter gesetzlichem Minimum → Fehler (15 J unter 50, 10 J ab 50)", () => {
    const pYoung = clone(defaultPortfolio) as PortfolioConfig;
    pYoung.lebensversicherungen = [{ ...makeDefaultLV(45), lockYears: 12 }];
    expect(
      validatePortfolio(pYoung).errors.some((e) => e.path.includes("lockYears")),
    ).toBe(true);

    const pOld = clone(defaultPortfolio) as PortfolioConfig;
    pOld.lebensversicherungen = [{ ...makeDefaultLV(55), lockYears: 10 }];
    expect(
      validatePortfolio(pOld).errors.some((e) => e.path.includes("lockYears")),
    ).toBe(false);
  });

  test("gültige Defaults erzeugen keine Fehler", () => {
    const p = clone(defaultPortfolio) as PortfolioConfig;
    p.wohnbauanleihen = [makeDefaultWBA(50)];
    p.lebensversicherungen = [makeDefaultLV(52)];
    const r = validatePortfolio(p);
    expect(r.errors.filter((e) => e.severity === "error")).toEqual([]);
  });
});

describe("i18n — neue Keys DE + EN vollständig", () => {
  const requiredKeys = [
    "portfolio.lockAllocation",
    "portfolio.unlockAllocation",
    "portfolio.lockedBadge",
    "portfolio.depositTaxLabel",
    "portfolio.depositTaxHint",
    "portfolio.twoPhaseSwitchYearsLabel",
    "portfolio.twoPhaseSwitchYearsHint",
    "portfolio.twoPhaseSwitchYearsActive",
    "portfolio.twoPhaseSwitchYearsAtRetirement",
    "products.title",
    "products.wbaTitle",
    "products.lvTitle",
    "products.addWba",
    "products.addLv",
    "products.liquidityNote",
    "results.staleWarning",
    "results.staleRerun",
    "results.retirementMarker",
    "results.monthlyWithdrawalGross",
    "results.heatmapTooltipSplit",
    "results.heatmapPensionNote",
    "results.fourPctExactValue",
    "scenarios.view",
    "scenarios.viewingBanner",
    "scenarios.viewingBack",
  ];

  test("alle neuen Keys existieren in beiden Sprachen", () => {
    for (const key of requiredKeys) {
      expect(translations.de[key], `de fehlt: ${key}`).toBeDefined();
      expect(translations.en[key], `en fehlt: ${key}`).toBeDefined();
    }
  });
});
