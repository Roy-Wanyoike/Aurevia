import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// Aurevia Market Pulse (#43) — returns MarketPulseData shape matching the
// useMarketPulse() hook interface in hooks.ts.

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const assets = store.assetCatalog;
    let advancers = 0, decliners = 0, unchanged = 0;
    const sectorPerf: Record<string, { count: number; totalChange: number }> = {};
    let aboveSma50 = 0, aboveSma200 = 0, totalWithIndicators = 0;
    const regimeDist: Record<string, number> = {};
    let totalChange = 0;
    let totalVolatility = 0;

    for (const a of assets) {
      const ctx = store.buildContext(a.symbol, 300);
      if (!ctx) continue;
      if (ctx.quote.changePct > 0) advancers++;
      else if (ctx.quote.changePct < 0) decliners++;
      else unchanged++;
      totalChange += ctx.quote.changePct;
      totalVolatility += ctx.trend.volatility;
      const sector = a.sector ?? "Other";
      if (!sectorPerf[sector]) sectorPerf[sector] = { count: 0, totalChange: 0 };
      sectorPerf[sector].count++;
      sectorPerf[sector].totalChange += ctx.quote.changePct;
      if (ctx.indicators.sma50 && ctx.quote.price > ctx.indicators.sma50) aboveSma50++;
      if (ctx.indicators.sma200 && ctx.quote.price > ctx.indicators.sma200) aboveSma200++;
      totalWithIndicators++;
      regimeDist[ctx.regime] = (regimeDist[ctx.regime] ?? 0) + 1;
    }

    const pctAboveSma50 = totalWithIndicators > 0 ? (aboveSma50 / totalWithIndicators) * 100 : 0;
    const pctAboveSma200 = totalWithIndicators > 0 ? (aboveSma200 / totalWithIndicators) * 100 : 0;
    const avgChange = assets.length > 0 ? totalChange / assets.length : 0;
    const avgVolatility = assets.length > 0 ? totalVolatility / assets.length : 0;

    // Fear/Greed components (each 0-100)
    const breadthScore = pctAboveSma50;
    const momentumScore = Math.max(0, Math.min(100, 50 + avgChange * 10));
    const volatilityScore = Math.max(0, Math.min(100, 100 - avgVolatility * 100));
    const score = Math.round((breadthScore + momentumScore + volatilityScore) / 3);

    const label = score >= 75 ? "Extreme Greed" :
                  score >= 55 ? "Greed" :
                  score >= 45 ? "Neutral" :
                  score >= 25 ? "Fear" : "Extreme Fear";

    const regimeDistribution = Object.entries(regimeDist)
      .sort((a, b) => b[1] - a[1])
      .map(([regime, count]) => ({
        regime,
        count,
        pct: assets.length > 0 ? (count / assets.length) * 100 : 0,
      }));

    const sectorPerformance = Object.entries(sectorPerf)
      .map(([sector, d]) => ({
        sector,
        avgChangePct: d.count > 0 ? d.totalChange / d.count : 0,
        count: d.count,
      }))
      .sort((a, b) => b.avgChangePct - a.avgChangePct);

    logger.info("Market pulse computed", { universeSize: assets.length, advancers, decliners, fearGreed: score });

    return NextResponse.json({
      advancers,
      decliners,
      unchanged,
      total: assets.length,
      breadth: {
        aboveSma50,
        aboveSma200,
        pctAboveSma50,
        pctAboveSma200,
      },
      regimeDistribution,
      sectorPerformance,
      fearGreed: {
        score,
        label,
        components: {
          breadth: Math.round(breadthScore),
          momentum: Math.round(momentumScore),
          volatility: Math.round(volatilityScore),
        },
      },
      computedAt: Date.now(),
    });
  } catch (e: any) {
    logger.error("Market pulse failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
