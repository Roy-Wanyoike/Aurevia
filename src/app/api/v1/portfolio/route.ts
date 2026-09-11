import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";

export const dynamic = "force-dynamic";

// GET /api/v1/portfolio — current paper-trading portfolio state.
export async function GET() {
  return NextResponse.json({ portfolio: store.getPortfolio() });
}

// POST /api/v1/portfolio — operator actions: reset, or place a manual order.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "reset") {
    store.resetPortfolio();
    return NextResponse.json({ ok: true, portfolio: store.getPortfolio() });
  }
  if (body.action === "order") {
    const { symbol, side, quantity, orderType, strategyKey, reason } = body;
    if (!symbol || !side || !quantity) {
      return NextResponse.json({ error: "symbol, side, quantity required" }, { status: 400 });
    }
    const order = store.submitOrder({
      symbol: String(symbol).toUpperCase(),
      side: side === "SELL" ? "SELL" : "BUY",
      quantity: Number(quantity),
      orderType: orderType ?? "MARKET",
      strategyKey,
      reason,
    });
    return NextResponse.json({ order, portfolio: store.getPortfolio() });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
