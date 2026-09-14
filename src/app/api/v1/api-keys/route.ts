import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia — API keys (Issue #122).
//
// GET /api/v1/api-keys
//   List the calling user's non-revoked API keys. The `hashedKey` column is
//   never returned — once the plaintext key is shown at creation time it is
//   gone forever, exactly like GitHub PATs.
//
// POST /api/v1/api-keys
//   Generate a new key. Body: { name: string }. Returns the plaintext key
//   ONCE in `{ key: "aur_..." }`. The key is hashed with bcrypt (cost 12,
//   matching the password-hashing convention) and only the hash is stored.
//
// The plaintext key format is `aur_<base64url(32 bytes)>` so it is grep-able
// in logs ("aur_" prefix), URL-safe, and long enough that brute-force against
// the bcrypt hash is computationally infeasible.
// ---------------------------------------------------------------------------

const BCRYPT_COST = 12;

function generatePlainKey(): string {
  // 32 bytes of entropy → ~43 base64url chars. Total key length ~47 chars
  // including the `aur_` prefix. Plenty of collision resistance for a per-user
  // API key namespace.
  const buf = randomBytes(32);
  const b64 = buf.toString("base64url");
  return `aur_${b64}`;
}

async function resolveCurrentUser(): Promise<{ id: string; email: string } | null> {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    // Dev mode — no auth wired up; fall back to the first user so the API
    // keys view renders something useful locally. If no user exists yet,
    // returns null and the caller will respond 401.
    const u = await db.user.findFirst({ select: { id: true, email: true } });
    return u ? { id: u.id, email: u.email } : null;
  }

  // Production — rely on the NextAuth session. The /user route uses the same
  // pattern (see src/app/api/v1/user/route.ts).
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("@/lib/aurevia/auth/auth-options");
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as any).id as string | undefined;
  if (!userId) return null;
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  return u ? { id: u.id, email: u.email } : null;
}

// GET /api/v1/api-keys — list the caller's non-revoked keys.
export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const user = await resolveCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const keys = await db.apiKey.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    const masked = keys.map((k) => ({
      id: k.id,
      name: k.name,
      maskedKey: `••••${k.id.slice(-4)}`,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    }));

    logger.debug("API keys listed", { requestId, userId: user.id, count: masked.length });
    return NextResponse.json({ keys: masked, total: masked.length });
  } catch (e: any) {
    logger.error("API keys GET failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
});

// POST /api/v1/api-keys — generate a new key. Returns the plaintext ONCE.
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const user = await resolveCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid name", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const plainKey = generatePlainKey();
    const hashedKey = await bcrypt.hash(plainKey, BCRYPT_COST);

    const row = await db.apiKey.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        hashedKey,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    logger.info("API key created", {
      requestId,
      userId: user.id,
      keyId: row.id,
      keyName: row.name,
    });

    // The plaintext key is returned EXACTLY ONCE. The client must persist it
    // immediately — there is no recovery path if it is lost.
    return NextResponse.json({
      key: plainKey,
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    }, { status: 201 });
  } catch (e: any) {
    logger.error("API key POST failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
