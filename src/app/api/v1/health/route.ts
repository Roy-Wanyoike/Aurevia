import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";

export const dynamic = "force-dynamic";

// GET /api/v1/health — observability snapshot.
export async function GET() {
  const portfolio = store.getPortfolio();
  const uptimeMs = Date.now() - store.startedAt;
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
    version: "0.1.0",
  });
}
