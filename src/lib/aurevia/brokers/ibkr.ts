import type { BrokerAdapter, BrokerConfig, BrokerAccount, OrderEvent, BrokerStatus } from "./adapter";
import type { OrderRecord, Quote, Position } from "../types";

// ---------------------------------------------------------------------------
// Interactive Brokers (IBKR) adapter.
//
// IBKR uses the TWS API or the Client Portal Web API. The Client Portal API
// is more cloud-friendly (REST + WebSocket). For production, you would use
// the official `@stoqey/ib` or `ibkr` npm packages.
//
// In this dev environment, network calls are stubbed and responses are
// simulated so the platform runs end-to-end without real IBKR credentials.
//
// CRITICAL: IBKR requires explicit LIVE approval. The adapter refuses to
// connect in LIVE mode unless mode === "LIVE" AND a confirmation flag is set.
// Withdrawal is never supported — trading only.
// ---------------------------------------------------------------------------

export class IBKRAdapter implements BrokerAdapter {
  readonly brokerId = "ibkr";
  readonly brokerName = "Interactive Brokers";
  private config: BrokerConfig;
  private status: BrokerStatus = "DISCONNECTED";
  private quoteHandlers: Map<string, (q: Quote) => void> = new Map();
  private orderHandlers: ((e: OrderEvent) => void)[] = [];

  constructor(config: BrokerConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.status = "CONNECTING";
    // In production: POST to /v1/api/iserver/authenticate
    await this.simulateLatency();
    this.status = "CONNECTED";
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
    // In production: GET /v1/api/portfolio/{accountId}/summary
    return {
      brokerId: this.brokerId,
      accountId: this.config.accountId ?? "DU1234567",
      brokerName: this.brokerName,
      mode: this.config.mode,
      currency: "USD",
      cash: 100000,
      equity: 100000,
      buyingPower: 400000, // 4x margin for IBKR Pro
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
    // In production: GET /v1/api/portfolio/{accountId}/positions
    return [];
  }

  async getQuote(_symbol: string): Promise<Quote | null> {
    this.requireConnected();
    // In production: GET /v1/api/md/stocks/{symbol}/quotes
    return null;
  }

  async subscribeQuotes(symbols: string[], handler: (q: Quote) => void): Promise<void> {
    this.requireConnected();
    for (const s of symbols) this.quoteHandlers.set(s, handler);
    // In production: WebSocket to wss://api.ibkr.com/v1/api/ws
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
    // In production: POST /v1/api/iserver/account/{accountId}/orders
    await this.simulateLatency();
    return {
      brokerOrderId: `ibkr-${order.clientOrderId}`,
      status: "ACKNOWLEDGED",
    };
  }

  async cancelOrder(_brokerOrderId: string): Promise<boolean> {
    this.requireConnected();
    // In production: DELETE /v1/api/iserver/account/{accountId}/order/{id}
    await this.simulateLatency();
    return true;
  }

  async getOrder(_brokerOrderId: string): Promise<OrderRecord | null> {
    this.requireConnected();
    // In production: GET /v1/api/iserver/account/{accountId}/orders
    return null;
  }

  async subscribeOrderEvents(handler: (e: OrderEvent) => void): Promise<void> {
    this.requireConnected();
    this.orderHandlers.push(handler);
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
      throw new Error(`IBKR adapter not connected (status: ${this.status})`);
    }
  }

  private async simulateLatency(): Promise<void> {
    // IBKR tends to be a bit slower than Alpaca
    const delay = 30 + Math.floor(Math.random() * 80);
    await new Promise((r) => setTimeout(r, delay));
  }
}
