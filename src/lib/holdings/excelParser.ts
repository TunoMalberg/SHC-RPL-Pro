/**
 * Excel-Parser für Bestandsportfolio-Import.
 *
 * Erkennt:
 *   - SHC-Vorlage          (Header exakt wie in excelTemplate.ts)
 *   - comdirect-Export     (Header enthält "WKN", "ISIN", "Bestand" etc.)
 *   - DAB / BNP            (Header enthält "ISIN", "Stück", "Kurs in")
 *   - V-Bank               (Header "Wertpapier", "Nominal", "Kurs")
 *   - FFB                  (Header "ISIN", "Anteile", "Anteilspreis")
 *   - Hauck Aufhäuser      (Header "WKN/ISIN", "Bestand", "Kurs")
 *   - Generisches CSV/XLSX → bestmögliches Mapping per Heuristik
 *
 * Output: Holding[] + Erkennung-Meta + Warnings.
 */

import ExcelJS from "exceljs";
import type {
  Holding,
  HoldingAssetClass,
  HoldingCurrency,
  HoldingsState,
} from "./types";
import { isValidIsin } from "./isin";
import { ASSET_CLASSES, CURRENCIES } from "./excelTemplate";

export interface ImportWarning {
  row: number;
  field?: string;
  message: string;
}

export interface ImportResult {
  detectedFormat: NonNullable<HoldingsState["importMeta"]>["source"];
  holdings: Holding[];
  warnings: ImportWarning[];
}

type ColumnKey =
  | "isin"
  | "ticker"
  | "name"
  | "quantity"
  | "costPrice"
  | "currentPrice"
  | "currency"
  | "assetClass"
  | "region"
  | "sector"
  | "note"
  | "marketValue"
  | "wkn";

interface FormatHints {
  source: NonNullable<HoldingsState["importMeta"]>["source"];
  /** Map from header tokens (lowercased trimmed) to column keys. */
  headerMap: Record<string, ColumnKey>;
}

const SHC_TEMPLATE: FormatHints = {
  source: "shc-template",
  headerMap: {
    isin: "isin",
    ticker: "ticker",
    bezeichnung: "name",
    stückzahl: "quantity",
    stueckzahl: "quantity",
    einstandskurs: "costPrice",
    "aktueller kurs": "currentPrice",
    währung: "currency",
    waehrung: "currency",
    anlageklasse: "assetClass",
    region: "region",
    sektor: "sector",
    notiz: "note",
  },
};

const COMDIRECT: FormatHints = {
  source: "comdirect",
  headerMap: {
    isin: "isin",
    wkn: "wkn",
    wertpapierbezeichnung: "name",
    bezeichnung: "name",
    bestand: "quantity",
    "stück": "quantity",
    kurs: "currentPrice",
    "aktueller kurs": "currentPrice",
    währung: "currency",
    waehrung: "currency",
  },
};

const DAB: FormatHints = {
  source: "dab",
  headerMap: {
    isin: "isin",
    wkn: "wkn",
    bezeichnung: "name",
    "stück": "quantity",
    stueck: "quantity",
    "kurs in": "currentPrice",
    "kurswert in": "marketValue",
    währung: "currency",
  },
};

const VBANK: FormatHints = {
  source: "vbank",
  headerMap: {
    isin: "isin",
    wertpapier: "name",
    bezeichnung: "name",
    nominal: "quantity",
    bestand: "quantity",
    kurs: "currentPrice",
    kurswert: "marketValue",
    währung: "currency",
  },
};

const FFB: FormatHints = {
  source: "ffb",
  headerMap: {
    isin: "isin",
    fondsname: "name",
    bezeichnung: "name",
    anteile: "quantity",
    anteilspreis: "currentPrice",
    währung: "currency",
  },
};

const HAUCK: FormatHints = {
  source: "hauck",
  headerMap: {
    isin: "isin",
    "wkn/isin": "isin",
    bezeichnung: "name",
    bestand: "quantity",
    kurs: "currentPrice",
    "wert in eur": "marketValue",
    währung: "currency",
  },
};

const KNOWN_FORMATS = [SHC_TEMPLATE, COMDIRECT, DAB, VBANK, FFB, HAUCK];

function normHeader(h: string): string {
  return h
    .toString()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.:]+$/g, "")
    .trim();
}

function detectFormat(headers: string[]): { hints: FormatHints; mapping: Record<number, ColumnKey> } {
  const normHeaders = headers.map(normHeader);

  let bestScore = 0;
  let bestHints: FormatHints = SHC_TEMPLATE;
  let bestMapping: Record<number, ColumnKey> = {};

  for (const fmt of KNOWN_FORMATS) {
    const mapping: Record<number, ColumnKey> = {};
    let score = 0;
    normHeaders.forEach((h, idx) => {
      // exact match?
      if (fmt.headerMap[h]) {
        mapping[idx] = fmt.headerMap[h];
        score++;
      } else {
        // contains match
        for (const [token, key] of Object.entries(fmt.headerMap)) {
          if (h.includes(token)) {
            mapping[idx] = key;
            score++;
            break;
          }
        }
      }
    });
    if (score > bestScore) {
      bestScore = score;
      bestHints = fmt;
      bestMapping = mapping;
    }
  }

  if (bestScore < 3) {
    // Generic fallback — heuristic per common keywords
    const generic: Record<number, ColumnKey> = {};
    normHeaders.forEach((h, idx) => {
      if (h === "isin" || h.includes("isin")) generic[idx] = "isin";
      else if (h.includes("ticker") || h.includes("symbol")) generic[idx] = "ticker";
      else if (h.includes("name") || h.includes("bezeichnung") || h.includes("wertpapier"))
        generic[idx] = "name";
      else if (h.includes("stück") || h === "stueck" || h.includes("anteile") || h.includes("quantity") || h.includes("nominal") || h.includes("bestand"))
        generic[idx] = "quantity";
      else if (h.includes("einstand") || h.includes("kaufkurs") || h.includes("cost"))
        generic[idx] = "costPrice";
      else if (h.includes("aktueller kurs") || h.includes("kurs") || h.includes("price"))
        generic[idx] = "currentPrice";
      else if (h.includes("währung") || h === "waehrung" || h.includes("currency") || h.includes("ccy"))
        generic[idx] = "currency";
      else if (h.includes("anlageklasse") || h.includes("asset class")) generic[idx] = "assetClass";
      else if (h.includes("region")) generic[idx] = "region";
      else if (h.includes("sektor") || h.includes("sector") || h.includes("branche"))
        generic[idx] = "sector";
      else if (h.includes("notiz") || h.includes("note") || h.includes("kommentar"))
        generic[idx] = "note";
      else if (h.includes("kurswert") || h.includes("marktwert") || h.includes("wert"))
        generic[idx] = "marketValue";
      else if (h.includes("wkn")) generic[idx] = "wkn";
    });
    return {
      hints: { source: "custom", headerMap: {} },
      mapping: generic,
    };
  }

  return { hints: bestHints, mapping: bestMapping };
}

function parseNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // German locale: 1.234,56 — strip thousand-dots, replace comma with dot
    const s = v.replace(/\s+/g, "").replace(/\.(?=\d{3}(?:[,.]|$))/g, "").replace(",", ".");
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function classifyByHints(input: string | undefined): HoldingAssetClass | undefined {
  if (!input) return undefined;
  const v = input.toLowerCase();
  if (ASSET_CLASSES.includes(input as HoldingAssetClass)) return input as HoldingAssetClass;
  if (v.includes("anleihe") || v.includes("bond") || v.includes("fixed")) {
    if (v.includes("staat") || v.includes("govt") || v.includes("government")) return "Anleihen Staat";
    if (v.includes("unternehmen") || v.includes("corporate")) return "Anleihen Unternehmen";
    if (v.includes("hy") || v.includes("high yield")) return "Anleihen High Yield";
    return "Anleihen Staat";
  }
  if (v.includes("immo") || v.includes("reit")) return "Immobilien (REIT)";
  if (v.includes("rohstoff") || v.includes("gold") || v.includes("commod")) return "Rohstoffe / Gold";
  if (v.includes("cash") || v.includes("geldmarkt") || v.includes("money market")) return "Geldmarkt / Cash";
  if (v.includes("emerg") || v.includes("schwellen")) return "Aktien Schwellenländer";
  if (v.includes("usa") || v.includes("us")) return "Aktien USA";
  if (v.includes("europ") || v.includes("dax") || v.includes("euro")) return "Aktien Europa";
  if (v.includes("welt") || v.includes("world") || v.includes("global")) return "Aktien Welt";
  if (v.includes("misch") || v.includes("balanc")) return "Mischfonds";
  return undefined;
}

function genUuid(): string {
  // Server-side: use crypto.randomUUID if available
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `h_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export async function parseHoldingsBuffer(
  buffer: ArrayBuffer | Buffer,
  fileName: string,
): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer);

  // Find first sheet that has at least 4 columns of data
  const candidates: ExcelJS.Worksheet[] = [];
  wb.eachSheet((ws) => {
    if (ws.actualColumnCount >= 4 && ws.actualRowCount >= 2) {
      candidates.push(ws);
    }
  });
  if (candidates.length === 0) {
    throw new Error("Keine geeigneten Daten in der Excel-Datei gefunden.");
  }
  const sheet = candidates[0];

  // Find header row (first row with > 3 non-empty cells AND containing common keywords)
  let headerRow = 1;
  let headers: string[] = [];
  const maxScan = Math.min(15, sheet.actualRowCount);
  for (let r = 1; r <= maxScan; r++) {
    const row = sheet.getRow(r);
    const vals: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell: ExcelJS.Cell) => {
      vals.push(String(cell.value ?? ""));
    });
    const joined = vals.join(" ").toLowerCase();
    if (
      vals.length >= 3 &&
      (joined.includes("isin") || joined.includes("wkn") || joined.includes("bezeichnung") || joined.includes("wertpapier") || joined.includes("ticker"))
    ) {
      headerRow = r;
      headers = vals;
      break;
    }
  }
  if (headers.length === 0) {
    // fall back to first row
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell) => {
      headers.push(String(cell.value ?? ""));
    });
  }

  const { hints, mapping } = detectFormat(headers);
  const warnings: ImportWarning[] = [];
  const holdings: Holding[] = [];

  for (let r = headerRow + 1; r <= sheet.actualRowCount + headerRow; r++) {
    const row = sheet.getRow(r);
    if (row.actualCellCount === 0) continue;

    const get = (key: ColumnKey): unknown => {
      for (const [idx, k] of Object.entries(mapping)) {
        if (k === key) {
          const cell = row.getCell(Number.parseInt(idx, 10) + 1);
          // Excel cell.value can be { result, formula }, string, number, Date, boolean, null
          const v = cell?.value;
          if (typeof v === "object" && v !== null && "result" in v) {
            return (v as { result: unknown }).result;
          }
          return v ?? null;
        }
      }
      return undefined;
    };

    const rawIsin = (get("isin") ?? "").toString().trim().toUpperCase();
    const rawTicker = (get("ticker") ?? "").toString().trim().toUpperCase();
    const name = (get("name") ?? "").toString().trim();
    const wkn = (get("wkn") ?? "").toString().trim().toUpperCase();

    if (!rawIsin && !rawTicker && !name && !wkn) {
      // Empty row — skip
      continue;
    }

    if (!name) {
      warnings.push({ row: r, field: "name", message: "Bezeichnung fehlt" });
      continue;
    }

    let isin: string | undefined = undefined;
    if (rawIsin) {
      if (isValidIsin(rawIsin)) {
        isin = rawIsin;
      } else {
        warnings.push({ row: r, field: "isin", message: `ISIN "${rawIsin}" ist ungültig (Prüfsumme/Format)` });
      }
    }

    const quantity = parseNumber(get("quantity"));
    let currentPrice = parseNumber(get("currentPrice"));
    const marketValue = parseNumber(get("marketValue"));
    const costPrice = parseNumber(get("costPrice"));

    // Derive price from market value if needed
    if (!currentPrice && marketValue && quantity) {
      currentPrice = marketValue / quantity;
    }

    if (!quantity || quantity <= 0) {
      warnings.push({ row: r, field: "quantity", message: "Stückzahl fehlt oder <= 0" });
      continue;
    }
    if (!currentPrice || currentPrice <= 0) {
      warnings.push({ row: r, field: "currentPrice", message: "Aktueller Kurs fehlt oder <= 0" });
      continue;
    }

    const currencyRaw = (get("currency") ?? "").toString().trim().toUpperCase();
    const currency: HoldingCurrency = (CURRENCIES as readonly string[]).includes(currencyRaw)
      ? (currencyRaw as HoldingCurrency)
      : "EUR";
    if (!currencyRaw) {
      warnings.push({ row: r, field: "currency", message: "Währung leer — Default EUR" });
    }

    const assetClassRaw = (get("assetClass") ?? "").toString().trim();
    const assetClass: HoldingAssetClass = classifyByHints(assetClassRaw) ?? "Sonstiges";

    const region = (get("region") ?? "").toString().trim() || undefined;
    const sector = (get("sector") ?? "").toString().trim() || undefined;
    const note = (get("note") ?? "").toString().trim() || undefined;

    holdings.push({
      id: genUuid(),
      isin,
      ticker: rawTicker || undefined,
      name,
      quantity,
      currentPrice,
      costPrice,
      currency,
      assetClass,
      region,
      sector,
      note,
      resolutionStatus: "pending",
    });
  }

  if (holdings.length === 0) {
    warnings.push({ row: 0, message: "Keine gültigen Positionen gefunden." });
  }

  return {
    detectedFormat: hints.source,
    holdings,
    warnings,
  };
}