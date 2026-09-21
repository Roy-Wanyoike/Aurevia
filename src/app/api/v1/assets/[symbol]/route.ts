import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/assets/[symbol]?bars=300
export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const { symbol } = await params;
    const ctx = store.buildContext(symbol.toUpperCase(), 300);
    if (!ctx) {
      return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 404 });
    }
    store.tickHealth();
    return NextResponse.json(ctx);
  } catch (e: any) {
    store.health.apiErrors++;
    logger.error("Asset detail GET failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
