import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/journal
//
// Aggregates every FILLED order into a journal of executed trades. For each
// fill we re-derive the market context at fill time (regime, trend direction,
// volatility) so the journal is a behavioral record — not just an order log.
// Returns overall analytics (trades by regime, by strategy, total count) so
// the view can render the same summaries server-side. (Issue #54.)
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const requestId = "journal";
  try {
    const orders = store.orders.filter((o) => o.status === "FILLED");
    const entries = orders.map((o) => {
      const ctx = store.buildContext(o.symbol, 300);
      return {
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        quantity: o.filledQty ?? o.quantity,
        filledPrice: o.filledPrice ?? 0,
        strategyKey: o.strategyKey ?? "manual",
        reason: o.reason ?? "Manual order",
        regime: ctx?.regime ?? "UNKNOWN",
        trend: ctx?.trend.direction ?? "FLAT",
        volatility: ctx?.trend.volatility ?? 0,
        createdAt: o.createdAt,
      };
    });

    const byRegime: Record<string, number> = {};
    const byStrategy: Record<string, number> = {};
    for (const e of entries) {
      byRegime[e.regime] = (byRegime[e.regime] ?? 0) + 1;
      byStrategy[e.strategyKey] = (byStrategy[e.strategyKey] ?? 0) + 1;
    }

    logger.info("Journal aggregated", {
      requestId,
      status: "OK",
      trades: entries.length,
      regimes: Object.keys(byRegime).length,
      strategies: Object.keys(byStrategy).length,
    });

    return NextResponse.json({
      entries,
      analytics: { byRegime, byStrategy, totalTrades: entries.length },
    });
  } catch (e: any) {
    logger.error("Journal aggregation failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    return NextResponse.json(
      { error: e?.message ?? "unknown" },
      { status: 500 },
    );
  }
}
