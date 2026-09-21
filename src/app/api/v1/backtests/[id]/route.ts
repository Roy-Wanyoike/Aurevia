import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/backtests/[id] — full backtest result with equity curve + trades.
//
// The response surfaces the four research-reproducibility metadata fields
// (issue #113) — `codeVersion`, `parameters`, `randomSeed`, `environment` —
// by returning the full BacktestResult object as-is. They are optional on
// the type so legacy in-memory backtests created before #113 still
// serialize cleanly (JSON.stringify drops `undefined`); new backtests have
// them populated by the POST handler via captureExperimentMetadata().
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const bt = store.backtests.find((b) => b.id === id);
    if (!bt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      result: {
        ...bt,
        // Explicitly surface the #113 metadata so the contract is documented
        // in the response shape (and survives future destructuring refactors).
        codeVersion: bt.codeVersion ?? null,
        parameters: bt.parameters ?? null,
        randomSeed: bt.randomSeed ?? null,
        environment: bt.environment ?? null,
      },
    });
  } catch (e: any) {
    logger.error("Backtest detail GET failed", { error: e?.message ?? "unknown" });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
