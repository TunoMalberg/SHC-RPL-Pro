"use client";

import { createContext, useContext } from "react";
import type {
  AppState,
  ClientProfile,
  FinancialInputs,
  PortfolioConfig,
  SimulationSettings,
  SimulationResult,
  HistoricalAnalysis,
  DetailedSimTrace,
  Scenario,
  LiquidityEvent,
} from "./types";
import {
  defaultClient,
  defaultInputs,
  defaultPortfolio,
  defaultSettings,
} from "./defaults";

export const initialState: AppState = {
  client: defaultClient,
  inputs: defaultInputs,
  portfolio: defaultPortfolio,
  settings: defaultSettings,
  liquidityEvents: [],
  result: null,
  historicalResult: null,
  detailedTrace: null,
  scenarios: [],
  activeTab: "profile",
};

export type Action =
  | { type: "SET_CLIENT"; payload: Partial<ClientProfile> }
  | { type: "SET_INPUTS"; payload: Partial<FinancialInputs> }
  | { type: "SET_PORTFOLIO"; payload: Partial<PortfolioConfig> }
  | { type: "SET_SETTINGS"; payload: Partial<SimulationSettings> }
  | { type: "SET_LIQUIDITY_EVENTS"; payload: LiquidityEvent[] }
  | { type: "ADD_LIQUIDITY_EVENT"; payload: LiquidityEvent }
  | { type: "REMOVE_LIQUIDITY_EVENT"; payload: string }
  | { type: "UPDATE_LIQUIDITY_EVENT"; payload: LiquidityEvent }
  | { type: "SET_RESULT"; payload: SimulationResult | null }
  | { type: "SET_HISTORICAL"; payload: HistoricalAnalysis | null }
  | { type: "SET_DETAILED_TRACE"; payload: DetailedSimTrace | null }
  | { type: "ADD_SCENARIO"; payload: Scenario }
  | { type: "REMOVE_SCENARIO"; payload: string }
  | { type: "UPDATE_SCENARIO"; payload: { id: string; result: SimulationResult } }
  | { type: "SET_TAB"; payload: string }
  | { type: "RESET" };

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_CLIENT":
      return { ...state, client: { ...state.client, ...action.payload } };
    case "SET_INPUTS":
      return { ...state, inputs: { ...state.inputs, ...action.payload } };
    case "SET_PORTFOLIO":
      return { ...state, portfolio: { ...state.portfolio, ...action.payload } };
    case "SET_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case "SET_LIQUIDITY_EVENTS":
      return { ...state, liquidityEvents: action.payload };
    case "ADD_LIQUIDITY_EVENT":
      return { ...state, liquidityEvents: [...state.liquidityEvents, action.payload] };
    case "REMOVE_LIQUIDITY_EVENT":
      return { ...state, liquidityEvents: state.liquidityEvents.filter((e) => e.id !== action.payload) };
    case "UPDATE_LIQUIDITY_EVENT":
      return {
        ...state,
        liquidityEvents: state.liquidityEvents.map((e) =>
          e.id === action.payload.id ? action.payload : e
        ),
      };
    case "SET_RESULT":
      return { ...state, result: action.payload };
    case "SET_HISTORICAL":
      return { ...state, historicalResult: action.payload };
    case "SET_DETAILED_TRACE":
      return { ...state, detailedTrace: action.payload };
    case "ADD_SCENARIO":
      return { ...state, scenarios: [...state.scenarios, action.payload] };
    case "REMOVE_SCENARIO":
      return {
        ...state,
        scenarios: state.scenarios.filter((s) => s.id !== action.payload),
      };
    case "UPDATE_SCENARIO":
      return {
        ...state,
        scenarios: state.scenarios.map((s) =>
          s.id === action.payload.id
            ? { ...s, result: action.payload.result }
            : s
        ),
      };
    case "SET_TAB":
      return { ...state, activeTab: action.payload };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
}>({
  state: initialState,
  dispatch: () => undefined,
});

export function useAppState() {
  return useContext(AppContext);
}