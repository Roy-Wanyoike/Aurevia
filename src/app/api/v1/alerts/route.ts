import { NextResponse } from "next/server";
import { z } from "zod";
import {
  store,
  getAlerts,
  addAlert,
  removeAlert,
  checkAlerts,
  type Alert,
} from "@/lib/aurevia/store";
import { getAsset } from "@/lib/aurevia/market-data/assets";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia Alert Engine (issue #48).
//
// GET  — return all alerts (active + triggered-history), and run `checkAlerts`
//        so any newly-satisfied conditions fire before the response is sent.
//        The freshly triggered alerts are returned in `triggered` so the
//        client can surface a toast per fire.
//
// POST — branches on `action`:
//   - create : register a new alert
//   - delete : remove an alert by id
//   - check  : explicitly evaluate alerts (in addition to the per-scan hook)
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  type: z.enum(["price", "rsi", "changePct"]),
  symbol: z.string().min(1).max(20),
  condition: z.enum(["above", "below"]),
  threshold: z.number().finite(),
});

const ActionSchema = z
  .object({
    action: z.enum(["create", "delete", "check"]),
    // create
    type: z.enum(["price", "rsi", "changePct"]).optional(),
    symbol: z.string().min(1).max(20).optional(),
    condition: z.enum(["above", "below"]).optional(),
    threshold: z.number().finite().optional(),
    // delete
    id: z.string().min(1).optional(),
  })
  .refine((d) => d.action !== "create" || (d.type && d.symbol && d.condition && d.threshold !== undefined), {
    message: "create requires type, symbol, condition, threshold",
  })
  .refine((d) => d.action !== "delete" || !!d.id, {
    message: "delete requires id",
  });

function serialize(a: Alert) {
  return {
    id: a.id,
    type: a.type,
    symbol: a.symbol,
    condition: a.condition,
    threshold: a.threshold,
    active: a.active,
    triggeredAt: a.triggeredAt,
    triggerValue: a.triggerValue,
    createdAt: a.createdAt,
  };
}

// GET /api/v1/alerts — list all alerts, fire any newly-satisfied ones.
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const requestId = "alerts";
  try {
    // Run checkAlerts so any condition that became true since the last scan
    // also fires when the user opens / refreshes the alerts view. The
    // freshly-triggered list is returned so the client can toast.
    let triggered: Alert[] = [];
    try {
      triggered = checkAlerts();
    } catch (e: any) {
      logger.warn("Alert check threw", { requestId, error: e?.message ?? "unknown" });
    }
    const all = getAlerts();
    logger.info("Alerts list", {
      requestId,
      active: all.filter((a) => a.active).length,
      triggered: all.filter((a) => !a.active).length,
      newlyFired: triggered.length,
      status: "OK",
    });
    return NextResponse.json({
      alerts: all.map(serialize),
      triggered: triggered.map(serialize),
      total: all.length,
    });
  } catch (e: any) {
    logger.error("Alerts GET failed", { requestId, status: "ERROR", error: e?.message ?? "unknown" });
    store.health.apiErrors++;
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}

// POST /api/v1/alerts — action-based mutations.
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Alert action rejected: invalid request", {
        requestId,
        action: body?.action,
        status: "INVALID",
        errors: parsed.error.issues?.map((i) => i.message) ?? [],
      });
      return NextResponse.json(
        { error: parsed.error.issues?.[0]?.message ?? parsed.error.message ?? "invalid request" },
        { status: 400 },
      );
    }
    const d = parsed.data;

    if (d.action === "create") {
      // Re-validate the create-specific shape with a tighter schema. The
      // outer ActionSchema already checks presence; this enforces types.
      const create = CreateSchema.safeParse({
        type: d.type,
        symbol: d.symbol,
        condition: d.condition,
        threshold: d.threshold,
      });
      if (!create.success) {
        return NextResponse.json(
          { error: create.error.issues?.[0]?.message ?? "invalid create payload" },
          { status: 400 },
        );
      }
      const cd = create.data;
      const upper = cd.symbol.toUpperCase();
      // Reject unknown symbols — silently accepting them would create alerts
      // that never fire because we have no market data to evaluate them
      // against. (Same guard as /api/v1/watchlists addSymbol.)
      if (!getAsset(upper)) {
        return NextResponse.json({ error: `Unknown symbol: ${upper}` }, { status: 400 });
      }
      const a = addAlert(cd.type, upper, cd.condition, cd.threshold);
      logger.info("Alert created", {
        requestId,
        action: "create",
        alertId: a.id,
        type: a.type,
        symbol: a.symbol,
        condition: a.condition,
        threshold: a.threshold,
        status: "OK",
      });
      const all = getAlerts();
      return NextResponse.json({
        ok: true,
        alert: serialize(a),
        alerts: all.map(serialize),
        total: all.length,
      });
    }

    if (d.action === "delete") {
      const ok = removeAlert(d.id!);
      if (!ok) {
        return NextResponse.json({ error: "Alert not found" }, { status: 404 });
      }
      logger.info("Alert deleted", { requestId, action: "delete", alertId: d.id, status: "OK" });
      const all = getAlerts();
      return NextResponse.json({
        ok: true,
        deleted: true,
        alerts: all.map(serialize),
        total: all.length,
      });
    }

    // d.action === "check"
    const triggered = checkAlerts();
    logger.info("Alerts checked", {
      requestId,
      action: "check",
      fired: triggered.length,
      status: "OK",
    });
    const all = getAlerts();
    return NextResponse.json({
      ok: true,
      triggered: triggered.map(serialize),
      alerts: all.map(serialize),
      total: all.length,
    });
  } catch (e: any) {
    logger.error("Alerts POST failed", { requestId, status: "ERROR", error: e?.message ?? "unknown" });
    store.health.apiErrors++;
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
