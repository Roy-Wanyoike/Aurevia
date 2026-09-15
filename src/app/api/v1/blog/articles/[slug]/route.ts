import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";
import {
  slugify,
  ensureUniqueSlug,
  resolveCurrentUserId,
  serializeArticle,
  serializeTags,
  estimateReadingMinutes,
} from "@/lib/aurevia/blog/shared";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/v1/blog/articles/[slug]
// Returns a single article by slug. In dev mode DRAFT articles are visible
// to everyone (matches the existing /api/v1/* dev-bypass posture); in
// production DRAFT visibility should be gated by author/admin role (TODO).
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? "blog-article-get";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const { slug } = await params;
    const article = await db.article.findUnique({
      where: { slug },
      include: {
        author: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, slug: true, color: true } },
      },
    });
    if (!article) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ article: serializeArticle(article) });
  } catch (e: any) {
    logger.error("Blog article get failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/blog/articles/[slug]
// Update an existing article. Body can include any subset of:
//   { title, content, excerpt, categoryId, tags, coverImageUrl,
//     status, featured, slug }
//
// Status transitions preserve the prior `publishedAt` if the article was
// already published; newly published articles get `publishedAt = now`.
// ---------------------------------------------------------------------------

const UpdateArticleSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(500_000).optional(),
  excerpt: z.string().max(500).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  coverImageUrl: z.string().url().optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  featured: z.boolean().optional(),
  slug: z.string().optional(),
  // When true, regenerate the AI summary/tags/sentiment after saving.
  // (The /ai-assist route does its own AI work; this is a re-cache flag.)
  refreshAi: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? "blog-article-patch";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const { slug } = await params;
    const existing = await db.article.findUnique({ where: { slug } });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateArticleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // Resolve category.
    let categoryId: string | null | undefined = undefined;
    if (data.categoryId !== undefined) {
      if (data.categoryId === null) {
        categoryId = null;
      } else {
        const cat = await db.category.findFirst({
          where: { OR: [{ id: data.categoryId }, { slug: data.categoryId }] },
          select: { id: true },
        });
        categoryId = cat?.id ?? null;
      }
    }

    // Compute new slug if title or slug changed.
    let newSlug: string | undefined = undefined;
    if (data.slug !== undefined && data.slug.trim() !== "") {
      const candidate = slugify(data.slug);
      if (candidate !== existing.slug) {
        newSlug = await ensureUniqueSlug(candidate, existing.id);
      }
    } else if (data.title !== undefined && data.title.trim() !== existing.title) {
      const candidate = slugify(data.title);
      if (candidate !== existing.slug) {
        newSlug = await ensureUniqueSlug(candidate, existing.id);
      }
    }

    // Status transition handling.
    const wasPublished = existing.status === "PUBLISHED";
    const newStatus = data.status ?? existing.status;
    const willPublish = newStatus === "PUBLISHED";
    // Newly published → stamp `publishedAt`. Already published → keep it.
    const publishedAt =
      !wasPublished && willPublish
        ? new Date()
        : wasPublished
          ? existing.publishedAt
          : null;

    // Footgun guard: can't publish an empty article.
    const effectiveStatus =
      willPublish && (data.content ?? existing.content).trim().length === 0
        ? "DRAFT"
        : newStatus;

    // Compute new content + reading minutes only when content changed.
    const content = data.content ?? existing.content;
    const readingMinutes = data.content !== undefined
      ? estimateReadingMinutes(data.content)
      : existing.readingMinutes;

    const updated = await db.article.update({
      where: { id: existing.id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(data.excerpt !== undefined ? { excerpt: data.excerpt } : {}),
        ...(data.coverImageUrl !== undefined ? { coverImageUrl: data.coverImageUrl } : {}),
        ...(data.featured !== undefined ? { featured: data.featured } : {}),
        ...(data.tags !== undefined ? { tags: serializeTags(data.tags) } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(newSlug ? { slug: newSlug } : {}),
        status: effectiveStatus,
        publishedAt,
        readingMinutes,
      },
      include: {
        author: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, slug: true, color: true } },
      },
    });

    logger.info("Blog article updated", {
      requestId,
      slug: updated.slug,
      status: updated.status,
    });

    return NextResponse.json({ article: serializeArticle(updated) });
  } catch (e: any) {
    logger.error("Blog article patch failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/blog/articles/[slug]
// Hard delete. Comments / likes / views cascade via the schema's `onDelete:
// Cascade`. Drafts are also hard-deleted — no soft-delete / trash bin in this
// PR (TODO: a `deletedAt` column when the moderation queue lands).
// ---------------------------------------------------------------------------

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? "blog-article-delete";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const { slug } = await params;
    const existing = await db.article.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await db.article.delete({ where: { id: existing.id } });
    logger.info("Blog article deleted", { requestId, slug });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    logger.error("Blog article delete failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
