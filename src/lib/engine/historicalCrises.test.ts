/**
 * Tests für das Krisen-Mapping.
 * Aufruf: `bun test src/lib/engine/historicalCrises.test.ts`
 */

import { describe, expect, test } from "bun:test";
import {
  HISTORICAL_CRISES,
  findCrisisForYear,
  getLocalizedCrisis,
} from "./historicalCrises";

describe("HISTORICAL_CRISES — Datenintegrität", () => {
  test("Liste ist nicht leer", () => {
    expect(HISTORICAL_CRISES.length).toBeGreaterThan(5);
  });

  test("alle Krisen haben gültigen Year-Range (start ≤ end, 1900 ≤ year ≤ 2100)", () => {
    for (const c of HISTORICAL_CRISES) {
      expect(c.yearRange[0]).toBeLessThanOrEqual(c.yearRange[1]);
      expect(c.yearRange[0]).toBeGreaterThanOrEqual(1900);
      expect(c.yearRange[1]).toBeLessThanOrEqual(2100);
    }
  });

  test("DE und EN Texte sind vorhanden und nicht leer", () => {
    for (const c of HISTORICAL_CRISES) {
      expect(c.nameDe.length).toBeGreaterThan(0);
      expect(c.nameEn.length).toBeGreaterThan(0);
      expect(c.descDe.length).toBeGreaterThan(10);
      expect(c.descEn.length).toBeGreaterThan(10);
    }
  });

  test("keine überlappenden Year-Ranges (jedes Jahr eindeutig zuordenbar)", () => {
    const years = new Set<number>();
    for (const c of HISTORICAL_CRISES) {
      for (let y = c.yearRange[0]; y <= c.yearRange[1]; y++) {
        expect(years.has(y)).toBe(false);
        years.add(y);
      }
    }
  });

  test("chronologisch sortiert", () => {
    for (let i = 1; i < HISTORICAL_CRISES.length; i++) {
      expect(HISTORICAL_CRISES[i].yearRange[0]).toBeGreaterThan(
        HISTORICAL_CRISES[i - 1].yearRange[1],
      );
    }
  });
});

describe("findCrisisForYear", () => {
  test("liefert Globale Finanzkrise für 2008", () => {
    const c = findCrisisForYear(2008);
    expect(c).not.toBeNull();
    expect(c?.nameDe).toBe("Globale Finanzkrise");
  });

  test("liefert Corona-Crash für 2020", () => {
    expect(findCrisisForYear(2020)?.nameDe).toBe("Corona-Crash");
  });

  test("liefert Dotcom-Crash für 2001", () => {
    expect(findCrisisForYear(2001)?.nameDe).toBe("Dotcom-Crash");
  });

  test("liefert null für Jahre ohne Krise (z. B. 1985)", () => {
    expect(findCrisisForYear(1985)).toBeNull();
  });

  test("liefert null für 2024 (kein Eintrag)", () => {
    expect(findCrisisForYear(2024)).toBeNull();
  });

  test("robust gegen NaN", () => {
    expect(findCrisisForYear(Number.NaN)).toBeNull();
  });
});

describe("getLocalizedCrisis", () => {
  test("liefert deutsche Texte bei locale=de", () => {
    const r = getLocalizedCrisis(2008, "de");
    expect(r?.name).toBe("Globale Finanzkrise");
    expect(r?.description).toContain("Lehman");
  });

  test("liefert englische Texte bei locale=en", () => {
    const r = getLocalizedCrisis(2008, "en");
    expect(r?.name).toBe("Global Financial Crisis");
    expect(r?.description).toContain("Lehman");
  });

  test("liefert null wenn keine Krise zugeordnet", () => {
    expect(getLocalizedCrisis(1985, "de")).toBeNull();
  });
});