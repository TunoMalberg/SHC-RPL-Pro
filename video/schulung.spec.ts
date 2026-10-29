/**
 * Aufnahme des Schulungsvideos: bedient die App wie eine Beraterin am
 * Beispielfall „Thomas Berger" und lässt den Sprecher dazu erklären.
 * Läuft nur im Workflow „Schulungsvideo" (GitHub), nicht in den Klicktests.
 */

import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { DREHBUCH as D, KAPITEL as K, fill } from "./drehbuch";
import { Narrator } from "./narrator";
import { card, chapter, clickOn, highlight, installStage, pointTo, scrollToEl, scrollTop, typeInto, unhighlight } from "./stage";

const OUT = join(process.cwd(), "video-output");
const SIZE = { width: 1920, height: 1080 };

/** Zahl aus einem angezeigten Text („42.3% …", „€ 2.012") lesen. */
async function readNumber(page: Page, selector: string): Promise<number> {
  const text = await page.locator(selector).first().innerText();
  const m = text.replace(/\s/g, "").match(/-?[\d.,]+/);
  if (!m) throw new Error(`keine Zahl in ${selector}: ${text}`);
  const raw = m[0];
  // „42.3" (Prozent mit Punkt) vs. „2.012" (Tausenderpunkt)
  const n = /^\d{1,3}(\.\d{3})+$/.test(raw) ? Number(raw.replace(/\./g, "")) : Number(raw.replace(",", "."));
  return n;
}
const pct = (n: number) => String(Math.round(n));
const eur = (n: number) => Math.round(n).toLocaleString("de-DE");

async function openTab(page: Page, id: string): Promise<void> {
  const trigger = page.locator(`[data-design-id="tab-trigger-${id}"]`);
  await scrollTop(page);
  await clickOn(page, trigger);
  await expect(trigger).toHaveAttribute("data-state", "active");
  await page.waitForTimeout(500);
}

async function runSimulation(page: Page): Promise<void> {
  await clickOn(page, page.locator('[data-design-id="run-simulation-button"]'));
  await expect(page.locator('[data-design-id="tab-trigger-results"]')).toHaveAttribute("data-state", "active", { timeout: 180_000 });
  await expect(page.locator('[data-design-id="kpi-success-rate"]')).toBeVisible();
  await page.waitForTimeout(800);
}

test("Schulungsvideo Ruhestandsplaner PRO", async ({ browser }) => {
  test.setTimeout(40 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const narrator = new Narrator(join(OUT, "audio"));
  // Alle Texte ohne Platzhalter vorab vertonen (keine Pausen im Video).
  narrator.preload(
    Object.values(D)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .filter((t): t is string => typeof t === "string" && !t.includes("{")),
  );

  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: join(OUT, "raw"), size: SIZE },
    locale: "de-AT",
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("veyder.uiMode", "pro");
      localStorage.setItem("veyder.uiModeChosen", "1");
    } catch {
      /* ignorieren */
    }
  });
  const page = await context.newPage();
  narrator.startClock();
  await page.goto("/");
  await expect(page.locator('[data-design-id="tab-trigger-optimizer"]')).toBeVisible({ timeout: 60_000 });
  await installStage(page);

  // ── Einführung ──────────────────────────────────────────────────────
  narrator.chapter = K[0];
  await card(
    page,
    `<img src="/icons/logo.png" alt=""><h1>Ruhestandsplaner PRO</h1><h2>Schulung für das Private Banking</h2><div class="bar"></div><p>Kundenfall: Thomas Berger (Beispiel, frei erfunden)</p>`,
  );
  for (const t of D.intro) await narrator.say(t);
  await card(page, null);

  // ── 1 Kunde ────────────────────────────────────────────────────────
  narrator.chapter = K[1];
  await narrator.say(D.kundeIntro, async () => {
    await chapter(page, K[1]);
    await openTab(page, "profile");
  });
  await narrator.say(D.kundeFelder, async () => {
    await typeInto(page, page.locator("#name"), "Thomas Berger");
    await typeInto(page, page.locator("#currentAge"), "48");
    await typeInto(page, page.locator("#retirementAge"), "62");
    await typeInto(page, page.locator("#lifeExpectancy"), "92");
  });

  // ── 2 Eingaben ─────────────────────────────────────────────────────
  narrator.chapter = K[2];
  await narrator.say(D.eingabenIntro, async () => {
    await chapter(page, K[2]);
    await openTab(page, "inputs");
    await typeInto(page, page.locator("#initialCapital"), "500000");
    await typeInto(page, page.locator("#monthlySavings"), "2000");
  });
  await narrator.say(D.eingabenWunsch, async () => {
    await typeInto(page, page.locator("#withdrawal"), "4500");
    await typeInto(page, page.locator("#pension"), "2400");
    await typeInto(page, page.locator("#pensionAge"), "62");
  });
  await narrator.say(D.eingabenInflation, async () => {
    await pointTo(page, page.locator("#inflation"));
    await highlight(page, page.locator("#inflation"));
  });
  await unhighlight(page.locator("#inflation"));

  // ── 3 Heutiges Portfolio ───────────────────────────────────────────
  narrator.chapter = K[3];
  const mifid = page.locator('[data-design-id="mifid-selector-card"]');
  await narrator.say(D.portfolioIntro, async () => {
    await chapter(page, K[3]);
    await openTab(page, "portfolio");
    await scrollToEl(page, mifid);
    await clickOn(page, mifid.locator("button", { hasText: "Konservativ" }).first());
  });
  await narrator.say(D.portfolioAnpassen, async () => {
    await clickOn(page, page.locator('[data-design-id="bucket-lock-2"]'));
    const cash = page.locator('[data-design-id="bucket-allocation-0"] [role="slider"]');
    await clickOn(page, cash);
    // Klick auf den Regler kann den Wert verschieben → exakt auf 40 setzen
    for (let i = 0; i < 40; i++) {
      const v = Number(await cash.getAttribute("aria-valuenow"));
      if (v === 40) break;
      await cash.press(v < 40 ? "ArrowRight" : "ArrowLeft");
      await page.waitForTimeout(70);
    }
    await highlight(page, page.locator('[data-design-id="allocation-bar-card"]'));
  });
  await unhighlight(page.locator('[data-design-id="allocation-bar-card"]'));

  // ── 4 Simulation ───────────────────────────────────────────────────
  narrator.chapter = K[4];
  await narrator.say(D.simulationIntro, async () => {
    await chapter(page, K[4]);
    await openTab(page, "simulation");
    await typeInto(page, page.locator("#seed"), "2026");
  });
  await narrator.say(D.simulationLaeuft, async () => {
    await runSimulation(page);
  });

  // ── 5 Ergebnis heute ───────────────────────────────────────────────
  narrator.chapter = K[5];
  await chapter(page, K[5]);
  const erfolgHeute = await readNumber(page, '[data-design-id="kpi-success-rate"]');
  const korrTyp = await readNumber(page, '[data-design-id="corridor-typical"] .text-2xl');
  const korrSchwer = await readNumber(page, '[data-design-id="corridor-difficult"] .text-2xl');
  const kpi = page.locator('[data-design-id="kpi-success-rate"]');
  await narrator.say(fill(D.ergebnisHeute, { erfolg: pct(erfolgHeute) }), async () => {
    await pointTo(page, kpi);
    await highlight(page, kpi);
  });
  await unhighlight(kpi);
  const corridor = page.locator('[data-design-id="corridor-card"]');
  await narrator.say(fill(D.ergebnisKorridor, { korridorTypisch: eur(korrTyp), korridorSchwierig: eur(korrSchwer) }), async () => {
    await scrollToEl(page, corridor);
    await highlight(page, corridor);
  });
  await unhighlight(corridor);
  const fan = page.locator('[data-design-id="fan-chart-card"]');
  await narrator.say(D.ergebnisFaecher, async () => {
    await scrollToEl(page, fan);
  });

  // Szenario „Heute" speichern
  await narrator.say(D.szenarioHeute, async () => {
    await openTab(page, "scenarios");
    await typeInto(page, page.locator("#scenarioName"), "Heute (40/45/15)");
    await clickOn(page, page.locator('[data-design-id="add-scenario-button"]'));
    await expect(page.locator('[data-design-id="scenario-card-0"]')).toBeVisible({ timeout: 120_000 });
  });

  // ── 6 Vergleich ────────────────────────────────────────────────────
  narrator.chapter = K[6];
  await narrator.say(D.vergleichIntro, async () => {
    await chapter(page, K[6]);
    await openTab(page, "compare");
    await pointTo(page, page.locator('[data-design-id="comparison-target-select"]'));
    await clickOn(page, page.locator('[data-design-id="run-comparison-button"]'));
    await expect(page.locator('[data-design-id="comparison-variants"]')).toBeVisible({ timeout: 180_000 });
  });
  const successIn = async (kind: string) => {
    const txt = await page.locator(`[data-design-id="variant-card-${kind}"]`).innerText();
    const m = txt.match(/Zielerreichungswahrscheinlichkeit[^\d]*([\d.,]+)\s*%/);
    return m ? Number(m[1].replace(",", ".")) : Number.NaN;
  };
  const vHeute = await successIn("current");
  const vAusgewogen = await successIn("target");
  const variants = page.locator('[data-design-id="comparison-variants"]');
  await narrator.say(fill(D.vergleichErgebnis, { heute: pct(vHeute), ausgewogen: pct(vAusgewogen) }), async () => {
    await scrollToEl(page, variants);
    await highlight(page, page.locator('[data-design-id="variant-card-target"]'));
  });
  await unhighlight(page.locator('[data-design-id="variant-card-target"]'));

  // ── 7 Optimierung ──────────────────────────────────────────────────
  narrator.chapter = K[7];
  await narrator.say(D.optimierungIntro, async () => {
    await chapter(page, K[7]);
    await openTab(page, "optimizer");
  });
  await narrator.say(D.optimierungEinstellen, async () => {
    await clickOn(page, page.locator('[data-design-id="opt-objective-field"] button[role="combobox"]'));
    await clickOn(page, page.getByRole("option", { name: "Erfolgsquote maximieren" }));
    const peSwitch = page.locator("#opt-include-pe");
    await clickOn(page, peSwitch);
    await expect(peSwitch).toHaveAttribute("data-state", "unchecked");
    await highlight(page, page.locator('[data-design-id="opt-include-pe"]'));
  });
  await unhighlight(page.locator('[data-design-id="opt-include-pe"]'));
  await narrator.say(D.optimierungLaeuft, async () => {
    await clickOn(page, page.locator('[data-design-id="opt-run-button"]'));
    await expect(page.locator('[data-design-id="opt-kpis"]')).toBeVisible({ timeout: 600_000 });
  });
  const table = page.locator('[data-design-id="opt-ranked-table"]');
  // Zeile 0 = Überschrift „Top 5", Zeile 1 = beste Aufteilung (Spalten: #, Liquidität, Anleihen, Aktien, …)
  const bestRowEl = table.locator("tbody tr").nth(1);
  const cellPct = async (i: number) => Number((await bestRowEl.locator("td").nth(i).innerText()).replace(/[^\d]/g, ""));
  const kpiCards = page.locator('[data-design-id="opt-kpis"] > *');
  const best = await kpiCards.nth(2).innerText();
  const firstPct = (s: string) => Number((s.match(/([\d.,]+)\s*%/)?.[1] ?? "0").replace(",", "."));
  const [cashPct, bondsPct, eqPct] = [await cellPct(1), await cellPct(2), await cellPct(3)];
  await narrator.say(
    fill(D.optimierungErgebnis, {
      cash: pct(cashPct), bonds: pct(bondsPct), equities: pct(eqPct),
      baseline: pct(erfolgHeute), best: pct(firstPct(best)),
    }),
    async () => {
      await scrollToEl(page, page.locator('[data-design-id="opt-ranked-table-card"]'));
      await highlight(page, bestRowEl);
    },
  );
  await narrator.say(D.optimierungEinordnung);
  await unhighlight(bestRowEl);
  await narrator.say(D.optimierungUebernehmen, async () => {
    await clickOn(page, page.locator('[data-design-id="opt-apply-0"]'));
  });

  // ── 8 Ergebnis optimiert ───────────────────────────────────────────
  narrator.chapter = K[8];
  await narrator.say(D.neuRechnen, async () => {
    await chapter(page, K[8]);
    await openTab(page, "simulation");
    await runSimulation(page);
  });
  const erfolgOpt = await readNumber(page, '[data-design-id="kpi-success-rate"]');
  const korrTypOpt = await readNumber(page, '[data-design-id="corridor-typical"] .text-2xl');
  const korrSchwerOpt = await readNumber(page, '[data-design-id="corridor-difficult"] .text-2xl');
  await narrator.say(fill(D.ergebnisOptimiert, { erfolg: pct(erfolgOpt), korridorTypisch: eur(korrTypOpt), korridorSchwierig: eur(korrSchwerOpt) }), async () => {
    await highlight(page, kpi);
    await page.waitForTimeout(1500);
    await unhighlight(kpi);
    await scrollToEl(page, corridor);
    await highlight(page, corridor);
  });
  await narrator.say(D.ergebnisGespraech);
  await unhighlight(corridor);
  await narrator.say(D.szenarioOptimiert, async () => {
    await openTab(page, "scenarios");
    await typeInto(page, page.locator("#scenarioName"), "Optimiert");
    await clickOn(page, page.locator('[data-design-id="add-scenario-button"]'));
    await expect(page.locator('[data-design-id="scenario-card-1"]')).toBeVisible({ timeout: 120_000 });
    await scrollToEl(page, page.locator('[data-design-id="scenario-summary-table-card"]'));
    await highlight(page, page.locator('[data-design-id="scenario-summary-table-card"]'));
  });
  await unhighlight(page.locator('[data-design-id="scenario-summary-table-card"]'));

  // ── 9 Einzelpfad & Historie ────────────────────────────────────────
  narrator.chapter = K[9];
  await narrator.say(D.einzelpfad, async () => {
    await chapter(page, K[9]);
    await openTab(page, "detailed");
    await clickOn(page, page.locator('[data-design-id="generate-worst-button"]'));
    await expect(page.locator('[data-design-id="detailed-chart-card"]')).toBeVisible({ timeout: 60_000 });
    await scrollToEl(page, page.locator('[data-design-id="detailed-chart-card"]'));
    await page.waitForTimeout(2500);
    await scrollToEl(page, page.locator('[data-design-id="detailed-table-card"]'));
  });
  await narrator.say(D.historie, async () => {
    await openTab(page, "historical");
    const sus = page.locator('[data-design-id="hist-sustainable-card"]');
    await scrollToEl(page, sus);
    await highlight(page, sus);
  });
  await unhighlight(page.locator('[data-design-id="hist-sustainable-card"]'));

  // ── 10 Kundenbericht ───────────────────────────────────────────────
  narrator.chapter = K[10];
  await narrator.say(D.kundenansicht, async () => {
    await chapter(page, K[10]);
    await openTab(page, "clientview");
    await typeInto(page, page.locator("#adv-name"), "Maria Muster");
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(1200);
  });

  // ── Zusammenfassung ────────────────────────────────────────────────
  narrator.chapter = K[11];
  await card(
    page,
    `<img src="/icons/logo.png" alt=""><h1>Zusammenfassung</h1><div class="bar"></div><p>Kunde · Eingaben · heutiges Portfolio erfassen</p><p>Simulation: Erfolgsquote und Planungskorridor lesen</p><p>Vergleichen · optimieren · als Szenarien dokumentieren</p><p style="margin-top:28px;font-size:16px">Beispielfall mit erfundenen Daten. Die App rechnet mit Annahmen und ersetzt keine individuelle Beratung.</p>`,
  );
  for (const t of D.outro) await narrator.say(t);
  await page.waitForTimeout(1500);

  // ── Aufnahme sichern ───────────────────────────────────────────────
  const video = page.video();
  await context.close();
  const rawPath = video ? await video.path() : "";
  const target = join(OUT, "aufnahme.webm");
  if (rawPath) copyFileSync(rawPath, target);
  narrator.save(join(OUT, "timeline.json"), target);
});
