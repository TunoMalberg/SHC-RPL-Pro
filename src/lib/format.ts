/**
 * Zahlenformat Österreich: Tausenderpunkt, Dezimalkomma, „€ 250.000".
 *
 * Neuere Browser (CLDR ≥ 42) trennen bei „de-AT" Tausender mit einem
 * Leerzeichen („250 000"). Die Bank verwendet den Punkt — daher wird die
 * Tausendergruppe hier fix auf „." gesetzt; alles andere (Währungszeichen
 * vorne, Dezimalkomma) bleibt wie bei „de-AT".
 */
export function atFormatter(options: Intl.NumberFormatOptions = {}): { format: (n: number) => string } {
  const nf = new Intl.NumberFormat("de-AT", options);
  return {
    format: (n: number) =>
      nf
        .formatToParts(n)
        .map((p) => (p.type === "group" ? "." : p.value))
        .join(""),
  };
}

/** Einmalige Formatierung im österreichischen Format. */
export function formatAT(n: number, options: Intl.NumberFormatOptions = {}): string {
  return atFormatter(options).format(n);
}

export function fmtEur(n: number): string {
  return formatAT(n, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export function fmtNum(n: number, decimals = 0): string {
  return formatAT(n, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}
