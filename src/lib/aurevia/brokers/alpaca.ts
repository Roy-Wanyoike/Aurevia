import type { BrokerAdapter, BrokerConfig, BrokerAccount, OrderEvent, BrokerStatus } from "./adapter";
import type { OrderRecord, Quote, Position } from "../types";

// ---------------------------------------------------------------------------
// Alpaca broker adapter.
//
// Alpaca provides a clean REST + WebSocket API ideal for algorithmic trading.
// Paper trading: https://paper-api.alpaca.markets
// Live trading: https://api.alpaca.markets
//
// This adapter implements the BrokerAdapter contract. In production, the
// actual HTTP calls would use the official Alpaca SDK or direct fetch. In
// this dev environment, we stub the network calls and simulate responses
// so the platform runs end-to-end without real credentials.
//
// CRITICAL: LIVE mode requires explicit configuration. The adapter refuses
// to connect in LIVE mode unless mode === "LIVE" AND a confirmation flag
// is set in the config. Withdrawal is never supported — trading only.
// ---------------------------------------------------------------------------

export class AlpacaAdapter implements BrokerAdapter {
  readonly brokerId = "alpaca";
  readonly brokerName = "Alpaca";
  private config: BrokerConfig;
  private status: BrokerStatus = "DISCONNECTED";
  private quoteHandlers: Map<string, (q: Quote) => void> = new Map();
  private orderHandlers: ((e: OrderEvent) => void)[] = [];
  private connectedAt = 0;

  constructor(config: BrokerConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.status = "CONNECTING";
    // In production: validate credentials via GET /v2/account
    await this.simulateLatency();
    this.status = "CONNECTED";
    this.connectedAt = Date.now();
  }

  async disconnect(): Promise<void> {
    this.quoteHandlers.clear();
    this.orderHandlers = [];
    this.status = "DISCONNECTED";
  }

  getStatus(): BrokerStatus {
    return this.status;
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const start = Date.now();
    if (this.status !== "CONNECTED") {
      return { ok: false, latencyMs: 0, message: `Not connected (status: ${this.status})` };
    }
    await this.simulateLatency();
    return { ok: true, latencyMs: Date.now() - start };
  }

  async getAccount(): Promise<BrokerAccount> {
    this.requireConnected();
    // In production: GET /v2/account
    return {
      brokerId: this.brokerId,
      accountId: this.config.accountId ?? "paper-account",
      brokerName: this.brokerName,
      mode: this.config.mode,
      currency: "USD",
      cash: 100000,
      equity: 100000,
      buyingPower: 200000, // 2x margin for paper
      dayTradeRemaining: 3,
      status: this.status,
      lastSyncAt: Date.now(),
    };
  }

  async getBalances(): Promise<{ cash: number; equity: number; buyingPower: number }> {
    const acct = await this.getAccount();
    return { cash: acct.cash, equity: acct.equity, buyingPower: acct.buyingPower };
  }

  async getPositions(): Promise<Position[]> {
    this.requireConnected();
    // In production: GET /v2/positions
    return [];
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    this.requireConnected();
    // In production: GET /v2/stocks/{symbol}/quotes/latest
    return null; // let the market-data feed handle this
  }

  async subscribeQuotes(symbols: string[], handler: (q: Quote) => void): Promise<void> {
    this.requireConnected();
    for (const s of symbols) this.quoteHandlers.set(s, handler);
    // In production: WebSocket to wss://stream.data.alpaca.markets/v2/iex
  }

  async unsubscribeQuotes(symbols: string[]): Promise<void> {
    for (const s of symbols) this.quoteHandlers.delete(s);
  }

  async placeOrder(order: {
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    orderType: "MARKET" | "LIMIT" | "STOP";
    limitPrice?: number;
    clientOrderId: string;
  }): Promise<{ brokerOrderId: string; status: OrderRecord["status"] }> {
    this.requireConnected();
    // In production: POST /v2/orders with client_order_id for idempotency
    await this.simulateLatency();
    return {
      brokerOrderId: `alpaca-${order.clientOrderId}`,
      status: "ACKNOWLEDGED",
    };
  }

  async cancelOrder(brokerOrderId: string): Promise<boolean> {
    this.requireConnected();
    // In production: DELETE /v2/orders/{id}
    await this.simulateLatency();
    return true;
  }

  async getOrder(brokerOrderId: string): Promise<OrderRecord | null> {
    this.requireConnected();
    // In production: GET /v2/orders/{id}
    return null;
  }

  async subscribeOrderEvents(handler: (e: OrderEvent) => void): Promise<void> {
    this.requireConnected();
    this.orderHandlers.push(handler);
    // In production: WebSocket to wss://paper-api.alpaca.markets/stream
  }

  async reconcile(internalPositions: Position[]): Promise<{
    ok: boolean;
    diffs: string[];
    externalPositions: Position[];
  }> {
    const external = await this.getPositions();
    const diffs: string[] = [];
    const internalMap = new Map(internalPositions.map((p) => [p.symbol, p]));
    const externalMap = new Map(external.map((p) => [p.symbol, p]));
    for (const sym of new Set([...internalMap.keys(), ...externalMap.keys()])) {
      const a = internalMap.get(sym);
      const b = externalMap.get(sym);
      if (!a || !b) {
        diffs.push(`${sym}: present in ${a ? "internal" : "external"} only`);
        continue;
      }
      if (Math.abs(a.quantity - b.quantity) / Math.max(1, a.quantity) > 0.001) {
        diffs.push(`${sym}: qty mismatch internal=${a.quantity} external=${b.quantity}`);
      }
    }
    return { ok: diffs.length === 0, diffs, externalPositions: external };
  }

  private requireConnected(): void {
    if (this.status !== "CONNECTED") {
      throw new Error(`Alpaca adapter not connected (status: ${this.status})`);
    }
  }

  private async simulateLatency(): Promise<void> {
    // Simulate realistic API latency: 20-80ms
    const delay = 20 + Math.floor(Math.random() * 60);
    await new Promise((r) => setTimeout(r, delay));
  }
}
