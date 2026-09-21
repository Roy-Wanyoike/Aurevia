import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/aurevia/auth/auth-options";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/v1/user
//
// Returns the currently authenticated user with their memberships (org +
// role). In dev (no auth configured), returns the first user in the DB so the
// profile view has something to render. In production, requires a NextAuth
// session.
//
// PATCH /api/v1/user
//
// Updates the current user's `name`. Same dev/prod auth split as GET. Returns
// 501 in production until the session→userId resolution is wired into the
// profile update path — that's intentional, the GET is read-only so it's safe
// to expose; the PATCH mutates state and so requires the full session
// plumbing.
// ---------------------------------------------------------------------------

interface UserOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
}

interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  organizations: UserOrg[];
}

async function resolveCurrentUser() {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    // Dev mode — no auth wired up; return the first user (demo user).
    return db.user.findFirst({
      include: {
        memberships: { include: { organization: true } },
      },
    });
  }

  // Production — require a NextAuth session.
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as any).id as string | undefined;
  if (!userId) return null;

  return db.user.findUnique({
    where: { id: userId },
    include: {
      memberships: { include: { organization: true } },
    },
  });
}

function toResponse(user: NonNullable<Awaited<ReturnType<typeof resolveCurrentUser>>>): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    organizations:
      user.memberships?.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        plan: m.organization.plan,
        role: m.role,
      })) ?? [],
  };
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const user = await resolveCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }
    return NextResponse.json({ user: toResponse(user) });
  } catch (e: any) {
    logger.error("user GET failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    return NextResponse.json(
      { error: "internal_error", requestId },
      { status: 500 },
    );
  }
}

const PatchSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function PATCH(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid name", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { name } = parsed.data;

    const user = await resolveCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { name },
    });

    logger.info("user profile updated", {
      requestId,
      userId: user.id,
      status: "OK",
    });

    // Re-fetch so the response carries the freshly persisted name + orgs.
    const updated = await db.user.findUnique({
      where: { id: user.id },
      include: { memberships: { include: { organization: true } } },
    });
    if (!updated) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: true, user: toResponse(updated) });
  } catch (e: any) {
    logger.error("user PATCH failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    return NextResponse.json(
      { error: "internal_error", requestId },
      { status: 500 },
    );
  }
}
