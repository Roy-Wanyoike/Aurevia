import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia Opportunity Radar (issue #49).
//
// Scans the tradeable universe and categorizes each asset into one or more
// opportunity buckets. An asset can appear in multiple buckets — e.g. a
// name that is breaking out AND has strong momentum appears in both lists.
// Risk events are flagged separately so the user sees the universe's red
// flags alongside its green ones.
//
// Categories (per spec):
//   - breakouts      : trend.breakout === true
//   - momentum       : trend.momentum > 0.02 && 50 <= RSI14 <= 70
//   - meanReversion  : price < bollingerLower && RSI14 < 35
//   - trendFollowing : price > sma20 > sma50 && ADX14 > 25
//   - riskEvents     : trend.volatility > 0.5 || trend.drawdown > 0.08
//
// Each opportunity carries a conviction score (0..1) and a risk score
// (0..1) so the UI can sort within each category. Conviction is a blend of
// the strongest signals for that category; risk is max(volatility, drawdown)
// scaled. No hard-coded data — every figure derives from store.buildContext.
// ---------------------------------------------------------------------------

interface Opportunity {
  symbol: string;
  name: string;
  assetType: string;
  sector?: string;
  price: number;
  conviction: number; // 0..1
  risk: number;       // 0..1
  reason: string;
}
interface Category {
  opportunities: Opportunity[];
}
interface RadarResponse {
  categories: {
    breakouts: Category;
    momentum: Category;
    meanReversion: Category;
    trendFollowing: Category;
    riskEvents: Category;
  };
  scannedAt: number;
  universeSize: number;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const requestId = "radar";
  try {
    const breakouts: Opportunity[] = [];
    const momentum: Opportunity[] = [];
    const meanReversion: Opportunity[] = [];
    const trendFollowing: Opportunity[] = [];
    const riskEvents: Opportunity[] = [];

    for (const asset of store.assetCatalog) {
      const ctx = store.buildContext(asset.symbol, 300);
      if (!ctx) continue;
      const { quote, indicators, trend } = ctx;
      const price = quote.price;

      // Risk score: max(volatility, drawdown) — both already 0..1-ish, but
      // we clamp to be safe. Drawdown is always 0..1; volatility from
      // detectTrend is annualized log-return std which we cap at 1 (100%).
      const riskScore = clamp01(Math.max(trend.volatility, trend.drawdown));

      // --- Breakouts (trend.breakout) -----------------------------------------
      if (trend.breakout) {
        const conviction = clamp01(
          0.4 + trend.strength * 0.4 + clamp01(indicators.adx14 / 50) * 0.2,
        );
        breakouts.push({
          symbol: asset.symbol,
          name: asset.name,
          assetType: asset.assetType,
          sector: asset.sector,
          price,
          conviction,
          risk: riskScore,
          reason: `Breakout above resistance ${ctx.trend.resistance.toFixed(2)} · ADX ${indicators.adx14.toFixed(0)}`,
        });
      }

      // --- Momentum (10-bar ROC in 2..∞ band, RSI in 50..70 healthy zone) -----
      if (trend.momentum > 0.02 && indicators.rsi14 >= 50 && indicators.rsi14 <= 70) {
        const conviction = clamp01(
          0.3 + Math.min(1, trend.momentum * 8) * 0.4 + (indicators.rsi14 - 50) / 100,
        );
        momentum.push({
          symbol: asset.symbol,
          name: asset.name,
          assetType: asset.assetType,
          sector: asset.sector,
          price,
          conviction,
          risk: riskScore,
          reason: `Momentum +${(trend.momentum * 100).toFixed(1)}% · RSI ${indicators.rsi14.toFixed(0)}`,
        });
      }

      // --- Mean Reversion (price < bollingerLower && RSI < 35 oversold) -------
      if (price < indicators.bollingerLower && indicators.rsi14 < 35) {
        const conviction = clamp01(
          0.4 + (35 - indicators.rsi14) / 100 + clamp01((indicators.bollingerLower - price) / price * 50) * 0.2,
        );
        meanReversion.push({
          symbol: asset.symbol,
          name: asset.name,
          assetType: asset.assetType,
          sector: asset.sector,
          price,
          conviction,
          risk: riskScore,
          reason: `Below BB lower ${indicators.bollingerLower.toFixed(2)} · RSI ${indicators.rsi14.toFixed(0)}`,
        });
      }

      // --- Trend Following (price > sma20 > sma50 && ADX > 25) -----------------
      if (
        price > indicators.sma20 &&
        indicators.sma20 > indicators.sma50 &&
        indicators.adx14 > 25
      ) {
        const conviction = clamp01(
          0.3 + clamp01((indicators.adx14 - 25) / 25) * 0.4 + trend.strength * 0.3,
        );
        trendFollowing.push({
          symbol: asset.symbol,
          name: asset.name,
          assetType: asset.assetType,
          sector: asset.sector,
          price,
          conviction,
          risk: riskScore,
          reason: `Stacked SMAs · ADX ${indicators.adx14.toFixed(0)} · ${trend.direction}`,
        });
      }

      // --- Risk Events (volatility > 0.5 OR drawdown > 8%) --------------------
      if (trend.volatility > 0.5 || trend.drawdown > 0.08) {
        riskEvents.push({
          symbol: asset.symbol,
          name: asset.name,
          assetType: asset.assetType,
          sector: asset.sector,
          price,
          conviction: riskScore, // for risk events, "conviction" is the risk level
          risk: riskScore,
          reason: `Vol ${(trend.volatility * 100).toFixed(0)}% · DD ${(trend.drawdown * 100).toFixed(1)}%`,
        });
      }
    }

    // Sort each category by conviction desc so the strongest signal shows
    // first in the UI.
    const sortDesc = (a: Opportunity, b: Opportunity) => b.conviction - a.conviction;
    breakouts.sort(sortDesc);
    momentum.sort(sortDesc);
    meanReversion.sort(sortDesc);
    trendFollowing.sort(sortDesc);
    riskEvents.sort(sortDesc);

    const response: RadarResponse = {
      categories: {
        breakouts: { opportunities: breakouts },
        momentum: { opportunities: momentum },
        meanReversion: { opportunities: meanReversion },
        trendFollowing: { opportunities: trendFollowing },
        riskEvents: { opportunities: riskEvents },
      },
      scannedAt: Date.now(),
      universeSize: store.assetCatalog.length,
    };

    logger.info("Radar scan computed", {
      requestId,
      universeSize: response.universeSize,
      breakouts: breakouts.length,
      momentum: momentum.length,
      meanReversion: meanReversion.length,
      trendFollowing: trendFollowing.length,
      riskEvents: riskEvents.length,
      status: "OK",
    });

    return NextResponse.json(response);
  } catch (e: any) {
    logger.error("Radar scan failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    store.health.apiErrors++;
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
