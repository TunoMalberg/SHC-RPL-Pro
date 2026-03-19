"use client";

import { useAppState } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssetBucket, PortfolioConfig } from "@/lib/types";
import {
  computePortfolioReturn,
  computePortfolioVolatility,
  computeSharpeRatio,
} from "@/lib/engine/portfolio";
import { fmtPct } from "@/lib/format";

const BUCKET_COLORS = [
  { bg: "bg-teal-50", border: "border-teal-200", accent: "text-teal-600", fill: "bg-teal-500" },
  { bg: "bg-blue-50", border: "border-blue-200", accent: "text-blue-600", fill: "bg-blue-500" },
  { bg: "bg-amber-50", border: "border-amber-200", accent: "text-amber-600", fill: "bg-amber-500" },
];

export function PortfolioBuilderSection() {
  const { state, dispatch } = useAppState();
  const { portfolio } = state;

  const updateBucket = (index: number, field: keyof AssetBucket, value: number | string) => {
    const newBuckets = [...portfolio.buckets] as PortfolioConfig["buckets"];
    const bucket = { ...newBuckets[index] };

    if (field === "name" || field === "label") {
      (bucket as Record<string, unknown>)[field] = value;
    } else {
      (bucket as Record<string, unknown>)[field] = typeof value === "string" ? parseFloat(value) || 0 : value;
    }

    bucket.netReturn = bucket.expectedReturn - bucket.costs - bucket.taxDrag;
    newBuckets[index] = bucket;
    dispatch({ type: "SET_PORTFOLIO", payload: { buckets: newBuckets } });
  };

  const updateAllocation = (index: number, newValue: number) => {
    const newBuckets = [...portfolio.buckets] as PortfolioConfig["buckets"];
    const diff = newValue - newBuckets[index].allocation;
    newBuckets[index] = { ...newBuckets[index], allocation: newValue };

    const otherIndices = [0, 1, 2].filter((i) => i !== index);
    const otherTotal = otherIndices.reduce((s, i) => s + newBuckets[i].allocation, 0);

    if (otherTotal > 0) {
      for (const i of otherIndices) {
        const ratio = newBuckets[i].allocation / otherTotal;
        newBuckets[i] = {
          ...newBuckets[i],
          allocation: Math.max(0, Math.round(newBuckets[i].allocation - diff * ratio)),
        };
      }
    }

    const total = newBuckets.reduce((s, b) => s + b.allocation, 0);
    if (total !== 100) {
      const adjust = 100 - total;
      for (const i of otherIndices) {
        if (newBuckets[i].allocation + adjust >= 0) {
          newBuckets[i] = { ...newBuckets[i], allocation: newBuckets[i].allocation + adjust };
          break;
        }
      }
    }

    dispatch({ type: "SET_PORTFOLIO", payload: { buckets: newBuckets } });
  };

  const updateCorrelation = (i: number, j: number, value: number) => {
    const newMatrix = portfolio.correlationMatrix.map((row) => [...row]);
    newMatrix[i][j] = value;
    newMatrix[j][i] = value;
    dispatch({ type: "SET_PORTFOLIO", payload: { correlationMatrix: newMatrix } });
  };

  const portReturn = computePortfolioReturn(portfolio) * 100;
  const portVol = computePortfolioVolatility(portfolio) * 100;
  const riskFree = portfolio.buckets[0].netReturn / 100;
  const sharpe = computeSharpeRatio(portReturn / 100, portVol / 100, riskFree);

  return (
    <div className="space-y-6" data-design-id="portfolio-builder-section">
      <div data-design-id="portfolio-builder-header">
        <h2 className="text-2xl font-bold text-slate-900" data-design-id="portfolio-builder-title">Portfolio Builder</h2>
        <p className="text-slate-500 mt-1" data-design-id="portfolio-builder-subtitle">
          Configure the three-bucket portfolio model with allocation, returns, and risk parameters.
        </p>
      </div>

      <Card className="border-slate-200" data-design-id="allocation-bar-card">
        <CardContent className="pt-6">
          <div className="flex h-8 rounded-lg overflow-hidden mb-3" data-design-id="allocation-bar">
            {portfolio.buckets.map((b, i) => (
              <div
                key={b.name}
                className={`${BUCKET_COLORS[i].fill} flex items-center justify-center text-white text-xs font-bold transition-all`}
                style={{ width: `${b.allocation}%` }}
              >
                {b.allocation > 8 && `${b.allocation}%`}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            {portfolio.buckets.map((b, i) => (
              <span key={b.name} className={BUCKET_COLORS[i].accent}>
                {b.label}: {b.allocation}%
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {portfolio.buckets.map((bucket, index) => (
          <Card
            key={bucket.name}
            className={`${BUCKET_COLORS[index].border} ${BUCKET_COLORS[index].bg}`}
            data-design-id={`bucket-card-${index}`}
          >
            <CardHeader className="pb-3">
              <CardTitle className={`text-base ${BUCKET_COLORS[index].accent}`} data-design-id={`bucket-title-${index}`}>
                Bucket {index + 1}: {bucket.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div data-design-id={`bucket-allocation-${index}`}>
                <Label className="text-xs">Allocation (%)</Label>
                <Slider
                  value={[bucket.allocation]}
                  onValueChange={([val]) => updateAllocation(index, val)}
                  max={100}
                  min={0}
                  step={1}
                  className="my-2"
                />
                <div className="text-right text-sm font-bold">{bucket.allocation}%</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div data-design-id={`bucket-return-${index}`}>
                  <Label className="text-xs">Expected Return (%)</Label>
                  <Input
                    type="number"
                    value={bucket.expectedReturn}
                    onChange={(e) => updateBucket(index, "expectedReturn", e.target.value)}
                    step={0.1}
                    className="h-8 text-sm"
                  />
                </div>
                <div data-design-id={`bucket-vol-${index}`}>
                  <Label className="text-xs">Volatility (%)</Label>
                  <Input
                    type="number"
                    value={bucket.volatility}
                    onChange={(e) => updateBucket(index, "volatility", e.target.value)}
                    step={0.5}
                    className="h-8 text-sm"
                  />
                </div>
                <div data-design-id={`bucket-costs-${index}`}>
                  <Label className="text-xs">Costs (%)</Label>
                  <Input
                    type="number"
                    value={bucket.costs}
                    onChange={(e) => updateBucket(index, "costs", e.target.value)}
                    step={0.1}
                    className="h-8 text-sm"
                  />
                </div>
                <div data-design-id={`bucket-tax-${index}`}>
                  <Label className="text-xs">Tax Drag (%)</Label>
                  <Input
                    type="number"
                    value={bucket.taxDrag}
                    onChange={(e) => updateBucket(index, "taxDrag", e.target.value)}
                    step={0.1}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className={`text-center py-2 rounded ${BUCKET_COLORS[index].border} bg-white/60`} data-design-id={`bucket-net-return-${index}`}>
                <div className="text-xs text-slate-500">Net Return</div>
                <div className={`text-lg font-bold ${BUCKET_COLORS[index].accent}`}>
                  {fmtPct(bucket.netReturn)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-design-id="correlation-matrix-card">
          <CardHeader>
            <CardTitle className="text-lg" data-design-id="correlation-title">Correlation Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-3 text-slate-500 font-medium"></th>
                    <th className="py-2 px-2 text-center text-teal-600 font-medium">Cash</th>
                    <th className="py-2 px-2 text-center text-blue-600 font-medium">Bonds</th>
                    <th className="py-2 px-2 text-center text-amber-600 font-medium">Equities</th>
                  </tr>
                </thead>
                <tbody>
                  {["Cash", "Bonds", "Equities"].map((label, i) => (
                    <tr key={label}>
                      <td className="py-2 pr-3 font-medium text-slate-700">{label}</td>
                      {[0, 1, 2].map((j) => (
                        <td key={j} className="py-1 px-1">
                          {i === j ? (
                            <div className="text-center font-bold text-slate-400 bg-slate-50 rounded px-2 py-1">
                              1.00
                            </div>
                          ) : i < j ? (
                            <Input
                              type="number"
                              value={portfolio.correlationMatrix[i][j]}
                              onChange={(e) =>
                                updateCorrelation(i, j, parseFloat(e.target.value) || 0)
                              }
                              step={0.05}
                              min={-1}
                              max={1}
                              className="h-8 text-sm text-center"
                            />
                          ) : (
                            <div className="text-center text-slate-400 bg-slate-50 rounded px-2 py-1">
                              {portfolio.correlationMatrix[i][j].toFixed(2)}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card data-design-id="rebalancing-card">
          <CardHeader>
            <CardTitle className="text-lg" data-design-id="rebalancing-title">Rebalancing & Portfolio Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="rebalancing-frequency-field">
              <Label>Rebalancing Frequency</Label>
              <Select
                value={portfolio.rebalancingFrequency}
                onValueChange={(v) =>
                  dispatch({
                    type: "SET_PORTFOLIO",
                    payload: { rebalancingFrequency: v as PortfolioConfig["rebalancingFrequency"] },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div data-design-id="rebalancing-threshold-field">
              <Label>Rebalancing Threshold (%)</Label>
              <Slider
                value={[portfolio.rebalancingThreshold]}
                onValueChange={([val]) =>
                  dispatch({ type: "SET_PORTFOLIO", payload: { rebalancingThreshold: val } })
                }
                max={20}
                min={1}
                step={1}
              />
              <div className="text-right text-sm text-slate-500">
                Trigger when drift exceeds {portfolio.rebalancingThreshold}%
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t" data-design-id="portfolio-metrics">
              <div className="text-center" data-design-id="metric-return">
                <div className="text-lg font-bold text-emerald-600">{fmtPct(portReturn)}</div>
                <div className="text-xs text-slate-500">Expected Return</div>
              </div>
              <div className="text-center" data-design-id="metric-volatility">
                <div className="text-lg font-bold text-rose-600">{fmtPct(portVol)}</div>
                <div className="text-xs text-slate-500">Volatility</div>
              </div>
              <div className="text-center" data-design-id="metric-sharpe">
                <div className="text-lg font-bold text-blue-600">{sharpe.toFixed(2)}</div>
                <div className="text-xs text-slate-500">Sharpe Ratio</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}