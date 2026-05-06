/**
 * Tests for the export-sanitisation helpers covering audit findings
 * F-01 (formula injection) and F-06 (filename injection).
 *
 * Uses `bun test` — no extra devDependency required.
 */
import { describe, expect, test } from "bun:test";
import { safeCell, safeFilename } from "./sanitize";

describe("safeCell (F-01)", () => {
  test("prefixes = with apostrophe", () => {
    expect(safeCell("=HYPERLINK(\"https://attacker.tld\",\"x\")")).toBe(
      "'=HYPERLINK(\"https://attacker.tld\",\"x\")"
    );
  });

  test("prefixes + with apostrophe", () => {
    expect(safeCell("+1+1")).toBe("'+1+1");
  });

  test("prefixes - with apostrophe", () => {
    expect(safeCell("-SUM(A1)")).toBe("'-SUM(A1)");
  });

  test("prefixes @ with apostrophe", () => {
    expect(safeCell("@SUM(1+1)")).toBe("'@SUM(1+1)");
  });

  test("prefixes TAB with apostrophe", () => {
    expect(safeCell("\tcmd")).toBe("'\tcmd");
  });

  test("prefixes CR with apostrophe", () => {
    expect(safeCell("\rcmd")).toBe("'\rcmd");
  });

  test("leaves benign strings untouched", () => {
    expect(safeCell("Max Mustermann")).toBe("Max Mustermann");
    expect(safeCell("2500000")).toBe("2500000");
    expect(safeCell("Herr Dr. Müller")).toBe("Herr Dr. Müller");
  });

  test("coerces null / undefined to empty string", () => {
    expect(safeCell(null)).toBe("");
    expect(safeCell(undefined)).toBe("");
  });

  test("caps length to 32767", () => {
    const big = "a".repeat(50000);
    expect(safeCell(big).length).toBe(32767);
  });

  test("DDE payload is neutralised", () => {
    expect(safeCell("=cmd|'/c calc'!A0")).toBe("'=cmd|'/c calc'!A0");
  });
});

describe("safeFilename (F-06)", () => {
  test("keeps letters, digits, underscore, hyphen", () => {
    expect(safeFilename("Max_Mustermann-2026")).toBe("Max_Mustermann-2026");
  });

  test("replaces whitespace with underscore", () => {
    expect(safeFilename("Max Mustermann")).toBe("Max_Mustermann");
  });

  test("strips path traversal", () => {
    expect(safeFilename("../../etc/passwd")).toBe("etc_passwd");
  });

  test("strips backslashes and forward slashes", () => {
    expect(safeFilename("a/b\\c")).toBe("a_b_c");
  });

  test("strips Right-to-Left-Override U+202E", () => {
    // "Plan_\u202Exslx.pdf" → display looks like "Plan_fdp.xlsx" ← harmless text chars only
    const rtl = "Plan_\u202Exslx.pdf";
    const cleaned = safeFilename(rtl);
    expect(cleaned).not.toContain("\u202E");
    expect(cleaned).not.toContain(".");
  });

  test("keeps German umlauts via Unicode letter class", () => {
    expect(safeFilename("Müller Jäger Öhlinger")).toBe("Müller_Jäger_Öhlinger");
  });

  test("keeps Cyrillic via Unicode letter class", () => {
    expect(safeFilename("Иван Петров")).toBe("Иван_Петров");
  });

  test("caps length at 64", () => {
    const long = "a".repeat(200);
    expect(safeFilename(long).length).toBe(64);
  });

  test("falls back when empty", () => {
    expect(safeFilename("", "fallback")).toBe("fallback");
    expect(safeFilename("///", "fallback")).toBe("fallback");
  });

  test("strips control characters", () => {
    expect(safeFilename("a\x00b\x07c")).toBe("a_b_c");
  });
});