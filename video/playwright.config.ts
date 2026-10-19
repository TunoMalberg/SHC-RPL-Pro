/**
 * Aufnahme des Schulungsvideos (nur Workflow „Schulungsvideo").
 * Baut die App wie für die Produktion und nimmt in Full HD auf.
 */
import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: ".",
  testMatch: /schulung\.spec\.ts/,
  timeout: 40 * 60_000,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "../video-output/test-results",
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3100",
    locale: "de-AT",
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
