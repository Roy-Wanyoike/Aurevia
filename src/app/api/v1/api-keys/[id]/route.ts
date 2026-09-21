import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia — API keys (Issue #122) — DELETE handler.
//
// DELETE /api/v1/api-keys/[id]
//   Soft-revokes an API key by setting `revokedAt = now()`. The row is kept
//   so the audit trail survives — useful when a key was used to make a
//   request last week and you want to confirm it has since been revoked.
//
// The key is matched on BOTH `id` AND the caller's `userId`, so one user
// cannot revoke another user's key by guessing its cuid. In dev mode we
// resolve the user the same way as the other /api-keys routes.
// ---------------------------------------------------------------------------

async function resolveCurrentUser(): Promise<{ id: string } | null> {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const u = await db.user.findFirst({ select: { id: true } });
    return u ? { id: u.id } : null;
  }
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("@/lib/aurevia/auth/auth-options");
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as any).id as string | undefined;
  return userId ? { id: userId } : null;
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id || typeof id !== "string" || id.length < 8) {
      return NextResponse.json({ error: "Invalid key id" }, { status: 400 });
    }

    const user = await resolveCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Match on both id AND userId — a user can only revoke their own keys.
    // If the row doesn't exist OR belongs to someone else, return 404 (not
    // 403) so we don't leak the existence of other users' keys.
    const existing = await db.apiKey.findFirst({
      where: { id, userId: user.id, revokedAt: null },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    await db.apiKey.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    logger.info("API key revoked", {
      requestId,
      userId: user.id,
      keyId: existing.id,
      keyName: existing.name,
    });

    return NextResponse.json({ ok: true, id: existing.id, revokedAt: new Date().toISOString() });
  } catch (e: any) {
    logger.error("API key DELETE failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
