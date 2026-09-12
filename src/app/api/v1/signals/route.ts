import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/signals — recent signals (optionally filtered by symbol / strategy).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");
  const strategy = url.searchParams.get("strategy");
  let signals = store.signals;
  if (symbol) signals = signals.filter((s) => s.symbol === symbol.toUpperCase());
  if (strategy) signals = signals.filter((s) => s.strategyKey === strategy);
  // For each signal, attach a risk evaluation snapshot so the UI can show
  // APPROVED vs REJECTED reasoning.
  const enriched = signals.slice(0, 100).map((s) => ({
    ...s,
    risk: store.evaluateSignal(s),
  }));
  return NextResponse.json({ signals: enriched, total: signals.length });
}

// POST /api/v1/signals — run a fresh scan across the universe.
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  try {
    const t0 = Date.now();
    const newSignals = store.scanSignals();
    const enriched = newSignals.map((s) => ({ ...s, risk: store.evaluateSignal(s) }));
    const approved = enriched.filter((s) => s.risk?.decision === "APPROVED").length;
    const rejected = enriched.filter((s) => s.risk?.decision === "REJECTED").length;
    const paused = enriched.filter((s) => s.risk?.decision === "PAUSED").length;
    logger.info("Signal scan completed", {
      requestId,
      action: "scan",
      status: "OK",
      universeSize: store.assetCatalog.length,
      signalsEmitted: newSignals.length,
      approved,
      rejected,
      paused,
      durationMs: Date.now() - t0,
    });
    return NextResponse.json({ scanned: store.assetCatalog.length, newSignals: enriched });
  } catch (e: any) {
    logger.error("Signal scan failed", {
      requestId,
      action: "scan",
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
