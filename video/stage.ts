/**
 * Bildhilfen für das Schulungsvideo (im Browser eingeblendet, SHC-Design):
 * sichtbarer Mauszeiger, Hervorhebung des erklärten Bereichs, Kapitel-
 * Einblendung, Titel- und Schlussbild. Ändert nichts an der App selbst.
 */

import type { Locator, Page } from "@playwright/test";

const SHC_RED = "#D31220";
const SHC_DARK = "#20201E";

/** Einmal nach jedem Seitenaufbau: Zeiger + Kapitel-Fläche einhängen. */
export async function installStage(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      #vid-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px;
        border-radius: 50%; background: rgba(211,18,32,.35); border: 2px solid ${SHC_RED}; pointer-events: none;
        transition: transform .12s ease; left: -50px; top: -50px; }
      #vid-cursor.down { transform: scale(.7); background: rgba(211,18,32,.6); }
      #vid-chapter { position: fixed; z-index: 2147483646; top: 14px; right: 18px; padding: 8px 16px; border-radius: 8px;
        background: ${SHC_DARK}; color: #fff; font: 600 18px var(--font-skeena), Arial, sans-serif; letter-spacing: .3px;
        box-shadow: 0 4px 14px rgba(0,0,0,.25); pointer-events: none; opacity: 0; transition: opacity .4s; }
      #vid-chapter.show { opacity: .94; }
      #vid-chapter b { color: ${SHC_RED}; margin-right: 6px; }
      .vid-highlight { outline: 4px solid ${SHC_RED} !important; outline-offset: 6px !important; border-radius: 10px;
        transition: outline-color .3s; }
      #vid-card { position: fixed; inset: 0; z-index: 2147483645; display: flex; flex-direction: column; align-items: center;
        justify-content: center; background: linear-gradient(135deg, #ffffff 0%, #f6f4f2 55%, #fbeaec 100%);
        font-family: var(--font-skeena), Arial, sans-serif; color: ${SHC_DARK}; text-align: center; opacity: 0; transition: opacity .6s; pointer-events: none; }
      #vid-card.show { opacity: 1; }
      #vid-card img { height: 96px; margin-bottom: 36px; }
      #vid-card h1 { font-size: 56px; margin: 0 0 14px; font-weight: 700; }
      #vid-card h2 { font-size: 28px; margin: 0; font-weight: 400; color: #4D4A47; }
      #vid-card .bar { width: 120px; height: 6px; background: ${SHC_RED}; margin: 28px auto; border-radius: 3px; }
      #vid-card p { font-size: 20px; color: #6b6762; max-width: 980px; line-height: 1.5; margin: 6px 0; }
    `,
  });
  await page.evaluate(() => {
    if (document.getElementById("vid-cursor")) return;
    const c = document.createElement("div");
    c.id = "vid-cursor";
    document.body.appendChild(c);
    const k = document.createElement("div");
    k.id = "vid-chapter";
    document.body.appendChild(k);
    window.addEventListener("mousemove", (e) => {
      c.style.left = `${e.clientX}px`;
      c.style.top = `${e.clientY}px`;
    }, true);
    window.addEventListener("mousedown", () => c.classList.add("down"), true);
    window.addEventListener("mouseup", () => c.classList.remove("down"), true);
  });
}

export async function chapter(page: Page, label: string): Promise<void> {
  await page.evaluate((text) => {
    const k = document.getElementById("vid-chapter");
    if (!k) return;
    const [num, ...rest] = text.split(" · ");
    k.innerHTML = rest.length ? `<b>${num}</b>${rest.join(" · ")}` : text;
    k.classList.add("show");
  }, label);
}

/** Vollbild-Karte (Titel/Schluss) ein- bzw. ausblenden. */
export async function card(page: Page, html: string | null): Promise<void> {
  await page.evaluate((content) => {
    let el = document.getElementById("vid-card");
    if (!content) {
      el?.classList.remove("show");
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "vid-card";
      document.body.appendChild(el);
    }
    el.innerHTML = content;
    requestAnimationFrame(() => el?.classList.add("show"));
  }, html);
  await page.waitForTimeout(700);
}

/** Zeiger sichtbar zum Element bewegen. */
export async function pointTo(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 40), { steps: 28 });
}

/** Zum Element zeigen und klicken. */
export async function clickOn(page: Page, target: Locator): Promise<void> {
  await pointTo(page, target);
  await page.waitForTimeout(250);
  await target.click();
  await page.waitForTimeout(350);
}

/** Feld sichtbar ausfüllen (Ziffer für Ziffer). */
export async function typeInto(page: Page, target: Locator, text: string): Promise<void> {
  await clickOn(page, target);
  await target.press("Control+A");
  await target.pressSequentially(text, { delay: 110 });
  await target.blur();
  await page.waitForTimeout(250);
}

/** Bereich hervorheben (rote Umrandung), optional nach `ms` wieder entfernen. */
export async function highlight(page: Page, target: Locator, ms?: number): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await target.evaluate((el) => el.classList.add("vid-highlight"));
  if (ms) {
    await page.waitForTimeout(ms);
    await unhighlight(target);
  }
}

export async function unhighlight(target: Locator): Promise<void> {
  await target.evaluate((el) => el.classList.remove("vid-highlight")).catch(() => {});
}

/** Sanft zu einem Bereich scrollen. */
export async function scrollToEl(page: Page, target: Locator): Promise<void> {
  await target.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await page.waitForTimeout(900);
}

export async function scrollTop(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(700);
}
