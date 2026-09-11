import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";

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
export async function POST() {
  const newSignals = store.scanSignals();
  const enriched = newSignals.map((s) => ({ ...s, risk: store.evaluateSignal(s) }));
  return NextResponse.json({ scanned: store.assetCatalog.length, newSignals: enriched });
}
