import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/v1/auth/seed-demo — creates a demo user for testing.
// This endpoint is DEV-ONLY and would be removed in production.
export async function POST() {
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
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
