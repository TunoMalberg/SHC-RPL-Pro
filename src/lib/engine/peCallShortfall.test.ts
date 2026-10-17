/**
 * PE-Kapitalabruf größer als die vorhandene Liquidität (Schulungsfall 10/2026):
 * Der nicht bezahlte Rest der Zusage verfällt, das bereits eingezahlte Kapital
 * bleibt investiert — NAV und Ausschüttungen zählen im Verhältnis
 * eingezahlt/geplant, statt komplett zu verschwinden.
 */

import { describe, expect, test } from "bun:test";
import { REFERENCE_CASES } from "./golden/referenceCases";
import { runDetailedSingleSimulation } from "./montecarlo";

const c = REFERENCE_CASES.find((rc) => rc.id === "pe-liquiditaet");
if (!c) throw new Error("Referenzfall pe-liquiditaet fehlt");
const settings = { ...c.settings, timeStepMonths: 12 };
const trace = (sim: number, capital = c.inputs.initialCapital) =>
  runDetailedSingleSimulation(c.client, { ...c.inputs, initialCapital: capital }, c.portfolio, settings, sim, c.liquidityEvents);

// Ersten Verlauf mit teilweise bezahltem Abruf suchen; derselbe Plan mit sehr
// viel Kapital liefert die Planwerte (alle Abrufe bezahlt).
let found: { actual: ReturnType<typeof trace>; planned: ReturnType<typeof trace> } | null = null;
for (let sim = 0; sim < 300 && !found; sim++) {
  const actual = trace(sim);
  const planned = trace(sim, 50_000_000);
  if (actual.rows.some((r, i) => (r.peCall ?? 0) < (planned.rows[i].peCall ?? 0) - 1)) found = { actual, planned };
}

describe("PE-Abruf ohne ausreichende Liquidität", () => {
  test("es gibt Verläufe mit nur teilweise bezahltem Abruf", () => {
    expect(found).not.toBeNull();
  });

  test("eingezahltes Kapital bleibt: NAV = Plan-NAV × eingezahlt/geplant", () => {
    if (!found) return;
    const { actual, planned } = found;
    let plannedIn = 0;
    let actualIn = 0;
    for (const [i, r] of actual.rows.entries()) {
      plannedIn += planned.rows[i].peCall ?? 0;
      actualIn += r.peCall ?? 0;
      const ratio = plannedIn > 0 ? Math.min(1, actualIn / plannedIn) : 1;
      expect(r.peNav ?? 0).toBeCloseTo((planned.rows[i].peNav ?? 0) * ratio, 2);
    }
    // Der überwiegende Teil des Kapitals ist investiert geblieben
    expect(actualIn / plannedIn).toBeGreaterThan(0.7);
  });

  test("Ausschüttungen fließen weiter in die Liquidität (kein Totalverlust)", () => {
    if (!found) return;
    const { actual, planned } = found;
    const dist = actual.rows.reduce((s, r) => s + (r.peDistNet ?? 0), 0);
    const plannedDist = planned.rows.reduce((s, r) => s + (r.peDistNet ?? 0), 0);
    expect(dist).toBeGreaterThan(plannedDist * 0.7);
  });
});
