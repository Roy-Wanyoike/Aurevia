import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/brokers — list registered brokers + routing info
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
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
  // Issue #68 / #62 — LIVE trading is a footgun. Connecting a broker in LIVE
  // mode requires an explicit `confirmLive: true` flag in the request body.
  // Any other value (false, undefined, missing) yields a 403. This is the
  // same safeguard the risk profile update uses for `tradingMode: "LIVE"`.
  confirmLive: z.boolean().optional(),
  symbol: z.string().optional(),
  side: z.enum(["BUY", "SELL"]).optional(),
  quantity: z.number().positive().optional(),
});

// POST /api/v1/brokers — connect/disconnect a broker or query routing
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
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
      // Issue #68 / #62 — LIVE mode requires explicit confirmation.
      if (data.mode === "LIVE" && data.confirmLive !== true) {
        logger.warn("Broker connect rejected: LIVE mode without confirmLive", {
          requestId,
          action: "connect",
          kind: data.kind,
          mode: data.mode,
          status: "FORBIDDEN",
        });
        return NextResponse.json(
          { error: "LIVE mode requires explicit confirmation", requestId },
          { status: 403 },
        );
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
