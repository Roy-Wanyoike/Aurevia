import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/auth/seed-demo — creates a demo user for testing.
//
// Issue #64 — this endpoint seeds a known email/password into the database so
// developers can sign in without running a separate script. In production it
// is a security hole: anyone could POST and create a known account. So we
// hard-disable it when NODE_ENV === "production" — returns 404 (not 403) so
// the endpoint appears not to exist, which is what we want an attacker to
// believe. The check runs FIRST, before any DB work, so we never touch the
// database in prod even if someone discovers the route.
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";

  if (process.env.NODE_ENV === "production") {
    logger.warn("seed-demo endpoint blocked in production", {
      requestId,
      path: "/api/v1/auth/seed-demo",
      status: "NOT_FOUND",
    });
    return new NextResponse(null, { status: 404 });
  }

  try {
    const email = "demo@aurevia.io";
    const password = "aurevia123";
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ ok: true, message: "Demo user already exists", credentials: { email, password } });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await db.user.create({
      data: {
        email,
        name: "Demo Trader",
        role: "trader",
        hashedPassword,
      },
    });
    const org = await db.organization.create({
      data: {
        name: "Demo Capital",
        slug: "demo-capital",
        plan: "pro",
      },
    });
    await db.membership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: "owner",
      },
    });
    return NextResponse.json({
      ok: true,
      message: "Demo user + organization created",
      credentials: { email, password },
      userId: user.id,
      orgId: org.id,
    });
  } catch (e: any) {
    logger.error("seed-demo failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
