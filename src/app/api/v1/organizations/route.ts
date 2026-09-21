import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/aurevia/auth/auth-options";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/v1/organizations
//
// Lists the organizations the current user belongs to (with their role).
// Dev mode returns the first user's orgs; production requires a session.
//
// POST /api/v1/organizations
//
// Creates a new Organization + adds the current user as owner. The slug is
// derived from the requested name (lowercased, kebab-cased, suffix-trimmed
// for uniqueness against existing slugs).
// ---------------------------------------------------------------------------

interface OrgMembership {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
  createdAt: string;
}

async function resolveCurrentUserId(): Promise<string | null> {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const u = await db.user.findFirst({ select: { id: true } });
    return u?.id ?? null;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as any).id as string | null;
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const userId = await resolveCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }
    const memberships = await db.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
    const orgs: OrgMembership[] = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      plan: m.organization.plan,
      role: m.role,
      createdAt: m.organization.createdAt.toISOString(),
    }));
    return NextResponse.json({ organizations: orgs });
  } catch (e: any) {
    logger.error("organizations GET failed", {
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

const PostSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, "slug must be lowercase, alphanumeric, or hyphen").optional(),
  plan: z.enum(["free", "pro", "enterprise"]).optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const userId = await resolveCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    // Resolve a unique slug. If the requested slug is taken, append a short
    // suffix. Cap at a few attempts so a pathological case can't loop.
    const baseSlug = (parsed.data.slug ?? slugify(parsed.data.name)) || `org-${userId.slice(0, 6)}`;
    let slug = baseSlug;
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await db.organization.findUnique({ where: { slug } });
      if (!existing) break;
      slug = `${baseSlug}-${attempt + 1}`;
    }

    const org = await db.organization.create({
      data: {
        name: parsed.data.name,
        slug,
        plan: parsed.data.plan ?? "free",
      },
    });
    await db.membership.create({
      data: {
        userId,
        organizationId: org.id,
        role: "owner",
      },
    });

    logger.info("organization created", {
      requestId,
      userId,
      orgId: org.id,
      slug,
      status: "OK",
    });

    return NextResponse.json({
      ok: true,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        role: "owner",
        createdAt: org.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    logger.error("organizations POST failed", {
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
