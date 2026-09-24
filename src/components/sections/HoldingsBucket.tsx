"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fmtEur, fmtNum, fmtPct } from "@/lib/format";
import type {
  Holding,
  HoldingAssetClass,
  HoldingCurrency,
  HoldingsBacktestResult,
} from "@/lib/holdings/types";
import { isValidIsin } from "@/lib/holdings/isin";
import { classifySecurity } from "@/lib/holdings/classify";
import { runMonteCarloSimulation, generateWithdrawalHeatmap } from "@/lib/engine/montecarlo";
import type { Scenario, AssetBucket } from "@/lib/types";

interface BucketStatsResp {
  buckets: Array<{
    bucket: "cash" | "bonds" | "equities";
    weight: number;
    expectedReturn: number;
    volatility: number;
  }>;
  correlationMatrix: number[][];
  daysOfHistory: number;
}

const ASSET_CLASSES: HoldingAssetClass[] = [
  "Aktien Welt",
  "Aktien USA",
  "Aktien Europa",
  "Aktien Schwellenländer",
  "Aktien Sektor",
  "Anleihen Staat",
  "Anleihen Unternehmen",
  "Anleihen High Yield",
  "Geldmarkt / Cash",
  "Rohstoffe / Gold",
  "Immobilien (REIT)",
  "Alternatives / PE",
  "Mischfonds",
  "Sonstiges",
];

const CURRENCIES: HoldingCurrency[] = ["EUR", "USD", "CHF", "GBP", "JPY", "CAD", "AUD"];

const HOLDINGS_COLOR = "#0F766E"; // Teal
const HOLDINGS_BG = "bg-[#0F766E]/5";
const HOLDINGS_BORDER = "border-[#0F766E]/40";
const HOLDINGS_ACCENT = "text-[#0F766E]";

function emptyHolding(): Holding {
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: "",
    quantity: 0,
    currentPrice: 0,
    currency: "EUR",
    assetClass: "Aktien Welt",
    resolutionStatus: "pending",
  };
}

export function HoldingsBucket() {
  const { state, dispatch } = useAppState();
  const { holdings: holdingsState, client, inputs, portfolio, settings, liquidityEvents } = state;
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<"" | "import" | "backtest">("");
  const [importMessage, setImportMessage] = useState<string>("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [backtest, setBacktest] = useState<HoldingsBacktestResult | null>(null);
  const [bucketStats, setBucketStats] = useState<BucketStatsResp | null>(null);
  const [backtestError, setBacktestError] = useState<string>("");
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioMessage, setScenarioMessage] = useState<string>("");

  const holdings = useMemo(() => holdingsState?.holdings ?? [], [holdingsState?.holdings]);
  const enabled = holdingsState?.enabled ?? false;

  const totalMV = useMemo(
    () => holdings.reduce((s, h) => s + h.quantity * h.currentPrice, 0),
    [holdings],
  );

  const setEnabled = useCallback(
    (e: boolean) => {
      dispatch({ type: "SET_HOLDINGS", payload: { enabled: e } });
    },
    [dispatch],
  );

  const setHoldings = useCallback(
    (next: Holding[]) => {
      dispatch({ type: "SET_HOLDINGS", payload: { holdings: next } });
    },
    [dispatch],
  );

  const updateHolding = useCallback(
    (id: string, patch: Partial<Holding>) => {
      const next = holdings.map((h) => (h.id === id ? { ...h, ...patch } : h));
      setHoldings(next);
    },
    [holdings, setHoldings],
  );

  const removeHolding = useCallback(
    (id: string) => {
      setHoldings(holdings.filter((h) => h.id !== id));
    },
    [holdings, setHoldings],
  );

  const addManual = useCallback(() => {
    setHoldings([...holdings, emptyHolding()]);
  }, [holdings, setHoldings]);

  const addFromSearch = useCallback(
    (h: Holding) => {
      setHoldings([...holdings, h]);
    },
    [holdings, setHoldings],
  );

  // ─── Bestand → Szenario ──────────────────────────────────────────
  const canSaveScenario = useMemo(
    () => !!bucketStats && bucketStats.daysOfHistory > 30 && !!backtest,
    [bucketStats, backtest],
  );

  const saveAsScenario = useCallback(() => {
    if (!bucketStats || !backtest) return;
    // Build a PortfolioConfig copy with the buckets replaced by the
    // observed historical mu/sigma + correlation matrix from the backtest.
    const m = backtest.portfolioMetrics;
    const buckets = portfolio.buckets.map((b, idx) => {
      const stat = bucketStats.buckets[idx]; // [cash, bonds, equities] same order as default
      const expectedReturn = stat.expectedReturn;
      const volatility = stat.volatility;
      const w = stat.weight * 100;
      // Keep the user's costs/taxDrag for the topf — historical returns are
      // gross of advisory fees / KESt was already excluded from backtest.
      const next: AssetBucket = {
        ...b,
        allocation: Math.round(w * 100) / 100,
        expectedReturn,
        volatility,
        netReturn: +(expectedReturn - b.costs - b.taxDrag).toFixed(2),
      };
      return next;
    }) as [AssetBucket, AssetBucket, AssetBucket];

    // Renormalise to 100 % to fight rounding drift
    const sum = buckets.reduce((s, b) => s + b.allocation, 0);
    if (sum > 0 && Math.abs(sum - 100) > 0.01) {
      buckets[2].allocation = +(100 - buckets[0].allocation - buckets[1].allocation).toFixed(2);
    }

    const newPortfolio = {
      ...portfolio,
      buckets,
      correlationMatrix: bucketStats.correlationMatrix,
    };

    const name =
      scenarioName.trim() ||
      `Bestand ${new Date().toISOString().slice(0, 10)} (${m.windowYears.toFixed(0)}J Backtest)`;

    const scenario: Scenario = {
      id: `bestand-${Date.now()}`,
      name,
      inputs: { ...inputs },
      portfolio: newPortfolio,
      source: "manual",
    };
    // BUGFIX (AP5): liquidityEvents mitgeben — konsistent zum Hauptlauf.
    const result = runMonteCarloSimulation(client, scenario.inputs, scenario.portfolio, settings, liquidityEvents);
    result.withdrawalHeatmap = generateWithdrawalHeatmap(client, scenario.inputs, scenario.portfolio, settings, liquidityEvents);
    scenario.result = result;
    dispatch({ type: "ADD_SCENARIO", payload: scenario });

    // Apply the bucket stats also to the live portfolio so the next "Simulation"
    // run reflects the historical data. Berater bleibt frei, das wieder zurück
    // zu setzen — Szenario ist die geprüfte Quelle.
    dispatch({
      type: "SET_PORTFOLIO",
      payload: { buckets, correlationMatrix: bucketStats.correlationMatrix },
    });

    setScenarioName("");
    setScenarioMessage(`✅ ${t("holdings.saveAsScenario.success")} – „${name}"`);
  }, [bucketStats, backtest, portfolio, scenarioName, inputs, client, settings, liquidityEvents, dispatch, t]);

  useEffect(() => {
    if (scenarioMessage) {
      const id = window.setTimeout(() => setScenarioMessage(""), 6000);
      return () => window.clearTimeout(id);
    }
  }, [scenarioMessage]);

  // ---- Excel template download
  const downloadTemplate = useCallback(() => {
    window.location.href = "/api/holdings/template";
  }, []);

  // ---- Excel/CSV import
  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setBusy("import");
      setImportMessage("");
      setImportWarnings([]);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const resp = await fetch("/api/holdings/import", { method: "POST", body: fd });
        const data = await resp.json();
        if (!resp.ok) {
          setImportMessage(`❌ ${data.error ?? "Import fehlgeschlagen"}`);
          return;
        }
        const importedHoldings: Holding[] = data.holdings ?? [];
        const warnings: { row: number; message: string }[] = data.warnings ?? [];
        setHoldings([...holdings, ...importedHoldings]);
        dispatch({
          type: "SET_HOLDINGS",
          payload: {
            importMeta: {
              source: data.detectedFormat,
              importedAt: new Date().toISOString(),
              fileName: f.name,
            },
            enabled: true,
          },
        });
        setImportMessage(
          `✅ ${importedHoldings.length} Position(en) importiert (Format: ${data.detectedFormat})`,
        );
        setImportWarnings(warnings.map((w) => `Zeile ${w.row}: ${w.message}`));
      } catch (err) {
        setImportMessage(`❌ ${err instanceof Error ? err.message : "Import fehlgeschlagen"}`);
      } finally {
        setBusy("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [dispatch, holdings, setHoldings],
  );

  // ---- Run backtest
  const runBacktest = useCallback(async () => {
    if (holdings.length === 0) return;
    setBusy("backtest");
    setBacktestError("");
    setBacktest(null);
    try {
      const resp = await fetch("/api/holdings/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setBacktestError(data.error ?? "Backtest fehlgeschlagen");
        return;
      }
      setBacktest(data.result as HoldingsBacktestResult);
      setBucketStats((data.bucketStats as BucketStatsResp | null) ?? null);
      setScenarioMessage("");
      // Update holdings with resolution info
      if (Array.isArray(data.holdings)) {
        setHoldings(data.holdings as Holding[]);
      }
    } catch (err) {
      setBacktestError(err instanceof Error ? err.message : "Backtest fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }, [holdings, setHoldings]);

  return (
    <div className="space-y-6" data-design-id="holdings-bucket">
      {/* ─── Header / Toggle ─────────────────────────────── */}
      <Card className={`${HOLDINGS_BG} ${HOLDINGS_BORDER} border-2`}>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className={`${HOLDINGS_ACCENT} text-xl flex items-center gap-2`}>
              📊 {t("holdings.title")}
            </CardTitle>
            <p className="text-sm text-[#4D4A47] max-w-2xl">{t("holdings.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="holdings-enabled" className="text-sm whitespace-nowrap">
              {t("holdings.enable")}
            </Label>
            <Switch id="holdings-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={downloadTemplate} variant="outline" size="sm">
              📥 {t("holdings.downloadTemplate")}
            </Button>
            <Button onClick={onPickFile} variant="outline" size="sm" disabled={busy === "import"}>
              {busy === "import" ? "⏳ " : "📂 "}
              {t("holdings.importExcel")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFileChange}
              className="hidden"
            />
            <Button onClick={addManual} variant="outline" size="sm">
              ➕ {t("holdings.addManual")}
            </Button>
            {holdings.length > 0 && (
              <Button
                onClick={runBacktest}
                size="sm"
                disabled={busy === "backtest"}
                className="bg-[#0F766E] hover:bg-[#0E665F] text-white"
              >
                {busy === "backtest" ? "⏳ " : "🔬 "}
                {t("holdings.runBacktest")}
              </Button>
            )}
          </div>

          {importMessage && (
            <div
              className={`text-sm rounded-md p-3 ${
                importMessage.startsWith("✅")
                  ? "bg-green-50 border border-green-200 text-green-900"
                  : "bg-red-50 border border-red-200 text-red-900"
              }`}
            >
              {importMessage}
              {importWarnings.length > 0 && (
                <ul className="mt-2 text-xs list-disc list-inside space-y-0.5">
                  {importWarnings.slice(0, 8).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {importWarnings.length > 8 && (
                    <li>… und {importWarnings.length - 8} weitere</li>
                  )}
                </ul>
              )}
            </div>
          )}

          {/* KPI Strip */}
          {holdings.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label={t("holdings.kpiPositions")} value={fmtNum(holdings.length)} />
              <KpiCard label={t("holdings.kpiTotalMV")} value={fmtEur(totalMV)} />
              <KpiCard
                label={t("holdings.kpiCurrencies")}
                value={fmtNum(new Set(holdings.map((h) => h.currency)).size)}
              />
              <KpiCard
                label={t("holdings.kpiAssetClasses")}
                value={fmtNum(new Set(holdings.map((h) => h.assetClass)).size)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Live-Suche Direkteingabe ───────────────────── */}
      <LiveSearchAddRow onAdd={addFromSearch} />

      {/* ─── Holdings Table ─────────────────────────────── */}
      {holdings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("holdings.tableTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-neutral-500">
                    <th className="px-2 py-2">ISIN / Ticker</th>
                    <th className="px-2 py-2">{t("holdings.col.name")}</th>
                    <th className="px-2 py-2 text-right">{t("holdings.col.quantity")}</th>
                    <th className="px-2 py-2 text-right">{t("holdings.col.price")}</th>
                    <th className="px-2 py-2">{t("holdings.col.currency")}</th>
                    <th className="px-2 py-2">{t("holdings.col.assetClass")}</th>
                    <th className="px-2 py-2 text-right">{t("holdings.col.mv")}</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <HoldingRow
                      key={h.id}
                      holding={h}
                      onUpdate={(patch) => updateHolding(h.id, patch)}
                      onRemove={() => removeHolding(h.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Backtest Results ─────────────────────────────── */}
      {backtestError && (
        <Card className="border-red-200">
          <CardContent className="text-sm text-red-900 p-4">{backtestError}</CardContent>
        </Card>
      )}
      {backtest && <BacktestResults result={backtest} />}

      {/* ─── Bucket-Stats + Save-as-Scenario ─────────────── */}
      {backtest && bucketStats && (
        <BucketStatsCard stats={bucketStats} />
      )}
      {backtest && (
        <Card className={`${canSaveScenario ? "border-emerald-300 bg-emerald-50/40" : "border-neutral-200 bg-neutral-50"} border-2`}>
          <CardHeader>
            <CardTitle className="text-base">🎯 {t("holdings.saveAsScenario.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-[#4D4A47]">
              {t("holdings.saveAsScenario.desc")}
            </p>
            {!canSaveScenario && (
              <div className="text-sm rounded-md bg-amber-50 border border-amber-200 text-amber-900 p-2">
                {t("holdings.saveAsScenario.notReady")}
              </div>
            )}
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[260px]">
                <Label htmlFor="scn-name" className="text-xs">
                  {t("holdings.saveAsScenario.namePlaceholder")}
                </Label>
                <Input
                  id="scn-name"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder={t("holdings.saveAsScenario.namePlaceholder")}
                  className="h-9"
                  disabled={!canSaveScenario}
                />
              </div>
              <Button
                onClick={saveAsScenario}
                disabled={!canSaveScenario}
                className="bg-emerald-700 hover:bg-emerald-800 text-white"
              >
                💾 {t("holdings.saveAsScenario.button")}
              </Button>
            </div>
            {scenarioMessage && (
              <div
                className={`text-sm rounded-md p-2 ${
                  scenarioMessage.startsWith("✅")
                    ? "bg-green-50 border border-green-200 text-green-900"
                    : "bg-red-50 border border-red-200 text-red-900"
                }`}
              >
                {scenarioMessage}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Live-Suche: Yahoo-Autocomplete + Auto-Fill
   ────────────────────────────────────────────────────────── */
interface SearchResult {
  symbol: string;
  name: string;
  quoteType: string;
  exchange: string;
  sector?: string;
  industry?: string;
  isin?: string;
}

function LiveSearchAddRow({ onAdd }: { onAdd: (h: Holding) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setError("");
      return;
    }
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const r = await fetch(`/api/holdings/search?q=${encodeURIComponent(q)}&limit=10`, {
          signal: ctrl.signal,
        });
        const data = await r.json();
        if (!r.ok) {
          setError(data.error ?? t("holdings.search.error"));
          setResults([]);
        } else {
          setResults((data.results as SearchResult[]) ?? []);
          setOpen(true);
          setHighlight(0);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(t("holdings.search.error"));
        }
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [q, t]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = useCallback(
    async (r: SearchResult) => {
      setAdding(r.symbol);
      setOpen(false);
      try {
        const resp = await fetch(`/api/holdings/quote?symbol=${encodeURIComponent(r.symbol)}`);
        const data = await resp.json();
        const cls = classifySecurity({
          quoteType: r.quoteType,
          name: r.name,
          symbol: r.symbol,
          sector: r.sector,
          industry: r.industry,
        });
        const ccyRaw = (data?.currency ?? "USD").toUpperCase();
        const currency: HoldingCurrency = (
          ["EUR", "USD", "CHF", "GBP", "JPY", "CAD", "AUD"].includes(ccyRaw) ? ccyRaw : "USD"
        ) as HoldingCurrency;
        const id =
          typeof globalThis.crypto?.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const h: Holding = {
          id,
          name: r.name,
          isin: r.isin,
          ticker: r.symbol,
          quantity: qty > 0 ? qty : 1,
          currentPrice: typeof data?.price === "number" && data.price > 0 ? data.price : 0,
          currency,
          assetClass: cls.assetClass,
          region: cls.region,
          sector: cls.sector ?? r.sector,
          resolutionStatus: "ok",
          priceHistorySource: "yahoo",
        } as Holding;
        onAdd(h);
        setQ("");
        setResults([]);
        setQty(1);
      } catch (err) {
        setError(`${t("holdings.search.error")}: ${(err as Error).message}`);
      } finally {
        setAdding(null);
      }
    },
    [onAdd, qty, t],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(results.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <Card className="border-2 border-dashed border-[#0F766E]/40 bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          🔍 {t("holdings.search.title")}
        </CardTitle>
        <p className="text-xs text-[#4D4A47]">{t("holdings.search.subtitle")}</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 items-stretch">
          <div ref={wrapRef} className="relative flex-1 min-w-[280px]">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder={t("holdings.search.placeholder")}
              className="h-9"
              autoComplete="off"
            />
            {loading && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#4D4A47]">⏳</div>
            )}
            {open && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-[340px] overflow-y-auto">
                {results.length === 0 && !loading && (
                  <div className="p-3 text-sm text-neutral-500">{t("holdings.search.noResults")}</div>
                )}
                {results.map((r, idx) => (
                  <button
                    key={r.symbol}
                    type="button"
                    onClick={() => choose(r)}
                    onMouseEnter={() => setHighlight(idx)}
                    className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${
                      idx === highlight ? "bg-[#0F766E]/10" : "hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex justify-between items-baseline gap-3">
                      <span className="font-mono font-semibold text-[#0F766E]">{r.symbol}</span>
                      <span className="text-xs text-neutral-500">
                        {r.quoteType} · {r.exchange}
                      </span>
                    </div>
                    <div className="text-[13px] text-neutral-800 truncate">{r.name}</div>
                    {(r.sector || r.industry) && (
                      <div className="text-xs text-neutral-500 truncate">
                        {[r.sector, r.industry].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </button>
                ))}
                {adding && (
                  <div className="p-3 text-sm text-[#0F766E]">⏳ {t("holdings.search.adding")} {adding}</div>
                )}
              </div>
            )}
          </div>
          <div className="w-[110px]">
            <Label htmlFor="hs-qty" className="text-xs">
              {t("holdings.search.qty")}
            </Label>
            <Input
              id="hs-qty"
              type="number"
              step="0.0001"
              value={qty || ""}
              onChange={(e) => setQty(Number.parseFloat(e.target.value) || 0)}
              className="h-9 text-right"
            />
          </div>
        </div>
        {error && (
          <div className="mt-2 text-xs rounded-md bg-red-50 border border-red-200 text-red-900 p-2">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────
   Bucket-Stats-Card (3-Topf-Kennzahlen aus Backtest)
   ────────────────────────────────────────────────────────── */
function BucketStatsCard({ stats }: { stats: BucketStatsResp }) {
  const { t } = useI18n();
  const labels: Record<string, string> = {
    cash: t("holdings.bucketStats.cash"),
    bonds: t("holdings.bucketStats.bonds"),
    equities: t("holdings.bucketStats.equities"),
  };
  return (
    <Card className="border-emerald-200">
      <CardHeader>
        <CardTitle className="text-base">📐 {t("holdings.bucketStats.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="text-left py-1">{t("holdings.bucketStats.bucket")}</th>
                <th className="text-right py-1">{t("holdings.bucketStats.weight")}</th>
                <th className="text-right py-1">{t("holdings.bucketStats.expReturn")}</th>
                <th className="text-right py-1">{t("holdings.bucketStats.vola")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.buckets.map((b) => (
                <tr key={b.bucket} className="border-t">
                  <td className="py-1.5 font-medium">{labels[b.bucket]}</td>
                  <td className="py-1.5 text-right font-mono">{fmtPct(b.weight * 100, 1)}</td>
                  <td className="py-1.5 text-right font-mono">{fmtPct(b.expectedReturn, 2)}</td>
                  <td className="py-1.5 text-right font-mono">{fmtPct(b.volatility, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="text-xs uppercase text-neutral-500 mb-1">{t("holdings.bucketStats.corr")}</div>
          <table className="text-sm border-collapse">
            <thead>
              <tr>
                <th></th>
                {stats.buckets.map((b) => (
                  <th key={b.bucket} className="px-3 py-1 text-xs text-neutral-500 font-normal">
                    {labels[b.bucket]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.correlationMatrix.map((row, i) => (
                <tr key={i}>
                  <th className="px-3 py-1 text-xs text-neutral-500 font-normal text-right">
                    {labels[stats.buckets[i].bucket]}
                  </th>
                  {row.map((v, j) => (
                    <td
                      key={j}
                      className="px-3 py-1 text-right font-mono"
                      style={{
                        backgroundColor:
                          i === j
                            ? "#F1F5F9"
                            : v > 0.2
                              ? "#FEE2E2"
                              : v < -0.05
                                ? "#DCFCE7"
                                : "transparent",
                      }}
                    >
                      {v.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-500">
          Fenster: {stats.daysOfHistory.toLocaleString("de-AT")} Handelstage. Werte fließen direkt
          in das Monte-Carlo-Szenario ein, sobald „{t("holdings.saveAsScenario.button")}" geklickt wird.
        </p>
      </CardContent>
    </Card>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="text-xs text-[#4D4A47] uppercase">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[#20201E]">{value}</div>
      {hint && <div className="text-xs text-[#4D4A47] mt-1">{hint}</div>}
    </div>
  );
}

/**
 * Drawdown-Analyse: zeigt Peak-, Trough- und Recovery-Datum sowie die
 * Dauern (in Handelstagen UND Kalendertagen) für den schlimmsten Drawdown
 * im Backtest-Window. Falls bis zum Window-Ende noch keine Erholung erfolgt
 * ist, wird das deutlich gekennzeichnet.
 */
function DrawdownAnalysisPanel({
  m,
}: {
  m: HoldingsBacktestResult["portfolioMetrics"];
}) {
  if (!m.maxDrawdownPeakDate || !m.maxDrawdownTroughDate) return null;

  const calDaysBetween = (from?: string, to?: string): number | null => {
    if (!from || !to) return null;
    const a = new Date(from).getTime();
    const b = new Date(to).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.round((b - a) / 86_400_000);
  };

  const peakToTroughTrading = m.drawdownPeakToTroughDays ?? 0;
  const recoveryTrading = m.drawdownRecoveryDays ?? 0;
  const underwaterTrading = m.drawdownUnderwaterDays ?? 0;
  const peakToTroughCal = calDaysBetween(m.maxDrawdownPeakDate, m.maxDrawdownTroughDate) ?? 0;
  const recoveryCal =
    calDaysBetween(m.maxDrawdownTroughDate, m.maxDrawdownRecoveryDate ?? m.windowTo) ?? 0;
  const underwaterCal =
    calDaysBetween(m.maxDrawdownPeakDate, m.maxDrawdownRecoveryDate ?? m.windowTo) ?? 0;

  const recovered = m.drawdownRecovered === true;
  const fmtDays = (trading: number, calendar: number) =>
    `${trading.toLocaleString("de-AT")} HT · ${calendar.toLocaleString("de-AT")} KT`;

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-[#20201E]">📉 Drawdown-Analyse</div>
          <div className="text-xs text-[#4D4A47]">
            Schlimmster Peak-to-Trough-Verlust im Backtest-Window und dazugehörige Erholungsdauer
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-rose-700">
            {(m.maxDrawdown * 100).toFixed(1)} %
          </div>
          <div className="text-xs text-[#4D4A47]">Max Drawdown</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="rounded-md bg-white border border-neutral-200 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#4D4A47]">Peak (Höchststand)</div>
          <div className="mt-1 font-mono text-sm font-semibold">{m.maxDrawdownPeakDate}</div>
          <div className="text-[#4D4A47] mt-1">Ausgangspunkt vor dem Einbruch.</div>
        </div>
        <div className="rounded-md bg-white border border-neutral-200 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#4D4A47]">Trough (Tiefpunkt)</div>
          <div className="mt-1 font-mono text-sm font-semibold">{m.maxDrawdownTroughDate}</div>
          <div className="text-[#4D4A47] mt-1">
            Abstieg: <span className="font-semibold">{fmtDays(peakToTroughTrading, peakToTroughCal)}</span>
          </div>
        </div>
        <div className="rounded-md bg-white border border-neutral-200 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#4D4A47]">
            Recovery {recovered ? "" : "(noch andauernd)"}
          </div>
          <div className="mt-1 font-mono text-sm font-semibold">
            {recovered ? m.maxDrawdownRecoveryDate : "—"}
          </div>
          <div className="text-[#4D4A47] mt-1">
            {recovered ? "Erholung: " : "Bisher unter Wasser: "}
            <span className={`font-semibold ${recovered ? "" : "text-rose-700"}`}>
              {fmtDays(recoveryTrading, recoveryCal)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-[#4D4A47]">
        <div>
          Gesamt unter Wasser:{" "}
          <span className="font-semibold text-[#20201E]">
            {fmtDays(underwaterTrading, underwaterCal)}
          </span>
          {!recovered && <span className="ml-1 text-rose-700">(bis Window-Ende {m.windowTo})</span>}
        </div>
        <div className="text-[10px] text-[#6B6864]">
          HT = Handelstage · KT = Kalendertage · ≈ {(underwaterCal / 365.25).toFixed(2)} Jahre
        </div>
      </div>
    </div>
  );
}

function HoldingRow({
  holding,
  onUpdate,
  onRemove,
}: {
  holding: Holding;
  onUpdate: (patch: Partial<Holding>) => void;
  onRemove: () => void;
}) {
  const isinValid = !holding.isin || isValidIsin(holding.isin);
  const mv = holding.quantity * holding.currentPrice;
  return (
    <tr className="border-b align-middle hover:bg-neutral-50">
      <td className="px-2 py-1.5">
        <div className="space-y-1">
          <Input
            value={holding.isin ?? ""}
            onChange={(e) => onUpdate({ isin: e.target.value.toUpperCase() })}
            placeholder="ISIN"
            className={`h-8 w-[140px] font-mono text-xs ${!isinValid ? "border-red-400" : ""}`}
          />
          <Input
            value={holding.ticker ?? ""}
            onChange={(e) => onUpdate({ ticker: e.target.value.toUpperCase() })}
            placeholder="Ticker"
            className="h-7 w-[120px] font-mono text-xs"
          />
        </div>
      </td>
      <td className="px-2 py-1.5">
        <Input
          value={holding.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Bezeichnung"
          className="h-8 w-[260px]"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input
          type="number"
          step="0.0001"
          value={holding.quantity || ""}
          onChange={(e) => onUpdate({ quantity: Number.parseFloat(e.target.value) || 0 })}
          className="h-8 w-[100px] text-right"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input
          type="number"
          step="0.01"
          value={holding.currentPrice || ""}
          onChange={(e) => onUpdate({ currentPrice: Number.parseFloat(e.target.value) || 0 })}
          className="h-8 w-[100px] text-right"
        />
      </td>
      <td className="px-2 py-1.5">
        <select
          value={holding.currency}
          onChange={(e) => onUpdate({ currency: e.target.value as HoldingCurrency })}
          className="h-8 px-2 text-sm border rounded-md bg-white"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select
          value={holding.assetClass}
          onChange={(e) => onUpdate({ assetClass: e.target.value as HoldingAssetClass })}
          className="h-8 px-2 text-sm border rounded-md bg-white max-w-[180px]"
        >
          {ASSET_CLASSES.map((ac) => (
            <option key={ac} value={ac}>
              {ac}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap font-mono">{fmtEur(mv)}</td>
      <td className="px-2 py-1.5">
        <ResolutionBadge holding={holding} />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Button onClick={onRemove} variant="ghost" size="sm" className="text-red-700">
          ✕
        </Button>
      </td>
    </tr>
  );
}

function ResolutionBadge({ holding }: { holding: Holding }) {
  const status = holding.resolutionStatus ?? "pending";
  const colors: Record<string, string> = {
    pending: "bg-neutral-100 text-neutral-700",
    ok: "bg-green-100 text-green-800",
    partial: "bg-amber-100 text-amber-800",
    proxy: "bg-amber-100 text-amber-800",
    failed: "bg-red-100 text-red-800",
  };
  const labels: Record<string, string> = {
    pending: "—",
    ok: "✅ OK",
    partial: "⚠ teilweise",
    proxy: "⚠ Proxy",
    failed: "❌ nicht aufgelöst",
  };
  return (
    <span className={`text-xs px-2 py-1 rounded-md ${colors[status]}`} title={holding.resolutionMessage ?? ""}>
      {labels[status]}
    </span>
  );
}

function BacktestResults({ result }: { result: HoldingsBacktestResult }) {
  const m = result.portfolioMetrics;
  const hasHistory = m.windowFrom && m.indexPath.length > 0;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Portfolio-Analyse</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasHistory && (
            <>
              <div className="text-xs text-[#4D4A47]">
                Backtest-Window: <span className="font-mono">{m.windowFrom}</span> –{" "}
                <span className="font-mono">{m.windowTo}</span> ({m.windowYears.toFixed(1)} Jahre,
                heutige Allokation als feste Gewichte)
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Annual. Rendite" value={fmtPct(m.annualizedReturn * 100, 2)} />
                <KpiCard label="Annual. Vola" value={fmtPct(m.annualizedVol * 100, 2)} />
                <KpiCard label="Sharpe" value={m.sharpe.toFixed(2)} hint="vs. 2 % RF" />
                <KpiCard label="Max Drawdown" value={fmtPct(m.maxDrawdown * 100, 1)} />
                <KpiCard label="Sortino" value={m.sortino.toFixed(2)} />
                <KpiCard label="Bestes Jahr" value={fmtPct(m.bestYear * 100, 1)} />
                <KpiCard label="Schlechtestes Jahr" value={fmtPct(m.worstYear * 100, 1)} />
                <KpiCard label="Marktwert" value={fmtEur(result.totalMarketValueEUR)} />
              </div>
              <DrawdownAnalysisPanel m={m} />
              <IndexChart path={m.indexPath} />
            </>
          )}
          {!hasHistory && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
              Keine durchgehende Preishistorie verfügbar — Backtest übersprungen. Allokation und
              Stresstests wurden trotzdem berechnet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top holdings + concentration */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 Positionen</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr>
                  <th className="text-left py-1">Position</th>
                  <th className="text-right py-1">Gewicht</th>
                  <th className="text-right py-1">Marktwert</th>
                </tr>
              </thead>
              <tbody>
                {result.topHoldings.map((h, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1.5">
                      <div className="font-medium">{h.name}</div>
                      {h.isin && <div className="text-xs text-neutral-500 font-mono">{h.isin}</div>}
                    </td>
                    <td className="py-1.5 text-right font-mono">{fmtPct(h.weight * 100, 1)}</td>
                    <td className="py-1.5 text-right font-mono">{fmtEur(h.marketValueEUR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Konzentrations-Risiken</CardTitle>
          </CardHeader>
          <CardContent>
            {result.concentrationFlags.length === 0 ? (
              <div className="text-sm text-green-800">✅ Keine kritischen Klumpen erkannt.</div>
            ) : (
              <ul className="space-y-2">
                {result.concentrationFlags.map((f, i) => (
                  <li
                    key={i}
                    className={`text-sm rounded-md p-2 ${
                      f.level === "critical"
                        ? "bg-red-50 border border-red-200 text-red-900"
                        : "bg-amber-50 border border-amber-200 text-amber-900"
                    }`}
                  >
                    <div className="font-medium">
                      {f.level === "critical" ? "🚨" : "⚠"} {f.label}
                    </div>
                    <div className="text-xs">{f.message}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Allocations */}
      <div className="grid md:grid-cols-3 gap-4">
        <AllocationCard title="Anlageklassen" data={result.classWeights} />
        <AllocationCard title="Regionen" data={result.regionWeights} />
        <AllocationCard title="Währungen" data={result.currencyWeights} />
      </div>

      {/* Stress tests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stresstests</CardTitle>
        </CardHeader>
        <CardContent>
          {result.stressTests.length === 0 ? (
            <div className="text-sm text-neutral-600">Keine historischen Replays verfügbar.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr>
                  <th className="text-left py-1">Szenario</th>
                  <th className="text-right py-1">Verlust %</th>
                  <th className="text-right py-1">Verlust EUR</th>
                </tr>
              </thead>
              <tbody>
                {result.stressTests.map((s, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1.5">
                      <div className="font-medium">{s.scenarioLabel}</div>
                      <div className="text-xs text-neutral-500">{s.description}</div>
                    </td>
                    <td className="py-1.5 text-right font-mono text-red-700">
                      {fmtPct(s.lossPct * 100, 1)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-red-700">
                      {fmtEur(s.lossEUR)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {result.warnings.length > 0 && (
        <Card className="border-amber-200">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-amber-900 uppercase mb-1">Hinweise</div>
            <ul className="text-sm text-amber-900 list-disc list-inside space-y-0.5">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function IndexChart({ path }: { path: { date: string; value: number }[] }) {
  if (path.length < 2) return null;
  const W = 800;
  const H = 220;
  const pad = { l: 50, r: 12, t: 12, b: 24 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const minV = Math.min(...path.map((p) => p.value));
  const maxV = Math.max(...path.map((p) => p.value));
  const yMin = Math.floor(minV * 0.95);
  const yMax = Math.ceil(maxV * 1.05);
  const xOf = (i: number) => pad.l + (i / (path.length - 1)) * innerW;
  const yOf = (v: number) => pad.t + ((yMax - v) / (yMax - yMin)) * innerH;
  const d = path.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(" ");

  const labels = [yMin, yMin + (yMax - yMin) * 0.5, yMax];
  const yearMarks: { x: number; label: string }[] = [];
  let lastYear = "";
  path.forEach((p, i) => {
    const y = p.date.slice(0, 4);
    if (y !== lastYear && Number.parseInt(y, 10) % Math.max(1, Math.floor(path.length / 252 / 6)) === 0) {
      yearMarks.push({ x: xOf(i), label: y });
      lastYear = y;
    }
  });

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-3">
      <div className="text-xs text-neutral-600 mb-2">
        Portfolio-Index (Start = 100, EUR-bereinigt, dividend-adjusted)
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Backtest-Indexverlauf">
        <rect x={pad.l} y={pad.t} width={innerW} height={innerH} fill="#FAFAFA" />
        {labels.map((v, i) => (
          <g key={i}>
            <line
              x1={pad.l}
              x2={pad.l + innerW}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke="#E5E5E5"
              strokeDasharray="2 3"
            />
            <text x={pad.l - 6} y={yOf(v) + 3} textAnchor="end" fontSize="10" fill="#666">
              {v.toFixed(0)}
            </text>
          </g>
        ))}
        {yearMarks.map((m, i) => (
          <text key={i} x={m.x} y={H - 6} fontSize="10" fill="#666" textAnchor="middle">
            {m.label}
          </text>
        ))}
        <path d={d} fill="none" stroke={HOLDINGS_COLOR} strokeWidth="1.6" />
      </svg>
    </div>
  );
}

function AllocationCard({
  title,
  data,
}: {
  title: string;
  data: { key: string; label: string; weight: number; marketValueEUR: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-sm text-neutral-500">—</div>
        ) : (
          <ul className="space-y-1">
            {data.slice(0, 8).map((d, i) => (
              <li key={i} className="text-sm">
                <div className="flex justify-between">
                  <span className="truncate pr-2">{d.label}</span>
                  <span className="font-mono">{fmtPct(d.weight * 100, 1)}</span>
                </div>
                <div className="h-1.5 bg-neutral-100 rounded">
                  <div
                    className="h-full rounded bg-[#0F766E]"
                    style={{ width: `${Math.min(100, d.weight * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}