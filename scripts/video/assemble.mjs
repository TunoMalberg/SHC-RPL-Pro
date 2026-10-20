// Schnitt des Schulungsvideos: legt die Sprecher-Tonspuren laut Zeitleiste
// auf die Bildschirmaufnahme, erzeugt Untertitel (SRT, eingebrannt) und
// schreibt eine MP4-Datei (H.264/AAC, Full HD).
//
// Aufruf (nach der Aufnahme): node scripts/video/assemble.mjs
// Erwartet: video-output/timeline.json + aufnahme.webm + audio/clip-*.mp3

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "video-output");
const timeline = JSON.parse(readFileSync(join(OUT, "timeline.json"), "utf8"));
const clips = timeline.clips;
if (!clips.length) throw new Error("Keine Tonspuren in der Zeitleiste");

// ── Untertitel ───────────────────────────────────────────────────────
// Jeder Sprechtext wird in Sätze geteilt; die Sätze bekommen Anteile der
// Tonspur nach ihrer Länge. Zeilen ≤ 64 Zeichen, höchstens 2 Zeilen je Bild.
const pad = (n, w = 2) => String(n).padStart(w, "0");
const ts = (ms) => {
  const t = Math.max(0, Math.round(ms));
  return `${pad(Math.floor(t / 3600000))}:${pad(Math.floor(t / 60000) % 60)}:${pad(Math.floor(t / 1000) % 60)},${pad(t % 1000, 3)}`;
};
function wrap(text, max = 64) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max && line) {
      lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}
const cues = [];
for (const c of clips) {
  const sentences = c.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [c.text];
  // Lange Sätze in Blöcke à 2 Zeilen aufteilen
  const blocks = sentences.flatMap((s) => {
    const lines = wrap(s);
    const out = [];
    for (let i = 0; i < lines.length; i += 2) out.push(lines.slice(i, i + 2).join("\n"));
    return out;
  });
  const total = blocks.reduce((n, b) => n + b.length, 0);
  let t = c.start;
  for (const b of blocks) {
    const d = (c.duration * b.length) / total;
    cues.push({ start: t, end: t + d - 40, text: b });
    t += d;
  }
}
const srt = cues.map((q, i) => `${i + 1}\n${ts(q.start)} --> ${ts(q.end)}\n${q.text}\n`).join("\n");
const srtPath = join(OUT, "untertitel.srt");
writeFileSync(srtPath, srt);

// ── Ton + Bild zusammenführen ────────────────────────────────────────
const args = ["-y", "-i", timeline.video];
for (const c of clips) args.push("-i", c.file);
// Kurzes Ein-/Ausblenden je Sprechteil verhindert Knackser an den Schnittstellen.
// Feste Lautstärke + Begrenzer statt loudnorm: loudnorm regelt nach jeder
// Pause nach und drückt dadurch den Satzanfang weg (hörbar als Unterbrechung).
const delays = clips.map((c, i) => {
  const d = Math.max(0.1, c.duration / 1000);
  return `[${i + 1}:a]afade=t=in:d=0.03,afade=t=out:st=${(d - 0.06).toFixed(3)}:d=0.06,adelay=${Math.round(c.start)}|${Math.round(c.start)}[a${i}]`;
});
const mix = `${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,volume=1.25,alimiter=limit=0.95:level=disabled[aout]`;
const style = "FontName=DejaVu Sans,FontSize=13,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=16";
const subs = `[0:v]subtitles=${srtPath.replace(/\\/g, "/").replace(/:/g, "\\:")}:force_style='${style}'[vout]`;
args.push(
  "-filter_complex", [...delays, mix, subs].join(";"),
  "-map", "[vout]", "-map", "[aout]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "25",
  "-c:a", "aac", "-b:a", "160k",
  "-movflags", "+faststart",
  join(OUT, "Schulungsvideo_Ruhestandsplaner_PRO.mp4"),
);
execFileSync("ffmpeg", args, { stdio: "inherit" });

// Kompakte Fassung fürs Intranet: 720p, H.264 (Main), AAC mono — spielt in
// jedem Browser/SharePoint/Stream und ist deutlich kleiner.
const full = join(OUT, "Schulungsvideo_Ruhestandsplaner_PRO.mp4");
const intranet = join(OUT, "Schulungsvideo_Ruhestandsplaner_PRO_Intranet.mp4");
execFileSync("ffmpeg", [
  "-y", "-i", full,
  "-vf", "scale=1280:-2:flags=lanczos",
  "-c:v", "libx264", "-profile:v", "main", "-level", "3.1", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-r", "25",
  "-c:a", "aac", "-b:a", "96k", "-ac", "1",
  "-movflags", "+faststart",
  intranet,
], { stdio: "inherit" });

// Drehbuch als Textdatei (zum Nachlesen / Übersetzen)
const script = clips.map((c) => `[${ts(c.start).slice(0, 8)}] ${c.chapter}\n${c.text}\n`).join("\n");
writeFileSync(join(OUT, "Sprechertext.txt"), script);
const endMs = clips[clips.length - 1].start + clips[clips.length - 1].duration;
console.log(`Fertig: ${clips.length} Tonspuren, ${cues.length} Untertitel, Länge ca. ${Math.round(endMs / 60000)} min.`);
