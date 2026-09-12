import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

const OrderSchema = z
  .object({
    action: z.enum(["reset", "order"]),
    symbol: z.string().min(1).optional(),
    side: z.enum(["BUY", "SELL"]).optional(),
    quantity: z.number().positive().optional(),
    orderType: z.string().optional(),
    limitPrice: z.number().positive().optional(),
    strategyKey: z.string().optional(),
    reason: z.string().optional(),
  })
  .refine((d) => d.action !== "order" || (d.symbol && d.side && d.quantity), {
    message: "symbol, side, and quantity required for order action",
  })
  .refine(
    (d) =>
      d.action !== "order" ||
      !d.orderType ||
      !["MARKET", "LIMIT", "STOP"].includes(d.orderType) ||
      (d.orderType !== "MARKET" && d.limitPrice !== undefined),
    { message: "limitPrice is required for LIMIT and STOP order types" },
  );

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
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = OrderSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Order rejected: invalid request", {
        requestId,
        action: body?.action,
        symbol: body?.symbol,
        status: "INVALID",
        errors: parsed.error.issues?.map((i) => i.message) ?? [],
      });
      return NextResponse.json(
        { error: parsed.error.flatten()?.formErrors?.[0] ?? parsed.error.message ?? "invalid request" },
        { status: 400 },
      );
    }
    const data = parsed.data;
    if (data.action === "reset") {
      store.resetPortfolio();
      logger.info("Portfolio reset by operator", {
        requestId,
        action: "reset",
        status: "OK",
      });
      return NextResponse.json({ ok: true, portfolio: store.getPortfolio() });
    }
    // action === "order"
    const { symbol, side, quantity, orderType, limitPrice, strategyKey, reason } = data;
    const upperSymbol = String(symbol).toUpperCase();
    const order = store.submitOrder({
      symbol: upperSymbol,
      side: side === "SELL" ? "SELL" : "BUY",
      quantity: Number(quantity),
      orderType: (orderType as "MARKET" | "LIMIT" | "STOP") ?? "MARKET",
      limitPrice: limitPrice !== undefined ? Number(limitPrice) : undefined,
      strategyKey,
      reason,
    });
    logger.info("Order submitted", {
      requestId,
      symbol: upperSymbol,
      action: `${order.side} ${order.orderType}`,
      status: order.status,
      orderId: order.id,
      quantity: order.quantity,
      filledPrice: order.filledPrice,
      filledQty: order.filledQty,
      reason: order.reason,
    });
    return NextResponse.json({ order, portfolio: store.getPortfolio() });
  } catch (e: any) {
    logger.error("Order submission failed", {
      requestId,
      action: "order",
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
