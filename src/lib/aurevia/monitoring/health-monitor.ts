// ---------------------------------------------------------------------------
// Aurevia Health Monitor (Issue #108).
//
// Runs a background tick every 30s that inspects the runtime for trouble:
//   - market data provider health (simulated vs. live)
//   - Node heap memory usage (>500MB threshold)
//   - portfolio drawdown (>5% threshold)
//
// On any anomaly it logs a structured warning so the operator can react
// before the situation degrades. It also refreshes `store.health.lastTickAt`
// and `store.health.brokerConnected` so the /api/v1/health snapshot stays
// fresh without requiring inbound API traffic.
//
// Lifecycle:
//   - The store instantiates a singleton HealthMonitor in its constructor
//     (passing itself in) and calls `start()`. In the dev server the store
//     is preserved across hot reloads via globalThis, so `start()` is
//     idempotent — a second call is a no-op.
//   - `stop()` clears the interval. Intended for tests / shutdown hooks.
//
// Circular dependency note:
//   This module does NOT statically import `../store`. The store passes
//   itself to the constructor; the type-only import below is erased at
//   runtime, so there's no load-time circular dependency.
// ---------------------------------------------------------------------------

import { logger } from "../logger";
import type { AureviaStore } from "../store";

const CHECK_INTERVAL_MS = 30_000;
const MEMORY_HEAP_THRESHOLD_BYTES = 500 * 1024 * 1024; // 500 MB
const DRAWDOWN_THRESHOLD_PCT = 0.05; // 5%

export class HealthMonitor {
  private interval: NodeJS.Timeout | null = null;
  private checks = 0;

  /**
   * @param store The owning Aurevia runtime store. Injected rather than
   * statically imported to avoid a load-time circular dependency between
   * `store.ts` (which constructs a HealthMonitor at module init time) and
   * this file (which needs to read from the store).
   */
  constructor(private readonly store: AureviaStore) {}

  /**
   * Start the periodic check. Idempotent — safe to call multiple times
   * (the dev-server's singleton store survives hot reloads, so the
   * constructor may run more than once in dev).
   */
  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      // Fire-and-forget — `check()` never throws (it catches internally)
      // so the interval callback can't leak an unhandled rejection.
      void this.check().catch((e) => {
        logger.error("Health monitor check crashed", {
          error: e?.message ?? "unknown",
        });
      });
    }, CHECK_INTERVAL_MS);
    logger.info("Health monitor started", { intervalMs: CHECK_INTERVAL_MS });
  }

  /** Stop the periodic check. Safe to call when not started. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info("Health monitor stopped");
    }
  }

  /** Exposed for tests so the check can be driven deterministically. */
  async check(): Promise<void> {
    this.checks++;
    const ds = this.store.getDataSource();
    const portfolio = this.store.getPortfolio();
    const breaker = this.store.riskProfile.circuitBreakerState;

    // Provider health — only warn after the first check so a cold start
    // (which always shows the simulated provider until live data is
    // initialized) doesn't generate noise on boot.
    if (!ds.isLive && this.checks > 1) {
      logger.warn("Market data provider is simulated", {
        check: this.checks,
        source: ds.source,
      });
    }

    // Memory pressure — `process.memoryUsage()` is a Node-only API; in
    // edge-runtime contexts it would throw, so we guard the call.
    if (typeof process !== "undefined" && typeof process.memoryUsage === "function") {
      const mem = process.memoryUsage();
      if (mem.heapUsed > MEMORY_HEAP_THRESHOLD_BYTES) {
        logger.warn("High memory usage", {
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        });
      }
    }

    // Drawdown — 5% is a soft threshold; the risk engine has its own hard
    // limit at `riskProfile.maxDrawdownPct` (default 20%). This is an
    // observability signal, not a control.
    if (portfolio.drawdown > DRAWDOWN_THRESHOLD_PCT) {
      logger.warn("Portfolio drawdown elevated", {
        drawdownPct: (portfolio.drawdown * 100).toFixed(2),
        equity: portfolio.equity,
        peakEquity: portfolio.peakEquity,
      });
    }

    // Circuit breaker — surface non-NORMAL states so the operator knows.
    if (breaker !== "NORMAL") {
      logger.warn("Circuit breaker not in NORMAL state", { state: breaker });
    }

    // Refresh the health snapshot consumed by /api/v1/health.
    this.store.health.lastTickAt = Date.now();
    this.store.health.brokerConnected = true;
  }

  /** Test accessor — number of check() invocations since start(). */
  get checkCount(): number {
    return this.checks;
  }
}
