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
  | "watchlists"
  | "screener"
  | "market-pulse"
  | "correlation"
  | "historical-memory"
  | "alerts"
  | "radar"
  | "news"
  | "events"
  | "macro"
  | "onchain"
  | "what-if"
  | "replay"
  | "portfolio-analytics"
  | "risk-cockpit"
  | "journal"
  | "copilot"
  | "strategy-builder"
  | "system"
  | "admin"
  | "settings"
  | "profile"
  // Research Hub (Blog/CMS) — issue #128.
  | "blog"
  | "blog-article"
  | "blog-editor"
  | "blog-dashboard";

interface UIState {
  view: ViewKey;
  selectedSymbol: string;
  selectedBacktestId: string | null;
  selectedArticleSlug: string | null;
  sidebarCollapsed: boolean;
  setView: (v: ViewKey) => void;
  setSymbol: (s: string) => void;
  openAsset: (s: string) => void;
  openBacktest: (id: string) => void;
  openArticle: (slug: string) => void;
  openBlogEditor: (slug?: string | null) => void;
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
  "orders", "ml", "brokers", "watchlists", "screener",
  "market-pulse", "correlation", "historical-memory",
  "alerts", "radar", "news", "events", "macro", "onchain",
  "system", "settings", "what-if", "replay",
  "portfolio-analytics", "risk-cockpit", "journal", "copilot", "strategy-builder",
  "profile", "admin",
  "blog", "blog-article", "blog-editor", "blog-dashboard",
]);

export const useUI = create<UIState>((set) => ({
  view: "dashboard",
  selectedSymbol: "AAPL",
  selectedBacktestId: null,
  selectedArticleSlug: null,
  sidebarCollapsed: false,
  setView: (view) => set({ view }),
  setSymbol: (selectedSymbol) => set({ selectedSymbol }),
  openAsset: (symbol) => set({ view: "asset", selectedSymbol: symbol }),
  openBacktest: (id) => set({ view: "backtests", selectedBacktestId: id }),
  openArticle: (slug) => set({ view: "blog-article", selectedArticleSlug: slug }),
  openBlogEditor: (slug) =>
    set({ view: "blog-editor", selectedArticleSlug: slug ?? null }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  syncFromUrl: () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawView = params.get("view");
    const view = rawView && VALID_VIEWS.has(rawView as ViewKey) ? (rawView as ViewKey) : null;
    const symbol = params.get("symbol");
    const backtestId = params.get("id");
    const articleSlug = params.get("article");
    const patch: Partial<UIState> = {};
    if (view) patch.view = view;
    if (symbol) patch.selectedSymbol = symbol;
    if (backtestId) patch.selectedBacktestId = backtestId;
    if (articleSlug) patch.selectedArticleSlug = articleSlug;
    if (Object.keys(patch).length > 0) set(patch);
  },
}));
