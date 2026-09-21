import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia News Intelligence (issue #46).
//
// No real news API key is wired, so we generate market-aware synthetic news
// from the current market data: each asset's changePct, regime, RSI, trend
// strength and volatility are projected into a headline + summary + sentiment
// score + importance rating. Output is CLEARLY LABELED as synthetic
// "AI-generated market commentary based on current data, not real news
// articles." Swapping the generator for a Finnhub / Polygon / Tiingo feed
// later is a one-function change.
//
// GET /api/v1/news                  — top 10 most-active assets
// GET /api/v1/news?symbol=AAPL      — single-asset commentary
// ---------------------------------------------------------------------------

export interface NewsArticle {
  id: string;
  headline: string;
  summary: string;
  source: string;
  symbol: string;
  sentiment: number; // -1..1
  importance: "high" | "medium" | "low";
  publishedAt: number;
  isSynthetic: true;
}

const IMPORTANCE_RANK: Record<NewsArticle["importance"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function buildHeadline(
  symbol: string,
  changePct: number,
  regime: string,
  rsi: number,
): { headline: string; sentiment: number } {
  let headline = "";
  let sentiment = 0;
  if (changePct > 2) {
    headline = `${symbol} surges ${changePct.toFixed(1)}% as momentum builds`;
    sentiment = 0.7;
  } else if (changePct > 0.5) {
    headline = `${symbol} advances amid ${regime.toLowerCase()} conditions`;
    sentiment = 0.3;
  } else if (changePct < -2) {
    headline = `${symbol} drops ${Math.abs(changePct).toFixed(1)}% as selling pressure mounts`;
    sentiment = -0.7;
  } else if (changePct < -0.5) {
    headline = `${symbol} declines in ${regime.toLowerCase()} regime`;
    sentiment = -0.3;
  } else {
    headline = `${symbol} steady as market digests ${regime.toLowerCase()} signals`;
    sentiment = 0;
  }
  if (rsi > 70) {
    headline += "; RSI signals overbought conditions";
    sentiment -= 0.2;
  } else if (rsi < 30) {
    headline += "; RSI suggests oversold bounce potential";
    sentiment += 0.2;
  }
  return { headline, sentiment };
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "news";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");
    const assets = symbol
      ? store.assetCatalog.filter((a) => a.symbol === symbol.toUpperCase())
      : store.assetCatalog.slice(0, 10); // top 10 most active

    const articles: NewsArticle[] = [];
    for (const a of assets) {
      const ctx = store.buildContext(a.symbol, 300);
      if (!ctx) continue;
      const change = ctx.quote.changePct;
      const regime = ctx.regime;
      const rsi = ctx.indicators.rsi14;
      const { headline, sentiment } = buildHeadline(a.symbol, change, regime, rsi);
      const importance: NewsArticle["importance"] =
        Math.abs(change) > 2 ? "high" : Math.abs(change) > 0.5 ? "medium" : "low";
      articles.push({
        id: `news-${a.symbol}-${Date.now()}`,
        headline,
        summary:
          `${a.name} (${a.symbol}) is currently in a ${regime} regime with RSI at ${rsi.toFixed(0)}, ` +
          `trend strength at ${(ctx.trend.strength * 100).toFixed(0)}%, and ${ctx.trend.direction.toLowerCase()} momentum. ` +
          `Volatility is ${(ctx.trend.volatility * 100).toFixed(0)}% annualized.`,
        source: "Aurevia Market Intelligence",
        symbol: a.symbol,
        sentiment: Math.round(sentiment * 100) / 100,
        importance,
        publishedAt: Date.now(),
        isSynthetic: true,
      });
    }
    // Sort by importance (high first) then by abs(sentiment)
    articles.sort((a, b) => {
      if (IMPORTANCE_RANK[b.importance] !== IMPORTANCE_RANK[a.importance]) {
        return IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance];
      }
      return Math.abs(b.sentiment) - Math.abs(a.sentiment);
    });
    logger.info("News generated", {
      requestId,
      symbol: symbol ?? "all",
      count: articles.length,
      status: "OK",
    });
    return NextResponse.json({
      articles,
      total: articles.length,
      source: "Aurevia Market Intelligence (synthetic)",
    });
  } catch (e: any) {
    logger.error("News GET failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    store.health.apiErrors++;
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
