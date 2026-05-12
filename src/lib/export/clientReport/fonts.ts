/**
 * Font embedding helper for the standalone client HTML / PDF reports.
 *
 * Reads the Skeena TTF files from /public/fonts/ and returns them as
 * base64 data-URLs, so the resulting HTML blob is fully self-contained
 * (no external font request, no CDN, no /fonts/ path dependency once the
 * file is e-mailed to the customer).
 *
 * On the server / at build time there is no browser fetch available, so
 * this helper is browser-only and called from `generateClientHtmlReport`.
 */

const FONT_FILES = {
  regular: "/fonts/Skeena-Regular.ttf",
  italic: "/fonts/Skeena-Italic.ttf",
  bold: "/fonts/Skeena-Bold.ttf",
  boldItalic: "/fonts/Skeena-BoldItalic.ttf",
} as const;

export interface SkeenaFontBytes {
  regular: ArrayBuffer;
  italic: ArrayBuffer;
  bold: ArrayBuffer;
  boldItalic: ArrayBuffer;
}

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${url} (${res.status})`);
  return res.arrayBuffer();
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  // chunked to avoid String.fromCharCode-call-stack limits
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function loadSkeenaFontBytes(): Promise<SkeenaFontBytes> {
  const [regular, italic, bold, boldItalic] = await Promise.all([
    fetchFont(FONT_FILES.regular),
    fetchFont(FONT_FILES.italic),
    fetchFont(FONT_FILES.bold),
    fetchFont(FONT_FILES.boldItalic),
  ]);
  return { regular, italic, bold, boldItalic };
}

/**
 * Build the @font-face CSS block with base64-embedded TTFs.
 * The resulting CSS makes the exported HTML portable — opening it on
 * any machine without Skeena installed still renders in Skeena.
 */
export function buildSkeenaFontFaceCss(bytes: SkeenaFontBytes): string {
  const face = (weight: 400 | 700, style: "normal" | "italic", buf: ArrayBuffer) =>
    `@font-face{font-family:"Skeena";font-weight:${weight};font-style:${style};font-display:swap;` +
    `src:url("data:font/ttf;base64,${bufToBase64(buf)}") format("truetype")}`;
  return [
    face(400, "normal", bytes.regular),
    face(400, "italic", bytes.italic),
    face(700, "normal", bytes.bold),
    face(700, "italic", bytes.boldItalic),
  ].join("\n");
}

/**
 * Convenience: fetch + embed in one step. Falls back to an empty string
 * (→ system-font fallback in the exported HTML) when fetch fails, so a
 * network hiccup during export never breaks the download.
 */
export async function buildEmbeddedSkeenaCss(): Promise<string> {
  try {
    const bytes = await loadSkeenaFontBytes();
    return buildSkeenaFontFaceCss(bytes);
  } catch (err) {
    console.warn("[clientReport] Skeena embedding failed, using system fallback", err);
    return "";
  }
}