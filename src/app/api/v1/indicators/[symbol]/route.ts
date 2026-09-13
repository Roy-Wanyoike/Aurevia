import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { indicatorSeries } from "@/lib/aurevia/quant/indicators";

export const dynamic = "force-dynamic";

// GET /api/v1/indicators/[symbol]?name=sma20&bars=200
export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
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
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
