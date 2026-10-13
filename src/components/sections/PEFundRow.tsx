"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PE_DEFAULT_MGMT_FEE,
  PE_DEFAULT_POSTPERIOD_FEE,
  PE_DEFAULT_SETUP_COST,
  PE_DEFAULT_IRR_VOL,
  PE_DEFAULT_TVPI_VOL,
  PE_DEFAULT_LOSS_PROB,
} from "@/lib/defaults";
import { computePESchedule } from "@/lib/engine/privateEquity";
import type { PEFund, PEModelingMode } from "@/lib/types";
import { fmtEur } from "@/lib/format";

interface PEFundRowProps {
  fund: PEFund;
  idx: number;
}

export function PEFundRow({ fund, idx }: PEFundRowProps) {
  const { dispatch, state } = useAppState();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(idx === 0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const kestRate = (state.portfolio.kestRate ?? 27.5) / 100;
  const peMode: PEModelingMode = state.portfolio.peModelingMode ?? "realistic";
  const schedule = useMemo(
    () => computePESchedule(fund, kestRate, peMode),
    [fund, kestRate, peMode],
  );
  const isStochastic = peMode === "full";
  const showFeeFields = peMode !== "simple";

  const update = <K extends keyof PEFund>(key: K, value: PEFund[K]) => {
    dispatch({ type: "UPDATE_PE_FUND", payload: { ...fund, [key]: value } });
  };

  const remove = () => {
    dispatch({ type: "REMOVE_PE_FUND", payload: fund.id });
  };

  const numChange =
    (key: keyof PEFund) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number.parseFloat(e.target.value);
      update(key, (Number.isFinite(v) ? v : 0) as PEFund[typeof key]);
    };

  return (
    <div className="bg-white rounded-lg border border-[#7B5BB6]/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-[#7B5BB6]/5 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded bg-[#7B5BB6]/20 text-[#5A3F94] text-[10px] font-bold flex items-center justify-center shrink-0">
            {idx + 1}
          </span>
          <span className="text-sm font-medium truncate">{fund.name}</span>
          <span className="text-[10px] text-slate-400 hidden md:inline">
            · {fmtEur(fund.commitment)} · {fund.callRatio}% · IRR {fund.irr}% ·
            TVPI {fund.tvpi.toFixed(1)}× · {fund.investmentPeriod}/{fund.fundDuration}y
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-slate-400">
            {t("portfolio.peStartAge")} {fund.startAge}
          </span>
          <span className="text-slate-300">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[#7B5BB6]/10 bg-white/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("portfolio.peName")}</Label>
              <Input
                type="text"
                value={fund.name}
                onChange={(e) => update("name", e.target.value)}
                maxLength={40}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peCommitment")}</Label>
              <Input
                type="number"
                value={fund.commitment}
                onChange={numChange("commitment")}
                step={10000}
                min={0}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peCallRatio")}</Label>
              <Input
                type="number"
                value={fund.callRatio}
                onChange={numChange("callRatio")}
                step={5}
                min={0}
                max={100}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peIrr")}</Label>
              <Input
                type="number"
                value={fund.irr}
                onChange={numChange("irr")}
                step={0.5}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peTvpi")}</Label>
              <Input
                type="number"
                value={fund.tvpi}
                onChange={numChange("tvpi")}
                step={0.1}
                min={0}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peStartAge")}</Label>
              <Input
                type="number"
                value={fund.startAge}
                onChange={numChange("startAge")}
                step={1}
                min={18}
                max={100}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peInvPeriod")}</Label>
              <Input
                type="number"
                value={fund.investmentPeriod}
                onChange={numChange("investmentPeriod")}
                step={1}
                min={1}
                max={20}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("portfolio.peDuration")}</Label>
              <Input
                type="number"
                value={fund.fundDuration}
                onChange={numChange("fundDuration")}
                step={1}
                min={2}
                max={30}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="text-[11px] text-slate-500 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <span className="text-slate-400">
                {t("portfolio.peFundCalled")}:
              </span>{" "}
              <strong>{fmtEur(schedule.totalCalled)}</strong>
            </div>
            <div>
              <span className="text-slate-400">
                {t("portfolio.peFundDistGross")}:
              </span>{" "}
              <strong>{fmtEur(schedule.totalDistributionsGross)}</strong>
            </div>
            <div>
              <span className="text-slate-400">
                {t("portfolio.peFundIrrAchieved")}:
              </span>{" "}
              <strong>{(schedule.achievedIRR * 100).toFixed(2)}%</strong>
            </div>
            <div>
              <span className="text-slate-400">
                {t("portfolio.peFundEndAge")}:
              </span>{" "}
              <strong>{fund.startAge + fund.fundDuration}</strong>
            </div>
          </div>

          {/* Erweiterte Parameter (J-Curve & Stochastik) */}
          {showFeeFields && (
            <div className="border-t border-[#7B5BB6]/10 pt-2">
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="text-[11px] text-slate-600 hover:text-[#5A3F94] flex items-center gap-1"
              >
                <span>{advancedOpen ? "▾" : "▸"}</span>
                <span className="font-medium">{t("portfolio.peAdvancedTitle")}</span>
                <span className="text-slate-400">
                  ({isStochastic
                    ? t("portfolio.peAdvancedHintFull")
                    : t("portfolio.peAdvancedHintRealistic")})
                </span>
              </button>
              {advancedOpen && (
                <div className="mt-2 space-y-3">
                  {/* J-Curve / Fee-Drag */}
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                      {t("portfolio.peAdvancedJCurve")}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[11px]">{t("portfolio.peMgmtFee")}</Label>
                        <Input
                          type="number"
                          value={fund.mgmtFeeRate ?? PE_DEFAULT_MGMT_FEE}
                          onChange={numChange("mgmtFeeRate")}
                          step={0.1}
                          min={0}
                          max={5}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">{t("portfolio.pePostPeriodFee")}</Label>
                        <Input
                          type="number"
                          value={fund.postPeriodFeeRate ?? PE_DEFAULT_POSTPERIOD_FEE}
                          onChange={numChange("postPeriodFeeRate")}
                          step={0.1}
                          min={0}
                          max={5}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">{t("portfolio.peSetupCost")}</Label>
                        <Input
                          type="number"
                          value={fund.setupCostPct ?? PE_DEFAULT_SETUP_COST}
                          onChange={numChange("setupCostPct")}
                          step={0.1}
                          min={0}
                          max={5}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                  {/* Stochastik */}
                  {isStochastic && (
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                        {t("portfolio.peAdvancedStoch")}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[11px]">{t("portfolio.peIrrVol")}</Label>
                          <Input
                            type="number"
                            value={fund.irrVolatility ?? PE_DEFAULT_IRR_VOL}
                            onChange={numChange("irrVolatility")}
                            step={0.5}
                            min={0}
                            max={20}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px]">{t("portfolio.peTvpiVol")}</Label>
                          <Input
                            type="number"
                            value={fund.tvpiVolatility ?? PE_DEFAULT_TVPI_VOL}
                            onChange={numChange("tvpiVolatility")}
                            step={0.05}
                            min={0}
                            max={2}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px]">{t("portfolio.peLossProb")}</Label>
                          <Input
                            type="number"
                            value={fund.lossProbability ?? PE_DEFAULT_LOSS_PROB}
                            onChange={numChange("lossProbability")}
                            step={0.01}
                            min={0}
                            max={0.5}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={remove}
              className="text-[11px] text-rose-500 hover:text-rose-700 hover:underline"
            >
              {t("portfolio.peRemove")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
