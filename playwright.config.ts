/**
 * Klicktests (Paket 3): die App wird bedient wie von einem Berater.
 *
 * CI:      baut die App, startet sie und testet mit Chromium (GitHub).
 * Lokal:   E2E_BASE_URL=http://localhost:3123 [PW_CHANNEL=msedge] \
 *          node node_modules/@playwright/test/cli.js test
 *          Hinweis: Auf den Bank-Arbeitsplätzen ist die Browser-Fernsteuerung
 *          per IT-Richtlinie gesperrt — dort laufen die Klicktests nur in CI.
 * Smoke:   E2E_BASE_URL=https://app.veyder-malberg.com … test --grep @smoke
 */
import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3100",
    locale: "de-AT",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(channel ? { channel } : {}),
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) },
      grepInvert: /@handy/,
    },
    {
      name: "handy",
      use: { ...devices["Pixel 7"], ...(channel ? { channel } : {}) },
      grep: /@handy/,
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "bun run build:vercel && bun run start",
        // VERCEL=1 → gleicher Build wie in Produktion (.next, kein standalone).
        env: { PORT: "3100", VERCEL: "1" },
        url: "http://localhost:3100",
        timeout: 600_000,
        reuseExistingServer: !process.env.CI,
      },
});
