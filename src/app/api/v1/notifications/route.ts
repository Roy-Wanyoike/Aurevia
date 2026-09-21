import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia — Notifications (Issue #125).
//
// GET /api/v1/notifications
//   Returns the most recent 50 notifications, newest first. `userId` is
//   scoped to the caller in production; in dev mode we return all
//   notifications (the demo user sees everything). `read=false` rows are
//   highlighted by the bell badge client-side.
//
// POST /api/v1/notifications
//   Body: `{ read: true }` — marks all of the caller's unread notifications
//   as read. Other bodies are rejected with 400 so the contract stays
//   narrow (no partial / per-id updates here yet — that comes when the
//   notification panel grows an archive button per row).
// ---------------------------------------------------------------------------

const LIST_LIMIT = 50;

async function resolveCurrentUserId(): Promise<string | null> {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const u = await db.user.findFirst({ select: { id: true } });
    return u?.id ?? null;
  }
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("@/lib/aurevia/auth/auth-options");
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as any).id as string | undefined;
  return userId ?? null;
}

// GET /api/v1/notifications — newest first, capped at LIST_LIMIT.
export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const userId = await resolveCurrentUserId();
    // In dev with no users seeded yet, return an empty list rather than 401
    // so the bell badge renders cleanly on a fresh checkout.
    const where = userId ? { userId } : {};
    const rows = await db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    });

    const notifications = rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    }));

    logger.debug("Notifications listed", {
      requestId,
      userId: userId ?? "none",
      count: notifications.length,
    });
    return NextResponse.json({ notifications, total: notifications.length });
  } catch (e: any) {
    logger.error("Notifications GET failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}

const MarkReadSchema = z.object({
  read: z.literal(true),
});

// POST /api/v1/notifications — mark all of the caller's notifications as read.
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = MarkReadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body — expected `{ read: true }`", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const userId = await resolveCurrentUserId();
    const where = userId ? { userId, read: false } : { read: false };
    const result = await db.notification.updateMany({
      where,
      data: { read: true },
    });

    logger.info("Notifications marked read", {
      requestId,
      userId: userId ?? "none",
      updated: result.count,
    });
    return NextResponse.json({ ok: true, updated: result.count });
  } catch (e: any) {
    logger.error("Notifications POST failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
