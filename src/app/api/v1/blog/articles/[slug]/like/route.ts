import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { requireTenant } from "@/lib/aurevia/auth/tenant";
import { rateLimitKey, extractClientIp } from "@/lib/aurevia/rate-limit";
import { logger } from "@/lib/aurevia/logger";
import { getReaderFingerprint } from "@/lib/aurevia/blog/shared";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/v1/blog/articles/[slug]/like
//
// Toggles like state for the calling browser. Uses a fingerprint hash of
// IP+UA so anonymous readers can't multi-like. Authenticated users get
// their `userId` stamped on the row too.
//
// Issue #141 / SEC-005 — per-route rate limit: max 10 likes per article per
// IP per minute. Prevents like-flooding from bots.
//
// Returns: { liked: boolean, likeCount: number }
// ---------------------------------------------------------------------------

const LIKE_LIMIT_PER_ARTICLE_PER_MIN = 10;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? "blog-article-like";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  // Issue #137 — tenant scoping.
  const tenant = await requireTenant();

  try {
    const { slug } = await params;

    // Issue #141 / SEC-005 — per-article-per-IP rate limit. Likes are
    // single-tap actions; 10/min is generous for a human but blocks bots.
    const ip = extractClientIp(req);
    const limitKey = `blog:like:${slug}:${ip}`;
    const limit = rateLimitKey(limitKey, LIKE_LIMIT_PER_ARTICLE_PER_MIN);
    if (!limit.ok) {
      return NextResponse.json(
        {
          error: "rate_limit_exceeded",
          retryAfterMs: limit.retryAfterMs,
          limit: limit.limit,
        },
        {
          status: 429,
          headers: {
            "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)),
            "x-ratelimit-limit": String(limit.limit),
            "x-ratelimit-remaining": "0",
          },
        },
      );
    }

    const article = await db.article.findUnique({
      where: { slug },
      select: { id: true, organizationId: true },
    });
    if (!article) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Cross-tenant likes are silently rejected (404).
    if (tenant.organizationId && article.organizationId && article.organizationId !== tenant.organizationId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const fingerprint = getReaderFingerprint(req);

    // Toggle: if a like with this fingerprint exists, remove it; otherwise create.
    const existing = await db.articleLike.findUnique({
      where: { articleId_fingerprint: { articleId: article.id, fingerprint } },
      select: { id: true },
    });

    if (existing) {
      await db.$transaction([
        db.articleLike.delete({ where: { id: existing.id } }),
        db.article.update({
          where: { id: article.id },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);
      const refreshed = await db.article.findUnique({
        where: { id: article.id },
        select: { likeCount: true },
      });
      return NextResponse.json({ liked: false, likeCount: refreshed?.likeCount ?? 0 });
    }

    // Resolve the user id (optional — anonymous likes still work).
    let userId: string | null = null;
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      const u = await db.user.findFirst({ select: { id: true } });
      userId = u?.id ?? null;
    } else {
      const { getServerSession } = await import("next-auth");
      const { authOptions } = await import("@/lib/aurevia/auth/auth-options");
      const session = await getServerSession(authOptions);
      userId = (session?.user as any)?.id ?? null;
    }

    await db.$transaction([
      db.articleLike.create({
        data: {
          articleId: article.id,
          fingerprint,
          userId,
          // Issue #137 — stamp the article's org on the like row.
          organizationId: article.organizationId,
        },
      }),
      db.article.update({
        where: { id: article.id },
        data: { likeCount: { increment: 1 } },
      }),
    ]);

    const refreshed = await db.article.findUnique({
      where: { id: article.id },
      select: { likeCount: true },
    });

    return NextResponse.json({ liked: true, likeCount: refreshed?.likeCount ?? 0 });
  } catch (e: any) {
    logger.error("Blog article like toggle failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
