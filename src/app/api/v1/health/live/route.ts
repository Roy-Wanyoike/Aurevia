import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/v1/health/live — liveness probe.
//
// Kubernetes-style liveness: is the process alive? No dependency checks —
// if this returns non-200, the orchestrator should restart the container.
// All heavy dependency checking belongs in /api/v1/health/ready so a slow
// downstream (e.g. market-data provider) doesn't cause a cascading restart.
export async function GET() {
  return NextResponse.json({ status: "alive", timestamp: Date.now() });
}
