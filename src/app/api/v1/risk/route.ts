import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/aurevia/store";
import { nextBreakerState } from "@/lib/aurevia/risk/engine";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { auditLog } from "@/lib/aurevia/audit/logger";

export const dynamic = "force-dynamic";

const RiskSchema = z
  .object({
    action: z.enum(["updateProfile", "setBreaker", "evaluateBreaker"]),
    state: z.enum(["NORMAL", "CAUTION", "TRADING_PAUSED", "RE_EVALUATING"]).optional(),
    reason: z.string().optional(),
    triggers: z.record(z.string(), z.any()).optional(),
    // Issue #68 / #62 — flipping the risk profile to `tradingMode: "LIVE"` is
    // the single most dangerous mutation in the system. The request MUST also
    // include `confirmLive: true` — otherwise we 403 with an explicit error.
    // This stops a fat-fingered `tradingMode: "LIVE"` payload from arming the
    // engine against real money.
    confirmLive: z.boolean().optional(),
  })
  .passthrough(); // allow numeric profile fields

// GET /api/v1/risk — risk profile + recent risk events + portfolio risk snapshot.
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const portfolio = store.getPortfolio();
    return NextResponse.json({
      profile: store.riskProfile,
      portfolio,
      events: store.riskEvents.slice(0, 30),
      dayStartEquity: store.dayStartEquity,
      weekStartEquity: store.weekStartEquity,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}

// POST /api/v1/risk — mutate risk profile or control circuit breaker.
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RiskSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Risk action rejected: invalid request", {
        requestId,
        action: body?.action,
        status: "INVALID",
        errors: parsed.error.issues?.map((i) => i.message) ?? [],
      });
      return NextResponse.json(
        { error: parsed.error.flatten()?.formErrors?.[0] ?? parsed.error.message ?? "invalid request" },
        { status: 400 },
      );
    }
    const data = parsed.data;
    if (data.action === "updateProfile") {
      // Issue #68 / #62 — LIVE trading mode is the single most dangerous
      // mutation in the system. Require an explicit `confirmLive: true`.
      if ((data as any).tradingMode === "LIVE" && data.confirmLive !== true) {
        logger.warn("Risk profile update rejected: LIVE mode without confirmLive", {
          requestId,
          action: "updateProfile",
          status: "FORBIDDEN",
          attemptedTradingMode: "LIVE",
        });
        return NextResponse.json(
          { error: "LIVE mode requires explicit confirmation", requestId },
          { status: 403 },
        );
      }
      const allowed: (keyof typeof store.riskProfile)[] = [
        "maxPositionPct",
        "maxPortfolioPct",
        "maxLeverage",
        "maxDailyLossPct",
        "maxWeeklyLossPct",
        "maxDrawdownPct",
        "maxSpread",
        "maxVolatility",
        "minLiquidity",
        "cooldownMinutes",
        "tradingMode",
      ];
      const changed: string[] = [];
      const changes: Record<string, { from: any; to: any }> = {};
      for (const k of allowed) {
        if ((data as any)[k] !== undefined) {
          changes[String(k)] = {
            from: (store.riskProfile as any)[k],
            to: (data as any)[k],
          };
          (store.riskProfile as any)[k] = (data as any)[k];
          changed.push(String(k));
        }
      }
      store.recordRiskEvent(
        "RISK_PROFILE_UPDATE",
        "INFO",
        `Profile updated: ${changed.join(", ")}`,
      );
      logger.info("Risk profile updated", {
        requestId,
        action: "updateProfile",
        status: "OK",
        changed,
        circuitBreakerState: store.riskProfile.circuitBreakerState,
        tradingMode: store.riskProfile.tradingMode,
      });
      // Issue #112 — risk profile changes (especially `tradingMode`) are the
      // most sensitive mutations in the system. Audit-log the full before/
      // after diff so a compliance review can reconstruct exactly which
      // threshold moved from what to what, by whom, when.
      await auditLog({
        actor: "system",
        action: "RISK_PROFILE_UPDATED",
        entity: "risk_profile",
        detail: JSON.stringify(changes),
        requestId,
      });
      return NextResponse.json({ ok: true, profile: store.riskProfile });
    }
    if (data.action === "setBreaker") {
      const state = data.state;
      if (!state) {
        logger.warn("setBreaker rejected: missing state", {
          requestId,
          action: "setBreaker",
          status: "INVALID",
        });
        return NextResponse.json({ error: "state is required for setBreaker action" }, { status: 400 });
      }
      const reason = data.reason ?? "Manual override";
      const fromState = store.riskProfile.circuitBreakerState;
      store.setBreakerState(state, reason);
      logger.warn("Circuit breaker set", {
        requestId,
        action: "setBreaker",
        status: "OK",
        circuitBreakerState: state,
        reason,
      });
      // Issue #112 — manual breaker override is a high-impact operator action.
      // Audit-log the from→to transition + reason so a post-incident review
      // can determine whether the breaker was tripped by the engine (via
      // evaluateBreaker) or by a human operator (via setBreaker).
      await auditLog({
        actor: "system",
        action: "CIRCUIT_BREAKER_CHANGED",
        entity: "circuit_breaker",
        detail: JSON.stringify({ from: fromState, to: state, reason }),
        requestId,
      });
      return NextResponse.json({ ok: true, profile: store.riskProfile });
    }
    if (data.action === "evaluateBreaker") {
      const triggers = data.triggers ?? {};
      const fromState = store.riskProfile.circuitBreakerState;
      const { next, reason } = nextBreakerState(store.riskProfile.circuitBreakerState, triggers);
      store.setBreakerState(next, reason);
      logger.info("Circuit breaker evaluated", {
        requestId,
        action: "evaluateBreaker",
        status: "OK",
        from: fromState,
        to: next,
        reason,
        triggers: Object.keys(triggers),
      });
      // Issue #112 — engine-driven breaker transitions are audited with the
      // same shape as manual ones so a compliance review can filter by
      // `action: "CIRCUIT_BREAKER_CHANGED"` and see every transition,
      // regardless of source.
      await auditLog({
        actor: "system",
        action: "CIRCUIT_BREAKER_CHANGED",
        entity: "circuit_breaker",
        detail: JSON.stringify({ from: fromState, to: next, reason }),
        requestId,
      });
      return NextResponse.json({ ok: true, next, reason, profile: store.riskProfile });
    }
    logger.warn("Unknown risk action", {
      requestId,
      action: data.action,
      status: "INVALID",
    });
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    logger.error("Risk action failed", {
      requestId,
      action: "risk",
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
