import { expect, test } from "@playwright/test";
import { enterDemoClient, fillAmount, openApp, openTab, runSimulation, trackErrors } from "./helpers";

test.describe("Szenarien und Vergleich", () => {
  test("zwei Szenarien speichern, vergleichen und eines ansehen", async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page, "classic");
    await enterDemoClient(page);

    await openTab(page, "scenarios");
    await expect(page.locator('[data-design-id="no-scenarios"]')).toBeVisible();
    await page.locator("#scenarioName").fill("Basis");
    await page.locator('[data-design-id="add-scenario-button"]').click();
    await expect(page.locator('[data-design-id="scenario-card-0"]')).toBeVisible({ timeout: 90_000 });

    await openTab(page, "inputs");
    await fillAmount(page, "#withdrawal", 3500);
    await openTab(page, "scenarios");
    await page.locator("#scenarioName").fill("Höhere Entnahme");
    await page.locator('[data-design-id="add-scenario-button"]').click();
    await expect(page.locator('[data-design-id="scenario-card-1"]')).toBeVisible({ timeout: 90_000 });

    await expect(page.locator('[data-design-id="scenario-summary-table-card"]')).toBeVisible();
    await expect(page.locator('[data-design-id="scenario-summary-table-card"]')).toContainText("Höhere Entnahme");

    await page.locator('[data-design-id="view-scenario-0"]').click();
    await expect(page.locator('[data-design-id="viewing-scenario-banner"]')).toBeVisible();
    await page.locator('[data-design-id="viewing-scenario-back"]').click();
    await expect(page.locator('[data-design-id="viewing-scenario-banner"]')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test("Vergleichsansicht: Varianten werden berechnet", async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page, "classic");
    await enterDemoClient(page);
    await runSimulation(page);
    await openTab(page, "compare");
    await page.locator('[data-design-id="run-comparison-button"]').click();
    await expect(page.locator('[data-design-id="comparison-variants"]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-design-id="no-invest-diff-card"]')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
