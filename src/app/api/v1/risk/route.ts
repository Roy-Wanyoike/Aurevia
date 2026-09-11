import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { nextBreakerState } from "@/lib/aurevia/risk/engine";

export const dynamic = "force-dynamic";

// GET /api/v1/risk — risk profile + recent risk events + portfolio risk snapshot.
export async function GET() {
  const portfolio = store.getPortfolio();
  return NextResponse.json({
    profile: store.riskProfile,
    portfolio,
    events: store.riskEvents.slice(0, 30),
    dayStartEquity: store.dayStartEquity,
    weekStartEquity: store.weekStartEquity,
  });
}

// POST /api/v1/risk — mutate risk profile or control circuit breaker.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "updateProfile") {
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
      if (body[k] !== undefined) {
        (store.riskProfile as any)[k] = body[k];
      }
    }
    store.recordRiskEvent("RISK_PROFILE_UPDATE", "INFO", `Profile updated: ${Object.keys(body).filter((k) => k !== "action").join(", ")}`);
    return NextResponse.json({ ok: true, profile: store.riskProfile });
  }
  if (body.action === "setBreaker") {
    const state = body.state;
    const reason = body.reason ?? "Manual override";
    store.setBreakerState(state, reason);
    return NextResponse.json({ ok: true, profile: store.riskProfile });
  }
  if (body.action === "evaluateBreaker") {
    const triggers = body.triggers ?? {};
    const { next, reason } = nextBreakerState(store.riskProfile.circuitBreakerState, triggers);
    store.setBreakerState(next, reason);
    return NextResponse.json({ ok: true, next, reason, profile: store.riskProfile });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
