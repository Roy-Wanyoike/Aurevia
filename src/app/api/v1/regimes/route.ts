import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { detectRegime } from "@/lib/aurevia/quant/regime";

export const dynamic = "force-dynamic";

// GET /api/v1/regimes — regime distribution across the tradeable universe.
export async function GET() {
  try {
    const dist: Record<string, { symbol: string; regime: string; price: number; changePct: number }[]> = {};
    for (const asset of store.assetCatalog) {
      const ctx = store.buildContext(asset.symbol, 300);
      if (!ctx) continue;
      const regime = ctx.regime;
      if (!dist[regime]) dist[regime] = [];
      dist[regime].push({
        symbol: asset.symbol,
        regime,
        price: ctx.quote.price,
        changePct: ctx.quote.changePct,
      });
    }
    const summary = Object.entries(dist).map(([regime, items]) => ({
      regime,
      count: items.length,
      symbols: items.slice(0, 6).map((i) => i.symbol),
    }));
    return NextResponse.json({ distribution: dist, summary });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
