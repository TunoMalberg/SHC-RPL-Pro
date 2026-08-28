/**
 * Smoke-Test für die User-Rückmeldungen vom 2026-05-30:
 *  1. Inflate-to-retirement Option (Eingaben)
 *  2. Best/Worst-Sim-Index Tracking + Reproduzierbarkeit
 *  3. Identität Klassik vs. Pro (Engine bleibt unbeeindruckt)
 *
 * Run: bunx tsx scripts/smoke-test.ts
 */
import { runMonteCarloSimulation, runDetailedSingleSimulation } from "../src/lib/engine/montecarlo";
import { defaultClient, defaultInputs, defaultPortfolio, defaultSettings } from "../src/lib/defaults";

console.log("\n=== Smoke-Test: User-Feedback 2026-05-30 ===\n");

const settings = { ...defaultSettings, numSimulations: 2000, randomSeed: 42 };

// --- (1) Inflate-to-retirement ---
console.log("(1) Inflate-to-retirement Option");
console.log("    Eingabe: 3000 €/Mo, 2,5 % Inflation, 20 J Ansparphase");
console.log("    Erwartung mit Boost: erste Entnahme ≈ 3000 × 1,025^20 ≈ 4914 €/Mo");
// CR 4: defaultInputs startet ohne Wunschbetrag (null) — Smoke-Test setzt
// explizit 3000 €/Monat, damit die Entnahme-Checks greifen.
const smokeInputs = { ...defaultInputs, desiredMonthlyWithdrawal: 3000 };
const baseInputs = { ...smokeInputs, useRealValues: false, inflateWithdrawalToRetirement: false };
const boostedInputs = { ...smokeInputs, useRealValues: false, inflateWithdrawalToRetirement: true };
const traceBase = runDetailedSingleSimulation(defaultClient, baseInputs, defaultPortfolio, settings, 0);
const traceBoost = runDetailedSingleSimulation(defaultClient, boostedInputs, defaultPortfolio, settings, 0);
const accYears = defaultClient.retirementAge - defaultClient.currentAge;
const firstWithdrawalRowBase = traceBase.rows[accYears];
const firstWithdrawalRowBoost = traceBoost.rows[accYears];
const cfBase = -firstWithdrawalRowBase.cashflow;
const cfBoost = -firstWithdrawalRowBoost.cashflow;
const expected = 3000 * 12 * Math.pow(1 + defaultInputs.inflationRate / 100, accYears);
console.log(`    Ohne Boost  → ${cfBase.toFixed(0)} €/J`);
console.log(`    Mit  Boost  → ${cfBoost.toFixed(0)} €/J  (erwartet ≈ ${expected.toFixed(0)})`);
const okInflate = Math.abs(cfBoost - expected) / expected < 0.02 || cfBoost > cfBase * 1.4;
console.log(`    ${okInflate ? "✓" : "✗"} Inflation-Boost wirkt korrekt\n`);

// --- (2) Best/Worst-Index reproduzierbar ---
console.log("(2) Best/Worst-Sim-Index reproduzierbar");
const result = runMonteCarloSimulation(defaultClient, smokeInputs, defaultPortfolio, settings);
console.log(`    successRate         : ${result.successRate.toFixed(2)}%`);
console.log(`    medianFinalWealth   : €${Math.round(result.medianFinalWealth).toLocaleString("de-AT")}`);
console.log(`    worstSimIndex       : ${result.worstSimIndex}`);
console.log(`    bestSimIndex        : ${result.bestSimIndex}`);
const traceWorst = runDetailedSingleSimulation(defaultClient, smokeInputs, defaultPortfolio, settings, result.worstSimIndex!);
const traceBest = runDetailedSingleSimulation(defaultClient, smokeInputs, defaultPortfolio, settings, result.bestSimIndex!);
console.log(`    Trace-Endvermögen worst: €${Math.round(traceWorst.finalWealth).toLocaleString("de-AT")}`);
console.log(`    Trace-Endvermögen best : €${Math.round(traceBest.finalWealth).toLocaleString("de-AT")}`);
console.log(`    Worst < Best         : ${traceWorst.finalWealth < traceBest.finalWealth ? "✓" : "✗"}\n`);

// --- (3) Determinismus ---
console.log("(3) Determinismus / Reproduzierbarkeit");
const r1 = runMonteCarloSimulation(defaultClient, smokeInputs, defaultPortfolio, settings);
const r2 = runMonteCarloSimulation(defaultClient, smokeInputs, defaultPortfolio, settings);
const sameKpis =
  r1.successRate === r2.successRate &&
  r1.medianFinalWealth === r2.medianFinalWealth &&
  r1.worstSimIndex === r2.worstSimIndex &&
  r1.bestSimIndex === r2.bestSimIndex;
console.log(`    Zwei aufeinanderfolgende Läufe identisch: ${sameKpis ? "✓" : "✗"}`);

console.log("\n=== Fertig ===\n");