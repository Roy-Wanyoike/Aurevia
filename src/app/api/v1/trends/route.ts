import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/trends — trend distribution + per-asset trend snapshot.
export async function GET() {
  try {
    const rows = store.assetCatalog.map((a) => {
      const ctx = store.buildContext(a.symbol, 300);
      if (!ctx) return null;
      return {
        symbol: a.symbol,
        name: a.name,
        price: ctx.quote.price,
        changePct: ctx.quote.changePct,
        direction: ctx.trend.direction,
        strength: Math.round(ctx.trend.strength * 100) / 100,
        durationBars: ctx.trend.durationBars,
        momentum: Math.round(ctx.trend.momentum * 1000) / 10,
        volatility: Math.round(ctx.trend.volatility * 100) / 100,
        drawdown: Math.round(ctx.trend.drawdown * 1000) / 10,
        support: Math.round(ctx.trend.support * 100) / 100,
        resistance: Math.round(ctx.trend.resistance * 100) / 100,
        breakout: ctx.trend.breakout,
        breakdown: ctx.trend.breakdown,
        regime: ctx.regime,
      };
    }).filter(Boolean);
    const distribution = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r!.direction] = (acc[r!.direction] ?? 0) + 1;
      return acc;
    }, {});
    return NextResponse.json({ rows, distribution });
  } catch (e: any) {
    logger.error("Trends GET failed", { error: e?.message ?? "unknown" });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
