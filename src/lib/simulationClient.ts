/**
 * Startet einen Simulationslauf im Hintergrund (Web Worker) und liefert
 * Fortschritt + Ergebnis. Kann der Browser keinen Worker starten (alter
 * Browser, Sicherheitsrichtlinie, Fehler beim Laden), läuft dieselbe
 * Rechnung direkt im Browser — Ergebnis identisch, nur ohne flüssige
 * Oberfläche während der Rechnung.
 */

import {
  runSimulationJob,
  type SimulationJobRequest,
  type SimulationJobResult,
  type SimulationProgress,
} from "./engine/simulationJob";
import { logger } from "./logger";

type WorkerMessage =
  | { type: "progress"; progress: SimulationProgress }
  | { type: "done"; result: SimulationJobResult }
  | { type: "error"; message: string };

/** Rechnung direkt im Browser (Ausweichweg). */
async function runInline(
  request: SimulationJobRequest,
  onProgress: (p: SimulationProgress) => void,
): Promise<SimulationJobResult> {
  // Kurz Luft holen, damit die Fortschrittsanzeige erscheint.
  await new Promise((r) => setTimeout(r, 30));
  return runSimulationJob(request, onProgress);
}

export function runSimulationInBackground(
  request: SimulationJobRequest,
  onProgress: (p: SimulationProgress) => void,
): Promise<SimulationJobResult> {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return runInline(request, onProgress);
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL("./engine/simulation.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch (err) {
    logger.warn("Web Worker nicht verfügbar — Rechnung im Vordergrund", { scope: "simulationClient" }, err);
    return runInline(request, onProgress);
  }

  return new Promise<SimulationJobResult>((resolve, reject) => {
    let started = false;
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        started = true;
        onProgress(msg.progress);
      } else if (msg.type === "done") {
        worker.terminate();
        resolve(msg.result);
      } else {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      // Worker ließ sich nicht laden (z. B. Sicherheitsrichtlinie) →
      // Ausweichweg; ein Fehler mitten in der Rechnung wird gemeldet.
      if (!started) {
        logger.warn("Web Worker konnte nicht starten — Rechnung im Vordergrund", {
          scope: "simulationClient",
          reason: e.message,
        });
        runInline(request, onProgress).then(resolve, reject);
      } else {
        reject(new Error(e.message || "Fehler in der Hintergrundrechnung"));
      }
    };
    worker.postMessage({ type: "run", request });
  });
}
