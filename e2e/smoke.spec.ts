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

/**
 * iPhone-Fehler vom 12.10.2026: Vorgabewert ließ sich nicht löschen
 * (sprang zurück), das Dezimalkomma ging verloren, Beträge wurden beim
 * Antippen nicht markiert.
 */
test("@handy Zahlenfelder: leeren, neue Zahl, Dezimalkomma, Betrag überschreiben", async ({ page }) => {
  await openApp(page, "classic");

  const life = page.locator("#lifeExpectancy");
  await life.click();
  await life.press("End");
  for (let i = 0; i < 3; i++) await life.press("Backspace");
  await expect(life).toHaveValue("");
  await life.pressSequentially("92");
  await life.blur();
  await expect(life).toHaveValue("92");
  await expect(page.getByText("Entnahmezeitraum: 27 Jahre")).toBeVisible();

  await openTab(page, "inputs");
  const inflation = page.locator("#inflation");
  await inflation.click();
  await inflation.press("End");
  for (let i = 0; i < 4; i++) await inflation.press("Backspace");
  await inflation.pressSequentially("2,");
  await expect(inflation).toHaveValue("2,");
  await inflation.pressSequentially("3");
  await inflation.blur();
  await expect(inflation).toHaveValue("2,3");

  const capital = page.locator("#initialCapital");
  await capital.click();
  await page.waitForTimeout(100); // Markierung erfolgt nach dem Fokus
  await capital.pressSequentially("380000");
  await capital.blur();
  await expect(capital).toHaveValue(/^€\s?380[\s.  ]?000$/);
});
