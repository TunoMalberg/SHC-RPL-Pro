/**
 * Zentrale Anzeige-Konfiguration (CR 11).
 *
 * Fachliche Parameter der Kundensicht: Bewertungsbasis, Planungskorridor-
 * Perzentile, primäre und Vergleichs-Kennzahl. Änderungen an den
 * Perzentilen wirken direkt auf die Korridor-Berechnung (corridor.ts)
 * und die Beschriftung (i18n „schwierige/typische/günstige
 * Marktentwicklung").
 *
 * `technical` bündelt rein technische (nicht fachliche) Parameter der
 * Korridor-Bisektion; sie werden im calculationTrace ausgewiesen, damit
 * keine Annahme „still" gesetzt ist.
 */

export type ValuationMode = "real" | "nominal";

export interface PlanningCorridorPercentiles {
  /** Schwierige Marktentwicklung (Perzentil der Simulationsverteilung). */
  difficult: number;
  /** Typische Marktentwicklung (Median). */
  typical: number;
  /** Günstige Marktentwicklung. */
  favorable: number;
}

export interface DisplayConfig {
  /** Standard-Bewertungsbasis der Kundensicht. */
  defaultValuationMode: ValuationMode;
  /** Verfügbare Bewertungsbasen (Umschalter). */
  availableValuationModes: ValuationMode[];
  /** Planungskorridor-Perzentile (CR 9: 25/50/75 für den ersten Entwurf). */
  planningCorridorPercentiles: PlanningCorridorPercentiles;
  /** Primäre Ergebniskennzahl der Kundensicht. */
  primaryMetric: "sustainableMonthlyWithdrawal";
  /** Vergleichskennzahl (Einordnung, wenn > 0 erfasst). */
  comparisonMetric: "requiredMonthlyWithdrawal";
  /** Konfigurationsversion (erscheint im calculationTrace). */
  version: string;
  /** Technische Parameter (keine fachlichen Schwellenwerte). */
  technical: {
    corridorBisection: {
      /** Max. MC-Pfade je Bisektionsschritt. */
      maxSimulations: number;
      /** Bisektions-Iterationen. */
      iterations: number;
    };
  };
}

export const DISPLAY_CONFIG: DisplayConfig = {
  defaultValuationMode: "real",
  availableValuationModes: ["real", "nominal"],
  planningCorridorPercentiles: {
    difficult: 25,
    typical: 50,
    favorable: 75,
  },
  primaryMetric: "sustainableMonthlyWithdrawal",
  comparisonMetric: "requiredMonthlyWithdrawal",
  version: "1.0.0",
  technical: {
    corridorBisection: {
      maxSimulations: 2000,
      iterations: 20,
    },
  },
};
