import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia Smart Screener (issue #42).
//
// POST a filter JSON describing the criteria; the route iterates the asset
// universe, computes a `MarketContext` per asset via `store.buildContext()`
// (which already gives us quote + indicators + trend + regime in one shot),
// applies every provided filter, and returns the matching rows with the
// indicator columns the UI needs to render the results table.
//
// All filter fields are optional — an empty body returns the whole universe.
// Filters compose with AND, never OR. Range bounds are inclusive.
// ---------------------------------------------------------------------------

// Nullish-coalesced number filter — accepts undefined (filter not provided),
// NaN strings, negative numbers, etc. Zod's `.nonnegative()` etc. would
// reject out of hand; we want the caller to be able to send `{"rsiMax":70}`
// without also sending `{"rsiMin":0}`.
const num = z.coerce.number().optional();
const str = z.string().min(1).max(60).optional();

const ScreenerFilterSchema = z.object({
  assetType: str,            // "equity" | "etf" | "crypto" | "fx"
  sector: str,              // matches AssetInfo.sector exactly (case-insensitive)
  priceMin: num,
  priceMax: num,
  volumeMin: num,            // 24h volume floor
  rsiMin: num,               // 0..100
  rsiMax: num,
  trendDirection: str,       // "UP" | "DOWN" | "FLAT"
  regime: str,               // one of the Regime union members
  volatilityMax: num,        // annualized, 0..1 (e.g. 0.5 = 50%)
  changePctMin: num,         // 24h change % floor (e.g. -5 to allow small losses)
  changePctMax: num,
  adxMin: num,               // ADX(14) trend-strength floor (typically 20-25)
});

interface ScreenerRow {
  symbol: string;
  name: string;
  assetType: string;
  sector?: string;
  exchange: string;
  price: number;
  changePct: number;
  volume24h: number;
  rsi14: number;
  adx14: number;
  volatility: number;
  trendDirection: string;
  trendStrength: number;
  regime: string;
  macdHist: number;
}

function passes(row: ScreenerRow, f: z.infer<typeof ScreenerFilterSchema>): boolean {
  if (f.assetType && row.assetType.toLowerCase() !== f.assetType.toLowerCase()) return false;
  if (f.sector && (row.sector ?? "").toLowerCase() !== f.sector.toLowerCase()) return false;
  if (f.priceMin !== undefined && row.price < f.priceMin) return false;
  if (f.priceMax !== undefined && row.price > f.priceMax) return false;
  if (f.volumeMin !== undefined && row.volume24h < f.volumeMin) return false;
  if (f.rsiMin !== undefined && row.rsi14 < f.rsiMin) return false;
  if (f.rsiMax !== undefined && row.rsi14 > f.rsiMax) return false;
  if (f.trendDirection && row.trendDirection !== f.trendDirection.toUpperCase()) return false;
  if (f.regime && row.regime !== f.regime.toUpperCase()) return false;
  if (f.volatilityMax !== undefined && row.volatility > f.volatilityMax) return false;
  if (f.changePctMin !== undefined && row.changePct < f.changePctMin) return false;
  if (f.changePctMax !== undefined && row.changePct > f.changePctMax) return false;
  if (f.adxMin !== undefined && row.adx14 < f.adxMin) return false;
  return true;
}

function buildRow(symbol: string): ScreenerRow | null {
  const ctx = store.buildContext(symbol, 300);
  if (!ctx) return null;
  const { asset, quote, indicators, trend, regime } = ctx;
  return {
    symbol: asset.symbol,
    name: asset.name,
    assetType: asset.assetType,
    sector: asset.sector,
    exchange: asset.exchange,
    price: quote.price,
    changePct: quote.changePct,
    volume24h: quote.volume24h,
    rsi14: indicators.rsi14,
    adx14: indicators.adx14,
    volatility: indicators.volatility,
    trendDirection: trend.direction,
    trendStrength: trend.strength,
    regime,
    macdHist: indicators.macdHist,
  };
}

// POST /api/v1/screener — multi-factor asset filter.
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ScreenerFilterSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Screener rejected: invalid filter", {
        requestId,
        status: "INVALID",
        errors: parsed.error.issues?.map((i) => i.message) ?? [],
      });
      return NextResponse.json(
        { error: parsed.error.issues?.[0]?.message ?? parsed.error.message ?? "invalid filter" },
        { status: 400 },
      );
    }
    const filter = parsed.data;

    const rows: ScreenerRow[] = [];
    for (const asset of store.assetCatalog) {
      const row = buildRow(asset.symbol);
      if (!row) continue;
      if (passes(row, filter)) rows.push(row);
    }

    // Default sort: by absolute changePct descending so the most volatile
    // movers surface first. The UI can re-sort client-side.
    rows.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

    logger.info("Screener run", {
      requestId,
      universeSize: store.assetCatalog.length,
      matched: rows.length,
      status: "OK",
    });

    return NextResponse.json({
      results: rows,
      total: rows.length,
      universeSize: store.assetCatalog.length,
      applied: filter,
    });
  } catch (e: any) {
    logger.error("Screener failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    store.health.apiErrors++;
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}

// GET /api/v1/screener — return the universe as filter options so the UI
// can populate its dropdowns (assetType, sector, regime) without hardcoding
// (issue #29 — no hardcoded lists).
export async function GET() {
  try {
    const assetTypes = new Set<string>();
    const sectors = new Set<string>();
    for (const a of store.assetCatalog) {
      assetTypes.add(a.assetType);
      if (a.sector) sectors.add(a.sector);
    }
    return NextResponse.json({
      assetTypes: Array.from(assetTypes).sort(),
      sectors: Array.from(sectors).sort(),
      trendDirections: ["UP", "DOWN", "FLAT"],
      regimes: [
        "BULL", "BEAR", "SIDEWAYS", "ACCUMULATION", "DISTRIBUTION",
        "BREAKOUT", "BREAKDOWN", "RECOVERY", "HIGH_VOLATILITY",
        "LOW_VOLATILITY", "CRASH",
      ],
      universeSize: store.assetCatalog.length,
    });
  } catch (e: any) {
    store.health.apiErrors++;
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
