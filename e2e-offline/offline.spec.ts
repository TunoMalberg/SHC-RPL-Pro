import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Download, type Page } from "@playwright/test";
import { enterDemoClient, openTab, runSimulation, trackErrors } from "../e2e/helpers";

/**
 * Offline-Datei (bun run build:offline): per Doppelklick geöffnet, ohne
 * Server und ohne Internet. Jede Anfrage außerhalb der Datei gilt als Fehler.
 */
const FILE_URL = pathToFileURL(
  resolve(__dirname, "../offline-output/Ruhestandsplaner_PRO_offline.html"),
).href;

async function openOffline(page: Page, mode: "classic" | "pro"): Promise<string[]> {
  const network: string[] = [];
  await page.context().setOffline(true);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (/^(file|data|blob):/.test(url)) return route.continue();
    network.push(url);
    return route.abort();
  });
  await page.addInitScript((m) => {
    localStorage.setItem("veyder.uiMode", m);
    localStorage.setItem("veyder.uiModeChosen", "1");
  }, mode);
  await page.goto(FILE_URL);
  await expect(page.locator('[data-design-id="tab-trigger-profile"]')).toBeVisible();
  await expect(page.locator('[data-testid="offline-version"]')).toContainText("Offline-Version");
  return network;
}

async function download(page: Page, click: () => Promise<void>): Promise<{ name: string; bytes: Buffer }> {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), click()]);
  const path = await (dl as Download).path();
  return { name: dl.suggestedFilename(), bytes: readFileSync(path) };
}

test("Offline: Simulation und alle Exporte ohne Netz", async ({ page }) => {
  const errors = trackErrors(page);
  const network = await openOffline(page, "classic");

  // Skeena-Schrift und Bilder sind eingebettet.
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px "Skeena"')))
    .toBe(true);
  const logoOk = await page
    .locator('[data-design-id="app-logo"] img')
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(logoOk).toBe(true);

  await enterDemoClient(page);
  await runSimulation(page);
  await expect(page.locator('[data-design-id="kpi-success-rate"]')).toContainText("%");

  await openTab(page, "export");
  const xlsx = await download(page, () =>
    page.locator('[data-design-id="excel-download-button"]').click(),
  );
  expect(xlsx.bytes.subarray(0, 2).toString()).toBe("PK");
  const pptx = await download(page, () =>
    page.locator('[data-design-id="pptx-download-button"]').click(),
  );
  expect(pptx.bytes.subarray(0, 2).toString()).toBe("PK");

  await openTab(page, "clientview");
  await page.locator("#adv-name").fill("Test Beraterin");
  const html = await download(page, () =>
    page.getByRole("button", { name: /HTML-Kundenreport herunterladen/ }).click(),
  );
  expect(html.bytes.toString("utf8")).toContain("Erika Test");
  const pdf = await download(page, () =>
    page.getByRole("button", { name: /PDF-Zusammenfassung/ }).click(),
  );
  expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");

  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});

test("Offline: Bestand mit Hinweis, Excel-Vorlage und Import im Browser", async ({ page }) => {
  const errors = trackErrors(page);
  const network = await openOffline(page, "pro");
  await openTab(page, "holdings");
  await expect(page.locator('[data-testid="offline-holdings-note"]')).toBeVisible();

  const tpl = await download(page, () =>
    page.getByRole("button", { name: /Excel-Vorlage herunterladen/ }).click(),
  );
  expect(tpl.name).toBe("SHC_Bestandsportfolio_Vorlage.xlsx");
  expect(tpl.bytes.subarray(0, 2).toString()).toBe("PK");

  // Die Vorlage enthält Beispielzeilen — Import ohne Server.
  await page.locator('input[type="file"]').setInputFiles({
    name: tpl.name,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: tpl.bytes,
  });
  await expect(page.getByText(/Position\(en\) importiert/)).toBeVisible();

  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
