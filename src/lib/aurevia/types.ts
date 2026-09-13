// Aurevia shared types — the engineering contract between engines.

export type AssetType = "equity" | "crypto" | "fx" | "etf";

export interface AssetInfo {
  symbol: string;
  name: string;
  exchange: string;
  assetType: AssetType;
  sector?: string;
  currency: string;
}

export interface Candle {
  time: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

// Canonical list of supported timeframes. Source this instead of declaring
// a local array in every component that renders a timeframe dropdown — the
// union type above is what the engines accept, and this array is what the UI
// iterates over. They MUST stay in sync. (Issue #29 — no hardcoded lists.)
export const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export interface Quote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  spread: number;
  volume24h: number;
  changePct: number;
  timestamp: number;
}

export type Regime =
  | "BULL"
  | "BEAR"
  | "SIDEWAYS"
  | "ACCUMULATION"
  | "DISTRIBUTION"
  | "BREAKOUT"
  | "BREAKDOWN"
  | "RECOVERY"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "CRASH";

export type TrendDirection = "UP" | "DOWN" | "FLAT";

export interface TrendState {
  direction: TrendDirection;
  strength: number; // 0..1
  durationBars: number;
  momentum: number;
  volatility: number;
  drawdown: number;
  support: number;
  resistance: number;
  breakout: boolean;
  breakdown: boolean;
}

export type Action = "BUY" | "SELL" | "HOLD" | "CLOSE";

export interface Signal {
  id: string;
  strategyKey: string;
  symbol: string;
  action: Action;
  confidence: number; // 0..1
  price: number;
  reasons: string[];
  timestamp: number;
}

export interface Indicators {
  sma20: number;
  sma50: number;
  sma200: number;
  ema12: number;
  ema26: number;
  rsi14: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
  atr14: number;
  adx14: number;
  stochasticK: number;
  stochasticD: number;
  vwap: number;
  obv: number;
  roc: number;
  volatility: number;
  momentum: number;
}

export interface MarketContext {
  asset: AssetInfo;
  candles: Candle[];
  quote: Quote;
  indicators: Indicators;
  trend: TrendState;
  regime: Regime;
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  side: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  barsHeld: number;
  reason: string;
}

export interface BacktestMetrics {
  totalReturn: number;
  totalReturnPct: number;
  annualReturnPct: number;
  benchmarkReturnPct: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  winRate: number;
  profitFactor: number;
  avgTradePct: number;
  largestWinPct: number;
  largestLossPct: number;
  numTrades: number;
  exposure: number;
  volatility: number;
}

export interface BacktestResult {
  id: string;
  strategyKey: string;
  symbol: string;
  timeframe: Timeframe;
  startDate: number;
  endDate: number;
  initialCapital: number;
  finalEquity: number;
  metrics: BacktestMetrics;
  equityCurve: { t: number; equity: number; benchmark: number }[];
  trades: BacktestTrade[];
  status: "COMPLETED" | "FAILED";
  createdAt: number;
}

export type RiskDecision = "APPROVED" | "REJECTED" | "PAUSED";

export type CircuitBreakerState =
  | "NORMAL"
  | "CAUTION"
  | "TRADING_PAUSED"
  | "RE_EVALUATING";

export type TradingMode = "ANALYSIS_ONLY" | "PAPER" | "SANDBOX" | "LIVE";

export interface RiskProfile {
  maxPositionPct: number;
  maxPortfolioPct: number;
  maxLeverage: number;
  maxDailyLossPct: number;
  maxWeeklyLossPct: number;
  maxDrawdownPct: number;
  maxSpread: number;
  maxVolatility: number;
  minLiquidity: number;
  cooldownMinutes: number;
  circuitBreakerState: CircuitBreakerState;
  tradingMode: TradingMode;
}

export interface RiskEvaluation {
  decision: RiskDecision;
  reasons: string[];
  circuitBreakerState: CircuitBreakerState;
}

export interface Position {
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: number;
  avgEntryPrice: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  realizedPnl: number;
}

export interface PortfolioState {
  cash: number;
  equity: number;
  marketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  feesPaid: number;
  exposure: number; // fraction of equity deployed
  leverage: number;
  drawdown: number;
  peakEquity: number;
  positions: Position[];
  updatedAt: number;
}

export interface OrderRecord {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  orderType: "MARKET" | "LIMIT" | "STOP";
  limitPrice?: number;
  status: "CREATED" | "SUBMITTED" | "ACKNOWLEDGED" | "PARTIALLY_FILLED" | "FILLED" | "CANCEL_REQUESTED" | "CANCELLED" | "REJECTED" | "UNKNOWN";
  filledPrice?: number;
  filledQty?: number;
  strategyKey?: string;
  reason?: string;
  createdAt: number;
  updatedAt: number;
}

// Risk event log entry — used by the circuit breaker state machine and the
// risk cockpit view. Stored in-memory in the singleton store.
export interface RiskEvent {
  id: string;
  type: string; // CIRCUIT_BREAKER_TRIGGER | LIMIT_BREACH | STALE_DATA | RISK_PROFILE_UPDATE | ORDER_REJECTED | ...
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  context?: string; // JSON string of additional context
  timestamp: number;
}
