"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
  const { holdings: holdingsState } = state;
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<"" | "import" | "backtest">("");
  const [importMessage, setImportMessage] = useState<string>("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [backtest, setBacktest] = useState<HoldingsBacktestResult | null>(null);
  const [backtestError, setBacktestError] = useState<string>("");

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
    </div>
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