import { ASSET_CATALOG, getAsset } from "./market-data/assets";
import { generateCandles, buildQuote } from "./market-data/feed";
import { computeIndicators } from "./quant/indicators";
import { detectTrend } from "./quant/trend";
import { detectRegime } from "./quant/regime";
import { STRATEGIES, evaluateAll, toSignal } from "./strategies";
import { runBacktest } from "./backtest/engine";
import { DEFAULT_RISK_PROFILE, evaluateRisk, nextBreakerState } from "./risk/engine";
import { PaperBroker, PortfolioManager } from "./execution/paper-broker";
import { BrokerRouter } from "./brokers/router";
import { ML_MODELS, ML_MODEL_MAP, mlPredictionToSignal, type MLPrediction } from "./ml/models";
import type {
  AssetInfo,
  BacktestResult,
  Candle,
  MarketContext,
  Quote,
  Signal,
  RiskProfile,
  RiskEvaluation,
  PortfolioState,
  OrderRecord,
  RiskEvent,
  CircuitBreakerState,
} from "./types";

// ---------------------------------------------------------------------------
// Aurevia in-memory runtime store.
//
// Holds live market data caches, the signal log, backtest history, the paper
// portfolio, risk profile, and the order / audit / risk-event logs. This is a
// single shared object across API routes — in a production deployment these
// would live in Redis / Kafka / Postgres.
// ---------------------------------------------------------------------------

const INITIAL_CASH = 100_000;
const SIGNAL_RETENTION = 200;
const ORDER_RETENTION = 200;

class AureviaStore {
  assetCatalog: AssetInfo[] = ASSET_CATALOG;
  candleCache: Map<string, Candle[]> = new Map();
  signals: Signal[] = [];
  backtests: BacktestResult[] = [];
  orders: OrderRecord[] = [];
  riskEvents: RiskEvent[] = [];
  riskProfile: RiskProfile = { ...DEFAULT_RISK_PROFILE };
  broker: PaperBroker = new PaperBroker();
  portfolio: PortfolioManager = new PortfolioManager(INITIAL_CASH);
  brokerRouter: BrokerRouter = new BrokerRouter();
  mlPredictions: Map<string, MLPrediction> = new Map(); // keyed by `${modelKey}:${symbol}`
  startedAt: number = Date.now();
  dayStartEquity: number = INITIAL_CASH;
  weekStartEquity: number = INITIAL_CASH;
  lastTradeTime: number = 0;
  recentSymbols: string[] = [];
  lastSignalScan: number = 0;
  health: {
    marketDataLatencyMs: number;
    lastTickAt: number;
    apiErrors: number;
    brokerConnected: boolean;
  } = {
    marketDataLatencyMs: 0,
    lastTickAt: Date.now(),
    apiErrors: 0,
    brokerConnected: true,
  };

  constructor() {
    // Register the paper broker with the router. Real brokers (Alpaca/IBKR)
    // are registered on-demand via /api/v1/brokers/connect.
    this.brokerRouter.registerPaper(this.broker);
  }

  // --- Market data ----------------------------------------------------------
  getCandles(symbol: string, bars: number = 300): Candle[] {
    const key = `${symbol}-${bars}`;
    const cached = this.candleCache.get(key);
    if (cached) return cached;
    const candles = generateCandles(symbol, "1d", bars);
    this.candleCache.set(key, candles);
    return candles;
  }

  getQuote(symbol: string): Quote {
    const candles = this.getCandles(symbol, 60);
    return buildQuote(symbol, candles);
  }

  getAllQuotes(): Quote[] {
    return this.assetCatalog.map((a) => this.getQuote(a.symbol));
  }

  buildContext(symbol: string, bars: number = 300): MarketContext | null {
    const asset = getAsset(symbol);
    if (!asset) return null;
    const candles = this.getCandles(symbol, bars);
    const quote = buildQuote(symbol, candles);
    const indicators = computeIndicators(candles);
    const trend = detectTrend(candles);
    const regime = detectRegime(candles);
    return { asset, candles, quote, indicators, trend, regime };
  }

  // --- Signal scan ----------------------------------------------------------
  // Run every strategy AND every ML model against every asset.
  scanSignals(): Signal[] {
    const newSignals: Signal[] = [];
    for (const asset of this.assetCatalog) {
      const ctx = this.buildContext(asset.symbol, 300);
      if (!ctx) continue;
      // Rule-based strategies
      const sigs = evaluateAll(ctx);
      for (const s of sigs) newSignals.push(s);
      // ML models — plug into the SAME contract
      for (const model of ML_MODELS) {
        const pred = model.predict(ctx);
        if (!pred) continue;
        this.mlPredictions.set(`${model.key}:${asset.symbol}`, pred);
        const mlSignal = mlPredictionToSignal(pred);
        if (mlSignal) {
          // Fill in the current price (mlPredictionToSignal leaves it 0)
          mlSignal.price = ctx.quote.price;
          const wrapped = toSignal(mlSignal);
          if (wrapped) newSignals.push(wrapped);
        }
      }
    }
    // Keep latest SIGNAL_RETENTION signals.
    this.signals = [...newSignals, ...this.signals].slice(0, SIGNAL_RETENTION);
    this.lastSignalScan = Date.now();
    return newSignals;
  }

  // --- ML predictions -------------------------------------------------------
  getMLPredictions(symbol?: string): MLPrediction[] {
    const all = Array.from(this.mlPredictions.values());
    return symbol ? all.filter((p) => p.symbol === symbol.toUpperCase()) : all;
  }

  runMLPrediction(modelKey: string, symbol: string): MLPrediction | null {
    const model = ML_MODEL_MAP[modelKey];
    if (!model) return null;
    const ctx = this.buildContext(symbol, 300);
    if (!ctx) return null;
    const pred = model.predict(ctx);
    if (!pred) return null;
    this.mlPredictions.set(`${modelKey}:${symbol}`, pred);
    return pred;
  }

  // --- Brokers --------------------------------------------------------------
  listBrokers() {
    return this.brokerRouter.listBrokers().map((e) => ({
      kind: e.kind,
      connected: e.connected,
      healthy: e.healthy,
      lastHealthCheck: e.lastHealthCheck,
    }));
  }

  async connectBroker(kind: "alpaca" | "ibkr", config: { apiKey: string; apiSecret: string; accountId?: string; mode?: "PAPER" | "SANDBOX" | "LIVE" }) {
    if (kind === "alpaca") {
      this.brokerRouter.registerAlpaca({
        brokerId: "alpaca",
        brokerName: "Alpaca",
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        accountId: config.accountId,
        mode: config.mode ?? "PAPER",
        baseUrl: config.mode === "LIVE" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets",
      });
      await this.brokerRouter.connect("alpaca");
    } else if (kind === "ibkr") {
      this.brokerRouter.registerIBKR({
        brokerId: "ibkr",
        brokerName: "Interactive Brokers",
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        accountId: config.accountId,
        mode: config.mode ?? "PAPER",
      });
      await this.brokerRouter.connect("ibkr");
    }
    this.recordRiskEvent("BROKER_CONNECT", "INFO", `Connected to ${kind} broker (mode: ${config.mode ?? "PAPER"})`);
    return this.listBrokers();
  }

  routeOrder(symbol: string, side: "BUY" | "SELL", quantity: number) {
    return this.brokerRouter.route(symbol, side, quantity);
  }

  // --- Risk -----------------------------------------------------------------
  evaluateSignal(signal: Signal): RiskEvaluation {
    const quote = this.getQuote(signal.symbol);
    return evaluateRisk(this.riskProfile, {
      portfolio: this.portfolio.state(),
      quote,
      signal,
      dayStartEquity: this.dayStartEquity,
      weekStartEquity: this.weekStartEquity,
      lastTradeTime: this.lastTradeTime,
      recentSymbols: this.recentSymbols,
    });
  }

  setBreakerState(state: CircuitBreakerState, reason: string): void {
    if (this.riskProfile.circuitBreakerState === state) return;
    this.riskProfile.circuitBreakerState = state;
    this.recordRiskEvent("CIRCUIT_BREAKER_TRIGGER", state === "NORMAL" ? "INFO" : "WARNING", reason);
  }

  recordRiskEvent(type: string, severity: "INFO" | "WARNING" | "CRITICAL", message: string, context?: any): void {
    this.riskEvents.unshift({
      id: `rev-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      type,
      severity,
      message,
      context: context ? JSON.stringify(context) : undefined,
      timestamp: Date.now(),
    });
    if (this.riskEvents.length > 100) this.riskEvents.length = 100;
  }

  // --- Orders & execution ---------------------------------------------------
  // CRITICAL (BE-P0-001): submitOrder is the SINGLE enforcement point for
  // the risk engine. No order reaches the broker without passing all risk
  // rules + circuit breaker state. If evaluateRisk returns REJECTED or
  // PAUSED, the order is recorded with status=REJECTED and a risk event
  // is logged. The broker is NEVER called for rejected orders.
  submitOrder(order: Omit<OrderRecord, "id" | "createdAt" | "updatedAt" | "status">): OrderRecord {
    const rec: OrderRecord = {
      ...order,
      id: `ord-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      status: "CREATED",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Step 1: Build a synthetic Signal so the risk engine can evaluate the
    // proposed order against all 11 rules + circuit breaker.
    const proposedSignal: Signal = {
      id: `sig-order-${rec.id}`,
      strategyKey: order.strategyKey ?? "manual",
      symbol: order.symbol,
      action: order.side === "BUY" ? "BUY" : "SELL",
      confidence: 1.0,
      price: this.getQuote(order.symbol).price,
      reasons: [order.reason ?? "Manual order"],
      timestamp: Date.now(),
    };

    // Step 2: Run the risk evaluation. This is the gate.
    const riskEval = this.evaluateSignal(proposedSignal);

    // Step 3: Enforce. Only APPROVED orders proceed to the broker.
    if (riskEval.decision !== "APPROVED") {
      rec.status = "REJECTED";
      rec.reason = `Risk engine: ${riskEval.decision} — ${riskEval.reasons.join("; ")}`;
      rec.updatedAt = Date.now();
      this.orders.unshift(rec);
      this.orders = this.orders.slice(0, ORDER_RETENTION);
      this.recordRiskEvent(
        "ORDER_REJECTED",
        riskEval.decision === "REJECTED" ? "WARNING" : "CRITICAL",
        `Order ${rec.id} ${rec.symbol} ${rec.side} ${rec.quantity} rejected: ${riskEval.reasons.join("; ")}`,
        { orderId: rec.id, decision: riskEval.decision, breaker: riskEval.circuitBreakerState }
      );
      return rec;
    }

    // Step 4: Approved — submit to the paper broker.
    rec.status = "SUBMITTED";
    const quote = this.getQuote(rec.symbol);
    const fill = this.broker.fillMarketOrder(rec, quote);
    if (!fill) {
      rec.status = "REJECTED";
      rec.reason = "Broker rejected order (no fill available)";
      rec.updatedAt = Date.now();
      this.orders.unshift(rec);
      this.orders = this.orders.slice(0, ORDER_RETENTION);
      this.recordRiskEvent("ORDER_REJECTED", "WARNING", `Broker rejected order ${rec.id}: no fill`, { orderId: rec.id });
      return rec;
    }
    rec.status = "FILLED";
    rec.filledPrice = fill.filledPrice;
    rec.filledQty = fill.filledQty;
    rec.updatedAt = Date.now();
    this.portfolio.applyFill(fill);
    this.lastTradeTime = Date.now();
    this.recentSymbols = [rec.symbol, ...this.recentSymbols.filter((s) => s !== rec.symbol)].slice(0, 10);
    this.orders.unshift(rec);
    this.orders = this.orders.slice(0, ORDER_RETENTION);
    // Mark all positions to market after the fill.
    const quotes = new Map<string, Quote>();
    for (const a of this.assetCatalog) quotes.set(a.symbol, this.getQuote(a.symbol));
    this.portfolio.markToMarket(quotes);

    // Step 5: Post-fill risk check. If the fill pushed the portfolio past
    // any hard limit, escalate the circuit breaker (latched).
    const postPortfolio = this.portfolio.state();
    if (postPortfolio.drawdown > this.riskProfile.maxDrawdownPct) {
      this.setBreakerState("TRADING_PAUSED", `Post-fill drawdown ${(postPortfolio.drawdown * 100).toFixed(2)}% exceeds max ${this.riskProfile.maxDrawdownPct * 100}%`);
    }
    const dayLossPct = this.dayStartEquity > 0 ? (postPortfolio.equity - this.dayStartEquity) / this.dayStartEquity : 0;
    if (dayLossPct < -this.riskProfile.maxDailyLossPct) {
      this.setBreakerState("TRADING_PAUSED", `Post-fill daily loss ${(dayLossPct * 100).toFixed(2)}% exceeds max -${this.riskProfile.maxDailyLossPct * 100}%`);
    }

    return rec;
  }

  getPortfolio(): PortfolioState {
    const quotes = new Map<string, Quote>();
    for (const a of this.assetCatalog) quotes.set(a.symbol, this.getQuote(a.symbol));
    this.portfolio.markToMarket(quotes);
    return this.portfolio.state();
  }

  // --- Backtests ------------------------------------------------------------
  runBacktest(cfg: Parameters<typeof runBacktest>[0]): BacktestResult {
    const result = runBacktest(cfg);
    this.backtests.unshift(result);
    if (this.backtests.length > 50) this.backtests.length = 50;
    return result;
  }

  // --- Health ---------------------------------------------------------------
  tickHealth(): void {
    this.health.lastTickAt = Date.now();
    this.health.marketDataLatencyMs = 1 + Math.floor(Math.random() * 4); // simulated
    this.health.brokerConnected = true;
  }

  resetPortfolio(): void {
    this.portfolio = new PortfolioManager(INITIAL_CASH);
    this.dayStartEquity = INITIAL_CASH;
    this.weekStartEquity = INITIAL_CASH;
    this.lastTradeTime = 0;
    this.recentSymbols = [];
    this.setBreakerState("NORMAL", "Portfolio reset by operator");
  }
}

// Singleton. Reused across hot reloads in dev via globalThis.
const globalForAurevia = globalThis as unknown as { __aurevia?: AureviaStore };
export const store: AureviaStore = globalForAurevia.__aurevia ?? new AureviaStore();
if (process.env.NODE_ENV !== "production") globalForAurevia.__aurevia = store;
