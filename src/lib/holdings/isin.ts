/**
 * ISIN utilities.
 *
 * Format: 2-Char Country + 9-Char Alphanumeric NSIN + 1 Check Digit.
 * Prüfsumme via Luhn-ähnlicher Mod-10-Algorithmus auf Buchstaben→Zahlen-Codierung
 * (A=10, B=11, ..., Z=35).
 */

export function isValidIsin(input: string): boolean {
  const isin = input.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;

  // 1. Letters → digits (A=10, B=11, ..., Z=35)
  let expanded = "";
  for (let i = 0; i < isin.length; i++) {
    const c = isin.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      expanded += isin.charAt(i);
    } else if (c >= 65 && c <= 90) {
      expanded += String(c - 55);
    } else {
      return false;
    }
  }

  // 2. Luhn check (right-to-left, double every second from second-to-last back)
  let sum = 0;
  let shouldDouble = false;
  for (let i = expanded.length - 1; i >= 0; i--) {
    let digit = Number.parseInt(expanded.charAt(i), 10);
    if (Number.isNaN(digit)) return false;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function maskIsin(isin: string): string {
  if (!isin || isin.length < 6) return "***";
  return `${isin.slice(0, 2)}***${isin.slice(-2)}`;
}