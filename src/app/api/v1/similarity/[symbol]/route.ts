import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { computeIndicators } from "@/lib/aurevia/quant/indicators";
import { detectTrend } from "@/lib/aurevia/quant/trend";
import { detectRegime } from "@/lib/aurevia/quant/regime";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia Historical Memory — Similarity Search (issue #45).
//
// For a given symbol we compute a feature vector at the current bar:
//   - rsi           : RSI14 normalized to 0..1
//   - momentum      : 10-bar ROC clipped to [-1, 1]
//   - macdHist      : MACD histogram, scaled by 2% of price, clipped [-1, 1]
//   - trendStrength : 0..1 from detectTrend
//   - volatility    : annualized log-return std, clipped to [0, 1]
//
// Then we slide a 60-bar window across history (stepping every 5 bars to keep
// the work bounded) and compute the SAME feature vector at each historical
// bar. Euclidean distance between current and historical vectors is mapped
// to a 0..1 similarity score via `max(0, 1 - dist / 2.5)`.
//
// For each match we also record the forward 5-bar and 20-bar returns, so the
// UI can show "when the market looked like this before, here's what happened
// next." The top 15 matches by similarity are returned along with summary
// stats (avg / median / win-rate of forward returns).
//
// All numbers derive from the deterministic simulated feed — same input ⇒
// same output, never hardcoded. Past performance is not predictive.
// ---------------------------------------------------------------------------

interface FeatureVec {
  rsi: number;
  momentum: number;
  macdHist: number;
  trendStrength: number;
  volatility: number;
}

function featuresFrom(
  indicators: ReturnType<typeof computeIndicators>,
  trend: ReturnType<typeof detectTrend>,
  price: number,
): FeatureVec {
  return {
    rsi: indicators.rsi14 / 100,
    momentum: Math.max(-1, Math.min(1, trend.momentum * 10)),
    macdHist: Math.max(-1, Math.min(1, indicators.macdHist / (price * 0.02))),
    trendStrength: trend.strength,
    volatility: Math.min(1, trend.volatility),
  };
}

function euclideanSimilarity(a: FeatureVec, b: FeatureVec): number {
  const dist = Math.sqrt(
    Math.pow(a.rsi - b.rsi, 2) +
      Math.pow(a.momentum - b.momentum, 2) +
      Math.pow(a.macdHist - b.macdHist, 2) +
      Math.pow(a.trendStrength - b.trendStrength, 2) +
      Math.pow(a.volatility - b.volatility, 2),
  );
  // 2.5 is the normalization constant — the maximum plausible distance for
  // this feature set, so distances >2.5 floor at 0 similarity.
  return Math.max(0, 1 - dist / 2.5);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const requestId = (req.headers.get("x-request-id") ?? "similarity") as string;
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const { symbol } = await params;
    const sym = symbol.toUpperCase();
    const candles = store.getCandles(sym, 300);
    if (candles.length < 60) {
      return NextResponse.json({ error: "Insufficient data" }, { status: 422 });
    }

    const currentCtx = store.buildContext(sym, 300);
    if (!currentCtx) {
      return NextResponse.json({ error: `Unknown symbol: ${sym}` }, { status: 404 });
    }

    const currentFeatures = featuresFrom(
      currentCtx.indicators,
      currentCtx.trend,
      currentCtx.quote.price,
    );

    const matches: {
      time: number;
      similarity: number;
      forwardReturn5d: number;
      forwardReturn20d: number;
      regime: string;
    }[] = [];

    // Slide a 60-bar window across history. Step by 5 to bound computation —
    // sampling every 5th bar gives ~45 candidates from 300 bars, enough for a
    // stable top-15 without burning 300 indicator recomputations.
    for (let i = 60; i < candles.length - 20; i += 5) {
      const prefix = candles.slice(0, i + 1);
      const indicators = computeIndicators(prefix);
      const trend = detectTrend(prefix);
      const regime = detectRegime(prefix);
      const feats = featuresFrom(indicators, trend, prefix[i].close);

      const similarity = euclideanSimilarity(currentFeatures, feats);

      const entryPrice = candles[i].close;
      const fwd5 =
        i + 5 < candles.length
          ? (candles[i + 5].close - entryPrice) / entryPrice
          : 0;
      const fwd20 =
        i + 20 < candles.length
          ? (candles[i + 20].close - entryPrice) / entryPrice
          : 0;

      matches.push({
        time: candles[i].time,
        similarity,
        forwardReturn5d: fwd5,
        forwardReturn20d: fwd20,
        regime,
      });
    }

    // Sort by similarity desc, take top 15.
    const top = matches
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 15);

    // Summary stats — mean, median, win-rate. medians sort in place so we
    // copy first to avoid mutating the returned array.
    const sorted5 = [...top].sort((a, b) => a.forwardReturn5d - b.forwardReturn5d);
    const sorted20 = [...top].sort((a, b) => a.forwardReturn20d - b.forwardReturn20d);

    const avg5 = top.reduce((s, m) => s + m.forwardReturn5d, 0) / top.length;
    const avg20 = top.reduce((s, m) => s + m.forwardReturn20d, 0) / top.length;
    const winRate5 = top.filter((m) => m.forwardReturn5d > 0).length / top.length * 100;
    const winRate20 = top.filter((m) => m.forwardReturn20d > 0).length / top.length * 100;
    const median5 = sorted5[Math.floor(top.length / 2)]?.forwardReturn5d ?? 0;
    const median20 = sorted20[Math.floor(top.length / 2)]?.forwardReturn20d ?? 0;

    logger.info("Similarity search computed", {
      requestId,
      symbol: sym,
      candidates: matches.length,
      top: top.length,
      avgForwardReturn5d: avg5,
      avgForwardReturn20d: avg20,
      status: "OK",
    });

    return NextResponse.json({
      symbol: sym,
      currentFeatures,
      currentRegime: currentCtx.regime,
      matches: top,
      stats: {
        sampleCount: top.length,
        avgForwardReturn5d: avg5,
        avgForwardReturn20d: avg20,
        winRate5d: winRate5,
        winRate20d: winRate20,
        medianReturn5d: median5,
        medianReturn20d: median20,
      },
      disclaimer:
        "Historical evidence, not prediction. Past performance does not guarantee future results.",
    });
  } catch (e: any) {
    logger.error("Similarity search failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    store.health.apiErrors++;
    return NextResponse.json(
      { error: "internal_error", requestId },
      { status: 500 },
    );
  }
}
