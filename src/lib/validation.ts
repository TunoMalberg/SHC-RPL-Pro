/**
 * Domänen-Validierung für Eingaben & API-Bodies.
 *
 * Bewusste Entscheidung: kein zod/valibot, sondern handgeschriebene Guards.
 * Gründe:
 *   - Keine zusätzliche Bundle-Größe (zod ~12 KB)
 *   - Volle Kontrolle über deutsche Fehlertexte
 *   - Identische Logik in Browser (Form-UX) und Server (API-Routes)
 *
 * Falls die Schemata in Iter 3 wachsen, ist ein Umstieg auf zod schmerzfrei,
 * weil hier ausschließlich Funktionen mit klarem Signaturvertrag stehen.
 */

import type { ClientProfile, FinancialInputs, PortfolioConfig, LiquidityEvent } from "./types";

export interface ValidationIssue {
  /** Pfad ins Objekt, z. B. "client.retirementAge" oder "portfolio.buckets[2].allocation" */
  path: string;
  /** Mensch-lesbare Fehlermeldung (DE). */
  message: string;
  /** Schweregrad: 'error' verhindert Ausführung, 'warn' nur Hinweis. */
  severity: "error" | "warn";
}

export type ValidationResult = {
  ok: boolean;
  errors: ValidationIssue[];
};

const result = (): ValidationResult => ({ ok: true, errors: [] });
const fail = (r: ValidationResult, issue: ValidationIssue): void => {
  r.errors.push(issue);
  if (issue.severity === "error") r.ok = false;
};

// ---- Numerische Helfer --------------------------------------------------

/** Begrenzt einen Wert auf ein Intervall ohne NaN-Surprises.
 *  - NaN  → fallback (default = min)
 *  - +Inf → max
 *  - -Inf → min
 *  - sonst → in [min, max] geklemmt
 */
export function clamp(value: number, min: number, max: number, fallback: number = min): number {
  if (Number.isNaN(value)) return fallback;
  if (value === Number.POSITIVE_INFINITY) return max;
  if (value === Number.NEGATIVE_INFINITY) return min;
  return Math.max(min, Math.min(max, value));
}

/** Rundet auf n Nachkommastellen ohne Floating-Drift. */
export function round(value: number, decimals: number = 2): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

// ---- Client-Profile -----------------------------------------------------

export function validateClient(c: ClientProfile): ValidationResult {
  const r = result();

  if (!Number.isFinite(c.currentAge) || c.currentAge < 18 || c.currentAge > 100) {
    fail(r, {
      path: "client.currentAge",
      message: "Aktuelles Alter muss zwischen 18 und 100 liegen.",
      severity: "error",
    });
  }
  if (!Number.isFinite(c.retirementAge) || c.retirementAge < 30 || c.retirementAge > 100) {
    fail(r, {
      path: "client.retirementAge",
      message: "Rentenalter muss zwischen 30 und 100 liegen.",
      severity: "error",
    });
  }
  if (c.retirementAge < c.currentAge) {
    fail(r, {
      path: "client.retirementAge",
      message: "Rentenalter darf nicht vor dem aktuellen Alter liegen.",
      severity: "error",
    });
  }
  if (!Number.isFinite(c.lifeExpectancy) || c.lifeExpectancy < 50 || c.lifeExpectancy > 120) {
    fail(r, {
      path: "client.lifeExpectancy",
      message: "Lebenserwartung muss zwischen 50 und 120 liegen.",
      severity: "error",
    });
  }
  if (c.lifeExpectancy <= c.retirementAge) {
    fail(r, {
      path: "client.lifeExpectancy",
      message: "Lebenserwartung muss größer als das Rentenalter sein.",
      severity: "error",
    });
  }
  if (c.retirementAge - c.currentAge > 60) {
    fail(r, {
      path: "client.retirementAge",
      message: "Ansparphase über 60 Jahre — bitte Werte prüfen.",
      severity: "warn",
    });
  }
  return r;
}

// ---- Financial Inputs ---------------------------------------------------

export function validateInputs(inp: FinancialInputs, c?: ClientProfile): ValidationResult {
  const r = result();

  if (!Number.isFinite(inp.initialCapital) || inp.initialCapital < 0) {
    fail(r, {
      path: "inputs.initialCapital",
      message: "Startkapital darf nicht negativ sein.",
      severity: "error",
    });
  }
  if (inp.initialCapital > 1_000_000_000) {
    fail(r, {
      path: "inputs.initialCapital",
      message: "Startkapital über 1 Mrd. € — bitte Eingabe prüfen.",
      severity: "warn",
    });
  }
  if (!Number.isFinite(inp.monthlySavings) || inp.monthlySavings < 0) {
    fail(r, {
      path: "inputs.monthlySavings",
      message: "Sparrate darf nicht negativ sein.",
      severity: "error",
    });
  }
  // CR 4: Der Wunschbetrag ist optional — null (= „berechnen, was möglich
  // ist") ist gültig; eine erfasste Zahl muss endlich und ≥ 0 sein.
  if (
    inp.desiredMonthlyWithdrawal !== null &&
    (!Number.isFinite(inp.desiredMonthlyWithdrawal) || inp.desiredMonthlyWithdrawal < 0)
  ) {
    fail(r, {
      path: "inputs.desiredMonthlyWithdrawal",
      message: "Gewünschter monatlicher Gesamtbetrag darf nicht negativ sein.",
      severity: "error",
    });
  }
  if (!Number.isFinite(inp.monthlyPension) || inp.monthlyPension < 0) {
    fail(r, {
      path: "inputs.monthlyPension",
      message: "Pension darf nicht negativ sein.",
      severity: "error",
    });
  }
  if (!Number.isFinite(inp.pensionStartAge) || inp.pensionStartAge < 30 || inp.pensionStartAge > 90) {
    fail(r, {
      path: "inputs.pensionStartAge",
      message: "Pensionsbeginn muss zwischen 30 und 90 liegen.",
      severity: "error",
    });
  }
  if (c && inp.pensionStartAge >= c.lifeExpectancy) {
    fail(r, {
      path: "inputs.pensionStartAge",
      message: "Pensionsbeginn liegt nach der Lebenserwartung — Pension wird nie ausgezahlt.",
      severity: "warn",
    });
  }
  if (!Number.isFinite(inp.inflationRate) || inp.inflationRate < -5 || inp.inflationRate > 25) {
    fail(r, {
      path: "inputs.inflationRate",
      message: "Inflationsrate muss zwischen −5 % und 25 % liegen.",
      severity: "error",
    });
  }
  if (!Number.isFinite(inp.annualSavingsIncrease) || inp.annualSavingsIncrease < -10 || inp.annualSavingsIncrease > 50) {
    fail(r, {
      path: "inputs.annualSavingsIncrease",
      message: "Jährliche Sparratenanpassung muss zwischen −10 % und 50 % liegen.",
      severity: "error",
    });
  }
  return r;
}

// ---- Portfolio ----------------------------------------------------------

export function validatePortfolio(p: PortfolioConfig): ValidationResult {
  const r = result();

  if (!Array.isArray(p.buckets) || p.buckets.length !== 3) {
    fail(r, {
      path: "portfolio.buckets",
      message: "Genau drei Vermögenstöpfe (Cash/Anleihen/Aktien) erforderlich.",
      severity: "error",
    });
    return r;
  }

  let allocSum = 0;
  for (let i = 0; i < p.buckets.length; i++) {
    const b = p.buckets[i];
    if (!Number.isFinite(b.allocation) || b.allocation < 0 || b.allocation > 100) {
      fail(r, {
        path: `portfolio.buckets[${i}].allocation`,
        message: `Allokation Topf ${i + 1} muss zwischen 0 und 100 % liegen.`,
        severity: "error",
      });
    } else {
      allocSum += b.allocation;
    }
    if (!Number.isFinite(b.expectedReturn) || b.expectedReturn < -10 || b.expectedReturn > 30) {
      fail(r, {
        path: `portfolio.buckets[${i}].expectedReturn`,
        message: `Erwartete Rendite Topf ${i + 1} unrealistisch (Bereich −10 % bis 30 %).`,
        severity: "warn",
      });
    }
    if (!Number.isFinite(b.volatility) || b.volatility < 0 || b.volatility > 60) {
      fail(r, {
        path: `portfolio.buckets[${i}].volatility`,
        message: `Volatilität Topf ${i + 1} unrealistisch (0–60 %).`,
        severity: "warn",
      });
    }
  }
  if (Math.abs(allocSum - 100) > 0.01) {
    fail(r, {
      path: "portfolio.buckets",
      message: `Allokationen summieren sich auf ${round(allocSum, 1)} %, müssen aber 100 % ergeben.`,
      severity: "error",
    });
  }

  if (!Number.isFinite(p.kestRate) || p.kestRate < 0 || p.kestRate > 60) {
    fail(r, {
      path: "portfolio.kestRate",
      message: "KESt-Satz muss zwischen 0 und 60 % liegen.",
      severity: "error",
    });
  }
  if (!Number.isFinite(p.cashYearsTarget) || p.cashYearsTarget < 0 || p.cashYearsTarget > 10) {
    fail(r, {
      path: "portfolio.cashYearsTarget",
      message: "Cash-Reserve-Jahre müssen zwischen 0 und 10 liegen.",
      severity: "error",
    });
  }

  // 3×3-Korrelationsmatrix
  if (!Array.isArray(p.correlationMatrix) || p.correlationMatrix.length !== 3) {
    fail(r, {
      path: "portfolio.correlationMatrix",
      message: "Korrelationsmatrix muss 3×3 sein.",
      severity: "error",
    });
  } else {
    for (let i = 0; i < 3; i++) {
      const row = p.correlationMatrix[i];
      if (!Array.isArray(row) || row.length !== 3) {
        fail(r, {
          path: `portfolio.correlationMatrix[${i}]`,
          message: "Zeile der Korrelationsmatrix unvollständig.",
          severity: "error",
        });
        continue;
      }
      if (Math.abs(row[i] - 1) > 0.01) {
        fail(r, {
          path: `portfolio.correlationMatrix[${i}][${i}]`,
          message: "Diagonalwerte der Korrelationsmatrix müssen 1 sein.",
          severity: "error",
        });
      }
      for (let j = 0; j < 3; j++) {
        if (!Number.isFinite(row[j]) || row[j] < -1 || row[j] > 1) {
          fail(r, {
            path: `portfolio.correlationMatrix[${i}][${j}]`,
            message: "Korrelationen müssen im Bereich [−1, 1] liegen.",
            severity: "error",
          });
        }
      }
    }
  }
  return r;
}

// ---- Liquidity Events ---------------------------------------------------

export function validateLiquidityEvents(
  events: LiquidityEvent[],
  c?: ClientProfile,
): ValidationResult {
  const r = result();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!Number.isFinite(e.amount)) {
      fail(r, {
        path: `liquidityEvents[${i}].amount`,
        message: "Betrag eines Liquiditätsereignisses ist kein gültiger Wert.",
        severity: "error",
      });
    }
    if (!Number.isFinite(e.age) || e.age < 18 || e.age > 120) {
      fail(r, {
        path: `liquidityEvents[${i}].age`,
        message: "Alter des Liquiditätsereignisses muss zwischen 18 und 120 liegen.",
        severity: "error",
      });
    }
    if (c && e.age < c.currentAge) {
      fail(r, {
        path: `liquidityEvents[${i}].age`,
        message: `Liquiditätsereignis liegt vor dem aktuellen Alter (${c.currentAge}).`,
        severity: "warn",
      });
    }
  }
  return r;
}

// ---- Holdings-API Body --------------------------------------------------

/** Validiert den POST-Body für /api/holdings/backtest. */
export function validateBacktestBody(body: unknown): ValidationResult {
  const r = result();
  if (!body || typeof body !== "object") {
    fail(r, { path: "body", message: "Request-Body fehlt oder ist kein Objekt.", severity: "error" });
    return r;
  }
  const b = body as { holdings?: unknown; from?: unknown };
  if (!Array.isArray(b.holdings)) {
    fail(r, { path: "holdings", message: "`holdings` muss ein Array sein.", severity: "error" });
    return r;
  }
  if (b.holdings.length === 0) {
    fail(r, { path: "holdings", message: "Mindestens eine Position erforderlich.", severity: "error" });
  }
  if (b.holdings.length > 200) {
    fail(r, { path: "holdings", message: "Maximal 200 Positionen pro Request.", severity: "error" });
  }
  if (b.from !== undefined && (typeof b.from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.from))) {
    fail(r, { path: "from", message: "`from` muss im Format YYYY-MM-DD vorliegen.", severity: "error" });
  }
  return r;
}

// ---- Aggregator ---------------------------------------------------------

/**
 * Validiert das gesamte Eingabe-Trio + optional Liquiditätsereignisse.
 * Praktisch zum Aufruf direkt vor `runMonteCarloSimulation`.
 */
export function validatePlanInputs(
  client: ClientProfile,
  inputs: FinancialInputs,
  portfolio: PortfolioConfig,
  events: LiquidityEvent[] = [],
): ValidationResult {
  const merged = result();
  for (const part of [
    validateClient(client),
    validateInputs(inputs, client),
    validatePortfolio(portfolio),
    validateLiquidityEvents(events, client),
  ]) {
    for (const e of part.errors) merged.errors.push(e);
    if (!part.ok) merged.ok = false;
  }
  return merged;
}