import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/v1/auth/register
//
// Public self-service registration. Validates email + password (min 8 chars),
// rejects duplicate emails with 409, bcrypts the password at cost 12 (matching
// the seed-demo route), and provisions a default org + owner membership so the
// new user can immediately use tenant-scoped features.
//
// This route is intentionally NOT gated by `requireAuth()` — it has to be
// reachable by anonymous visitors. Rate limiting is the responsibility of the
// edge layer; the route itself does only idempotent validation + writes.
// ---------------------------------------------------------------------------

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { email, password, name } = parsed.data;

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await db.user.create({
      data: { email, name, hashedPassword, role: "trader" },
    });

    // Auto-provision a default org + owner membership so the new user has a
    // tenant context immediately. Slug derived from the user id to guarantee
    // uniqueness without a separate slug-collision retry loop.
    const org = await db.organization.create({
      data: {
        name: `${name || email}'s Workspace`,
        slug: `ws-${user.id.slice(0, 8)}`,
        plan: "free",
      },
    });
    await db.membership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: "owner",
      },
    });

    logger.info("User registered", {
      requestId,
      userId: user.id,
      orgId: org.id,
      status: "OK",
    });

    return NextResponse.json({ ok: true, userId: user.id, orgId: org.id });
  } catch (e: any) {
    logger.error("Registration failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    return NextResponse.json(
      { error: e?.message ?? "unknown" },
      { status: 500 },
    );
  }
}
