import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia Market Replay (issue #50).
//
// POST /api/v1/replay
//   body: { action: "start" | "next" | "trade" | "state", ... }
//
// A bar-by-bar replay trainer: the operator picks a symbol, a number of
// historical bars to seed the replay, and a starting capital. The session
// begins with the first 60 bars visible; each `next` call advances the
// cursor by N bars (default 1). A trade ticket (BUY/SELL + qty) lets the
// user practice execution against historical prices — orders fill at the
// close of the bar at the cursor (no look-ahead).
//
// Sessions are in-memory and per-process. There is no per-client session
// management — the most recently created session is the active one. This
// is a training tool, not a paper-trading replacement; the live portfolio
// in /api/v1/portfolio is never touched.
// ---------------------------------------------------------------------------

const ReplaySchema = z.object({
  action: z.enum(["start", "next", "trade", "state"]),
  symbol: z.string().min(1).max(20).optional(),
  bars: z.number().int().min(60).max(2000).optional(),
  cursor: z.number().int().optional(),
  side: z.enum(["BUY", "SELL"]).optional(),
  quantity: z.number().positive().optional(),
  capital: z.number().positive().optional(),
});

interface ReplayPosition {
  side: string;
  qty: number;
  price: number;
}

interface ReplayTrade {
  side: string;
  qty: number;
  price: number;
  time: number;
  bar: number;
}

interface ReplaySession {
  symbol: string;
  cursor: number;
  totalBars: number;
  capital: number;
  cash: number;
  positions: ReplayPosition[];
  trades: ReplayTrade[];
}

// In-memory replay sessions (per-process). The most recently created session
// is the active one — this is a training tool, not a multi-user service.
const sessions = new Map<string, ReplaySession>();

function getActiveSession(): ReplaySession | null {
  // Use the most recently inserted session. Values() iteration order is
  // insertion order per the Map spec.
  const arr = Array.from(sessions.values());
  return arr.length > 0 ? arr[arr.length - 1] : null;
}

function serializeSessionState(session: ReplaySession) {
  const candles = store.getCandles(session.symbol, session.totalBars);
  const visibleCandles = candles.slice(0, session.cursor);
  const currentPrice = candles[session.cursor - 1]?.close ?? 0;
  return {
    sessionIdHint: sessions.size,
    symbol: session.symbol,
    cursor: session.cursor,
    totalBars: session.totalBars,
    currentPrice,
    cash: Math.round(session.cash * 100) / 100,
    capital: session.capital,
    positions: session.positions,
    trades: session.trades,
    visibleCandles: visibleCandles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    })),
  };
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ReplaySchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Replay rejected: invalid request", {
        requestId,
        status: "INVALID",
        errors: parsed.error.issues?.map((i) => i.message) ?? [],
      });
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }
    const { action, symbol, bars, cursor, side, quantity, capital } = parsed.data;

    // --- start ---------------------------------------------------------------
    if (action === "start") {
      if (!symbol) {
        return NextResponse.json({ error: "symbol required" }, { status: 400 });
      }
      const upper = symbol.toUpperCase();
      // Reject unknown symbols — silently accepting them would render an empty
      // chart with no helpful error message.
      const known = store.assetCatalog.find((a) => a.symbol === upper);
      if (!known) {
        return NextResponse.json({ error: `Unknown symbol: ${upper}` }, { status: 400 });
      }
      const totalBars = bars ?? 300;
      const candles = store.getCandles(upper, totalBars);
      if (candles.length < 60) {
        return NextResponse.json({ error: "insufficient data" }, { status: 422 });
      }
      const sessionId = `replay-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const startCapital = capital ?? 100_000;
      sessions.set(sessionId, {
        symbol: upper,
        cursor: 60, // start with 60 visible bars — enough context to trade
        totalBars: candles.length,
        capital: startCapital,
        cash: startCapital,
        positions: [],
        trades: [],
      });
      logger.info("Replay session started", {
        requestId,
        action: "start",
        sessionId,
        symbol: upper,
        totalBars: candles.length,
        capital: startCapital,
        status: "OK",
      });
      const session = sessions.get(sessionId)!;
      return NextResponse.json({
        sessionId,
        ...serializeSessionState(session),
      });
    }

    // --- next ----------------------------------------------------------------
    if (action === "next") {
      const session = getActiveSession();
      if (!session) {
        return NextResponse.json(
          { error: "No active replay session" },
          { status: 422 },
        );
      }
      const advance = cursor ?? 1;
      session.cursor = Math.min(session.cursor + advance, session.totalBars);
      logger.info("Replay advanced", {
        requestId,
        action: "next",
        symbol: session.symbol,
        cursor: session.cursor,
        totalBars: session.totalBars,
        advance,
        status: "OK",
      });
      return NextResponse.json(serializeSessionState(session));
    }

    // --- trade ---------------------------------------------------------------
    if (action === "trade") {
      const session = getActiveSession();
      if (!session) {
        return NextResponse.json(
          { error: "No active replay session" },
          { status: 422 },
        );
      }
      if (!side || !quantity) {
        return NextResponse.json(
          { error: "side and quantity required" },
          { status: 400 },
        );
      }
      const candles = store.getCandles(session.symbol, session.totalBars);
      const price = candles[session.cursor - 1]?.close ?? 0;
      if (price <= 0) {
        return NextResponse.json(
          { error: "No price available at cursor" },
          { status: 422 },
        );
      }
      const cost = price * quantity;
      // BUY: cash decreases (pay for shares). SELL: cash increases
      // (proceeds from selling shares short or closing longs).
      if (side === "BUY") session.cash -= cost;
      else session.cash += cost;
      session.positions.push({ side, qty: quantity, price });
      session.trades.push({
        side,
        qty: quantity,
        price,
        time: candles[session.cursor - 1]?.time ?? Date.now(),
        bar: session.cursor,
      });
      logger.info("Replay trade filled", {
        requestId,
        action: "trade",
        symbol: session.symbol,
        side,
        quantity,
        price,
        bar: session.cursor,
        cash: session.cash,
        status: "OK",
      });
      return NextResponse.json({
        cash: Math.round(session.cash * 100) / 100,
        positions: session.positions,
        trades: session.trades,
        cursor: session.cursor,
        totalBars: session.totalBars,
        currentPrice: price,
      });
    }

    // --- state ---------------------------------------------------------------
    if (action === "state") {
      const session = getActiveSession();
      if (!session) {
        return NextResponse.json(
          { error: "No active replay session" },
          { status: 422 },
        );
      }
      return NextResponse.json(serializeSessionState(session));
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    logger.error("Replay POST failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    store.health.apiErrors++;
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
