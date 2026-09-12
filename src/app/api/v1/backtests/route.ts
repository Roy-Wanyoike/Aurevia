import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { z } from "zod";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";

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
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({
      backtests: store.backtests.map((b) => ({
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
      })),
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
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
