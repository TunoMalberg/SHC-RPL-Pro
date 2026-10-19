/**
 * Sprecher für das Schulungsvideo: vertont Texte mit der österreichischen
 * Microsoft-Stimme (edge-tts, nur Beispieltexte — keine Kundendaten) und
 * protokolliert, wann im Video welcher Satz beginnt. Der Schnitt
 * (scripts/video/assemble.mjs) legt die Tonspuren danach exakt an.
 *
 * Statische Texte werden vorab im Hintergrund vertont (keine Pausen im
 * Video); Texte mit Werten aus der App erst, wenn die Werte feststehen.
 */

import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface Clip {
  file: string;
  /** Start im Video in ms (ab Öffnen der Seite). */
  start: number;
  /** Länge der Tonspur in ms. */
  duration: number;
  text: string;
  chapter: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Narrator {
  readonly clips: Clip[] = [];
  private readonly cache = new Map<string, Promise<{ file: string; duration: number }>>();
  private counter = 0;
  private t0 = Date.now();
  chapter = "";

  constructor(
    private readonly dir: string,
    private readonly voice = process.env.VIDEO_VOICE ?? "de-AT-JonasNeural",
    private readonly rate = process.env.VIDEO_RATE ?? "-4%",
  ) {
    mkdirSync(dir, { recursive: true });
  }

  /** Zeitpunkt „Video beginnt" setzen (direkt nach dem Öffnen der Seite). */
  startClock(): void {
    this.t0 = Date.now();
  }

  private synth(text: string): Promise<{ file: string; duration: number }> {
    const cached = this.cache.get(text);
    if (cached) return cached;
    const file = join(this.dir, `clip-${String(++this.counter).padStart(3, "0")}.mp3`);
    const p = (async () => {
      // Höchstens drei Anfragen gleichzeitig an den Sprachdienst.
      while (this.active >= 3) await sleep(150);
      this.active++;
      try {
        return await this.synthNow(text, file);
      } finally {
        this.active--;
      }
    })();
    this.cache.set(text, p);
    return p;
  }

  private active = 0;

  private async synthNow(text: string, file: string): Promise<{ file: string; duration: number }> {
    for (let attempt = 1; ; attempt++) {
      try {
        await run("edge-tts", ["--voice", this.voice, `--rate=${this.rate}`, "--text", text, "--write-media", file]);
        break;
      } catch (err) {
        if (attempt >= 4) throw err;
        await sleep(1500 * attempt);
      }
    }
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    return { file, duration: Math.round(Number(stdout.trim()) * 1000) };
  }

  /** Statische Texte vorab vertonen (parallel, im Hintergrund). */
  preload(texts: string[]): void {
    for (const t of texts) void this.synth(t);
  }

  /**
   * Text sprechen. `during` läuft parallel zur Tonspur (z. B. Eingaben
   * tippen); gewartet wird, bis beides fertig ist, plus kurze Atempause.
   */
  async say(text: string, during?: () => Promise<void>, pauseMs = 450): Promise<void> {
    const { file, duration } = await this.synth(text);
    this.clips.push({ file, start: Date.now() - this.t0, duration, text, chapter: this.chapter });
    await Promise.all([sleep(duration + pauseMs), during ? during() : Promise.resolve()]);
  }

  /** Zeitleiste für den Schnitt speichern. */
  save(path: string, videoFile: string): void {
    writeFileSync(path, JSON.stringify({ video: videoFile, clips: this.clips }, null, 2));
  }
}
