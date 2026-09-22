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

// --- Historical Memory — Similarity Search (issue #45) ---
// For a given symbol, the backend computes a feature vector (RSI, momentum,
// MACD hist, trend strength, volatility) at the current bar and compares it
// to the same vector computed at every 5th historical bar. Top-15 matches by
// Euclidean similarity are returned along with forward 5d / 20d return stats.
export interface SimilarityFeatures {
  rsi: number;
  momentum: number;
  macdHist: number;
  trendStrength: number;
  volatility: number;
}
export interface SimilarityMatch {
  time: number;
  similarity: number;
  forwardReturn5d: number;
  forwardReturn20d: number;
  regime: string;
}
export interface SimilarityStats {
  sampleCount: number;
  avgForwardReturn5d: number;
  avgForwardReturn20d: number;
  winRate5d: number;
  winRate20d: number;
  medianReturn5d: number;
  medianReturn20d: number;
}
export interface SimilarityResponse {
  symbol: string;
  currentFeatures: SimilarityFeatures;
  currentRegime: string;
  matches: SimilarityMatch[];
  stats: SimilarityStats;
  disclaimer: string;
}
export function useSimilarity(symbol: string) {
  return useQuery({
    queryKey: ["similarity", symbol],
    queryFn: () => fetchJson<SimilarityResponse>(`/api/v1/similarity/${encodeURIComponent(symbol)}`),
    enabled: !!symbol,
    refetchInterval: 60_000,
  });
}

// --- Alerts (issue #48) ---
// User-defined price / RSI / change-% alerts. The route runs `checkAlerts`
// on each GET so any newly-satisfied conditions fire before the response is
// returned; the freshly triggered alerts are surfaced in `triggered` so the
// view can toast on them.
export interface AlertRow {
  id: string;
  type: "price" | "rsi" | "changePct";
  symbol?: string;
  condition: "above" | "below";
  threshold: number;
  active: boolean;
  triggeredAt?: number;
  triggerValue?: number;
  createdAt: number;
}
export interface AlertsResponse {
  alerts: AlertRow[];
  triggered: AlertRow[];
  total: number;
}
export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => fetchJson<AlertsResponse>("/api/v1/alerts"),
    refetchInterval: 15_000,
  });
}
export interface AlertActionInput {
  action: "create" | "delete" | "check";
  type?: "price" | "rsi" | "changePct";
  symbol?: string;
  condition?: "above" | "below";
  threshold?: number;
  id?: string;
}
export function useAlertAction() {
  return useMutation({
    mutationFn: (input: AlertActionInput) =>
      fetchJson<{ ok: boolean; alert?: AlertRow; alerts: AlertRow[]; total: number; triggered?: AlertRow[]; deleted?: boolean }>(
        "/api/v1/alerts",
        { method: "POST", body: JSON.stringify(input) },
      ),
  });
}

// --- Opportunity Radar (issue #49) ---
// Scans the universe and categorizes each asset into one or more opportunity
// buckets: breakouts, momentum, mean reversion, trend following, risk events.
// An asset can appear in multiple buckets. Each opportunity carries a
// conviction score (0..1) and a risk score (0..1) for in-bucket sorting.
export interface RadarOpportunity {
  symbol: string;
  name: string;
  assetType: string;
  sector?: string;
  price: number;
  conviction: number; // 0..1
  risk: number;       // 0..1
  reason: string;
}
export interface RadarResponse {
  categories: {
    breakouts: { opportunities: RadarOpportunity[] };
    momentum: { opportunities: RadarOpportunity[] };
    meanReversion: { opportunities: RadarOpportunity[] };
    trendFollowing: { opportunities: RadarOpportunity[] };
    riskEvents: { opportunities: RadarOpportunity[] };
  };
  scannedAt: number;
  universeSize: number;
}
export function useRadar() {
  return useQuery({
    queryKey: ["radar"],
    queryFn: () => fetchJson<RadarResponse>("/api/v1/radar"),
    refetchInterval: 30_000,
  });
}

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
// Public probe — minimal fields only (issue #183 / R-13).
// Returns: status, uptimeHours, tradingMode, circuitBreakerState,
// dataSource, dataIsLive, version. The full operational snapshot
// (portfolioEquity, signalsTracked, backtestsRun, ordersPlaced, broker
// connectivity, latency, apiErrors, universeSize) lives behind auth at
// `/api/v1/admin/system` — use `useSystemStats()` for those fields.
export interface HealthSnapshot {
  status: "ok";
  uptimeHours: number;
  tradingMode: string;
  circuitBreakerState: string;
  dataSource: string;
  dataIsLive: boolean;
  version: string;
}
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => fetchJson<HealthSnapshot>("/api/v1/health"),
    refetchInterval: 10_000,
  });
}

// --- Admin: system stats (full operational snapshot) ---
// Authenticated — returns everything `/api/v1/health` strips out plus
// process-level metrics (memory, CPU, uptime). Used by the dashboard's
// System Status card and the System view (which need signals/backtests/
// orders counts + broker connectivity + latency). Issue #183.
export interface SystemStatsMemory {
  bytes: number;
  human: string;
}
export interface SystemStats {
  timestamp: string;
  process: {
    uptimeSec: number;
    pid: number;
    nodeVersion: string;
    platform: string;
    arch: string;
    memory: {
      rss: SystemStatsMemory;
      heapUsed: SystemStatsMemory;
      heapTotal: SystemStatsMemory;
      external: SystemStatsMemory;
      arrayBuffers: SystemStatsMemory;
    };
    cpu: { userMicros: number; systemMicros: number };
  };
  store: {
    circuitBreakerState: string;
    tradingMode: string;
    signalsTracked: number;
    backtestsRun: number;
    ordersPlaced: number;
    riskEvents: number;
    universeSize: number;
    portfolioEquity: number;
    portfolioCash: number;
    portfolioMarketValue: number;
    portfolioUnrealizedPnl: number;
    portfolioRealizedPnl: number;
    portfolioDrawdown: number;
    portfolioExposure: number;
    startedAt: string;
    uptimeMs: number;
  };
  health: {
    brokerConnected: boolean;
    marketDataLatencyMs: number;
    lastTickAt: string | null;
    apiErrors: number;
  };
}
export function useSystemStats() {
  return useQuery({
    queryKey: ["admin", "system"],
    queryFn: () => fetchJson<SystemStats>("/api/v1/admin/system"),
    refetchInterval: 10_000,
    staleTime: 5_000,
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

// --- News Intelligence (issue #46) ---
// Market-aware synthetic news derived from the current market data. Each
// article carries a headline, summary, sentiment (-1..1), importance
// (high/medium/low) and the source symbol. All entries are CLEARLY LABELED
// `isSynthetic: true` — they are AI-generated commentary based on current
// data, NOT real news articles. Swapping the generator for a Finnhub /
// Polygon / Tiingo feed later is a one-function change on the server.
export interface NewsArticle {
  id: string;
  headline: string;
  summary: string;
  source: string;
  symbol: string;
  sentiment: number; // -1..1
  importance: "high" | "medium" | "low";
  publishedAt: number;
  isSynthetic: boolean;
}
export interface NewsResponse {
  articles: NewsArticle[];
  total: number;
  source: string;
}
export function useNews(symbol?: string) {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  const qs = params.toString();
  return useQuery({
    queryKey: ["news", symbol],
    queryFn: () => fetchJson<NewsResponse>(`/api/v1/news${qs ? `?${qs}` : ""}`),
    refetchInterval: 60_000,
  });
}

// --- Market Events (issue #47) ---
// Upcoming synthetic calendar events derived from the asset catalog —
// equities get monthly earnings + dividend events; crypto gets halving +
// upgrade events. Each event carries a type, symbol, title, description,
// importance and scheduled-at timestamp. All entries are CLEARLY LABELED
// `isSynthetic: true`. Connect Finnhub for real earnings/dividend dates.
export type EventType = "earnings" | "dividend" | "halving" | "upgrade";
export interface MarketEvent {
  id: string;
  type: EventType;
  symbol: string;
  title: string;
  description: string;
  importance: "high" | "medium" | "low";
  scheduledAt: number;
  isSynthetic: boolean;
}
export interface EventsResponse {
  events: MarketEvent[];
  total: number;
  source: string;
}
export function useEvents(symbol?: string) {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  const qs = params.toString();
  return useQuery({
    queryKey: ["events", symbol],
    queryFn: () => fetchJson<EventsResponse>(`/api/v1/events${qs ? `?${qs}` : ""}`),
    refetchInterval: 60_000,
  });
}

// --- Market Replay (issue #50) ---
// A bar-by-bar replay trainer. The operator picks a symbol + bar count +
// starting capital; the server seeds a session with the first 60 bars
// visible. Each `next` advances the cursor by N bars; `trade` fills a
// BUY/SELL at the cursor bar's close (no look-ahead). The active session
// is the most recently started one — sessions are per-process and not
// tied to a specific client.
export interface ReplayCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface ReplayPosition {
  side: string;
  qty: number;
  price: number;
}
export interface ReplayTrade {
  side: string;
  qty: number;
  price: number;
  time: number;
  bar: number;
}
export interface ReplayState {
  sessionId?: string;
  symbol: string;
  cursor: number;
  totalBars: number;
  currentPrice: number;
  cash: number;
  capital: number;
  positions: ReplayPosition[];
  trades: ReplayTrade[];
  visibleCandles: ReplayCandle[];
}
export interface ReplayStartInput {
  action: "start";
  symbol: string;
  bars?: number;
  capital?: number;
}
export interface ReplayNextInput {
  action: "next";
  cursor?: number; // advance N bars (default 1)
}
export interface ReplayTradeInput {
  action: "trade";
  side: "BUY" | "SELL";
  quantity: number;
}
export interface ReplayStateInput {
  action: "state";
}
export type ReplayInput =
  | ReplayStartInput
  | ReplayNextInput
  | ReplayTradeInput
  | ReplayStateInput;
export function useReplay() {
  return useMutation({
    mutationFn: (input: ReplayInput) =>
      fetchJson<ReplayState>("/api/v1/replay", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

// --- What-If Simulator (issue #51) ---
// Applies a hypothetical shock to the current portfolio and returns the
// per-position P&L impact + the projected new equity. Read-only: never
// mutates the portfolio. When `symbol` is omitted, every position takes
// the full shock (whole-book shock); when supplied, only that symbol takes
// the full shock, and same-sector positions take 50% (correlated impact).
export interface ScenarioImpact {
  symbol: string;
  side: string;
  marketValue: number;
  shockPct: number;
  pnlImpact: number;
  correlated: boolean;
}
export interface ScenarioResult {
  originalEquity: number;
  newEquity: number;
  pnlImpact: number;
  equityImpactPct: number;
  impacts: ScenarioImpact[];
}
export interface ScenarioInput {
  symbol?: string;
  shockPct: number;
}
export function useRunScenario() {
  return useMutation({
    mutationFn: (input: ScenarioInput) =>
      fetchJson<ScenarioResult>("/api/v1/scenario", {
        method: "POST",
        body: JSON.stringify(input),
      }),
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

// --- Portfolio Analytics (issue #52) ---
// VaR (95%/99%) + CVaR (95%) + Beta vs SPY + sector exposure +
// concentration (Herfindahl + max position weight). Computed server-side
// from the 30-day daily returns of every open position, blended by their
// current market-value weights. Returns 422 when there are no positions.
export interface PortfolioVarBand {
  returnPct: number; // negative — a loss
  dollar: number;   // positive — magnitude in dollars
}
export interface SectorExposure {
  sector: string;
  exposurePct: number;
  marketValue: number;
}
export interface PortfolioAnalytics {
  var95: PortfolioVarBand;
  var99: PortfolioVarBand;
  cvar95: PortfolioVarBand;
  beta: number;
  sectors: SectorExposure[];
  concentration: number;     // 0..1 Herfindahl
  maxConcentration: number;  // 0..1 max position weight
  totalMarketValue: number;
  sampleDays: number;
}
export function usePortfolioAnalytics() {
  return useQuery({
    queryKey: ["portfolio-analytics"],
    queryFn: () => fetchJson<PortfolioAnalytics>("/api/v1/portfolio/analytics"),
    refetchInterval: 30_000,
    // 422 (no open positions) is a valid state — surface the empty UI rather
    // than a hard error.
    retry: false,
  });
}

// --- Trading Journal (issue #54) ---
// Aggregates every FILLED order into a journal of executed trades with
// per-trade market context (regime / trend / volatility at fill time) and
// overall analytics (trades by regime, by strategy, total count).
export interface JournalEntry {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  filledPrice: number;
  strategyKey: string;
  reason: string;
  regime: string;
  trend: string;
  volatility: number;
  createdAt: number;
}
export interface JournalAnalytics {
  byRegime: Record<string, number>;
  byStrategy: Record<string, number>;
  totalTrades: number;
}
export interface JournalResponse {
  entries: JournalEntry[];
  analytics: JournalAnalytics;
}
export function useJournal() {
  return useQuery({
    queryKey: ["journal"],
    queryFn: () => fetchJson<JournalResponse>("/api/v1/journal"),
    refetchInterval: 30_000,
  });
}

// --- AI Research Copilot (issue #55) ---
// POST a natural-language question; the server bundles the live portfolio +
// market + signal context, calls the ZAI chat completion API, and returns
// the answer + the context bundle that was sent. Server-side only — the
// SDK never runs in the browser.
export interface CopilotResponse {
  answer: string;
  context: string;
  query: string;
}
export function useAskCopilot() {
  return useMutation({
    mutationFn: (input: { query: string }) =>
      fetchJson<CopilotResponse>("/api/v1/copilot", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

// --- Monte Carlo + Walk-Forward (issue #57) ---
// POST a backtest id; the server resamples the trade sequence 100 times to
// build a Monte Carlo equity-curve distribution (p10 / p50 / p90 + survival
// rate + worst / best case) and splits the trades into 4 walk-forward windows
// with per-window Sharpe + return. Blended with the original Sharpe for an
// overall robustness score (0..100).
export interface MonteCarloResult {
  simulations: number;
  p10: number;
  p50: number;
  p90: number;
  survivalRate: number; // 0..100
  worstCase: number;
  bestCase: number;
}
export interface WalkForwardWindow {
  start: number;
  end: number;
  sharpe: number;
  returnPct: number;
}
export interface RobustnessBreakdown {
  score: number;            // 0..100
  originalSharpe: number;
  survivalRate: number;     // 0..100
  walkForwardStability: number; // 0..100
}
export interface MonteCarloResponse {
  monteCarlo: MonteCarloResult;
  walkForward: WalkForwardWindow[];
  robustness: RobustnessBreakdown;
}
export function useMonteCarlo() {
  return useMutation({
    mutationFn: (input: { id: string }) =>
      fetchJson<MonteCarloResponse>(
        `/api/v1/backtests/${encodeURIComponent(input.id)}/monte-carlo`,
        { method: "POST", body: JSON.stringify({}) },
      ),
  });
}

// --- Macro Intelligence — FRED Economic Indicators (issue #105) ---
// Macro overlay from the St. Louis Fed's free FRED API: GDP, CPI, Unemployment,
// Fed Funds, 10Y Treasury, 2Y Treasury. The latest observation + period-over-
// period change is returned for each series. When FRED_API_KEY is unset the
// route returns 200 with `source: "disabled"` and an empty list — the UI shows
// a clear empty state, never an error.
export interface EconomicIndicator {
  seriesId: string;
  label: string;
  value: number;
  unit: "pct" | "index" | "usd-bn";
  date: string;
  changePct: number;
}
export interface EconomicResponse {
  indicators: EconomicIndicator[];
  total: number;
  source: "fred" | "disabled";
  updatedAt: number;
}
export function useEconomic() {
  return useQuery({
    queryKey: ["economic"],
    queryFn: () => fetchJson<EconomicResponse>("/api/v1/economic"),
    refetchInterval: 5 * 60_000,
  });
}

// --- On-Chain Intelligence — DeFi Llama (issue #106) ---
// Free public API (no key required). Current TVL per chain + 90-day total TVL
// history + top-20 protocols by TVL. When the upstream is unreachable the
// route returns 200 with empty arrays so the UI renders a clean empty state.
export interface ChainTvl {
  name: string;
  tvl: number;
  chainSymbol: string;
}
export interface TvlHistoryPoint {
  date: number;
  tvl: number;
}
export interface ProtocolTvl {
  name: string;
  tvl: number;
  chain: string;
  category: string;
}
export interface OnchainSnapshot {
  chains: ChainTvl[];
  totalTvlUsd: number;
  history: TvlHistoryPoint[];
  protocols: ProtocolTvl[];
  source: "defillama";
  updatedAt: number;
}
export function useOnchain() {
  return useQuery({
    queryKey: ["onchain"],
    queryFn: () => fetchJson<OnchainSnapshot>("/api/v1/onchain"),
    refetchInterval: 5 * 60_000,
  });
}

// --- Current User + Organizations (issue #118) ---
// `useUser` powers the profile view. In dev mode the route returns the first
// user (demo user) so the view always has something to render; in production
// the route requires a NextAuth session. `useOrganizations` lists the user's
// memberships. `useUpdateUser` PATCHes the user's name; `useCreateOrg` POSTs
// a new organization (auto-adds the current user as owner).

export interface UserOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
}
export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  organizations: UserOrg[];
}
export function useUser() {
  return useQuery({
    queryKey: ["user"],
    queryFn: () => fetchJson<{ user: CurrentUser }>("/api/v1/user").then((d) => d.user),
    staleTime: 30_000,
  });
}
export function useUpdateUser() {
  return useMutation({
    mutationFn: (input: { name: string }) =>
      fetchJson<{ ok: boolean; user?: CurrentUser }>("/api/v1/user", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
  });
}
export function useOrganizations() {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: () => fetchJson<{ organizations: UserOrg[] }>("/api/v1/organizations").then((d) => d.organizations),
    staleTime: 30_000,
  });
}
export function useCreateOrg() {
  return useMutation({
    mutationFn: (input: { name: string; slug?: string; plan?: "free" | "pro" | "enterprise" }) =>
      fetchJson<{ ok: boolean; organization: UserOrg }>("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}
