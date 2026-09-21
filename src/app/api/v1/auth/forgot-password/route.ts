import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/v1/auth/forgot-password
//
// Self-service password reset requestor. Accepts an email address; if a User
// row matches, mint a single-use VerificationToken (1h TTL) and persist it.
// In production the token is delivered via email — that transport is not
// wired up here, so in dev we log it to the server console for the operator
// to copy/paste into the reset-password page.
//
// Email enumeration hardening: the response is ALWAYS 200 with the same body
// shape regardless of whether the email exists. A caller cannot distinguish
// "user not found" from "user found" via the HTTP response.
// ---------------------------------------------------------------------------

const Schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      // Return 200 with the same body shape as success to avoid leaking that
      // the email was syntactically invalid (which itself is a soft signal).
      // Validation errors are still 400 here because a malformed payload is a
      // client bug, not an enumeration probe.
      return NextResponse.json(
        { error: "Invalid email" },
        { status: 400 },
      );
    }
    const { email } = parsed.data;

    // Always return 200 to prevent email enumeration.
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomUUID();
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Clean up any prior reset tokens for this identifier first to avoid
      // stale tokens piling up for an email that's been reset multiple times.
      // (VerificationToken has @@unique([identifier, token]) so old tokens
      // don't collide, but pruning keeps the table tidy.)
      await db.verificationToken.deleteMany({ where: { identifier: email } }).catch(() => {});
      await db.verificationToken.create({
        data: { identifier: email, token, expires },
      });

      // In production: send email with reset link.
      // For dev: log the token so the operator can complete the flow via the
      // reset-password page without a mail server.
      logger.info("Password reset token issued", {
        requestId,
        email,
        expires: expires.toISOString(),
        status: "OK",
      });
      console.log(`[aurevia] Password reset token for ${email}: ${token}`);
    } else {
      logger.info("Password reset requested for unknown email", {
        requestId,
        email,
        status: "OK",
      });
    }

    return NextResponse.json({
      ok: true,
      message: "If the email exists, a reset link has been sent.",
    });
  } catch (e: any) {
    logger.error("Forgot-password failed", {
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
