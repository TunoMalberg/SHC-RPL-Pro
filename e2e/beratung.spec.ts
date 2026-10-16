import { expect, test } from "@playwright/test";
import { enterDemoClient, openApp, openTab, runSimulation, trackErrors } from "./helpers";

test.describe("Beratungsablauf", () => {
  test("Klassik: Eingaben → Simulation → Ergebnisse, Historie, Einzelpfad", async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page, "classic");
    await expect(page.locator('[role="tab"]')).toHaveCount(11);

    await enterDemoClient(page);
    await runSimulation(page);

    // Erfolgsquote ist eine Prozentzahl zwischen 0 und 100.
    const kpi = await page.locator('[data-design-id="kpi-success-rate"]').innerText();
    const pct = Number(kpi.match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1].replace(",", "."));
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
    await expect(page.locator('[data-design-id="kpi-median-wealth"]')).toContainText("€");

    await openTab(page, "historical");
    await expect(page.locator('[data-design-id="hist-kpi-success"]')).toBeVisible();
    await expect(page.locator('[data-design-id="hist-paths-chart-card"] svg').first()).toBeVisible();

    await openTab(page, "detailed");
    await page.locator('[data-design-id="generate-trace-button"]').click();
    await expect(page.locator('[data-design-id="detailed-table-card"]')).toBeVisible();
    await expect(page.locator('[data-design-id="detailed-table-card"] tbody tr').first()).toBeVisible();

    await openTab(page, "clientview");
    await expect(page.getByText("Bitte führen Sie zuerst eine Simulation durch.")).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test("Pro: alle 13 Reiter öffnen sich ohne Fehler", async ({ page }) => {
    const errors = trackErrors(page);
    // Kursdienste des Bestand-Reiters nicht wirklich aufrufen.
    await page.route("**/api/holdings/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    );
    await openApp(page, "pro");
    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(13);
    const ids = await tabs.evaluateAll((els) =>
      els.map((e) => (e.getAttribute("data-design-id") ?? "").replace("tab-trigger-", "")),
    );
    for (const id of ids) {
      await openTab(page, id);
      await expect(page.locator(`[data-design-id="tab-content-${id}"]`)).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("Pro: Wohnbauanleihe und Lebensversicherung erscheinen im Einzelpfad-Diagramm", async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page, "pro");
    await openTab(page, "portfolio");
    await page.locator('[data-design-id="add-wba-button"]').click();
    await page.locator('[data-design-id="add-lv-button"]').click();
    await runSimulation(page);
    await openTab(page, "detailed");
    await page.locator('[data-design-id="generate-trace-button"]').click();
    const chart = page.locator('[data-design-id="detailed-chart-card"]');
    await expect(chart.locator(".recharts-legend-item", { hasText: "Wohnbauanleihen" })).toBeVisible();
    await expect(chart.locator(".recharts-legend-item", { hasText: "Fondsgebundene Lebensversicherungen" })).toBeVisible();
    await expect(page.locator('[data-design-id="detailed-illiquid-note"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Ohne Simulation zeigen Ergebnis-Reiter einen Hinweis statt leerer Seite", async ({ page }) => {
    await openApp(page, "classic");
    await openTab(page, "results");
    await expect(page.locator('[data-design-id="no-results"]')).toBeVisible();
    await openTab(page, "historical");
    await expect(page.locator('[data-design-id="no-historical"]')).toBeVisible();
    await openTab(page, "export");
    await expect(page.locator('[data-design-id="export-warning"]')).toBeVisible();
  });

  test("Sprache wechseln: Oberfläche auf Englisch", async ({ page }) => {
    await openApp(page, "classic");
    await page.locator('[data-design-id="language-toggle"]').first().click();
    await expect(page.locator('[data-design-id="tab-trigger-results"]')).toContainText("Results");
    await expect(page.locator('[data-design-id="tab-trigger-profile"]')).toContainText("Client");
  });
});
