import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { marketDataGateway } from "@/lib/aurevia/market-data/gateway";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/health — observability snapshot.
// Public endpoint (no requireAuth — used by uptime checks / load balancers).
export async function GET() {
  try {
    const portfolio = store.getPortfolio();
    const uptimeMs = Date.now() - store.startedAt;
    const activeProvider = marketDataGateway.getActiveProvider();
    return NextResponse.json({
      status: "ok",
      uptimeMs,
      uptimeHours: Math.round((uptimeMs / 3_600_000) * 10) / 10,
      tradingMode: store.riskProfile.tradingMode,
      circuitBreakerState: store.riskProfile.circuitBreakerState,
      brokerConnected: store.health.brokerConnected,
      marketDataLatencyMs: store.health.marketDataLatencyMs,
      lastTickAt: store.health.lastTickAt,
      apiErrors: store.health.apiErrors,
      signalsTracked: store.signals.length,
      backtestsRun: store.backtests.length,
      ordersPlaced: store.orders.length,
      portfolioEquity: portfolio.equity,
      portfolioDrawdown: portfolio.drawdown,
      universeSize: store.assetCatalog.length,
      strategiesInstalled: 5,
      // Issue #35 — surface the active market data provider so the UI can
      // badge LIVE vs SIMULATED. When a real provider (polygon, alpaca, ...)
      // has a configured API key, dataSource = its id and dataIsLive = true.
      // Otherwise we are transparently running off the simulated feed.
      dataSource: activeProvider.id,
      dataIsLive: activeProvider.isLive,
      version: "0.1.0",
    });
  } catch (e: any) {
    logger.error("Health check failed", { error: e?.message ?? "unknown" });
    return NextResponse.json(
      { status: "error", error: e?.message ?? "unknown" },
      { status: 500 },
    );
  }
}
