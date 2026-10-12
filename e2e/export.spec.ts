import { readFileSync } from "node:fs";
import { expect, test, type Download, type Page } from "@playwright/test";
import { enterDemoClient, openApp, openTab, runSimulation, trackErrors } from "./helpers";

async function download(page: Page, click: () => Promise<void>): Promise<{ name: string; bytes: Buffer }> {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), click()]);
  const path = await (dl as Download).path();
  return { name: dl.suggestedFilename(), bytes: readFileSync(path) };
}

test.describe("Exporte", () => {
  test("Excel, PowerPoint, HTML-Kundenreport und PDF werden erzeugt", async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page, "classic");
    await enterDemoClient(page);
    await runSimulation(page);

    await openTab(page, "export");
    const xlsx = await download(page, () =>
      page.locator('[data-design-id="excel-download-button"]').click(),
    );
    expect(xlsx.name).toMatch(/\.xlsx$/);
    expect(xlsx.bytes.subarray(0, 2).toString()).toBe("PK"); // Office-Datei (ZIP)
    expect(xlsx.bytes.length).toBeGreaterThan(10_000);

    const pptx = await download(page, () =>
      page.locator('[data-design-id="pptx-download-button"]').click(),
    );
    expect(pptx.name).toMatch(/\.pptx$/);
    expect(pptx.bytes.subarray(0, 2).toString()).toBe("PK");
    expect(pptx.bytes.length).toBeGreaterThan(20_000);

    // Kundenreport braucht einen Beraternamen (Dummy).
    await openTab(page, "clientview");
    await page.locator("#adv-name").fill("Test Beraterin");
    const html = await download(page, () =>
      page.getByRole("button", { name: /HTML-Kundenreport herunterladen/ }).click(),
    );
    expect(html.name).toMatch(/\.html$/);
    const htmlText = html.bytes.toString("utf8");
    expect(htmlText).toContain("Erika Test");
    expect(htmlText).toContain("Test Beraterin");

    const pdf = await download(page, () =>
      page.getByRole("button", { name: /PDF-Zusammenfassung/ }).click(),
    );
    expect(pdf.name).toMatch(/\.pdf$/);
    expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");

    expect(errors.filter((e) => !/Skeena/i.test(e))).toEqual([]);
  });
});
