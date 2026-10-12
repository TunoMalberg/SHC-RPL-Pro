import { describe, expect, test } from "bun:test";
import { sanitizeMessage, sanitizeStack } from "./errorReport";

describe("Fehlerprotokoll — keine Kundendaten in Meldungen", () => {
  test("Beträge, Jahreszahlen und lange Ziffernfolgen werden unkenntlich", () => {
    expect(sanitizeMessage("Ungültiger Betrag 523000 €")).toBe("Ungültiger Betrag # €");
    expect(sanitizeMessage("Wert 1.234,56 überschritten")).toBe("Wert # überschritten");
    expect(sanitizeMessage("Geburtsjahr 1980 fehlt")).toBe("Geburtsjahr # fehlt");
    expect(sanitizeMessage("Telefon 0664 1234567")).toBe("Telefon #");
  });

  test("kurze Zahlen (Zeilen, Indizes, Alter) bleiben lesbar", () => {
    expect(sanitizeMessage("Index 3 außerhalb, Alter 45")).toBe("Index 3 außerhalb, Alter 45");
  });

  test("E-Mail-Adressen werden entfernt", () => {
    expect(sanitizeMessage("Senden an max.muster@example.com fehlgeschlagen")).toBe(
      "Senden an <email> fehlgeschlagen",
    );
  });

  test("Meldung wird gekürzt", () => {
    expect(sanitizeMessage("x".repeat(1000)).length).toBe(300);
  });

  test("Code-Stellen: nur Funktion + Dateiname:Zeile:Spalte, ohne Pfad und Parameter", () => {
    const stack = [
      "TypeError: x is undefined",
      "    at renderChart (http://localhost:3123/_next/static/chunks/app/page-abc.js?v=17:120:15)",
      "    at http://localhost:3123/_next/static/chunks/main.js:5:9",
    ].join("\n");
    expect(sanitizeStack(stack)).toBe("renderChart (page-abc.js:120:15)\n<anonym> (main.js:5:9)");
  });

  test("leerer oder fehlender Stack → nichts", () => {
    expect(sanitizeStack(undefined)).toBeUndefined();
    expect(sanitizeStack("")).toBeUndefined();
  });
});
