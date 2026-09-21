import { NextResponse } from "next/server";
import { STRATEGIES } from "@/lib/aurevia/strategies";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/strategies — list installed strategy plugins.
export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({
      strategies: STRATEGIES.map((s) => ({
        key: s.key,
        name: s.name,
        description: s.description,
        category: s.category,
        version: s.version,
        defaultParams: s.defaultParams,
      })),
      total: STRATEGIES.length,
    });
  } catch (e: any) {
    logger.error("Strategies GET failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
