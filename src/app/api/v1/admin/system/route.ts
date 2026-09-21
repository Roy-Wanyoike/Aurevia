import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia — Admin: system stats (Issue #123).
//
// GET /api/v1/admin/system
//   Returns a consolidated observability snapshot suitable for the admin
//   dashboard's top metric strip. Pulls from three sources:
//
//     1. Node process — uptime (seconds), RSS + heap memory, CPU usage.
//     2. Aurevia store — circuit breaker state, signal/order/backtest counts,
//        portfolio equity + drawdown, universe size.
//     3. Health monitor — market-data latency, last tick timestamp, broker
//        connectivity, error counters.
//
// The endpoint is read-only and idempotent — safe to poll every 5–10s.
// ---------------------------------------------------------------------------

function formatMemory(bytes: number): { bytes: number; human: string } {
  const mb = bytes / (1024 * 1024);
  return {
    bytes,
    human: `${mb.toFixed(1)} MB`,
  };
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const portfolio = store.getPortfolio();
    const mem = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());
    const cpuUsage = process.cpuUsage();

    const stats = {
      timestamp: new Date().toISOString(),
      process: {
        uptimeSec,
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: {
          rss: formatMemory(mem.rss),
          heapUsed: formatMemory(mem.heapUsed),
          heapTotal: formatMemory(mem.heapTotal),
          external: formatMemory(mem.external),
          arrayBuffers: formatMemory(mem.arrayBuffers),
        },
        cpu: {
          userMicros: cpuUsage.user,
          systemMicros: cpuUsage.system,
        },
      },
      store: {
        circuitBreakerState: store.riskProfile.circuitBreakerState,
        tradingMode: store.riskProfile.tradingMode,
        signalsTracked: store.signals.length,
        backtestsRun: store.backtests.length,
        ordersPlaced: store.orders.length,
        riskEvents: store.riskEvents.length,
        universeSize: store.assetCatalog.length,
        portfolioEquity: portfolio.equity,
        portfolioCash: portfolio.cash,
        portfolioMarketValue: portfolio.marketValue,
        portfolioUnrealizedPnl: portfolio.unrealizedPnl,
        portfolioRealizedPnl: portfolio.realizedPnl,
        portfolioDrawdown: portfolio.drawdown,
        portfolioExposure: portfolio.exposure,
        startedAt: new Date(store.startedAt).toISOString(),
        uptimeMs: Date.now() - store.startedAt,
      },
      health: {
        brokerConnected: store.health.brokerConnected,
        marketDataLatencyMs: store.health.marketDataLatencyMs,
        lastTickAt: store.health.lastTickAt
          ? new Date(store.health.lastTickAt).toISOString()
          : null,
        apiErrors: store.health.apiErrors,
      },
    };

    logger.debug("Admin system stats requested", { requestId });
    return NextResponse.json(stats);
  } catch (e: any) {
    logger.error("Admin system GET failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
