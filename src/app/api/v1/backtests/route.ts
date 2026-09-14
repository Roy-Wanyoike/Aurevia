import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { z } from "zod";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { requireTenant } from "@/lib/aurevia/auth/tenant";
import { logger } from "@/lib/aurevia/logger";
import { captureExperimentMetadata } from "@/lib/aurevia/research/metadata";

export const dynamic = "force-dynamic";

const RunSchema = z.object({
  strategyKey: z.string().min(1),
  symbol: z.string().min(1),
  timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]).default("1d"),
  bars: z.number().int().min(60).max(2000).default(500),
  initialCapital: z.number().positive().default(100000),
  commissionBps: z.number().min(0).optional(),
  slippageBps: z.number().min(0).optional(),
  positionPct: z.number().min(0.01).max(1).optional(),
  allowShort: z.boolean().optional(),
  stopLossPct: z.number().min(0).max(0.5).optional(),
  takeProfitPct: z.number().min(0).max(2).optional(),
});

// GET /api/v1/backtests — list previous backtest results (summary only).
//
// Pagination (Issue #126): `?page=1&limit=20` returns a paginated slice. When
// neither param is supplied the response is the full list (backward
// compatible — the existing hooks and tests use the unpaginated shape).
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  // Issue #97 — resolve tenant context at the API boundary. The store is
  // currently a singleton, so `tenant` is a passthrough here; once per-tenant
  // facades exist, the caller's organization will scope the backtest list.
  const tenant = await requireTenant();
  try {
    logger.debug("Backtest history requested", {
      requestId: req.headers.get("x-request-id") ?? "unknown",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
    });

    const url = new URL(req.url);
    const summaries = store.backtests.map((b) => ({
      id: b.id,
      strategyKey: b.strategyKey,
      symbol: b.symbol,
      timeframe: b.timeframe,
      startDate: b.startDate,
      endDate: b.endDate,
      initialCapital: b.initialCapital,
      finalEquity: b.finalEquity,
      metrics: b.metrics,
      numTrades: b.trades.length,
      status: b.status,
      createdAt: b.createdAt,
    }));

    const page = Number(url.searchParams.get("page") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 0);
    if (page > 0 && limit > 0) {
      const offset = (page - 1) * limit;
      const paginated = summaries.slice(offset, offset + limit);
      return NextResponse.json({
        data: paginated,
        backtests: paginated, // mirror key for backward compat
        pagination: {
          page,
          limit,
          total: summaries.length,
          totalPages: Math.ceil(summaries.length / limit),
        },
      });
    }

    // No pagination — return all (backward compatible).
    return NextResponse.json({
      backtests: summaries,
      total: store.backtests.length,
    });
  } catch (e: any) {
    logger.error("Backtests GET failed", { error: e?.message ?? "unknown" });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}

// POST /api/v1/backtests — run a new backtest.
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const parsed = RunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const result = store.runBacktest(parsed.data);
    // Issue #113 — attach reproducibility metadata to the in-memory record so
    // the run can be replayed bit-for-bit. The Prisma Backtest row carries
    // the same four columns; when the store moves off in-memory, the same
    // object can be persisted without reshaping.
    const meta = captureExperimentMetadata(parsed.data);
    result.codeVersion = meta.codeVersion;
    result.parameters = meta.parameters;
    result.randomSeed = meta.randomSeed;
    result.environment = meta.environment;
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
