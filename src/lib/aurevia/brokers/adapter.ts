import type { OrderRecord, Quote, Position } from "../types";

// ---------------------------------------------------------------------------
// Aurevia Broker Adapter Contract.
//
// Every broker (IBKR, Alpaca, OANDA, Coinbase, paper) implements this
// interface. The Execution Engine talks ONLY to BrokerAdapter — it never
// imports a broker SDK directly. This is the boundary that lets Aurevia
// switch between paper, sandbox, and live brokers without touching the
// strategy, risk, or portfolio engines.
//
// CRITICAL safety properties:
// - Trading-only credentials (withdrawal permission DISABLED).
// - Secrets stored in secret manager, NEVER in code or logs.
// - LIVE mode requires explicit configuration + multiple safeguards.
// ---------------------------------------------------------------------------

export type BrokerStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";

export interface BrokerAccount {
  brokerId: string;
  accountId: string;
  brokerName: string;
  mode: "PAPER" | "SANDBOX" | "LIVE";
  currency: string;
  cash: number;
  equity: number;
  buyingPower: number;
  dayTradeRemaining: number;
  status: BrokerStatus;
  lastSyncAt: number;
}

export interface BrokerConfig {
  brokerId: string;
  brokerName: string;
  apiKey: string; // stored in secret manager in production
  apiSecret: string;
  accountId?: string;
  mode: "PAPER" | "SANDBOX" | "LIVE";
  baseUrl?: string; // override for sandbox/paper endpoints
  rateLimitPerMin?: number;
}

export interface BrokerAdapter {
  readonly brokerId: string;
  readonly brokerName: string;

  // --- Lifecycle ---
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): BrokerStatus;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;

  // --- Account ---
  getAccount(): Promise<BrokerAccount>;
  getBalances(): Promise<{ cash: number; equity: number; buyingPower: number }>;
  getPositions(): Promise<Position[]>;

  // --- Market data (pass-through; most brokers also provide data) ---
  getQuote(symbol: string): Promise<Quote | null>;
  subscribeQuotes(symbols: string[], handler: (q: Quote) => void): Promise<void>;
  unsubscribeQuotes(symbols: string[]): Promise<void>;

  // --- Orders ---
  placeOrder(order: {
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    orderType: "MARKET" | "LIMIT" | "STOP";
    limitPrice?: number;
    clientOrderId: string; // idempotency key
  }): Promise<{ brokerOrderId: string; status: OrderRecord["status"] }>;
  cancelOrder(brokerOrderId: string): Promise<boolean>;
  getOrder(brokerOrderId: string): Promise<OrderRecord | null>;

  // --- Order events stream ---
  subscribeOrderEvents(handler: (event: OrderEvent) => void): Promise<void>;

  // --- Reconciliation ---
  reconcile(internalPositions: Position[]): Promise<{
    ok: boolean;
    diffs: string[];
    externalPositions: Position[];
  }>;
}

export interface OrderEvent {
  brokerOrderId: string;
  clientOrderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  status: OrderRecord["status"];
  filledPrice?: number;
  filledQty?: number;
  timestamp: number;
}
