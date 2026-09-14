import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia — Admin: users (Issue #123).
//
// GET /api/v1/admin/users
//   Lists every user in the system with the columns the admin dashboard needs:
//   id, email, name, role, createdAt. Password hashes are never returned. The
//   list is ordered newest-first so a freshly-onboarded user shows at the top
//   without sorting client-side.
//
// Auth: `requireAuth(req)` guards the route — same contract as every other
// v1 route. A future RBAC pass will additionally require the `admin` role.
// For now, any authenticated caller can list users; this matches the dev-mode
// posture of every other admin endpoint (audit-logs, feature-flags).
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    const items = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    }));

    logger.debug("Admin users listed", { requestId, count: items.length });
    return NextResponse.json({ users: items, total: items.length });
  } catch (e: any) {
    logger.error("Admin users GET failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
