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
  | "market-pulse"
  | "correlation"
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
  // Hydrate Zustand state from the current URL query params.
  // Called on mount and on `popstate` so refresh / back / forward restore
  // the correct view (issue #38).
  syncFromUrl: () => void;
}

// Whitelist of valid view keys used to guard against arbitrary URL input.
const VALID_VIEWS: ReadonlySet<ViewKey> = new Set<ViewKey>([
  "dashboard", "markets", "asset", "strategies", "backtests",
  "signals", "trends", "regimes", "risk", "portfolio",
  "orders", "ml", "brokers", "market-pulse", "correlation", "system", "settings",
]);

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
  syncFromUrl: () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawView = params.get("view");
    const view = rawView && VALID_VIEWS.has(rawView as ViewKey) ? (rawView as ViewKey) : null;
    const symbol = params.get("symbol");
    const backtestId = params.get("id");
    const patch: Partial<UIState> = {};
    if (view) patch.view = view;
    if (symbol) patch.selectedSymbol = symbol;
    if (backtestId) patch.selectedBacktestId = backtestId;
    if (Object.keys(patch).length > 0) set(patch);
  },
}));
