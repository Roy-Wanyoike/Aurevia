import { ASSET_CATALOG, getAsset } from "./market-data/assets";
import { generateCandles, buildQuote } from "./market-data/feed";
import { MarketDataGateway } from "./market-data/gateway";
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

export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
}

// Alert types — kept as string unions (not enums) so the API can return them
// as plain JSON. (Issue #48 — Alert Engine.)
export type AlertType = "price" | "rsi" | "changePct";
export type AlertCondition = "above" | "below";

export interface Alert {
  id: string;
  type: AlertType;
  symbol?: string;
  condition: AlertCondition;
  threshold: number;
  active: boolean;
  triggeredAt?: number;
  triggerValue?: number;
  createdAt: number;
}

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
  marketDataGateway: MarketDataGateway = new MarketDataGateway();
  mlPredictions: Map<string, MLPrediction> = new Map(); // keyed by `${modelKey}:${symbol}`
  // Track whether live market data has been initialized
  private liveDataInitialized: boolean = false;
  private liveDataInitPromise: Promise<void> | null = null;
  startedAt: number = Date.now();
  dayStartEquity: number = INITIAL_CASH;
  weekStartEquity: number = INITIAL_CASH;
  lastTradeTime: number = 0;
  recentSymbols: string[] = [];
  lastSignalScan: number = 0;
  // --- Watchlists -----------------------------------------------------------
  // User-curated symbol lists. Persisted in-memory; survives hot reloads via
  // the globalThis singleton. The default watchlist seeds AAPL/MSFT/NVDA/BTC
  // so the view isn't empty on a fresh install. Symbols are upper-cased on
  // add so AAPL/aapl/AAPl all collapse to one entry (issue #41).
  //
  // The CRUD operations live as module-level functions (see bottom of file)
  // rather than instance methods so they're reachable from the dev-server's
  // long-lived singleton — whose prototype was set at construction time and
  // therefore predates this PR's methods. Module-level functions operate on
  // `store.watchlists` as an own-property data bag, so they work regardless
  // of which AureviaStore prototype version the singleton happens to have.
  watchlists: Watchlist[] = [];

  // --- Alerts (issue #48) ---------------------------------------------------
  // User-defined price / RSI / change-% alerts. The bag is an own property
  // here; the CRUD operations live as module-level functions (see bottom of
  // file) rather than instance methods so they're reachable from the
  // dev-server's long-lived singleton — whose prototype was set at
  // construction time and therefore predates this PR's methods. Module-level
  // functions operate on `store.alerts` as an own-property data bag, so they
  // work regardless of which AureviaStore prototype version the singleton
  // happens to have. (Same pattern watchlists already use for #41.)
  alerts: Alert[] = [];

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
  // getCandles returns candles from cache. If live data has been fetched
  // (via initLiveData), the cache contains real Polygon data. Otherwise it
  // falls back to the deterministic simulated feed.
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

  // --- Live market data initialization --------------------------------------
  // Called on first API request. If POLYGON_API_KEY (or any provider key) is
  // configured, fetches real candles for all assets and populates the cache.
  // The synchronous getCandles() then returns live data from cache. If no key
  // is set, this is a no-op — the simulated feed remains in the cache.
  async initLiveData(): Promise<void> {
    if (this.liveDataInitialized) return;
    if (this.liveDataInitPromise) return this.liveDataInitPromise;

    this.liveDataInitPromise = this._doInitLiveData();
    await this.liveDataInitPromise;
  }

  private async _doInitLiveData(): Promise<void> {
    const activeProvider = this.marketDataGateway.getActiveProvider();
    if (!activeProvider.isLive) {
      // No live provider configured — keep simulated data
      this.liveDataInitialized = true;
      return;
    }

    // Fetch real candles for all assets in the universe
    for (const asset of this.assetCatalog) {
      try {
        const result = await this.marketDataGateway.getCandles(asset.symbol, "1d", 300);
        if (result.candles.length > 0) {
          // Replace the simulated cache with live data
          const key = `${asset.symbol}-300`;
          this.candleCache.set(key, result.candles);
          // Also cache the 60-bar subset used by getQuote
          const key60 = `${asset.symbol}-60`;
          this.candleCache.set(key60, result.candles.slice(-60));
        }
      } catch (e: any) {
        // Log but continue — partial live data is better than none
        console.warn(`[aurevia] Live data fetch failed for ${asset.symbol}:`, e?.message);
      }
    }

    this.liveDataInitialized = true;
    console.log(`[aurevia] Live market data initialized via ${activeProvider.id}`);
  }

  // Check if live data is available
  getDataSource(): { source: string; isLive: boolean } {
    const p = this.marketDataGateway.getActiveProvider();
    return { source: p.id, isLive: p.isLive };
  }

  // Refresh live data — called periodically to keep cache fresh
  async refreshLiveData(): Promise<void> {
    const activeProvider = this.marketDataGateway.getActiveProvider();
    if (!activeProvider.isLive) return;

    for (const asset of this.assetCatalog) {
      try {
        const result = await this.marketDataGateway.getCandles(asset.symbol, "1d", 300);
        if (result.candles.length > 0) {
          this.candleCache.set(`${asset.symbol}-300`, result.candles);
          this.candleCache.set(`${asset.symbol}-60`, result.candles.slice(-60));
        }
      } catch (e: any) {
        console.warn(`[aurevia] Live data refresh failed for ${asset.symbol}:`, e?.message);
      }
    }
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
    // Check user-defined alerts against the fresh market data — fires any
    // alerts whose condition is now satisfied. (Issue #48 — Alert Engine.)
    // checkAlerts is module-level; called from here so alerts are evaluated
    // on every scan without requiring callers to remember to invoke it.
    try {
      checkAlerts();
    } catch {
      // Never let alert evaluation break a signal scan — alerts are a UX
      // feature, not part of the trade decision path.
    }
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
    //
    // Issue #63 — previously the risk engine received a synthetic signal with
    // `confidence: 1.0` but had NO visibility into the actual order quantity.
    // Rules 9/10/11 (post-fill hypothetical exposure / concentration /
    // leverage) therefore assumed the WORST-CASE size (`maxPositionPct` of
    // equity), which over-rejects small orders and under-rejects large ones.
    // We now embed the actual requested quantity in `reasons` as a `qty=N`
    // entry. The risk engine reads it back (see engine.ts rule 9) and uses
    // it for the post-fill computation instead of the conservative default.
    const proposedSignal: Signal = {
      id: `sig-order-${rec.id}`,
      strategyKey: order.strategyKey ?? "manual",
      symbol: order.symbol,
      action: order.side === "BUY" ? "BUY" : "SELL",
      confidence: 1.0,
      price: this.getQuote(order.symbol).price,
      reasons: [order.reason ?? "Manual order", `qty=${order.quantity}`],
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

// --- Watchlists (module-level API) -----------------------------------------
// CRUD + add/remove symbol operations on user-curated symbol lists. These
// are module-level functions rather than instance methods so they're
// reachable from the dev-server's long-lived singleton — which was
// constructed before this PR existed and therefore has an older prototype
// without the new methods. Calling module-level functions is prototype-
// agnostic: they just reach into `store.watchlists` (an own property on
// the instance) and mutate it directly. (Issue #41 — Watchlists.)

const DEFAULT_WATCHLIST: Watchlist = {
  id: "default",
  name: "My Watchlist",
  symbols: ["AAPL", "MSFT", "NVDA", "BTC"],
};

export function getWatchlists(): Watchlist[] {
  if (!Array.isArray(store.watchlists) || store.watchlists.length === 0) {
    store.watchlists = [{ ...DEFAULT_WATCHLIST, symbols: [...DEFAULT_WATCHLIST.symbols] }];
  }
  return store.watchlists;
}

export function addWatchlist(name: string): Watchlist {
  const list = getWatchlists();
  const trimmed = name.trim();
  const finalName = trimmed.length > 0 ? trimmed : `Watchlist ${list.length + 1}`;
  const wl: Watchlist = {
    // Stable, URL-safe, collision-resistant id. Date.now() + random suffix
    // matches the existing pattern used by OrderRecord / RiskEvent ids.
    id: `wl-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: finalName,
    symbols: [],
  };
  list.push(wl);
  return wl;
}

export function addToWatchlist(watchlistId: string, symbol: string): Watchlist | null {
  const wl = getWatchlists().find((w) => w.id === watchlistId);
  if (!wl) return null;
  const upper = symbol.toUpperCase();
  if (!wl.symbols.includes(upper)) wl.symbols.push(upper);
  return wl;
}

export function removeFromWatchlist(watchlistId: string, symbol: string): Watchlist | null {
  const wl = getWatchlists().find((w) => w.id === watchlistId);
  if (!wl) return null;
  const upper = symbol.toUpperCase();
  wl.symbols = wl.symbols.filter((s) => s !== upper);
  return wl;
}

export function renameWatchlist(watchlistId: string, name: string): Watchlist | null {
  const wl = getWatchlists().find((w) => w.id === watchlistId);
  if (!wl) return null;
  const trimmed = name.trim();
  if (trimmed.length > 0) wl.name = trimmed;
  return wl;
}

export function deleteWatchlist(watchlistId: string): boolean {
  // The default watchlist cannot be deleted — otherwise a fresh install
  // would render an empty watchlists view with no clear "create one" affordance.
  if (watchlistId === "default") return false;
  const list = getWatchlists();
  const idx = list.findIndex((w) => w.id === watchlistId);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

// --- Alerts (issue #48) — module-level API ---------------------------------
// CRUD + check operations on user-defined alerts. Module-level rather than
// instance methods for the same reason watchlists are: the dev server's
// long-lived singleton was constructed before this PR existed, so its
// prototype predates any new methods. Module-level functions reach into
// `store.alerts` (an own property on the instance) and mutate it directly,
// which is prototype-agnostic.
export function getAlerts(): Alert[] {
  if (!Array.isArray(store.alerts)) store.alerts = [];
  return store.alerts;
}

export function addAlert(
  type: AlertType,
  symbol: string | undefined,
  condition: AlertCondition,
  threshold: number,
): Alert {
  const a: Alert = {
    id: `alrt-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    type,
    symbol: symbol?.toUpperCase(),
    condition,
    threshold,
    active: true,
    createdAt: Date.now(),
  };
  store.alerts.unshift(a);
  if (store.alerts.length > 100) store.alerts.length = 100;
  return a;
}

export function removeAlert(id: string): boolean {
  const idx = store.alerts.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  store.alerts.splice(idx, 1);
  return true;
}

// Evaluate every active alert against current market data. Triggered alerts
// are latched (active=false, triggeredAt=now) and a RiskEvent is recorded so
// they show up in the existing risk-event log too. Returns the freshly
// triggered alerts so the route can emit them in the response (the client
// then surfaces a toast).
export function checkAlerts(): Alert[] {
  // Defensive initialization — the dev server's long-lived singleton may have
  // been constructed before this PR added `alerts: Alert[] = []` to the
  // class, in which case `store.alerts` is undefined and `for (...of...)`
  // would throw. `getAlerts()` ensures the own-property exists. (Issue #48.)
  const all = getAlerts();
  const triggered: Alert[] = [];
  for (const a of all) {
    if (!a.active) continue;
    const sym = a.symbol;
    if (!sym) continue;
    const ctx = store.buildContext(sym, 300);
    if (!ctx) continue;
    let value = 0;
    switch (a.type) {
      case "price":
        value = ctx.quote.price;
        break;
      case "rsi":
        value = ctx.indicators.rsi14;
        break;
      case "changePct":
        value = ctx.quote.changePct;
        break;
    }
    const fired =
      (a.condition === "above" && value > a.threshold) ||
      (a.condition === "below" && value < a.threshold);
    if (!fired) continue;
    a.active = false;
    a.triggeredAt = Date.now();
    a.triggerValue = value;
    triggered.push(a);
    store.recordRiskEvent(
      "ALERT_TRIGGERED",
      "INFO",
      `Alert ${a.id} (${a.symbol} ${a.type} ${a.condition} ${a.threshold}) fired at ${value.toFixed(4)}`,
      {
        alertId: a.id,
        type: a.type,
        symbol: a.symbol,
        condition: a.condition,
        threshold: a.threshold,
        value,
      },
    );
  }
  return triggered;
}

// Singleton. Reused across hot reloads in dev via globalThis.
const globalForAurevia = globalThis as unknown as { __aurevia?: AureviaStore };
export const store: AureviaStore = globalForAurevia.__aurevia ?? new AureviaStore();
if (process.env.NODE_ENV !== "production") globalForAurevia.__aurevia = store;
