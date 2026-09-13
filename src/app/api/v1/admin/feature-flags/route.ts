import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";
import { getAllFlags } from "@/lib/aurevia/config/feature-flags";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia — Feature flags admin endpoint (Issue #111).
//
// GET /api/v1/admin/feature-flags
//   Returns the current state of every known feature flag. Flags are sourced
//   from `NEXT_PUBLIC_ENABLE_*` env vars; this endpoint is read-only — flag
//   flips happen via deploy-time env-var changes, NOT via a POST here. That
//   keeps "enable LIVE trading" a deliberate, reviewable change rather than
//   a careless admin click.
//
// Phase 2 will add a database-backed FlagStore (with tenant / user /
// percentage rollouts) and a corresponding POST handler. Until then, the
// contract is GET-only.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const flags = getAllFlags();
    logger.debug("Feature flags requested", { requestId, count: flags.length });
    return NextResponse.json({
      flags,
      source: "env",
      // `env` documents that these flags come from process.env, not a
      // database — clients can render a "flags are read-only" hint.
      readOnly: true,
    });
  } catch (e: any) {
    logger.error("Feature flags GET failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json(
      { error: e?.message ?? "unknown" },
      { status: 500 },
    );
  }
}
