/**
 * Einzelpfad in heutiger Kaufkraft: alle Euro-Beträge eines Jahres werden
 * durch die bis Jahresende aufgelaufene Inflation dieses Pfads geteilt —
 * dieselbe Basis wie das Fächerdiagramm (Deflator je Jahresende).
 * Prozentwerte, Alter und Texte bleiben unverändert; die Beträge im
 * Text „Entnahme X − Pension Y" werden mit umgerechnet.
 */

import type { DetailedSimTrace, DetailedYearRow } from "./types";

const MONEY_FIELDS = [
  "startTotal", "startCash", "startBonds", "startEquities",
  "returnCash", "returnBonds", "returnEquities", "cashTax",
  "cashflow", "liquidityEvent",
  "rebalCashDelta", "rebalBondsDelta", "rebalEquitiesDelta",
  "withdrawalFromCash", "withdrawalFromBonds", "withdrawalFromEquities", "unpaidWithdrawal",
  "endCash", "endBonds", "endEquities", "endTotal",
  "peCall", "peDistGross", "peDistNet", "peNav", "peCommitted", "peUnfunded",
  "productPurchase", "productCoupon", "productPayout", "wbaValue", "lvValue",
] as const satisfies readonly (keyof DetailedYearRow)[];

export function deflateRow(row: DetailedYearRow): DetailedYearRow {
  const factor = row.cumulativeInflation > 0 ? row.cumulativeInflation : 1;
  const out: DetailedYearRow = { ...row };
  for (const key of MONEY_FIELDS) {
    const v = row[key];
    if (typeof v === "number") (out as unknown as Record<string, number>)[key] = v / factor;
  }
  out.cashflowLabel = row.cashflowLabel.replace(/\d+/g, (n) => String(Math.round(Number(n) / factor)));
  return out;
}

/** Ganzer Einzelpfad in heutiger Kaufkraft (Endvermögen mit dem letzten Jahr). */
export function deflateTrace(trace: DetailedSimTrace): DetailedSimTrace {
  const rows = trace.rows.map(deflateRow);
  const last = trace.rows[trace.rows.length - 1];
  const factor = last && last.cumulativeInflation > 0 ? last.cumulativeInflation : 1;
  return { ...trace, rows, finalWealth: trace.finalWealth / factor };
}
