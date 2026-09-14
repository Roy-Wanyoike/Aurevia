import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { requireTenant } from "@/lib/aurevia/auth/tenant";

export const dynamic = "force-dynamic";

// GET /api/v1/signals — recent signals (optionally filtered by symbol / strategy).
//
// Pagination (Issue #126): `?page=1&limit=20` returns a paginated slice. When
// neither param is supplied the response is the full list (backward
// compatible — the existing hooks and tests use the unpaginated shape).
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  // Issue #97 — resolve tenant context at the API boundary. The store is
  // currently a singleton, so `tenant` is a passthrough here; once per-tenant
  // facades exist, the caller's organization will scope the signal log.
  const tenant = await requireTenant();
  try {
    logger.debug("Signals list requested", {
      requestId: req.headers.get("x-request-id") ?? "unknown",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
    });
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");
    const strategy = url.searchParams.get("strategy");
    let signals = store.signals;
    if (symbol) signals = signals.filter((s) => s.symbol === symbol.toUpperCase());
    if (strategy) signals = signals.filter((s) => s.strategyKey === strategy);

    const page = Number(url.searchParams.get("page") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 0);
    if (page > 0 && limit > 0) {
      const offset = (page - 1) * limit;
      const sliced = signals.slice(offset, offset + limit);
      const paginated = sliced.map((s) => ({ ...s, risk: store.evaluateSignal(s) }));
      return NextResponse.json({
        data: paginated,
        signals: paginated, // mirror key for backward compat
        pagination: {
          page,
          limit,
          total: signals.length,
          totalPages: Math.ceil(signals.length / limit),
        },
      });
    }

    // No pagination — return all (backward compatible). Each signal carries
    // a risk evaluation snapshot so the UI can show APPROVED vs REJECTED.
    const enriched = signals.slice(0, 100).map((s) => ({
      ...s,
      risk: store.evaluateSignal(s),
    }));
    return NextResponse.json({ signals: enriched, total: signals.length });
  } catch (e: any) {
    logger.error("Signals GET failed", { error: e?.message ?? "unknown" });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}

// POST /api/v1/signals — run a fresh scan across the universe.
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const t0 = Date.now();
    const newSignals = store.scanSignals();
    const enriched = newSignals.map((s) => ({ ...s, risk: store.evaluateSignal(s) }));
    const approved = enriched.filter((s) => s.risk?.decision === "APPROVED").length;
    const rejected = enriched.filter((s) => s.risk?.decision === "REJECTED").length;
    const paused = enriched.filter((s) => s.risk?.decision === "PAUSED").length;
    logger.info("Signal scan completed", {
      requestId,
      action: "scan",
      status: "OK",
      universeSize: store.assetCatalog.length,
      signalsEmitted: newSignals.length,
      approved,
      rejected,
      paused,
      durationMs: Date.now() - t0,
    });
    return NextResponse.json({ scanned: store.assetCatalog.length, newSignals: enriched });
  } catch (e: any) {
    logger.error("Signal scan failed", {
      requestId,
      action: "scan",
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
