"use client";

import { create } from "zustand";

export type ViewKey =
  | "dashboard"
  | "markets"
  | "asset"
  | "strategies"
  | "backtests"
  | "signals"
  | "trends"
  | "regimes"
  | "risk"
  | "portfolio"
  | "orders"
  | "ml"
  | "brokers"
  | "system"
  | "settings";

interface UIState {
  view: ViewKey;
  selectedSymbol: string;
  selectedBacktestId: string | null;
  sidebarCollapsed: boolean;
  setView: (v: ViewKey) => void;
  setSymbol: (s: string) => void;
  openAsset: (s: string) => void;
  openBacktest: (id: string) => void;
  toggleSidebar: () => void;
}

export const useUI = create<UIState>((set) => ({
  view: "dashboard",
  selectedSymbol: "AAPL",
  selectedBacktestId: null,
  sidebarCollapsed: false,
  setView: (view) => set({ view }),
  setSymbol: (selectedSymbol) => set({ selectedSymbol }),
  openAsset: (symbol) => set({ view: "asset", selectedSymbol: symbol }),
  openBacktest: (id) => set({ view: "backtests", selectedBacktestId: id }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
