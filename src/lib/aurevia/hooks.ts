"use client";

import { useQuery, useMutation } from "@tanstack/react-query";

// Centralized fetch helpers for Aurevia API routes.

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// --- Markets ---
export interface MarketAsset {
  symbol: string;
  name: string;
  exchange: string;
  assetType: string;
  sector?: string;
  currency: string;
  quote: {
    symbol: string;
    price: number;
    bid: number;
    ask: number;
    spread: number;
    volume24h: number;
    changePct: number;
    timestamp: number;
  };
}
export function useMarkets() {
  return useQuery({
    queryKey: ["markets"],
    queryFn: () => fetchJson<{ assets: MarketAsset[]; total: number }>("/api/v1/markets").then((d) => d.assets),
    refetchInterval: 30_000,
  });
}

// --- Asset detail ---
export interface AssetDetail {
  asset: { symbol: string; name: string; exchange: string; assetType: string; sector?: string; currency: string };
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  quote: { symbol: string; price: number; bid: number; ask: number; spread: number; volume24h: number; changePct: number; timestamp: number };
  indicators: Record<string, number>;
  trend: { direction: string; strength: number; durationBars: number; momentum: number; volatility: number; drawdown: number; support: number; resistance: number; breakout: boolean; breakdown: boolean };
  regime: string;
}
export function useAsset(symbol: string) {
  return useQuery({
    queryKey: ["asset", symbol],
    queryFn: () => fetchJson<AssetDetail>(`/api/v1/assets/${symbol}`),
    refetchInterval: 30_000,
    enabled: !!symbol,
  });
}

// --- Strategies ---
export function useStrategies() {
  return useQuery({
    queryKey: ["strategies"],
    queryFn: () => fetchJson<{ strategies: any[]; total: number }>("/api/v1/strategies").then((d) => d.strategies),
  });
}

// --- Sparklines (batch recent closes for all assets) ---
export interface SparklineData {
  closes: number[];
  changePct: number;
  price: number;
}
export function useSparklines(bars = 30) {
  return useQuery({
    queryKey: ["sparklines", bars],
    queryFn: () => fetchJson<{ sparklines: Record<string, SparklineData>; bars: number }>(`/api/v1/sparklines?bars=${bars}`).then((d) => d.sparklines),
    refetchInterval: 60_000,
  });
}

// --- Signals ---
export interface SignalRow {
  id: string;
  strategyKey: string;
  symbol: string;
  action: string;
  confidence: number;
  price: number;
  reasons: string[];
  timestamp: number;
  risk?: { decision: string; reasons: string[]; circuitBreakerState: string };
}
export function useSignals(symbol?: string, strategy?: string) {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  if (strategy) params.set("strategy", strategy);
  const qs = params.toString();
  return useQuery({
    queryKey: ["signals", symbol, strategy],
    queryFn: () => fetchJson<{ signals: SignalRow[]; total: number }>(`/api/v1/signals${qs ? `?${qs}` : ""}`).then((d) => d.signals),
    refetchInterval: 30_000,
  });
}
export function useScanSignals() {
  return useMutation({
    mutationFn: () => fetchJson<{ scanned: number; newSignals: SignalRow[] }>("/api/v1/signals", { method: "POST" }),
  });
}

// --- Backtests ---
export interface BacktestSummary {
  id: string;
  strategyKey: string;
  symbol: string;
  timeframe: string;
  startDate: number;
  endDate: number;
  initialCapital: number;
  finalEquity: number;
  metrics: Record<string, number>;
  numTrades: number;
  status: string;
  createdAt: number;
}
export function useBacktests() {
  return useQuery({
    queryKey: ["backtests"],
    queryFn: () => fetchJson<{ backtests: BacktestSummary[]; total: number }>("/api/v1/backtests").then((d) => d.backtests),
  });
}
export function useBacktestDetail(id: string | null) {
  return useQuery({
    queryKey: ["backtest", id],
    queryFn: () => fetchJson<{ result: any }>(`/api/v1/backtests/${id}`).then((d) => d.result),
    enabled: !!id,
  });
}
export interface RunBacktestInput {
  strategyKey: string;
  symbol: string;
  timeframe?: string;
  bars?: number;
  initialCapital?: number;
  commissionBps?: number;
  slippageBps?: number;
  positionPct?: number;
  allowShort?: boolean;
  stopLossPct?: number;
  takeProfitPct?: number;
}
export function useRunBacktest() {
  return useMutation({
    mutationFn: (input: RunBacktestInput) =>
      fetchJson<{ result: any }>("/api/v1/backtests", { method: "POST", body: JSON.stringify(input) }),
  });
}

// --- Portfolio ---
export function usePortfolio() {
  return useQuery({
    queryKey: ["portfolio"],
    queryFn: () => fetchJson<{ portfolio: any }>("/api/v1/portfolio").then((d) => d.portfolio),
    refetchInterval: 20_000,
  });
}
export function useResetPortfolio() {
  return useMutation({
    mutationFn: () => fetchJson("/api/v1/portfolio", { method: "POST", body: JSON.stringify({ action: "reset" }) }),
  });
}
export function usePlaceOrder() {
  return useMutation({
    mutationFn: (input: {
      symbol: string;
      side: "BUY" | "SELL";
      quantity: number;
      orderType?: "MARKET" | "LIMIT" | "STOP";
      limitPrice?: number;
      strategyKey?: string;
      reason?: string;
    }) =>
      fetchJson("/api/v1/portfolio", { method: "POST", body: JSON.stringify({ action: "order", ...input }) }),
  });
}

// --- Risk ---
export function useRisk() {
  return useQuery({
    queryKey: ["risk"],
    queryFn: () => fetchJson<{ profile: any; portfolio: any; events: any[]; dayStartEquity: number; weekStartEquity: number }>("/api/v1/risk"),
    refetchInterval: 20_000,
  });
}
export function useUpdateRisk() {
  return useMutation({
    mutationFn: (input: Record<string, any>) =>
      fetchJson("/api/v1/risk", { method: "POST", body: JSON.stringify({ action: "updateProfile", ...input }) }),
  });
}
export function useSetBreaker() {
  return useMutation({
    mutationFn: (input: { state: string; reason?: string }) =>
      fetchJson("/api/v1/risk", { method: "POST", body: JSON.stringify({ action: "setBreaker", ...input }) }),
  });
}

// --- Market Pulse (issue #43) ---

// --- Correlation Matrix (issue #44) ---
// N×N Pearson correlation matrix across the tradeable universe, computed
// from 30-day log returns server-side. `symbols` is the shared row + column
// order; `matrix` is a flat list of { a, b, corr } entries (one per cell).
export interface CorrelationCell {
  a: string;
  b: string;
  corr: number;
}
export interface CorrelationMatrix {
  symbols: string[];
  matrix: CorrelationCell[];
}
export function useCorrelation() {
  return useQuery({
    queryKey: ["correlation"],
    queryFn: () => fetchJson<CorrelationMatrix>("/api/v1/correlation"),
    refetchInterval: 60_000,
  });
}

// --- Health ---
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => fetchJson<any>("/api/v1/health"),
    refetchInterval: 10_000,
  });
}

// --- Orders ---
export interface OrderRow {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  orderType: string;
  status: string;
  filledPrice?: number;
  filledQty?: number;
  strategyKey?: string;
  reason?: string;
  createdAt: number;
  updatedAt: number;
}
export function useOrders(status?: string, symbol?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (symbol) params.set("symbol", symbol);
  const qs = params.toString();
  return useQuery({
    queryKey: ["orders", status, symbol],
    queryFn: () => fetchJson<{ orders: OrderRow[]; total: number }>(`/api/v1/orders${qs ? `?${qs}` : ""}`).then((d) => d.orders),
    refetchInterval: 15_000,
  });
}

// --- Trends & Regimes ---
export function useTrends() {
  return useQuery({
    queryKey: ["trends"],
    queryFn: () => fetchJson<{ rows: any[]; distribution: Record<string, number> }>("/api/v1/trends"),
    refetchInterval: 60_000,
  });
}
export function useRegimes() {
  return useQuery({
    queryKey: ["regimes"],
    queryFn: () => fetchJson<{ distribution: Record<string, any[]>; summary: any[] }>("/api/v1/regimes"),
    refetchInterval: 60_000,
  });
}

// --- Watchlists (issue #41) ---
// Each watchlist row carries the live quote + a 30-bar sparkline of closes,
// so the view can render the table without a second /api/v1/sparklines fetch.
export interface WatchlistQuoteRow {
  symbol: string;
  name: string;
  assetType: string;
  sector?: string;
  exchange: string;
  price: number;
  changePct: number;
  volume24h: number;
  spread: number;
  bid: number;
  ask: number;
  timestamp: number;
  sparkline: number[];
}
export interface WatchlistData {
  id: string;
  name: string;
  symbols: string[];
  rows: WatchlistQuoteRow[];
}
export function useWatchlists() {
  return useQuery({
    queryKey: ["watchlists"],
    queryFn: () => fetchJson<{ watchlists: WatchlistData[]; total: number }>("/api/v1/watchlists").then((d) => d.watchlists),
    refetchInterval: 30_000,
  });
}
export interface WatchlistActionResponse {
  ok: boolean;
  watchlists: WatchlistData[];
  deleted?: boolean;
  mutated?: WatchlistData;
}
export function useWatchlistAction() {
  return useMutation({
    mutationFn: (input: {
      action: "create" | "addSymbol" | "removeSymbol" | "rename" | "delete";
      watchlistId?: string;
      name?: string;
      symbol?: string;
    }) => fetchJson<WatchlistActionResponse>("/api/v1/watchlists", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  });
}

// --- Screener (issue #42) ---
// Multi-factor asset filter — POST a filter JSON, get a ranked list of assets
// that match, each with quote + the indicators needed to render the table.
export interface ScreenerFilter {
  assetType?: string;
  sector?: string;
  priceMin?: number;
  priceMax?: number;
  volumeMin?: number;
  rsiMin?: number;
  rsiMax?: number;
  trendDirection?: string;
  regime?: string;
  volatilityMax?: number;
  changePctMin?: number;
  changePctMax?: number;
  adxMin?: number;
}
export interface ScreenerResultRow {
  symbol: string;
  name: string;
  assetType: string;
  sector?: string;
  exchange: string;
  price: number;
  changePct: number;
  volume24h: number;
  rsi14: number;
  adx14: number;
  volatility: number;
  trendDirection: string;
  trendStrength: number;
  regime: string;
  macdHist: number;
}
export interface ScreenerRunResponse {
  results: ScreenerResultRow[];
  total: number;
  universeSize: number;
  applied: ScreenerFilter;
}
export interface ScreenerOptions {
  assetTypes: string[];
  sectors: string[];
  trendDirections: string[];
  regimes: string[];
  universeSize: number;
}
export function useScreener() {
  return useMutation({
    mutationFn: (filter: ScreenerFilter) =>
      fetchJson<ScreenerRunResponse>("/api/v1/screener", {
        method: "POST",
        body: JSON.stringify(filter),
      }),
  });
}
export function useScreenerOptions() {
  return useQuery({
    queryKey: ["screener-options"],
    queryFn: () => fetchJson<ScreenerOptions>("/api/v1/screener"),
    staleTime: 5 * 60_000, // universe rarely changes
  });
}

// --- Market Pulse (issue #43) ---
// Global market health snapshot — advancers/decliners, regime distribution,
// sector performance, market breadth vs SMA50/SMA200, fear/greed composite.
export interface MarketPulseData {
  advancers: number;
  decliners: number;
  unchanged: number;
  total: number;
  breadth: {
    aboveSma50: number;
    aboveSma200: number;
    pctAboveSma50: number;
    pctAboveSma200: number;
  };
  regimeDistribution: { regime: string; count: number; pct: number }[];
  sectorPerformance: { sector: string; avgChangePct: number; count: number }[];
  fearGreed: {
    score: number;
    label: string;
    components: {
      breadth: number;       // 0..100 — % above SMA50 (smoothed)
      momentum: number;      // 0..100 — avg changePct scaled
      volatility: number;    // 0..100 — inverse of avg volatility
    };
  };
  computedAt: number;
}
export function useMarketPulse() {
  return useQuery({
    queryKey: ["market-pulse"],
    queryFn: () => fetchJson<MarketPulseData>("/api/v1/market-pulse"),
    refetchInterval: 30_000,
  });
}
