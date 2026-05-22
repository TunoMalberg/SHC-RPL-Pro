/**
 * Heuristische Klassifikation einer Yahoo-Suche in HoldingAssetClass + Region.
 *
 * Wird beim Auto-Befüllen einer neu hinzugefügten Position über die Live-Suche
 * verwendet. Berater kann jederzeit manuell überschreiben.
 */

import type { HoldingAssetClass } from "./types";

export interface ClassificationInput {
  quoteType: string; // ETF | EQUITY | MUTUALFUND | INDEX | CURRENCY | …
  name: string;
  symbol: string;
  sector?: string;
  industry?: string;
}

export interface ClassificationOutput {
  assetClass: HoldingAssetClass;
  region?: string;
  sector?: string;
}

export function classifySecurity(inp: ClassificationInput): ClassificationOutput {
  const n = (inp.name ?? "").toLowerCase();
  const sym = (inp.symbol ?? "").toUpperCase();
  const t = (inp.quoteType ?? "").toUpperCase();
  const sec = inp.sector;

  // Money-Market / Cash
  if (/money\s*market|geldmarkt|treasury\s*bill|t-bill|cash\s+equiv/i.test(n)) {
    return { assetClass: "Geldmarkt / Cash" };
  }

  // Bonds — keyword detection in fund names
  if (/bond|anleihen|aggregate|treasury|fixed[\s-]?income|gilt|bund\b|corporate\s*bond/i.test(n)) {
    if (/high\s*yield|hy\b|junk/i.test(n)) {
      return { assetClass: "Anleihen High Yield" };
    }
    if (/corporate|unternehmen|credit/i.test(n)) {
      return { assetClass: "Anleihen Unternehmen" };
    }
    return { assetClass: "Anleihen Staat" };
  }

  // Real Estate / REIT
  if (/reit|real\s*estate|immobilien/i.test(n) || sec === "Real Estate") {
    return { assetClass: "Immobilien (REIT)", sector: sec };
  }

  // Commodities / Gold
  if (/gold|silver|commodity|commodities|rohstoff|wti|brent|oil/i.test(n)) {
    return { assetClass: "Rohstoffe / Gold" };
  }

  // Mixed funds / multi-asset
  if (
    /multi[-\s]?asset|balanced|mischfonds|target[-\s]?date|lifecycle|allocation/i.test(n) ||
    t === "MUTUALFUND"
  ) {
    if (t === "MUTUALFUND" && /aktien|equity|stock/i.test(n)) {
      // a mutual fund explicitly tagged equity → keep equity below
    } else {
      return { assetClass: "Mischfonds" };
    }
  }

  // Private Equity / Alternatives
  if (/private\s*equity|alternatives?|hedge|infrastructure|infrastruktur/i.test(n)) {
    return { assetClass: "Alternatives / PE" };
  }

  // ETF / equity index funds → region detection
  if (t === "ETF" || /\betf\b|index\s*fund|ucits/i.test(n)) {
    if (/emerging|schwellenländer|emerging\s*markets|em\b/i.test(n)) {
      return { assetClass: "Aktien Schwellenländer", region: "Schwellenländer" };
    }
    if (/world|msci\s+world|all[-\s]?country|ftse\s*all[-\s]?world|acwi/i.test(n)) {
      return { assetClass: "Aktien Welt", region: "Welt" };
    }
    if (/s&p\s*500|usa|nasdaq|russell|us\s+equity|us\s*total/i.test(n)) {
      return { assetClass: "Aktien USA", region: "USA" };
    }
    if (/europ|stoxx|euro|dax|cac|ftse(?!\s*all)|smi|atx/i.test(n)) {
      return { assetClass: "Aktien Europa", region: "Europa" };
    }
    if (/asia|pacific|japan|china|nikkei|topix|hang\s*seng/i.test(n)) {
      return { assetClass: "Aktien Welt", region: "Asien-Pazifik" };
    }
    // Sector ETFs (Financials, Tech, Healthcare …)
    if (/sector|tech\b|financials?|health|energy|consumer|utilities|industrials/i.test(n)) {
      return { assetClass: "Aktien Sektor", sector: sec };
    }
    return { assetClass: "Aktien Welt" };
  }

  // Single-stock equity → derive region from suffix
  if (t === "EQUITY") {
    let region: string | undefined;
    if (sym.endsWith(".DE") || sym.endsWith(".F") || sym.endsWith(".VI") || sym.endsWith(".SW")) region = "Europa";
    else if (sym.endsWith(".L") || sym.endsWith(".AS") || sym.endsWith(".PA") || sym.endsWith(".MC") || sym.endsWith(".ST") || sym.endsWith(".BR") || sym.endsWith(".MI")) region = "Europa";
    else if (sym.endsWith(".T") || sym.endsWith(".HK") || sym.endsWith(".SS") || sym.endsWith(".AX")) region = "Asien-Pazifik";
    else region = "USA"; // No suffix = NYSE/Nasdaq default
    return { assetClass: "Aktien Sektor", region, sector: sec };
  }

  // Index → typically not investable directly, but treat as "Aktien Welt" placeholder
  if (t === "INDEX") {
    return { assetClass: "Aktien Welt" };
  }

  return { assetClass: "Sonstiges", sector: sec };
}