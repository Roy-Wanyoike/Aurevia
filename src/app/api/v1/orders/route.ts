import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";

export const dynamic = "force-dynamic";

// GET /api/v1/orders — real order history from the store
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const symbol = url.searchParams.get("symbol");
    let orders = store.orders;
    if (status) orders = orders.filter((o) => o.status === status.toUpperCase());
    if (symbol) orders = orders.filter((o) => o.symbol === symbol.toUpperCase());
    return NextResponse.json({ orders, total: orders.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
