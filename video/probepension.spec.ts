/**
 * Aufnahme Schulungsvideo 2 „Probepension": bedient die App am Beispielfall
 * Dr. Michael Huber, macht je Szene ein Bild und liest die angezeigten
 * Werte für den Sprechertext aus. Den Player baut danach
 * scripts/video/probepension-player.mjs (Vertonung + HTML-Datei).
 * Läuft nur im Workflow „Schulungsvideo 2" (GitHub), nicht in den Klicktests.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { SZENEN, fill } from "./probepension/drehbuch";
import { highlight, installStage, scrollToEl, scrollTop, unhighlight } from "./stage";

const OUT = join(process.cwd(), "video-output", "probepension");
const SIZE = { width: 1440, height: 900 };

/** Zahl aus einem angezeigten Text („42.3% …", „€ 2.012") lesen. */
function parseNumber(text: string): number {
  const m = text.replace(/\s/g, "").match(/-?[\d.,]+/);
  if (!m) throw new Error(`keine Zahl in: ${text}`);
  const raw = m[0];
  return /^\d{1,3}(\.\d{3})+$/.test(raw) ? Number(raw.replace(/\./g, "")) : Number(raw.replace(",", "."));
}
const readNumber = async (loc: Locator) => parseNumber(await loc.first().innerText());
const pct = (n: number) => String(Math.round(n));
const eur = (n: number) => Math.round(n).toLocaleString("de-DE");
const ORDINAL: Record<number, string> = { 2: "zweiten", 3: "dritten", 4: "vierten", 5: "fünften", 6: "sechsten" };

async function openTab(page: Page, id: string): Promise<void> {
  const trigger = page.locator(`[data-design-id="tab-trigger-${id}"]`);
  await scrollTop(page);
  await trigger.click();
  await expect(trigger).toHaveAttribute("data-state", "active");
  await page.waitForTimeout(500);
}

/**
 * Feld befüllen und prüfen. Betragsfelder formatieren sich beim Fokus neu
 * („€ 3.500" → „3500"); ohne Pause geht dabei der erste Tastendruck verloren.
 */
async function setField(page: Page, selector: string, value: string): Promise<void> {
  const f = page.locator(selector);
  const digits = (s: string) => s.replace(/[^\d]/g, "");
  for (let attempt = 1; attempt <= 3; attempt++) {
    await f.click();
    await page.waitForTimeout(350);
    await f.press("Control+A");
    await f.press("Backspace");
    await page.waitForTimeout(150);
    await f.pressSequentially(value, { delay: 45 });
    await f.blur();
    await page.waitForTimeout(300);
    const shown = await f.inputValue();
    if (digits(shown) === digits(value) || shown === value) return;
  }
  throw new Error(`${selector}: Wert ${value} ließ sich nicht setzen (zeigt ${await f.inputValue()})`);
}

async function runSimulation(page: Page): Promise<number> {
  await openTab(page, "simulation");
  await page.locator('[data-design-id="run-simulation-button"]').click();
  await expect(page.locator('[data-design-id="tab-trigger-results"]')).toHaveAttribute("data-state", "active", { timeout: 180_000 });
  const kpi = page.locator('[data-design-id="kpi-success-rate"]');
  await expect(kpi).toBeVisible();
  await page.waitForTimeout(1200);
  return readNumber(kpi);
}

async function saveScenario(page: Page, name: string, index: number): Promise<void> {
  await openTab(page, "scenarios");
  await setField(page, "#scenarioName", name);
  await page.locator('[data-design-id="add-scenario-button"]').click();
  await expect(page.locator(`[data-design-id="scenario-card-${index}"]`)).toBeVisible({ timeout: 120_000 });
}

/** Optimierung: Ziel Erfolgsquote, ohne Private Equity. Liefert beste Zeile + Quoten. */
async function optimize(page: Page) {
  await openTab(page, "optimizer");
  await page.locator('[data-design-id="opt-objective-field"] button[role="combobox"]').click();
  await page.getByRole("option", { name: "Erfolgsquote maximieren" }).click();
  const peSwitch = page.locator("#opt-include-pe");
  if ((await peSwitch.getAttribute("data-state")) === "checked") await peSwitch.click();
  await expect(peSwitch).toHaveAttribute("data-state", "unchecked");
  await page.locator('[data-design-id="opt-run-button"]').click();
  await expect(page.locator('[data-design-id="opt-kpis"]')).toBeVisible({ timeout: 600_000 });
  // Zeile 0 = Überschrift „Top 5", Zeile 1 = beste Aufteilung
  const bestRow = page.locator('[data-design-id="opt-ranked-table"] tbody tr').nth(1);
  // KPI-Karten: Bewertungen, Dauer, beste Erfolgsquote, heutiges Portfolio
  const kpis = page.locator('[data-design-id="opt-kpis"] > *');
  const firstPct = (s: string) => Number((s.match(/([\d.,]+)\s*%/)?.[1] ?? "0").replace(",", "."));
  return {
    bestRow,
    best: firstPct(await kpis.nth(2).innerText()),
    baseline: firstPct(await kpis.nth(3).innerText()),
  };
}

test("Schulungsvideo 2 Probepension", async ({ browser }) => {
  test.setTimeout(45 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({ viewport: SIZE, locale: "de-AT" });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("veyder.uiMode", "pro");
      localStorage.setItem("veyder.uiModeChosen", "1");
    } catch {
      /* ignorieren */
    }
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator('[data-design-id="tab-trigger-optimizer"]')).toBeVisible({ timeout: 60_000 });
  await installStage(page);
  // Standbilder: kein Mauszeiger und keine Hinweis-Einblendungen im Bild
  await page.addStyleTag({ content: "#vid-cursor,[data-sonner-toaster]{display:none!important}" });

  const values: Record<string, Record<string, string | number>> = {};
  const images: Record<string, string> = {};
  /** Bild der Szene: Bereich mittig, rot umrandet. */
  const shot = async (id: string, target?: Locator, vals: Record<string, string | number> = {}) => {
    if (target) {
      await scrollToEl(page, target);
      await highlight(page, target);
    }
    // Maus aus dem Bild, damit keine Diagramm-Tooltips stehen bleiben
    await page.mouse.move(SIZE.width - 2, SIZE.height - 2);
    await page.waitForTimeout(500);
    const file = `${String(SZENEN.findIndex((s) => s.id === id) + 1).padStart(2, "0")}-${id}.jpg`;
    await page.screenshot({ path: join(OUT, file), type: "jpeg", quality: 82 });
    if (target) await unhighlight(target);
    images[id] = file;
    values[id] = vals;
  };

  // ── Der Fall ─────────────────────────────────────────────────────────
  await openTab(page, "profile");
  await setField(page, "#name", "Dr. Michael Huber");
  await setField(page, "#currentAge", "60");
  await setField(page, "#retirementAge", "65");
  await setField(page, "#lifeExpectancy", "92");
  await shot("kunde", page.locator('[data-design-id="client-retirement-age-field"]'));

  await openTab(page, "inputs");
  await setField(page, "#initialCapital", "3500000");
  await setField(page, "#monthlySavings", "5000");
  await setField(page, "#withdrawal", "13500");
  await setField(page, "#pension", "3500");
  await setField(page, "#pensionAge", "65");
  // Beide Karten (Kapital & Sparen, Entnahmen & Pension) gemeinsam zeigen
  await shot("eingaben", page.locator('[data-design-id="capital-savings-card"]').locator(".."));

  // Die Vorschau „Start-Entnahme beim Pensionsantritt" steht in den Experteneinstellungen
  await page.getByRole("button", { name: /Experteneinstellungen/ }).click();
  const preview = page.locator('[data-design-id="inflate-to-retirement-preview"]');
  await expect(preview).toBeVisible();
  const previewText = await preview.innerText();
  const startMonat = parseNumber(previewText.split("(")[1] ?? previewText);
  await shot("inflation", preview, { startMonat: eur(startMonat) });

  // Heutiges Portfolio: Konservativ, Aktien gesperrt, Liquidität auf 45 %
  await openTab(page, "portfolio");
  const mifid = page.locator('[data-design-id="mifid-selector-card"]');
  await scrollToEl(page, mifid);
  await mifid.locator("button", { hasText: "Konservativ" }).first().click();
  await page.locator('[data-design-id="bucket-lock-2"]').click();
  const cash = page.locator('[data-design-id="bucket-allocation-0"] [role="slider"]');
  await cash.focus();
  for (let i = 0; i < 40; i++) {
    const v = Number(await cash.getAttribute("aria-valuenow"));
    if (v === 45) break;
    await cash.press(v < 45 ? "ArrowRight" : "ArrowLeft");
    await page.waitForTimeout(60);
  }
  const alloc = async (i: number) =>
    Number(await page.locator(`[data-design-id="bucket-allocation-${i}"] [role="slider"]`).getAttribute("aria-valuenow"));
  const heute = { cash: await alloc(0), bonds: await alloc(1), equities: await alloc(2) };
  await shot("portfolio", page.locator('[data-design-id="allocation-bar-card"]'), heute);

  // ── Probepension I ──────────────────────────────────────────────────
  await openTab(page, "simulation");
  await setField(page, "#seed", "2026");
  const erfolgHeute = await runSimulation(page);
  const fail = Math.max(1, 100 - erfolgHeute);
  await shot("ergebnis", page.locator('[data-design-id="kpi-success-rate"]'), {
    erfolg: pct(erfolgHeute),
    jeder: ORDINAL[Math.min(6, Math.max(2, Math.round(100 / fail)))],
  });
  const korrTyp = await readNumber(page.locator('[data-design-id="corridor-typical"] .text-2xl'));
  const korrSchwer = await readNumber(page.locator('[data-design-id="corridor-difficult"] .text-2xl'));
  const WUNSCH = 10_000;
  const korridorSatz =
    korrTyp >= WUNSCH
      ? `Bei typischer Entwicklung geht sich der Wunsch also gerade aus. Bei schwieriger fehlen ${eur(WUNSCH - korrSchwer)} Euro, Monat für Monat.`
      : `Schon bei typischer Entwicklung fehlen ${eur(WUNSCH - korrTyp)} Euro im Monat.`;
  await shot("korridor", page.locator('[data-design-id="corridor-card"]'), {
    korridorTypisch: eur(korrTyp),
    korridorSchwierig: eur(korrSchwer),
    korridorSatz,
  });
  const gap = page.locator('[data-design-id="gap-analysis-card"]');
  // Box 1 = Wunsch gesamt, Box 2 = nachhaltig auf 90-%-Niveau (beides inkl. Pension)
  const tragbar90 = await readNumber(gap.locator(".text-xl").nth(1));
  await shot("luecke", gap, { tragbar90: eur(tragbar90), ausDepot90: eur(tragbar90 - 3500) });
  await shot("faecher", page.locator('[data-design-id="fan-chart-card"]'));
  await saveScenario(page, `Heute · Pension 65 (${heute.cash}/${heute.bonds}/${heute.equities})`, 0);

  await openTab(page, "detailed");
  await page.locator('[data-design-id="generate-worst-button"]').click();
  const detChart = page.locator('[data-design-id="detailed-chart-card"]');
  await expect(detChart).toBeVisible({ timeout: 60_000 });
  const firstGapRow = page.locator('[data-design-id="detailed-table-card"] tbody tr', {
    has: page.locator("td.bg-rose-50"),
  }).first();
  const leerSatz = (await firstGapRow.count())
    ? `In diesem Verlauf reicht das Geld nur bis zum Alter von ${await firstGapRow.locator("td").nth(1).innerText()} Jahren. Danach kann die gewünschte Entnahme nicht mehr voll bezahlt werden.`
    : "Selbst in diesem Verlauf reicht das Geld knapp, aber ohne jede Reserve.";
  await shot("worstcase", detChart, { leerSatz });

  // ── Hebel 1: Portfolio ──────────────────────────────────────────────
  const opt1 = await optimize(page);
  await shot("hebelPortfolio", opt1.bestRow, { best: pct(opt1.best), baseline: pct(opt1.baseline) });

  // ── Hebel 2: Pension mit 66 (heutiges Portfolio) ────────────────────
  await openTab(page, "profile");
  await setField(page, "#retirementAge", "66");
  await openTab(page, "inputs");
  await setField(page, "#pensionAge", "66");
  const erfolg66 = await runSimulation(page);
  await shot("hebelPension", page.locator('[data-design-id="kpi-success-rate"]'), { vorher: pct(erfolgHeute), erfolg: pct(erfolg66) });
  await saveScenario(page, "Pension mit 66", 1);

  // ── Hebel 3: Sparrate 8.000 ─────────────────────────────────────────
  await openTab(page, "inputs");
  await setField(page, "#monthlySavings", "8000");
  const erfolgSpar = await runSimulation(page);
  await shot("hebelSparen", page.locator('[data-design-id="kpi-success-rate"]'), { erfolg: pct(erfolgSpar) });
  await saveScenario(page, "Pension 66 · Sparrate 8.000", 2);

  // ── Der Plan: zum Schluss optimieren ────────────────────────────────
  await optimize(page);
  await page.locator('[data-design-id="opt-apply-0"]').click();
  await page.waitForTimeout(600);
  const erfolgPlan = await runSimulation(page);
  expect(erfolgPlan, "Plan soll deutlich sicherer sein als heute").toBeGreaterThanOrEqual(80);
  await shot("planOptimiert", page.locator('[data-design-id="kpi-success-rate"]'), { erfolg: pct(erfolgPlan) });
  await saveScenario(page, "Plan: 66 · 8.000 · optimiert", 3);

  const summary = page.locator('[data-design-id="scenario-summary-table-card"]');
  await shot("vorherNachher", summary, { heute: pct(erfolgHeute), plan: pct(erfolgPlan) });

  // ── Gegenprobe & Bericht ────────────────────────────────────────────
  await openTab(page, "historical");
  const hist = page.locator('[data-design-id="hist-sustainable-card"]');
  await expect(hist).toBeVisible({ timeout: 120_000 });
  // Karten: ungünstigstes Startjahr, Median, im Plan gerechnet (alle inkl. Pension)
  const histWorst = await readNumber(hist.locator(".text-2xl").nth(0));
  const histPlan = await readNumber(hist.locator(".text-2xl").nth(2));
  const histSatz =
    histWorst >= histPlan
      ? `Für den neuen Plan von Herrn Huber gilt: Selbst im ungünstigsten Startjahr hätte die Entnahme gereicht.`
      : `Im ungünstigsten Startjahr hätten ${eur(histWorst)} Euro gereicht, geplant sind ${eur(histPlan)} Euro, beides inklusive Pension.`;
  await shot("historie", hist, { histSatz });

  await openTab(page, "clientview");
  await setField(page, "#adv-name", "Maria Muster");
  const reportCards = page.getByText("Seite 1: Cover").locator("xpath=ancestor::div[contains(@class,'md:grid-cols-2')][1]");
  await shot("bericht", reportCards);

  await context.close();

  // Szenen mit befüllten Texten für den Player
  const szenen = SZENEN.map((s) => ({
    id: s.id, kap: s.kap, titel: s.titel, slide: s.slide, img: images[s.id],
    text: fill(s.text, values[s.id] ?? {}),
  }));
  for (const s of szenen) if (!s.slide && !s.img) throw new Error(`Szene ${s.id} ohne Bild`);
  writeFileSync(join(OUT, "szenen.json"), JSON.stringify({ szenen }, null, 2));
});
