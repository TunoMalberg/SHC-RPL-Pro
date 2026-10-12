import { expect, test } from "@playwright/test";
import { openApp, openTab, runSimulation, trackErrors } from "./helpers";

/**
 * Kurzprüfung nach jedem Livegang (läuft gegen die Produktions-URL):
 * Seite lädt, Simulation rechnet, Ergebnis erscheint, keine Fehler.
 */
test("@smoke Produktion: Seite lädt und Simulation liefert ein Ergebnis", async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, "classic");
  await runSimulation(page);
  await expect(page.locator('[data-design-id="kpi-median-wealth"]')).toContainText("€");
  await openTab(page, "historical");
  await expect(page.locator('[data-design-id="hist-kpi-success"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("@handy Handybreite: kein seitliches Verrutschen, Eingaben bedienbar", async ({ page }) => {
  await openApp(page, "classic");
  await expect(page.locator("#name")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
