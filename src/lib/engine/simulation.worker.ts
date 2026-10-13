/**
 * Web Worker für „Simulation starten" (Paket 4).
 *
 * Rechnet den kompletten Lauf außerhalb der Oberfläche — Klicks, Scrollen
 * und die Fortschrittsanzeige bleiben während der Rechnung flüssig.
 *
 * Protokoll:
 *   ← { type: "run", request }
 *   → { type: "progress", progress } (mehrfach)
 *   → { type: "done", result } | { type: "error", message }
 */

import { runSimulationJob, type SimulationJobRequest } from "./simulationJob";

interface RunMessage {
  type: "run";
  request: SimulationJobRequest;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<RunMessage>) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = (e) => {
  if (e.data?.type !== "run") return;
  try {
    const result = runSimulationJob(e.data.request, (progress) =>
      ctx.postMessage({ type: "progress", progress }),
    );
    ctx.postMessage({ type: "done", result });
  } catch (err) {
    ctx.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
