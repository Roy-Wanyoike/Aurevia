import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/market-data — returns the current data source status
export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const ds = store.getDataSource();
    return NextResponse.json({
      source: ds.source,
      isLive: ds.isLive,
      providers: [
        { id: "polygon", configured: !!process.env.POLYGON_API_KEY },
        { id: "simulated", configured: true, isLive: false },
      ],
    });
  } catch (e: any) {
    logger.error("Market data GET failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}

// POST /api/v1/market-data — refresh live data (fetch latest candles from provider)
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    await store.initLiveData();  // ensures first-time init
    await store.refreshLiveData();  // refresh cache
    const ds = store.getDataSource();
    return NextResponse.json({
      ok: true,
      source: ds.source,
      isLive: ds.isLive,
      message: ds.isLive
        ? `Live data refreshed from ${ds.source}`
        : "No live provider configured — using simulated data. Set POLYGON_API_KEY to enable live data.",
    });
  } catch (e: any) {
    logger.error("Market data POST failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
