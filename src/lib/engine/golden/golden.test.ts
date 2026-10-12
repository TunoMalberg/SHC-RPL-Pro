/**
 * Referenzfälle mit eingefrorenen Ergebnissen (Paket 2, Punkt 4).
 *
 * Jeder Fall wird neu berechnet und mit `reference.golden.json` verglichen.
 * Weicht auch nur ein Wert ab, schlägt der Test fehl und nennt die Stelle.
 *
 * Bewusste, fachlich begründete Änderungen an der Rechenlogik erfordern
 * ein Neu-Einfrieren — ausschließlich mit Begründung im Commit:
 *
 *   UPDATE_GOLDEN=1 bun test src/lib/engine/golden
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REFERENCE_CASES } from "./referenceCases";
import { computeSnapshot, diffSnapshots, type Snapshot } from "./snapshot";
import { runDetailedSingleSimulation, runMonteCarloSimulation } from "../montecarlo";

const GOLDEN_FILE = join(import.meta.dir, "reference.golden.json");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

const golden: Record<string, Snapshot> =
  !UPDATE && existsSync(GOLDEN_FILE)
    ? JSON.parse(readFileSync(GOLDEN_FILE, "utf8"))
    : {};
const fresh: Record<string, Snapshot> = {};

describe("Referenzfälle (eingefrorene Ergebnisse)", () => {
  for (const c of REFERENCE_CASES) {
    test(`${c.id}: ${c.title}`, () => {
      const snap = JSON.parse(JSON.stringify(computeSnapshot(c))) as Snapshot;
      fresh[c.id] = snap;
      if (UPDATE) return;
      expect(golden[c.id], `Referenz für „${c.id}“ fehlt — UPDATE_GOLDEN=1 ausführen`).toBeDefined();
      const diffs = diffSnapshots(golden[c.id], snap);
      if (diffs.length > 0) {
        throw new Error(
          `${diffs.length} Abweichung(en) in „${c.id}“:\n  ` + diffs.slice(0, 15).join("\n  "),
        );
      }
    }, 60_000);
  }

  // Gemeinsamer Rechenkern: bei jährlichem Schritt zeigt der Einzelpfad
  // exakt den Monte-Carlo-Pfad gleichen Index (Worst- und Best-Case).
  for (const c of REFERENCE_CASES.filter((rc) => rc.settings.timeStepMonths === 12)) {
    test(`${c.id}: Einzelpfad = Monte-Carlo-Pfad`, () => {
      const { client, inputs, portfolio, settings, liquidityEvents } = c;
      const mc = runMonteCarloSimulation(client, inputs, portfolio, settings, liquidityEvents);
      for (const [idx, path] of [
        [mc.worstSimIndex ?? 0, mc.worstPath],
        [mc.bestSimIndex ?? 0, mc.bestPath],
      ] as const) {
        const trace = runDetailedSingleSimulation(client, inputs, portfolio, settings, idx, liquidityEvents);
        expect(trace.finalWealth).toBeCloseTo(path[path.length - 1], 6);
      }
    }, 60_000);
  }

  test("keine verwaisten Referenzen", () => {
    if (UPDATE) {
      writeFileSync(GOLDEN_FILE, `${JSON.stringify(fresh, null, 1)}\n`);
      return;
    }
    const ids = new Set(REFERENCE_CASES.map((c) => c.id));
    expect(Object.keys(golden).filter((k) => !ids.has(k))).toEqual([]);
  });
});
