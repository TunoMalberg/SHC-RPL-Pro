import { expect, type Page } from "@playwright/test";

/**
 * Konsolen- und Seitenfehler mitschreiben. Ein Test gilt als gescheitert,
 * wenn die App unerwartet Fehler wirft — auch wenn die Oberfläche noch
 * „richtig aussieht".
 */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  // Nur Begleiterscheinungen des lokalen Dev-Servers bzw. bewusst
  // abgefangene Schrift-Fallbacks — keine App-Fehler.
  const ignore = [
    /Failed to read source code/i, // Virenscanner-Artefakt im Dev-Server
    /\[HMR\]|webpack-hmr|turbopack/i,
    /Download the React DevTools/i,
  ];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (ignore.some((r) => r.test(text))) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

/** Bedienmodus vorwählen, damit der Begrüßungsdialog nicht erscheint. */
export async function openApp(page: Page, mode: "classic" | "pro" = "classic"): Promise<void> {
  await page.addInitScript((m) => {
    try {
      localStorage.setItem("veyder.uiMode", m);
      localStorage.setItem("veyder.uiModeChosen", "1");
    } catch {
      /* privater Modus — Dialog wird dann geklickt */
    }
  }, mode);
  await page.goto("/");
  await expect(page.locator('[data-design-id="tab-trigger-profile"]')).toBeVisible();
  await expect(page.locator('[data-design-id="mode-chooser-overlay"]')).toHaveCount(0);
}

export async function openTab(page: Page, id: string): Promise<void> {
  const trigger = page.locator(`[data-design-id="tab-trigger-${id}"]`);
  await trigger.click();
  await expect(trigger).toHaveAttribute("data-state", "active");
}

/** Betragsfeld (formatiert als „€ 1.000") mit einem Rohwert füllen. */
export async function fillAmount(page: Page, selector: string, value: number): Promise<void> {
  const input = page.locator(selector);
  await input.click();
  await input.fill(String(value));
  await input.blur();
}

/** Typische Demo-Eingaben (Dummy-Kunde, keine echten Daten). */
export async function enterDemoClient(page: Page): Promise<void> {
  await openTab(page, "profile");
  await page.locator("#name").fill("Erika Test");
  await page.locator("#currentAge").fill("50");
  await page.locator("#currentAge").blur();
  await openTab(page, "inputs");
  await fillAmount(page, "#initialCapital", 400_000);
  await fillAmount(page, "#monthlySavings", 800);
  await fillAmount(page, "#withdrawal", 2500);
}

/** Simulation starten und warten, bis die Ergebnisse angezeigt werden. */
export async function runSimulation(page: Page): Promise<void> {
  await openTab(page, "simulation");
  await page.locator('[data-design-id="run-simulation-button"]').click();
  await expect(page.locator('[data-design-id="tab-trigger-results"]')).toHaveAttribute(
    "data-state",
    "active",
    { timeout: 90_000 },
  );
  await expect(page.locator('[data-design-id="kpi-success-rate"]')).toBeVisible();
}
