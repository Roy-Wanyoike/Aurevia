import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/v1/auth/reset-password
//
// Consumes a single-use VerificationToken minted by /forgot-password and
// rotates the matching user's password. On success the token is deleted so
// it cannot be replayed; the user can then sign in with the new password.
//
// The token lookup is the only auth factor here — anyone with the token can
// reset the password. That's why /forgot-password logs the token to a
// controlled channel (server logs / email) and the token TTL is 1h.
// ---------------------------------------------------------------------------

const Schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { token, password } = parsed.data;

    const resetToken = await db.verificationToken.findUnique({ where: { token } });
    if (!resetToken || resetToken.expires < new Date()) {
      // Don't leak whether the token existed but was expired vs. never existed.
      if (resetToken) {
        await db.verificationToken.delete({ where: { token } }).catch(() => {});
      }
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({
      where: { email: resetToken.identifier },
    });
    if (!user) {
      // The token existed for an email that has no User row. Should not happen
      // in normal flow (forgot-password only mints tokens for existing users),
      // but guard against it anyway.
      await db.verificationToken.delete({ where: { token } }).catch(() => {});
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await db.user.update({
      where: { id: user.id },
      data: { hashedPassword },
    });

    // Single-use — consume the token after the password is rotated.
    await db.verificationToken.delete({ where: { token } });

    logger.info("Password reset completed", {
      requestId,
      userId: user.id,
      status: "OK",
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    logger.error("Reset-password failed", {
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
