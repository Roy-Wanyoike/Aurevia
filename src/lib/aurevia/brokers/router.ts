import type { BrokerAdapter, BrokerConfig } from "./adapter";
import { AlpacaAdapter } from "./alpaca";
import { IBKRAdapter } from "./ibkr";
import { PaperBroker } from "../execution/paper-broker";

// ---------------------------------------------------------------------------
// Multi-broker router.
//
// Routes orders to the best execution venue based on:
// - fees (lowest commission)
// - liquidity (best fill quality)
// - spread (tightest)
// - latency (fastest acknowledgement)
// - availability (broker health)
// - asset support (does the broker trade this asset?)
//
// The router is the ONLY component that decides which broker handles an
// order. Strategies and the risk engine never know which broker will execute.
// ---------------------------------------------------------------------------

export type BrokerKind = "paper" | "alpaca" | "ibkr";

export interface BrokerRoute {
  brokerId: BrokerKind;
  brokerName: string;
  reason: string;
  estimatedFee: number;
  estimatedLatencyMs: number;
}

export interface BrokerRegistryEntry {
  kind: BrokerKind;
  adapter: BrokerAdapter | PaperBroker;
  config?: BrokerConfig;
  connected: boolean;
  healthy: boolean;
  lastHealthCheck: number;
}

export class BrokerRouter {
  private registry: Map<BrokerKind, BrokerRegistryEntry> = new Map();

  // Register a broker adapter. Paper broker is always registered by default.
  registerPaper(broker: PaperBroker): void {
    this.registry.set("paper", {
      kind: "paper",
      adapter: broker,
      connected: true,
      healthy: true,
      lastHealthCheck: Date.now(),
    });
  }

  registerAlpaca(config: BrokerConfig): void {
    this.registry.set("alpaca", {
      kind: "alpaca",
      adapter: new AlpacaAdapter(config),
      config,
      connected: false,
      healthy: false,
      lastHealthCheck: 0,
    });
  }

  registerIBKR(config: BrokerConfig): void {
    this.registry.set("ibkr", {
      kind: "ibkr",
      adapter: new IBKRAdapter(config),
      config,
      connected: false,
      healthy: false,
      lastHealthCheck: 0,
    });
  }

  async connect(kind: BrokerKind): Promise<void> {
    const entry = this.registry.get(kind);
    if (!entry) throw new Error(`Unknown broker: ${kind}`);
    if (kind === "paper") return; // paper broker is always connected
    await (entry.adapter as BrokerAdapter).connect();
    entry.connected = true;
    entry.healthy = true;
    entry.lastHealthCheck = Date.now();
  }

  async disconnect(kind: BrokerKind): Promise<void> {
    const entry = this.registry.get(kind);
    if (!entry) return;
    if (kind !== "paper") await (entry.adapter as BrokerAdapter).disconnect();
    entry.connected = false;
    entry.healthy = false;
  }

  getBroker(kind: BrokerKind): BrokerAdapter | PaperBroker | undefined {
    return this.registry.get(kind)?.adapter;
  }

  listBrokers(): BrokerRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  // Route an order to the best broker. Returns the routing decision.
  // Currently: paper broker is always preferred (it's the only connected one
  // in dev). In production, this would compare fees/latency/liquidity.
  route(_symbol: string, _side: "BUY" | "SELL", quantity: number): BrokerRoute {
    // If paper broker is available, use it (dev mode).
    const paper = this.registry.get("paper");
    if (paper?.healthy) {
      return {
        brokerId: "paper",
        brokerName: "Paper Broker",
        reason: "Paper broker healthy — default for dev mode",
        estimatedFee: 0,
        estimatedLatencyMs: 1,
      };
    }
    // Try Alpaca next
    const alpaca = this.registry.get("alpaca");
    if (alpaca?.healthy) {
      return {
        brokerId: "alpaca",
        brokerName: "Alpaca",
        reason: "Alpaca healthy — lowest fees for US equities",
        estimatedFee: quantity * 0.0005, // $0.005/share
        estimatedLatencyMs: 50,
      };
    }
    // IBKR fallback
    const ibkr = this.registry.get("ibkr");
    if (ibkr?.healthy) {
      return {
        brokerId: "ibkr",
        brokerName: "Interactive Brokers",
        reason: "IBKR healthy — global market access",
        estimatedFee: quantity * 0.001, // tiered pricing
        estimatedLatencyMs: 80,
      };
    }
    // No broker available — circuit breaker should have caught this
    return {
      brokerId: "paper",
      brokerName: "No broker available",
      reason: "ERROR: no healthy broker — order should be rejected by risk engine",
      estimatedFee: 0,
      estimatedLatencyMs: 0,
    };
  }

  // Run health checks on all connected brokers.
  async healthCheckAll(): Promise<{ kind: BrokerKind; ok: boolean; latencyMs: number }[]> {
    const results: { kind: BrokerKind; ok: boolean; latencyMs: number }[] = [];
    for (const [kind, entry] of this.registry.entries()) {
      if (!entry.connected || kind === "paper") {
        results.push({ kind, ok: kind === "paper", latencyMs: 0 });
        continue;
      }
      try {
        const check = await (entry.adapter as BrokerAdapter).healthCheck();
        entry.healthy = check.ok;
        entry.lastHealthCheck = Date.now();
        results.push({ kind, ok: check.ok, latencyMs: check.latencyMs });
      } catch {
        entry.healthy = false;
        results.push({ kind, ok: false, latencyMs: 0 });
      }
    }
    return results;
  }
}
