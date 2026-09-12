import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/backtests/[id] — full backtest result with equity curve + trades.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bt = store.backtests.find((b) => b.id === id);
    if (!bt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ result: bt });
  } catch (e: any) {
    logger.error("Backtest detail GET failed", { error: e?.message ?? "unknown" });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
