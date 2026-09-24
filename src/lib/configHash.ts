import type {
  ClientProfile,
  FinancialInputs,
  LiquidityEvent,
  PortfolioConfig,
} from "./types";

/**
 * Kompakter Fingerabdruck der simulationsrelevanten Eingaben (AP6).
 *
 * Wird beim Simulationslauf im Ergebnis gespeichert; weicht der aktuelle
 * Fingerabdruck ab, zeigen Ergebnis- und Vergleichsansicht einen
 * „Eingaben geändert — bitte neu berechnen"-Hinweis. Damit wird z. B.
 * sichtbar, dass eine KESt-Änderung erst nach einem Neulauf wirkt.
 *
 * djb2-Hash über die JSON-Serialisierung — schnell, deterministisch,
 * kollisionsarm genug für einen UI-Hinweis (kein Sicherheitskontext).
 */
export function computeConfigHash(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  liquidityEvents: LiquidityEvent[],
): string {
  const payload = JSON.stringify([client, inputs, portfolio, liquidityEvents]);
  let hash = 5381;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) + hash + payload.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
