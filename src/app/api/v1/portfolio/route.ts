import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/aurevia/store";

export const dynamic = "force-dynamic";

const OrderSchema = z
  .object({
    action: z.enum(["reset", "order"]),
    symbol: z.string().min(1).optional(),
    side: z.enum(["BUY", "SELL"]).optional(),
    quantity: z.number().positive().optional(),
    orderType: z.string().optional(),
    strategyKey: z.string().optional(),
    reason: z.string().optional(),
  })
  .refine((d) => d.action !== "order" || (d.symbol && d.side && d.quantity), {
    message: "symbol, side, and quantity required for order action",
  });

// GET /api/v1/portfolio — current paper-trading portfolio state.
export async function GET() {
  try {
    return NextResponse.json({ portfolio: store.getPortfolio() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}

// POST /api/v1/portfolio — operator actions: reset, or place a manual order.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = OrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten()?.formErrors?.[0] ?? parsed.error.message ?? "invalid request" },
        { status: 400 },
      );
    }
    const data = parsed.data;
    if (data.action === "reset") {
      store.resetPortfolio();
      return NextResponse.json({ ok: true, portfolio: store.getPortfolio() });
    }
    // action === "order"
    const { symbol, side, quantity, orderType, strategyKey, reason } = data;
    const order = store.submitOrder({
      symbol: String(symbol).toUpperCase(),
      side: side === "SELL" ? "SELL" : "BUY",
      quantity: Number(quantity),
      orderType: (orderType as "MARKET" | "LIMIT" | "STOP") ?? "MARKET",
      strategyKey,
      reason,
    });
    return NextResponse.json({ order, portfolio: store.getPortfolio() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
