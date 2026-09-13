import { NextResponse } from "next/server";
import { z } from "zod";
import { store, getWatchlists, addWatchlist, addToWatchlist, removeFromWatchlist, renameWatchlist, deleteWatchlist } from "@/lib/aurevia/store";
import { getAsset } from "@/lib/aurevia/market-data/assets";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// Action schema — the POST endpoint branches on `action` to create / mutate
// / delete watchlists. Single endpoint keeps the API surface small and
// matches the existing pattern used by /api/v1/portfolio and /api/v1/risk
// (issue #41 — Watchlists).
const ActionSchema = z
  .object({
    action: z.enum(["create", "addSymbol", "removeSymbol", "rename", "delete"]),
    watchlistId: z.string().min(1).optional(),
    name: z.string().min(1).max(80).optional(),
    symbol: z.string().min(1).max(20).optional(),
  })
  .refine((d) => d.action === "create" || !!d.watchlistId, {
    message: "watchlistId required for non-create actions",
  })
  .refine((d) => d.action !== "addSymbol" && d.action !== "removeSymbol" || !!d.symbol, {
    message: "symbol required for addSymbol / removeSymbol actions",
  })
  .refine((d) => d.action !== "rename" && d.action !== "create" || !!d.name, {
    message: "name required for create / rename actions",
  });

interface WatchlistQuoteRow {
  symbol: string;
  name: string;
  assetType: string;
  sector?: string;
  exchange: string;
  price: number;
  changePct: number;
  volume24h: number;
  spread: number;
  bid: number;
  ask: number;
  timestamp: number;
  // Last N closes for a mini-sparkline. Cheaper than hitting /api/v1/sparklines
  // for every watchlist render — the quote we already built cost us nothing
  // since buildQuote reuses the cached candle series.
  sparkline: number[];
}

interface WatchlistResponse {
  id: string;
  name: string;
  symbols: string[];
  rows: WatchlistQuoteRow[];
}

function buildRows(symbols: string[]): WatchlistQuoteRow[] {
  // Preserve the user's order. Unknown symbols (typos, delisted tickers) are
  // silently skipped — the GET response shouldn't 500 just because one symbol
  // in a list no longer resolves.
  const out: WatchlistQuoteRow[] = [];
  for (const sym of symbols) {
    const upper = sym.toUpperCase();
    const asset = getAsset(upper);
    if (!asset) continue;
    const candles = store.getCandles(upper, 300);
    const quote = store.getQuote(upper);
    out.push({
      symbol: asset.symbol,
      name: asset.name,
      assetType: asset.assetType,
      sector: asset.sector,
      exchange: asset.exchange,
      price: quote.price,
      changePct: quote.changePct,
      volume24h: quote.volume24h,
      spread: quote.spread,
      bid: quote.bid,
      ask: quote.ask,
      timestamp: quote.timestamp,
      sparkline: candles.slice(-30).map((c) => c.close),
    });
  }
  return out;
}

// GET /api/v1/watchlists — all watchlists, each with live quotes per symbol.
export async function GET() {
  try {
    const payload: WatchlistResponse[] = getWatchlists().map((wl) => ({
      id: wl.id,
      name: wl.name,
      symbols: wl.symbols,
      rows: buildRows(wl.symbols),
    }));
    return NextResponse.json({ watchlists: payload, total: payload.length });
  } catch (e: any) {
    store.health.apiErrors++;
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}

// POST /api/v1/watchlists — action-based mutations on the watchlist set.
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Watchlist action rejected: invalid request", {
        requestId,
        action: body?.action,
        status: "INVALID",
        errors: parsed.error.issues?.map((i) => i.message) ?? [],
      });
      return NextResponse.json(
        { error: parsed.error.issues?.[0]?.message ?? parsed.error.message ?? "invalid request" },
        { status: 400 },
      );
    }
    const d = parsed.data;
    let mutated: WatchlistResponse | null = null;
    let deleted = false;

    switch (d.action) {
      case "create": {
        const wl = addWatchlist(d.name!);
        mutated = { id: wl.id, name: wl.name, symbols: wl.symbols, rows: buildRows(wl.symbols) };
        break;
      }
      case "addSymbol": {
        const upper = d.symbol!.toUpperCase();
        // Reject symbols not in the asset catalog — silently accepting them
        // would create watchlist rows that never render a quote (issue #29 —
        // no unbounded user-provided keys).
        if (!getAsset(upper)) {
          return NextResponse.json({ error: `Unknown symbol: ${upper}` }, { status: 400 });
        }
        const wl = addToWatchlist(d.watchlistId!, upper);
        if (!wl) return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
        mutated = { id: wl.id, name: wl.name, symbols: wl.symbols, rows: buildRows(wl.symbols) };
        break;
      }
      case "removeSymbol": {
        const wl = removeFromWatchlist(d.watchlistId!, d.symbol!);
        if (!wl) return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
        mutated = { id: wl.id, name: wl.name, symbols: wl.symbols, rows: buildRows(wl.symbols) };
        break;
      }
      case "rename": {
        const wl = renameWatchlist(d.watchlistId!, d.name!);
        if (!wl) return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
        mutated = { id: wl.id, name: wl.name, symbols: wl.symbols, rows: buildRows(wl.symbols) };
        break;
      }
      case "delete": {
        deleted = deleteWatchlist(d.watchlistId!);
        if (!deleted) {
          return NextResponse.json(
            { error: "Watchlist not found or cannot be deleted (default watchlist is protected)" },
            { status: 400 },
          );
        }
        break;
      }
    }

    logger.info("Watchlist action", {
      requestId,
      action: d.action,
      watchlistId: d.watchlistId,
      symbol: d.symbol,
      name: d.name,
      status: "OK",
    });

    // Return the full fresh set so the client can replace its cached state in
    // a single query invalidation rather than re-fetching per watchlist.
    const payload: WatchlistResponse[] = getWatchlists().map((wl) => ({
      id: wl.id,
      name: wl.name,
      symbols: wl.symbols,
      rows: buildRows(wl.symbols),
    }));
    return NextResponse.json({
      ok: true,
      watchlists: payload,
      total: payload.length,
      mutated,
      deleted,
    });
  } catch (e: any) {
    logger.error("Watchlist action failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    store.health.apiErrors++;
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
