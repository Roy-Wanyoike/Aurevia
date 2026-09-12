import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia Market Pulse (issue #43).
//
// One-shot global market health snapshot computed across the whole tradeable
// universe (18 assets). Reads the same `store.buildContext()` data the rest
// of the app already trusts — no hardcoded numbers, no external API.
//
// Returns:
//   - advancers / decliners / unchanged (by sign of 24h changePct)
//   - sectors[]: per-sector average 24h changePct
//   - breadth: % of assets above their SMA50 / SMA200
//   - regimeDist: count of assets per regime
//   - fearGreed: 0..100 composite (100 = extreme greed, 0 = extreme fear)
//   - totalAssets: universe size at compute time
// ---------------------------------------------------------------------------

export async function GET() {
  const requestId = "market-pulse";
  try {
    const assets = store.assetCatalog;
    let advancers = 0, decliners = 0, unchanged = 0;
    const sectorPerf: Record<string, { count: number; totalChange: number }> = {};
    let aboveSma50 = 0, aboveSma200 = 0, totalWithIndicators = 0;
    const regimeDist: Record<string, number> = {};
    for (const a of assets) {
      const ctx = store.buildContext(a.symbol, 300);
      if (!ctx) continue;
      if (ctx.quote.changePct > 0) advancers++;
      else if (ctx.quote.changePct < 0) decliners++;
      else unchanged++;
      const sector = a.sector ?? "Other";
      if (!sectorPerf[sector]) sectorPerf[sector] = { count: 0, totalChange: 0 };
      sectorPerf[sector].count++;
      sectorPerf[sector].totalChange += ctx.quote.changePct;
      if (ctx.indicators.sma50 && ctx.quote.price > ctx.indicators.sma50) aboveSma50++;
      if (ctx.indicators.sma200 && ctx.quote.price > ctx.indicators.sma200) aboveSma200++;
      totalWithIndicators++;
      regimeDist[ctx.regime] = (regimeDist[ctx.regime] ?? 0) + 1;
    }
    const sectors = Object.entries(sectorPerf).map(([name, d]) => ({
      name,
      avgChange: d.totalChange / d.count,
      count: d.count,
    }));
    const breadth = {
      aboveSma50Pct: totalWithIndicators > 0 ? (aboveSma50 / totalWithIndicators) * 100 : 0,
      aboveSma200Pct: totalWithIndicators > 0 ? (aboveSma200 / totalWithIndicators) * 100 : 0,
    };
    // Fear/Greed: 100 = extreme greed, 0 = extreme fear.
    // Blends advancer participation (50% weight) with breadth above SMA50
    // (50% weight) — both are fast-moving breadth signals that capture the
    // current risk appetite of the universe.
    const advancerRatio = assets.length > 0 ? advancers / assets.length : 0.5;
    const fearGreed = Math.round(
      Math.max(0, Math.min(100, advancerRatio * 50 + breadth.aboveSma50Pct * 0.5)),
    );

    logger.info("Market pulse computed", {
      requestId,
      universeSize: assets.length,
      advancers,
      decliners,
      fearGreed,
    });

    return NextResponse.json({
      advancers,
      decliners,
      unchanged,
      sectors,
      breadth,
      regimeDist,
      fearGreed,
      totalAssets: assets.length,
    });
  } catch (e: any) {
    logger.error("Market pulse failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    store.health.apiErrors++;
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
