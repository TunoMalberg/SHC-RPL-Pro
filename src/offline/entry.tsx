/**
 * Startpunkt der Offline-Datei (Build: scripts/offline/build.ts).
 * Rendert dieselbe Seite wie die Online-App, nur ohne Next.js-Server.
 */
import { createRoot } from "react-dom/client";
import ClientBody from "@/app/ClientBody";
import RetirementPlannerApp from "@/app/page";
import { installOfflineApi, offlineAssets } from "./offlineApi";

/** Skeena-Schrift aus den eingebetteten Dateien (statt next/font). */
function installFonts(): void {
  const assets = offlineAssets();
  const faces: [string, string, string][] = [
    ["/fonts/Skeena-Regular.ttf", "400", "normal"],
    ["/fonts/Skeena-Italic.ttf", "400", "italic"],
    ["/fonts/Skeena-Bold.ttf", "700", "normal"],
    ["/fonts/Skeena-BoldItalic.ttf", "700", "italic"],
  ];
  const style = document.createElement("style");
  style.textContent = faces
    .filter(([path]) => assets[path])
    .map(
      ([path, weight, fontStyle]) =>
        `@font-face{font-family:"Skeena";src:url(${assets[path]}) format("truetype");font-weight:${weight};font-style:${fontStyle};font-display:swap}`,
    )
    .join("");
  document.head.appendChild(style);
  document.documentElement.style.setProperty("--font-skeena", '"Skeena"');
}

installOfflineApi();
installFonts();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <ClientBody>
      <RetirementPlannerApp />
    </ClientBody>,
  );
}
