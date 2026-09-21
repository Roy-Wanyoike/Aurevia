import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { requireTenant } from "@/lib/aurevia/auth/tenant";
import { rateLimitKey, extractClientIp } from "@/lib/aurevia/rate-limit";
import { logger } from "@/lib/aurevia/logger";
import { resolveCurrentUserId } from "@/lib/aurevia/blog/shared";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/v1/blog/articles/[slug]/comments
//
// Returns the comment tree for an article, ordered oldest-first. The shape
// is a flat list — the client assembles the parent/child tree. Replies are
// included inline (status = "visible") with their parentId set.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? "blog-comments-list";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  // Issue #137 — tenant scoping.
  const tenant = await requireTenant();

  try {
    const { slug } = await params;
    const article = await db.article.findUnique({
      where: { slug },
      select: { id: true, organizationId: true },
    });
    if (!article) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Cross-tenant comments are invisible.
    if (tenant.organizationId && article.organizationId && article.organizationId !== tenant.organizationId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const rows = await db.articleComment.findMany({
      where: { articleId: article.id, status: "visible" },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    const comments = rows.map((c) => ({
      id: c.id,
      articleId: c.articleId,
      authorName: c.authorName,
      authorId: c.authorId,
      content: c.content,
      parentId: c.parentId,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json({ comments, total: comments.length });
  } catch (e: any) {
    logger.error("Blog comments list failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/blog/articles/[slug]/comments
//
// Body: { authorName, content, parentId? }
//
// Creates a new comment. Also increments the article's `commentCount` and
// emits a `blog:comment` event on the websocket service (the WS service
// runs out-of-process; the client polls / SSEs the comment list as a
// fallback if the WS connection isn't established).
//
// Issue #141 / SEC-005 — per-route rate limit: max 5 comments per article
// per IP per minute. Tighter than likes because comments are higher-cost
// (DB write + potential spam moderation queue).
// ---------------------------------------------------------------------------

const COMMENT_LIMIT_PER_ARTICLE_PER_MIN = 5;

const CreateCommentSchema = z.object({
  authorName: z.string().min(1).max(80).optional(),
  content: z.string().min(1).max(10_000),
  parentId: z.string().optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? "blog-comment-create";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  // Issue #137 — tenant scoping.
  const tenant = await requireTenant();

  try {
    const { slug } = await params;

    // Issue #141 / SEC-005 — per-article-per-IP rate limit. 5/min is tight
    // enough to block spam but loose enough for a threaded conversation.
    const ip = extractClientIp(req);
    const limitKey = `blog:comment:${slug}:${ip}`;
    const limit = rateLimitKey(limitKey, COMMENT_LIMIT_PER_ARTICLE_PER_MIN);
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

    // Cross-tenant comments are rejected.
    if (tenant.organizationId && article.organizationId && article.organizationId !== tenant.organizationId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = CreateCommentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // Validate parent belongs to the same article (no cross-article threading).
    if (data.parentId) {
      const parent = await db.articleComment.findUnique({
        where: { id: data.parentId },
        select: { articleId: true },
      });
      if (!parent || parent.articleId !== article.id) {
        return NextResponse.json(
          { error: "invalid_parent" },
          { status: 400 },
        );
      }
    }

    const authorId = await resolveCurrentUserId();
    const fallbackName = authorId ? "Aurevia Trader" : "Anonymous";
    const authorName = (data.authorName ?? "").trim() || fallbackName;

    const comment = await db.articleComment.create({
      data: {
        articleId: article.id,
        authorName,
        authorId,
        content: data.content.trim(),
        parentId: data.parentId ?? null,
        // Issue #137 — stamp the article's org on the comment row.
        organizationId: article.organizationId,
      },
    });

    await db.article.update({
      where: { id: article.id },
      data: { commentCount: { increment: 1 } },
    });

    logger.info("Blog comment created", {
      requestId,
      articleId: article.id,
      commentId: comment.id,
      authorId: authorId ?? "anon",
    });

    return NextResponse.json(
      {
        comment: {
          id: comment.id,
          articleId: comment.articleId,
          authorName: comment.authorName,
          authorId: comment.authorId,
          content: comment.content,
          parentId: comment.parentId,
          status: comment.status,
          createdAt: comment.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (e: any) {
    logger.error("Blog comment create failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
