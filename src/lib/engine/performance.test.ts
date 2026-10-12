/**
 * Rechenzeit-Grenzen (Paket 3, Punkt D).
 *
 * Schlägt an, wenn eine Änderung die Simulation spürbar langsamer macht.
 * Die Grenzen haben bewusst viel Luft (ca. 5–8× der lokalen Messung vom
 * 12.10.2026), damit langsamere Prüfrechner keinen Fehlalarm auslösen —
 * erkannt werden echte Einbrüche (z. B. versehentlich quadratischer Aufwand).
 *
 * Lokal gemessen (10.000 Pfade, Jahresschritt): Standard 0,35 s,
 * PE-Programm 0,6 s, Produkt-Töpfe 0,55 s; Monatsschritt 2.000 Pfade 1,8 s.
 */

import { describe, expect, test } from "bun:test";
import { runMonteCarloSimulation } from "./montecarlo";
import { REFERENCE_CASES } from "./golden/referenceCases";

const budgets: { id: string; sims: number; maxMs: number }[] = [
  { id: "standard", sims: 10_000, maxMs: 3_000 },
  { id: "pe-programm", sims: 10_000, maxMs: 5_000 },
  { id: "produkte", sims: 10_000, maxMs: 5_000 },
  { id: "monatlich", sims: 2_000, maxMs: 12_000 },
];

describe("Rechenzeit der Simulation", () => {
  for (const b of budgets) {
    test(`${b.id}: ${b.sims.toLocaleString("de-AT")} Pfade unter ${b.maxMs / 1000} s`, () => {
      const c = REFERENCE_CASES.find((rc) => rc.id === b.id);
      if (!c) throw new Error(`Referenzfall ${b.id} fehlt`);
      const t0 = performance.now();
      runMonteCarloSimulation(
        c.client,
        c.inputs,
        c.portfolio,
        { ...c.settings, numSimulations: b.sims },
        c.liquidityEvents,
      );
      const ms = performance.now() - t0;
      expect(ms).toBeLessThan(b.maxMs);
    }, 60_000);
  }
});
