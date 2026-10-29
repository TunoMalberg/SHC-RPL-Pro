/**
 * Aufnahme Schulungsvideo 2 „Probepension" (nur Workflow „Schulungsvideo 2").
 * Baut die App wie für die Produktion; Bilder statt Bildschirmvideo.
 */
import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: ".",
  testMatch: /probepension\.spec\.ts/,
  timeout: 45 * 60_000,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "../video-output/test-results-probepension",
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3100",
    locale: "de-AT",
    // Datumsfelder im österreichischen Format (TT.MM.JJJJ)
    launchOptions: { args: ["--lang=de-AT"] },
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "bun run build:vercel && bun run start",
        cwd: "..",
        env: { PORT: "3100", VERCEL: "1" },
        url: "http://localhost:3100",
        timeout: 600_000,
        reuseExistingServer: !process.env.CI,
      },
});
