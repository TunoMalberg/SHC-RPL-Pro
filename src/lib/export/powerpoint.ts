/**
 * PowerPoint-Export (Beratungspräsentation). Die einzelnen Folien liegen
 * thematisch gegliedert unter ./powerpoint/ (Paket 4).
 */

import type {
  ClientProfile,
  FinancialInputs,
  PortfolioConfig,
  SimulationResult,
  HistoricalAnalysis,
  DetailedSimTrace,
  LiquidityEvent,
  Scenario,
} from "../types";
import { safeCell } from "./sanitize";
import type PptxGenJS from "pptxgenjs";
import { addSectionSlide } from "./powerpoint/shared";
import {
  addTitleSlide,
  addFinancialSummary,
  addLiquidityEventsSlide,
  addPortfolioSlide,
  addAssumptionsSlide,
} from "./powerpoint/intro";
import {
  addMonteCarloResults,
  addSuccessProbabilitySlide,
  addWithdrawalSlide,
  addRiskAnalysis,
  addHistoricalSlide,
  addScenarioComparisonSlide,
  addDetailedTraceSlides,
} from "./powerpoint/results";
import {
  addEducationalSlides,
  addRecommendationsSlide,
  addAppendixSlide,
  addMarketingDisclaimerSlide,
} from "./powerpoint/closing";

export async function generatePowerPointReport(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  result: SimulationResult,
  historical: HistoricalAnalysis | null,
  detailedTrace?: DetailedSimTrace | null,
  liquidityEvents?: LiquidityEvent[],
  // AP10: gespeicherte Szenarien für die Vergleichsfolie (optional).
  scenarios?: Scenario[],
  // AP10: tatsächliche Simulationsanzahl (vorher fix „5.000" im Text).
  numSimulations?: number
): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Ruhestandsplaner Pro";
  pptx.company = "Ruhestandsplaner Pro";
  pptx.title = `Ruhestandsplan — ${safeCell(client.name)}`;

  addTitleSlide(pptx, client);
  addFinancialSummary(pptx, client, inputs);
  if (liquidityEvents && liquidityEvents.length > 0) {
    addLiquidityEventsSlide(pptx, liquidityEvents);
  }
  addPortfolioSlide(pptx, portfolio);
  addAssumptionsSlide(pptx, inputs, portfolio, result);
  addSectionSlide(pptx, "Simulationsergebnisse", "Monte-Carlo-Analyse & Entnahme-Nachhaltigkeit");
  addMonteCarloResults(pptx, result, inputs, client, numSimulations);
  addSuccessProbabilitySlide(pptx, result);
  addWithdrawalSlide(pptx, result, inputs, client);
  addRiskAnalysis(pptx, result);
  // AP10: direkter Szenarienvergleich (gespeicherte Szenarien mit Ergebnis).
  if (scenarios?.some((s) => s.result)) {
    addSectionSlide(pptx, "Szenarienvergleich", "Gespeicherte Szenarien im direkten Vergleich");
    addScenarioComparisonSlide(pptx, scenarios);
  }
  if (detailedTrace) {
    addSectionSlide(pptx, "Einzelpfad-Beispiel", "Detaillierte Portfolioentwicklung eines Simulationspfades");
    addDetailedTraceSlides(pptx, detailedTrace, client);
  }
  addSectionSlide(pptx, "Historische Analyse", "Backtest mit realen Marktdaten");
  addHistoricalSlide(pptx, historical);
  addSectionSlide(pptx, "Wissenswertes", "Die wichtigsten Konzepte verstehen");
  addEducationalSlides(pptx);
  addRecommendationsSlide(pptx, result, inputs, client);
  addAppendixSlide(pptx);
  addMarketingDisclaimerSlide(pptx);

  const output = await pptx.write({ outputType: "blob" });
  return output as Blob;
}
