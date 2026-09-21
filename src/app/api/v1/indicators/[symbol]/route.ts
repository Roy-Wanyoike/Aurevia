import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { indicatorSeries } from "@/lib/aurevia/quant/indicators";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/indicators/[symbol]?name=sma20&bars=200
export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const { symbol } = await params;
    const url = new URL(req.url);
    const name = (url.searchParams.get("name") ?? "sma20") as string;
    const bars = Number(url.searchParams.get("bars") ?? 200);
    const candles = store.getCandles(symbol.toUpperCase(), Math.max(50, bars));
    const series = indicatorSeries(candles, name);
    const out = candles
      .map((c, i) => ({ t: c.time, v: isNaN(series[i]) ? null : Math.round(series[i] * 100) / 100 }))
      .filter((p) => p.v !== null);
    return NextResponse.json({ symbol, name, series: out });
  } catch (e: any) {
    logger.error("Indicators GET failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
