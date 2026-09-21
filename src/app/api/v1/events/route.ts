import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia Market Events calendar (issue #47).
//
// No real earnings / dividend API key is wired, so we generate upcoming
// synthetic events based on the asset calendar: equities get monthly
// earnings + dividend events; crypto gets halving + upgrade events.
// Each event carries a type, symbol, title, description, importance and
// scheduled-at timestamp. Output is CLEARLY LABELED `isSynthetic: true`.
// Swapping the generator for a Finnhub calendar feed later is a
// one-function change.
//
// GET /api/v1/events                  — all equity + crypto events
// GET /api/v1/events?symbol=AAPL      — single-asset events
// ---------------------------------------------------------------------------

export type EventType = "earnings" | "dividend" | "halving" | "upgrade";

export interface MarketEvent {
  id: string;
  type: EventType;
  symbol: string;
  title: string;
  description: string;
  importance: "high" | "medium" | "low";
  scheduledAt: number;
  isSynthetic: true;
}

// Deterministic pseudo-random offset within a window — keyed by symbol so the
// same asset always gets the same relative dates within a session. Using
// Math.random() would shift the calendar on every refetch (every 60s), making
// the UI jittery. Hashing the symbol + a per-asset nonce keeps events stable
// for the lifetime of the process.
function hashOffset(seed: string, max: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % max;
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "events";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");
    const assets = symbol
      ? store.assetCatalog.filter((a) => a.symbol === symbol.toUpperCase())
      : store.assetCatalog.filter((a) => a.assetType === "equity" || a.assetType === "crypto");
    const now = Date.now();
    const events: MarketEvent[] = [];

    for (const a of assets) {
      const ctx = store.buildContext(a.symbol, 300);
      if (!ctx) continue;

      // Two upcoming events per asset — one near-term (3-17 days), one
      // mid-term (17-31 days). Event type depends on asset class:
      //   equity → earnings (near) + dividend (mid)
      //   crypto → halving (near) + upgrade (mid)
      const daysAhead1 = 3 + hashOffset(`${a.symbol}-n1`, 14);
      const daysAhead2 = 17 + hashOffset(`${a.symbol}-n2`, 14);
      const eventType1: EventType = a.assetType === "equity" ? "earnings" : "halving";
      const eventType2: EventType = a.assetType === "equity" ? "dividend" : "upgrade";

      events.push({
        id: `evt-${a.symbol}-${daysAhead1}`,
        type: eventType1,
        symbol: a.symbol,
        title: `${a.symbol} ${eventType1} event`,
        description:
          `Scheduled ${eventType1} for ${a.name}. Current regime: ${ctx.regime}. ` +
          `Volatility: ${(ctx.trend.volatility * 100).toFixed(0)}%.`,
        importance: Math.abs(ctx.quote.changePct) > 2 ? "high" : "medium",
        scheduledAt: now + daysAhead1 * 86_400_000,
        isSynthetic: true,
      });
      events.push({
        id: `evt-${a.symbol}-${daysAhead2}`,
        type: eventType2,
        symbol: a.symbol,
        title: `${a.symbol} ${eventType2} announcement`,
        description: `${a.symbol} ${eventType2} event scheduled.`,
        importance: "low",
        scheduledAt: now + daysAhead2 * 86_400_000,
        isSynthetic: true,
      });
    }

    events.sort((a, b) => a.scheduledAt - b.scheduledAt);
    logger.info("Events generated", {
      requestId,
      symbol: symbol ?? "all",
      count: events.length,
      status: "OK",
    });
    return NextResponse.json({
      events,
      total: events.length,
      source: "Aurevia Calendar (synthetic)",
    });
  } catch (e: any) {
    logger.error("Events GET failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    store.health.apiErrors++;
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
