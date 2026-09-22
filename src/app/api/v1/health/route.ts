import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/health — public observability probe.
//
// Issue #183 / R-13 — this route is publicly reachable (it is exempt from
// `requireAuth()` and listed in `middleware.ts` `PUBLIC_PATHS` so liveness
// probes can reach it without credentials). To prevent an unauthenticated
// caller from probing system activity or inferring account size, the public
// payload is restricted to the minimal fields a probe needs:
//
//   status, uptimeHours, tradingMode, circuitBreakerState,
//   dataSource, dataIsLive, version
//
// The full operational snapshot (portfolioEquity, portfolioDrawdown,
// signalsTracked, backtestsRun, ordersPlaced, brokerConnected,
// marketDataLatencyMs, apiErrors, universeSize, …) lives behind auth at
// `/api/v1/admin/system` (returns the same data plus process metrics).
//
// Also triggers live data initialization on first request (idempotent).
export async function GET() {
  const requestId = "health";
  try {
    // Initialize live market data on first health check (idempotent)
    await store.initLiveData();

    const uptimeMs = Date.now() - store.startedAt;
    const dataSource = store.getDataSource();
    return NextResponse.json({
      status: "ok",
      uptimeHours: Math.round((uptimeMs / 3_600_000) * 10) / 10,
      tradingMode: store.riskProfile.tradingMode,
      circuitBreakerState: store.riskProfile.circuitBreakerState,
      dataSource: dataSource.source,
      dataIsLive: dataSource.isLive,
      version: "0.1.0",
    });
  } catch (e: any) {
    logger.error("Health check failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json(
      { error: "internal_error", requestId },
      { status: 500 },
    );
  }
}
