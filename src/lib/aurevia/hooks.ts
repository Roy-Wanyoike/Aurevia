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
    mutationFn: (input: { symbol: string; side: "BUY" | "SELL"; quantity: number; strategyKey?: string; reason?: string }) =>
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

// --- Health ---
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => fetchJson<any>("/api/v1/health"),
    refetchInterval: 10_000,
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
