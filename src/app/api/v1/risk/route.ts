import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/aurevia/store";
import { nextBreakerState } from "@/lib/aurevia/risk/engine";

export const dynamic = "force-dynamic";

const RiskSchema = z
  .object({
    action: z.enum(["updateProfile", "setBreaker", "evaluateBreaker"]),
    state: z.enum(["NORMAL", "CAUTION", "TRADING_PAUSED", "RE_EVALUATING"]).optional(),
    reason: z.string().optional(),
    triggers: z.record(z.string(), z.any()).optional(),
  })
  .passthrough(); // allow numeric profile fields

// GET /api/v1/risk — risk profile + recent risk events + portfolio risk snapshot.
export async function GET() {
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
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RiskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten()?.formErrors?.[0] ?? parsed.error.message ?? "invalid request" },
        { status: 400 },
      );
    }
    const data = parsed.data;
    if (data.action === "updateProfile") {
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
      for (const k of allowed) {
        if ((data as any)[k] !== undefined) {
          (store.riskProfile as any)[k] = (data as any)[k];
        }
      }
      store.recordRiskEvent(
        "RISK_PROFILE_UPDATE",
        "INFO",
        `Profile updated: ${Object.keys(data).filter((k) => k !== "action").join(", ")}`,
      );
      return NextResponse.json({ ok: true, profile: store.riskProfile });
    }
    if (data.action === "setBreaker") {
      const state = data.state;
      if (!state) {
        return NextResponse.json({ error: "state is required for setBreaker action" }, { status: 400 });
      }
      const reason = data.reason ?? "Manual override";
      store.setBreakerState(state, reason);
      return NextResponse.json({ ok: true, profile: store.riskProfile });
    }
    if (data.action === "evaluateBreaker") {
      const triggers = data.triggers ?? {};
      const { next, reason } = nextBreakerState(store.riskProfile.circuitBreakerState, triggers);
      store.setBreakerState(next, reason);
      return NextResponse.json({ ok: true, next, reason, profile: store.riskProfile });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
