import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/markets — universe of tradeable assets with live quotes.
export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const assets = store.assetCatalog.map((a) => {
      const quote = store.getQuote(a.symbol);
      return { ...a, quote };
    });
    store.tickHealth();
    return NextResponse.json({ assets, total: assets.length });
  } catch (e: any) {
    store.health.apiErrors++;
    logger.error("Markets GET failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
