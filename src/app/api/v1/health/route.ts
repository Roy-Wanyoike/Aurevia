import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/health — observability snapshot.
// Also triggers live data initialization on first request.
export async function GET() {
  try {
    // Initialize live market data on first health check (idempotent)
    await store.initLiveData();

    const portfolio = store.getPortfolio();
    const uptimeMs = Date.now() - store.startedAt;
    const dataSource = store.getDataSource();
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
      dataSource: dataSource.source,
      dataIsLive: dataSource.isLive,
      liveDataInitialized: store.getDataSource().isLive,
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
