import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/sparklines?bars=30 — recent closes for all universe assets.
// Single request returns sparkline data for every asset, so the dashboard
// can render real price trends without 18 separate fetches.
export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const bars = Math.min(30, Math.max(5, Number(url.searchParams.get("bars") ?? 30)));
    const out: Record<string, { closes: number[]; changePct: number; price: number }> = {};
    for (const asset of store.assetCatalog) {
      const candles = store.getCandles(asset.symbol, 300);
      const recent = candles.slice(-bars);
      const closes = recent.map((c) => c.close);
      const first = closes[0] ?? 0;
      const last = closes[closes.length - 1] ?? 0;
      const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
      out[asset.symbol] = { closes, changePct, price: last };
    }
    return NextResponse.json({ sparklines: out, bars });
  } catch (e: any) {
    logger.error("Sparklines GET failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
