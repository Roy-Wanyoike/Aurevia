import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/health/live — liveness probe.
//
// Kubernetes-style liveness: is the process alive? No dependency checks —
// if this returns non-200, the orchestrator should restart the container.
// All heavy dependency checking belongs in /api/v1/health/ready so a slow
// downstream (e.g. market-data provider) doesn't cause a cascading restart.
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ status: "alive", timestamp: Date.now() });
}
