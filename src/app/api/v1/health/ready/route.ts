import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/health/ready — readiness probe.
//
// Returns 200 + { status: "ready" } when every dependency the API needs to
// serve traffic is up. Returns 503 + { status: "degraded" } when any check
// fails — the orchestrator should stop routing traffic to this instance but
// NOT restart it (a restart won't fix a downstream outage).
//
// Checks:
//   - market_data : always true for now (simulated fallback always available;
//                   the live provider's health is reported separately in the
//                   main /api/v1/health payload's `dataIsLive` field).
//   - portfolio   : store.getPortfolio() — currently a pure in-memory op, but
//                   wrapped in try/catch so a future Prisma-backed portfolio
//                   that throws on DB outage degrades gracefully.
//   - memory      : heapUsed < 500 MiB. Node's default heap limit is ~4 GiB
//                   on 64-bit boxes; 500 MiB is a conservative ceiling that
//                   catches runaway growth before the V8 OOM killer fires.
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const checks: { name: string; ok: boolean }[] = [];
  // Check market data
  const ds = store.getDataSource();
  checks.push({ name: "market_data", ok: true }); // always ok (simulated fallback)
  // Check portfolio
  try { store.getPortfolio(); checks.push({ name: "portfolio", ok: true }); }
  catch { checks.push({ name: "portfolio", ok: false }); }
  // Check memory
  const mem = process.memoryUsage();
  checks.push({ name: "memory", ok: mem.heapUsed < 500 * 1024 * 1024 });
  const allOk = checks.every((c) => c.ok);
  return NextResponse.json(
    { status: allOk ? "ready" : "degraded", checks, timestamp: Date.now() },
    { status: allOk ? 200 : 503 },
  );
}
