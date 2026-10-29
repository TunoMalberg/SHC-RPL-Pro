/**
 * Schulungsvideo 2 „Probepension": vertont die Szenen aus der Aufnahme
 * (video-output/probepension/szenen.json) mit der österreichischen
 * Microsoft-Stimme und baut daraus eine einzige HTML-Datei — Player im
 * Stil der Vermögensnachfolge-Schulung, Bilder und Ton eingebettet.
 *
 * Aufruf: node scripts/video/probepension-player.mjs   (NO_TTS=1 = ohne Ton)
 */

import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = process.cwd();
const DIR = join(ROOT, "video-output", "probepension");
const AUDIO = join(DIR, "audio");
const OUT = join(ROOT, "video-output", "Schulungsvideo_2_Probepension.html");
const VOICE = process.env.VIDEO_VOICE ?? "de-AT-JonasNeural";
const RATE = process.env.VIDEO_RATE ?? "-4%";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { szenen } = JSON.parse(readFileSync(join(DIR, "szenen.json"), "utf8"));
mkdirSync(AUDIO, { recursive: true });

async function vertonen(text, file) {
  for (let attempt = 1; ; attempt++) {
    try {
      await run("edge-tts", ["--voice", VOICE, `--rate=${RATE}`, "--text", text, "--write-media", file]);
      break;
    } catch (err) {
      if (attempt >= 4) throw err;
      await sleep(1500 * attempt);
    }
  }
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Math.round(Number(stdout.trim()) * 1000);
}

// Höchstens drei Anfragen gleichzeitig an den Sprachdienst.
const ton = new Array(szenen.length);
let next = 0;
async function worker() {
  while (next < szenen.length) {
    const k = next++;
    const file = join(AUDIO, `${String(k + 1).padStart(2, "0")}-${szenen[k].id}.mp3`);
    ton[k] = process.env.NO_TTS ? null : { file, dauer: await vertonen(szenen[k].text, file) };
  }
}
await Promise.all([worker(), worker(), worker()]);

const dataUri = (file, mime) => `data:${mime};base64,${readFileSync(file).toString("base64")}`;
const eingebettet = szenen.map((s, k) => ({
  kap: s.kap,
  titel: s.titel,
  slide: s.slide,
  text: s.text,
  img: s.img ? dataUri(join(DIR, s.img), "image/jpeg") : undefined,
  audio: ton[k] ? dataUri(ton[k].file, "audio/mpeg") : undefined,
  dauer: ton[k]?.dauer,
}));

const gesamtMs = eingebettet.reduce((sum, s) => sum + (s.dauer ?? s.text.length * 62) + 700, 0);
const minuten = Math.max(1, Math.round(gesamtMs / 60_000));
const template = readFileSync(join(ROOT, "video", "probepension", "player.html"), "utf8");
// Ersetzen per Funktion, damit „$" in Texten nicht als Muster gilt
const html = template
  .replace("__LOGO__", () => dataUri(join(ROOT, "video", "probepension", "logo-dunkel.png"), "image/png"))
  .replace("__MINUTEN__", () => String(minuten))
  // JSON in <script>: „</" maskieren, damit kein Text das Skript beendet
  .replace("/*__SZENEN__*/[]", () => JSON.stringify(eingebettet).replace(/<\//g, "<\\/"));
writeFileSync(OUT, html);

writeFileSync(
  join(ROOT, "video-output", "Sprechertext_Probepension.txt"),
  szenen.map((s, k) => `${String(k + 1).padStart(2, "0")} · ${s.kap} · ${s.titel}\n${s.text}\n`).join("\n"),
);
console.log(`Player: ${OUT} (${(html.length / 1e6).toFixed(1)} MB, ca. ${minuten} Min.)`);
