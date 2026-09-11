import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/aurevia/store";

export const dynamic = "force-dynamic";

// GET /api/v1/brokers — list registered brokers + routing info
export async function GET() {
  try {
    const brokers = store.listBrokers();
    return NextResponse.json({ brokers, total: brokers.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}

const ConnectSchema = z.object({
  action: z.enum(["connect", "disconnect", "route"]),
  kind: z.enum(["alpaca", "ibkr"]).optional(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  accountId: z.string().optional(),
  mode: z.enum(["PAPER", "SANDBOX", "LIVE"]).optional(),
  symbol: z.string().optional(),
  side: z.enum(["BUY", "SELL"]).optional(),
  quantity: z.number().positive().optional(),
});

// POST /api/v1/brokers — connect/disconnect a broker or query routing
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ConnectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten()?.formErrors?.[0] ?? "invalid request" },
        { status: 400 }
      );
    }
    const data = parsed.data;

    if (data.action === "connect") {
      if (!data.kind || !data.apiKey || !data.apiSecret) {
        return NextResponse.json({ error: "kind, apiKey, apiSecret required for connect" }, { status: 400 });
      }
      const brokers = await store.connectBroker(data.kind, {
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
        accountId: data.accountId,
        mode: data.mode ?? "PAPER",
      });
      return NextResponse.json({ ok: true, brokers });
    }

    if (data.action === "route") {
      if (!data.symbol || !data.side || !data.quantity) {
        return NextResponse.json({ error: "symbol, side, quantity required for route" }, { status: 400 });
      }
      const route = store.routeOrder(data.symbol, data.side, data.quantity);
      return NextResponse.json({ route });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
