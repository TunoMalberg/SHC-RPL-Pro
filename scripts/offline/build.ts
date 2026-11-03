/**
 * Baut die Offline-Fassung der App als EINE HTML-Datei:
 *   offline-output/Ruhestandsplaner_PRO_offline.html
 *
 * Doppelklick öffnet die App im Browser — ohne Server und ohne Internet.
 * Enthalten: App-Code, Rechenkern (Web Worker), Stylesheet, Skeena-Schrift
 * und die verwendeten Bilder. Aufruf: bun run build:offline
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BunPlugin } from "bun";

const ROOT = resolve(import.meta.dir, "../..");
const OUT_DIR = join(ROOT, "offline-output");
const OUT_FILE = join(OUT_DIR, "Ruhestandsplaner_PRO_offline.html");
const TMP = join(OUT_DIR, ".tmp");

const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const buildDate = new Intl.DateTimeFormat("de-AT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Vienna",
}).format(new Date());

const define = {
  "process.env.NODE_ENV": JSON.stringify("production"),
  "process.env.NEXT_PUBLIC_APP_VERSION": JSON.stringify(pkg.version),
  "process.env.NEXT_PUBLIC_OFFLINE": JSON.stringify("1"),
  "process.env.NEXT_PUBLIC_OFFLINE_BUILD_DATE": JSON.stringify(buildDate),
};

/** next/image → eingebettete Bilder (src/offline/image.tsx). */
const nextShims: BunPlugin = {
  name: "next-shims",
  setup(build) {
    build.onResolve({ filter: /^next\/image$/ }, () => ({
      path: join(ROOT, "src/offline/image.tsx"),
    }));
  },
};

async function bundle(entry: string, plugins: BunPlugin[] = []): Promise<string> {
  const res = await Bun.build({
    entrypoints: [join(ROOT, entry)],
    target: "browser",
    format: "iife",
    splitting: false,
    minify: true,
    define,
    // process.env.* nur über define ersetzen, nicht aus der Build-Umgebung
    env: "disable",
    plugins,
  });
  if (!res.success) {
    for (const log of res.logs) console.error(log);
    throw new Error(`Build fehlgeschlagen: ${entry}`);
  }
  if (res.outputs.length !== 1) {
    throw new Error(`${entry}: ${res.outputs.length} Dateien statt einer`);
  }
  return res.outputs[0].text();
}

async function buildCss(): Promise<string> {
  const out = join(TMP, "app.css");
  const proc = Bun.spawn(
    [
      process.execPath,
      join(ROOT, "node_modules/tailwindcss/lib/cli.js"),
      "-i",
      join(ROOT, "src/app/globals.css"),
      "-o",
      out,
      "--minify",
    ],
    { cwd: ROOT, stdout: "inherit", stderr: "inherit" },
  );
  if ((await proc.exited) !== 0) throw new Error("Tailwind-Build fehlgeschlagen");
  return readFile(out, "utf8");
}

/** Alle Bild- und Schriftpfade, die der Code verwendet, als data:-Adressen. */
async function collectAssets(): Promise<Record<string, string>> {
  const paths = new Set<string>();
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) {
        const src = await readFile(p, "utf8");
        for (const m of src.matchAll(/["'`](\/(?:icons|fonts)\/[^"'`$]+\.(?:png|ttf))["'`]/g)) {
          paths.add(m[1]);
        }
      }
    }
  };
  await walk(join(ROOT, "src"));
  const mime: Record<string, string> = { png: "image/png", ttf: "font/ttf" };
  const assets: Record<string, string> = {};
  for (const p of [...paths].sort()) {
    const bytes = await readFile(join(ROOT, "public", p));
    assets[p] = `data:${mime[p.split(".").pop() ?? ""]};base64,${bytes.toString("base64")}`;
  }
  return assets;
}

/**
 * Inhalt sicher in ein <script>-Element einbetten. Der App-Code läuft als
 * Modul-Skript, weil er import.meta enthält (Worker-Pfad der Online-App).
 */
const scriptSafe = (code: string) => code.replace(/<\/(script)/gi, "<\\/$1");

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });

const [css, workerJs, appJs, assets] = await Promise.all([
  buildCss(),
  bundle("src/lib/engine/simulation.worker.ts"),
  bundle("src/offline/entry.tsx", [nextShims]),
  collectAssets(),
]);

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ruhestandsplaner Pro — Offline</title>
<style>${css.replace(/<\/(style)/gi, "<\\/$1")}</style>
</head>
<body class="antialiased font-sans">
<div id="root"></div>
<script id="rpl-worker" type="text/plain">${scriptSafe(workerJs)}</script>
<script>
globalThis.__RPL_ASSETS__=${scriptSafe(JSON.stringify(assets))};
try{globalThis.__RPL_WORKER_URL__=URL.createObjectURL(new Blob([document.getElementById("rpl-worker").textContent],{type:"text/javascript"}));}catch(e){}
</script>
<script type="module">${scriptSafe(appJs)}</script>
</body>
</html>
`;

await writeFile(OUT_FILE, html);
await rm(TMP, { recursive: true, force: true });
console.log(
  `Offline-Datei: ${OUT_FILE} (${(html.length / 1024 / 1024).toFixed(1)} MB, Version ${pkg.version}, Stand ${buildDate})`,
);
