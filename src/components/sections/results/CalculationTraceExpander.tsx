"use client";

import { useI18n } from "@/lib/i18n";
import { fmtEur, fmtPct, fmtNum } from "@/lib/format";
import type { SimulationResult } from "@/lib/types";

/** Berechnungsnachweis (CR 19): Experten-Ansicht + JSON-Export. */
export function CalculationTraceExpander({ result }: { result: SimulationResult }) {
  const { t } = useI18n();
  return (
    <>
      {/* ── Berechnungsnachweis (CR 19): Experten-Expander + JSON-Export ── */}
      {result.calculationTrace && (
        <details className="rounded-xl border border-slate-200 bg-white" data-design-id="calculation-trace-expander">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-600 hover:text-slate-900">
            🧮 {t("trace.title")}
            <span className="ml-2 text-[10px] font-normal text-slate-400">
              {t("trace.versionLine")
                .replace("{version}", result.calculationTrace.configVersion)
                .replace("{date}", new Date(result.calculationTrace.stichtag).toLocaleDateString("de-AT"))}
            </span>
          </summary>
          <div className="px-4 pb-4 space-y-3 text-xs text-slate-600">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                <div className="font-semibold text-slate-700">{t("trace.assumptions")}</div>
                {result.calculationTrace.assumptions.buckets.map((b) => (
                  <div key={b.name} className="flex justify-between tabular-nums">
                    <span>{b.label} ({b.allocationPct}%)</span>
                    <span>
                      {fmtPct(b.expectedReturnNominalPct)} {t("trace.nominalShort")} / {fmtPct(b.expectedReturnRealPct)} {t("trace.realShort")}, σ {fmtPct(b.volatilityPct)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between">
                  <span>{t("trace.inflation")}</span>
                  <span>{fmtPct(result.calculationTrace.assumptions.inflationRatePct)}</span>
                </div>
                <div className="flex justify-between">
                  <span>KESt</span>
                  <span>{fmtPct(result.calculationTrace.assumptions.kestRatePct)}</span>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                <div className="font-semibold text-slate-700">{t("trace.derivation")}</div>
                <div className="flex justify-between">
                  <span>desiredMonthlyIncome</span>
                  <span>{result.calculationTrace.derivation.desiredMonthlyIncome !== null ? fmtEur(result.calculationTrace.derivation.desiredMonthlyIncome) : "— (null)"}</span>
                </div>
                <div className="flex justify-between">
                  <span>externalMonthlyIncome</span>
                  <span>{fmtEur(result.calculationTrace.derivation.externalMonthlyIncome)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>requiredMonthlyWithdrawal</span>
                  <span>{result.calculationTrace.derivation.requiredMonthlyWithdrawal !== null ? fmtEur(result.calculationTrace.derivation.requiredMonthlyWithdrawal) : "— (null)"}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">{result.calculationTrace.derivation.formula}</p>
                <div className="font-semibold text-slate-700 pt-1">{t("trace.corridorMethod")}</div>
                <p className="text-[10px] text-slate-400 leading-relaxed">{result.calculationTrace.corridor.method}</p>
                <p className="text-[10px] text-slate-400">
                  {t("trace.simLine")
                    .replace("{sims}", fmtNum(result.calculationTrace.corridor.technical.maxSimulations))
                    .replace("{iters}", String(result.calculationTrace.corridor.technical.iterations))
                    .replace("{seed}", String(result.calculationTrace.simulation.seed ?? "auto"))}
                </p>
                <p className="text-[10px] text-slate-400">{result.calculationTrace.rounding.corridorRounding}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob(
                  [JSON.stringify(result.calculationTrace, null, 2)],
                  { type: "application/json" },
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `calculationTrace_${new Date(result.calculationTrace?.stichtag ?? Date.now()).toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-[#20201E] text-white hover:bg-[#3a3935] transition-colors"
              data-design-id="trace-download-button"
            >
              ⬇ {t("trace.download")}
            </button>
          </div>
        </details>
      )}
    </>
  );
}
