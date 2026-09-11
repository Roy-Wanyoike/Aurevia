import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";

export const dynamic = "force-dynamic";

// GET /api/v1/markets — universe of tradeable assets with live quotes.
export async function GET() {
  try {
    const assets = store.assetCatalog.map((a) => {
      const quote = store.getQuote(a.symbol);
      return { ...a, quote };
    });
    store.tickHealth();
    return NextResponse.json({ assets, total: assets.length });
  } catch (e: any) {
    store.health.apiErrors++;
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
