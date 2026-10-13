import { describe, expect, test } from "bun:test";
import { fmtEur, fmtNum, formatAT } from "./format";

describe("Zahlenformat Österreich", () => {
  test("Tausenderpunkt statt Leerzeichen", () => {
    expect(fmtEur(250_000)).toMatch(/^€\s250\.000$/);
    expect(fmtNum(1_234_567)).toBe("1.234.567");
  });

  test("Dezimalkomma bleibt", () => {
    expect(fmtNum(1234.5, 1)).toBe("1.234,5");
    expect(formatAT(0.025, { style: "percent", minimumFractionDigits: 1 })).toMatch(/^2,5\s?%$/);
  });

  test("negative Beträge", () => {
    expect(fmtEur(-40_000)).toMatch(/^-€\s40\.000$|^€\s-40\.000$/);
  });
});
