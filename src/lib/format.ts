export function fmtEur(n: number): string {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtNum(n: number, decimals = 0): string {
  return new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function fmtPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}