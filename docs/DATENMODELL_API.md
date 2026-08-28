# Datenmodell- & API-Dokumentation — CR „Heutige Kaufkraft, Planungskorridor & Vergleichsansicht"

Stand: 2026-08 · Konfigurationsversion `1.0.0` (`src/lib/displayConfig.ts`)

## 1. Anzeige-Konfiguration (CR 11)

`src/lib/displayConfig.ts` — zentral, versioniert, im calculationTrace ausgewiesen:

| Feld | Wert | Bedeutung |
|---|---|---|
| `defaultValuationMode` | `'real'` | Standard-Bewertungsbasis der Kundensicht = heutige Kaufkraft |
| `availableValuationModes` | `['real','nominal']` | Umschaltbar über das Header-Badge |
| `planningCorridorPercentiles` | `{difficult: 25, typical: 50, favorable: 75}` | Planungskorridor (CR 9) |
| `primaryMetric` | `'sustainableMonthlyWithdrawal'` | Zentrale Ergebnisgröße |
| `comparisonMetric` | `'requiredMonthlyWithdrawal'` | Einordnungsgröße |
| `technical.corridorBisection` | `{maxSimulations: 2000, iterations: 20}` | Technische (nicht fachliche) Parameter |

Die aktive Bewertungsbasis liegt in `AppState.valuationMode` (persistiert, Reducer-Action `SET_VALUATION_MODE`) und ist dauerhaft als klickbares Badge im Sticky-Header sichtbar (`src/components/ValuationBadge.tsx`).

## 2. Eingabemodell

`FinancialInputs.desiredMonthlyWithdrawal: number | null` (`src/lib/types.ts`)
- Zahl = „Gewünschter monatlicher Gesamtbetrag in heutiger Kaufkraft".
- `null` = kein Wunschbetrag → Modus **„berechnen, was möglich ist"** (CR 4). Default für neue Planungen ist `null`.
- Abgeleitet (nirgends eingebbar, CR 2): **Benötigt aus dem Vermögen** = `max(0, Gesamtbetrag − monthlyPension)`.
- Eingabebasis: heutige Kaufkraft, solange `inflateWithdrawalToRetirement !== false` (Default ON; Schalter ist Experteneinstellung — bei OFF zeigt die UI eine Nominal-Warnung statt des Kaufkraft-Hinweises).

`LiquidityEvent` bleibt unverändert vorzeichenbasiert (`amount ≥ 0` = zusätzliche Einnahme, `< 0` = zusätzliche Ausgabe). Die Trennung (CR 5) erfolgt in UI und Trace, nicht im Datenmodell — bewusst keine Doppelstruktur.

## 3. Ergebnismodell (`SimulationResult`, erweitert)

| Feld | Typ | Inhalt |
|---|---|---|
| `valuation` | `ResultValuation` | Deflatoren je Step (`real = nominal × deflators[s]`), `percentilesReal`, `medianFinalWealthReal`, `meanFinalWealthReal`, `horizonYear`, `retirementYear` |
| `corridor` | `CorridorResult` | je Szenario (`difficult/typical/favorable`): `percentile`, `targetSuccessRate`, `totalMonthly`, `fromWealthMonthly`, Nominal-Zwillinge zum Pensionsantritt; `basis`, `retirementYear`, technische Laufparameter |
| `requiredMonthlyWithdrawal` | `number \| null` | `max(0, Wunsch − Pension)`; `null` ohne Wunsch |
| `withdrawalAssumption` | `'user' \| 'corridor_typical'` | Welche Entnahmeannahme dem Lauf zugrunde liegt |
| `calculationTrace` | `CalculationTrace` | vollständiger Berechnungsnachweis (CR 19), JSON-exportierbar |

Reale **Serien** werden nicht dupliziert gespeichert, sondern exakt per `deflateSeries(nominal, valuation.deflators)` abgeleitet (`src/lib/engine/valuation.ts`); UI und Trace nutzen dieselben Deflatoren → garantierte Konsistenz.

### Mathematik
- **Reale Rendite (CR 13):** `realReturn = ((1 + nominalReturn) / (1 + inflationRate)) − 1`; periodische variable Sätze via `chainDeflators` (Verkettung periodengleicher Faktoren).
- **Korridor (CR 9):** Dualität `Quantil_q(Endvermögen | Entnahme w) ≥ 0 ⇔ Erfolgsquote(w) ≥ (100 − q) %`. Die mögliche Entnahme je Perzentil q ∈ {25, 50, 75} ist der größte Betrag mit Erfolgsquote ≥ 100 − q (Bisektion des Brutto-Gesamtbetrags in heutiger Kaufkraft, fester Seed → Monotonie schwierig ≤ typisch ≤ günstig). Ausweis beider Größen: Gesamtbetrag und „aus dem Vermögen" (= Gesamtbetrag − Pension). Nominal-Zwilling = real × (1+i)^(Jahre bis Pension), stets mit Jahresangabe (CR 6).
- **Einordnung (CR 10):** `rankAgainstCorridor(required, corridor)` → `below_difficult | within_corridor | above_favorable`. Keine weiteren fachlichen Schwellenwerte.

## 4. Baseline & Vergleich (CR 12/15/17)

- `src/lib/engine/baseline.ts` — **„Nicht investieren"**: deterministisch, 0 % nominal (fachliche Freigabe), gleiche Cashflow-/Event-Semantik wie MC, keine KESt (keine Gewinne). Zielerreichung **binär** (`goalReached`), `depletionAge`, reale Serie über die angenommene Inflationsrate. `findBaselineSustainableWithdrawal` = exakte deterministische Bisektion (Floor-Rundung: der ausgewiesene Betrag besteht die Projektion garantiert).
- `src/lib/engine/comparison.ts` — Varianten `no_invest | current | target` strikt getrennt (eigene Objekte, Labels, Kennzahlen; keine Vermischung). Zielstrategie-Quellen: MiFID-Profil (`MIFID_PRESETS`, geteilt mit SimulationPanel) oder beste Optimizer-Allokation (`AppState.optimizerBestAllocation`, gesetzt via `SET_OPTIMIZER_RESULT`). `assembleComparison` liefert `diffVsNoInvest` (nominal + real + Monatsentnahme, mit Horizontjahr).
- UI: Tab **„Vergleich"** (`src/components/sections/ComparisonView.tsx`), Klassik + Pro, beratungsorientierte Standardansicht ohne Ansichtswechsel; fallabhängiger CTA ohne Pauschalaussagen (`compare.noBlanketClaim`).

## 5. calculationTrace (CR 19)

`buildCalculationTrace(...)` (`src/lib/engine/trace.ts`) — Sektionen: `assumptions` (Buckets inkl. realer Rendite, Korrelationsmatrix, Inflation, KESt, Entnahmephasen-Override), `simulation` (Pfade, Zeitschritt, Modus, Seed), `valuation` (Basis, Fisher-Formel, Deflatoren), `derivation` (required = max(0, desired − extern), inkl. null-Fall), `corridor` (Perzentile, Methode, technische Parameter, Ergebnis), `ranking`, `cashflows` (Sparraten/Brutto-Entnahmen/Pension/Netto je Jahr, nominal), `series` (Median/P25/P75 nominal **und** real), `liquidityEvents` (getrennt Einnahmen/Ausgaben mit Summen), `rounding` (de-AT, 0 Dezimalen, Korridor auf ganze €), `configVersion`, `stichtag` (ISO).

Sichtbar: Expander „Berechnungsnachweis" im Ergebnis-Tab + JSON-Download. Nicht persistiert (Session-Storage droppt `result`).

### Beispiel-Ergebnisobjekt (gekürzt)

```json
{
  "successRate": 87.4,
  "medianFinalWealth": 1250000,
  "requiredMonthlyWithdrawal": 1800,
  "withdrawalAssumption": "user",
  "valuation": {
    "inflationRatePct": 2.5, "stepsPerYear": 1,
    "deflators": [1, 0.9756, "…", 0.3292],
    "horizonYear": 2070, "retirementYear": 2045, "yearsToHorizon": 45,
    "medianFinalWealthReal": 411500,
    "percentilesReal": { "p5": 0, "p25": 198000, "p50": 411500, "p75": 720000, "p95": 1490000 }
  },
  "corridor": {
    "basis": "real", "retirementYear": 2045, "yearsToRetirement": 20,
    "scenarios": {
      "difficult": { "percentile": 25, "targetSuccessRate": 75, "totalMonthly": 3480, "fromWealthMonthly": 2280, "totalMonthlyNominalAtRetirement": 5703, "fromWealthMonthlyNominalAtRetirement": 3736 },
      "typical":   { "percentile": 50, "targetSuccessRate": 50, "totalMonthly": 4310, "fromWealthMonthly": 3110, "totalMonthlyNominalAtRetirement": 7063, "fromWealthMonthlyNominalAtRetirement": 5096 },
      "favorable": { "percentile": 75, "targetSuccessRate": 25, "totalMonthly": 5540, "fromWealthMonthly": 4340, "totalMonthlyNominalAtRetirement": 9078, "fromWealthMonthlyNominalAtRetirement": 7112 }
    },
    "simulationsUsed": 2000, "iterations": 20, "seedUsed": 12633901
  },
  "calculationTrace": {
    "stichtag": "2026-08-28T09:00:00.000Z", "configVersion": "1.0.0",
    "derivation": { "desiredMonthlyIncome": 3000, "externalMonthlyIncome": 1200, "requiredMonthlyWithdrawal": 1800, "formula": "requiredMonthlyWithdrawal = max(0, desiredMonthlyIncome - externalMonthlyIncome); …" },
    "ranking": { "requiredFromWealthMonthly": 1800, "comparedAgainst": { "difficult": 2280, "typical": 3110, "favorable": 4340 }, "result": "below_difficult" },
    "liquidityEvents": { "additionalIncomes": ["…"], "additionalExpenses": ["…"], "totalIncomes": 130000, "totalExpenses": -50000 },
    "rounding": { "locale": "de-AT", "currency": "EUR", "displayDecimals": 0, "corridorRounding": "Monatsentnahmen auf ganze Euro gerundet (Math.round nach Bisektion)" }
  }
}
```

## 6. Perioden-Reihenfolge (CR 14)

MC-Schleife (unverändert, produktionsstabil), je Schritt: Renditen → PE-Bestand → PE-Programm → Phasenwechsel (einmalig) → Sparrate/Entnahme (netto nach Pension) → Liquiditätsereignisse (Crossing) → Rebalancing → High-Watermark-KESt.

**Begründete Anpassungen an den Nebenpfaden:**
1. `historical.ts`: Entnahme-/Pensions-Inflation hängt jetzt an `inflateWithdrawalToRetirement` (vorher stale `useRealValues`; Konsistenz mit MC-FIX 2026-Q4 / e967b66). Backtest und MC interpretieren identische Eingaben jetzt gleich.
2. Einzelpfad-Trace: Liquiditätsereignis-Matching auf Crossing-Semantik (`age−1 < le.age ≤ age`) — vorher exakte Gleichheit, wodurch gebrochene Alter im Trace nie feuerten, im MC aber schon. Für ganzzahlige Alter unverändert.
3. `powerpoint.ts` / `inputs.realValuesOn/Off`: stale Texte korrigiert (beschrieben fälschlich die Entnahme statt der Sparphase).

Der Trace-Phasenwechsel steht syntaktisch im Entnahme-Zweig, ist aber semantisch identisch zur MC-Reihenfolge (er feuert nur bei `!isAccumulation`, nach PE, vor der Entnahme) — bewusst unverändert.

## 7. Persistenz & Kompatibilität

- SessionStorage-Envelope bleibt `__v: 1`: `desiredMonthlyWithdrawal` als Zahl (Alt-Sessions) bleibt gültig; neue Felder (`valuationMode`, `optimizerBestAllocation`, `dataCompletenessConfirmed`) sind additiv. `comparisonResult` wird — wie `result` — nicht persistiert.
- Manuelle PE-Fonds, Szenarien, Holdings: unverändert.

## 8. Rollback

Alle Änderungen liegen in den CR-Commits (git log, Präfix `feat(cr-kaufkraft)` bzw. `fix(consistency)`). Rollback = `git revert` der Commits in umgekehrter Reihenfolge; keine Datenmigration nötig (additive optionale Felder; Alt-Sessions kompatibel in beide Richtungen — ein `null`-Wunsch wird von der alten Version allerdings nicht verstanden, daher nach Rollback ggf. Session leeren via Tab-Schließen). Vercel: vorheriges Deployment im Dashboard „Promote to Production".
