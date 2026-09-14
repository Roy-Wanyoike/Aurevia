import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";

export const dynamic = "force-dynamic";

// GET /api/v1/orders — real order history from the store.
//
// Pagination (Issue #126): `?page=1&limit=20` returns a paginated slice. When
// neither param is supplied the response is the full list (backward
// compatible — the existing hooks and tests use the unpaginated shape).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const symbol = url.searchParams.get("symbol");
    let orders = store.orders;
    if (status) orders = orders.filter((o) => o.status === status.toUpperCase());
    if (symbol) orders = orders.filter((o) => o.symbol === symbol.toUpperCase());

    const page = Number(url.searchParams.get("page") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 0);
    if (page > 0 && limit > 0) {
      const offset = (page - 1) * limit;
      const paginated = orders.slice(offset, offset + limit);
      return NextResponse.json({
        data: paginated,
        orders: paginated, // mirror key for backward compat
        pagination: {
          page,
          limit,
          total: orders.length,
          totalPages: Math.ceil(orders.length / limit),
        },
      });
    }

    // No pagination — return all (backward compatible).
    return NextResponse.json({ orders, total: orders.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
