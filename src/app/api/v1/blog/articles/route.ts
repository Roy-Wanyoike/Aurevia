import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/aurevia/auth/check";
import { requireTenant, withTenantFilter } from "@/lib/aurevia/auth/tenant";
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
// GET /api/v1/blog/articles
//
// List articles with optional filters:
//   ?status=PUBLISHED|DRAFT|ARCHIVED|ALL  (default: PUBLISHED)
//   ?category=<slug>                       (filter by category slug)
//   ?tag=<tag>                             (filter by tag, substring match)
//   ?q=<search>                            (title + excerpt + content ILIKE)
//   ?featured=true                         (only featured articles)
//   ?authorId=<id>                          (only articles by this author)
//   ?page=1&limit=20                       (pagination)
//   ?sort=newest|oldest|popular|liked|az  (default: newest)
//
// Returns: { articles, total, page, limit, pagination }
// ---------------------------------------------------------------------------

const VALID_STATUSES = new Set(["PUBLISHED", "DRAFT", "ARCHIVED", "ALL"]);
const VALID_SORTS = new Set(["newest", "oldest", "popular", "liked", "az"]);

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "blog-articles-list";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  // Issue #137 — resolve tenant context for multi-tenant scoping. In dev
  // mode returns organizationId=null (no filter applied, backwards-compatible).
  const tenant = await requireTenant();

  try {
    const url = new URL(req.url);
    const params = url.searchParams;

    const statusParam = (params.get("status") ?? "PUBLISHED").toUpperCase();
    const status = VALID_STATUSES.has(statusParam) ? statusParam : "PUBLISHED";
    const categorySlug = params.get("category");
    const tag = params.get("tag");
    const q = params.get("q")?.trim();
    const featured = params.get("featured") === "true";
    const authorId = params.get("authorId") ?? undefined;
    const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(params.get("limit") ?? "20", 10) || 20));
    const sortParam = (params.get("sort") ?? "newest").toLowerCase();
    const sort = VALID_SORTS.has(sortParam) ? sortParam : "newest";

    // Build the Prisma `where` clause.
    const where: any = {};
    if (status !== "ALL") where.status = status;
    if (featured) where.featured = true;
    if (authorId) where.authorId = authorId;

    // Issue #137 — apply tenant filter so org A can't read org B's articles.
    const tenantWhere = withTenantFilter(where, tenant);

    if (categorySlug) {
      const category = await db.category.findUnique({
        where: { slug: categorySlug },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json({ articles: [], total: 0, page, limit });
      }
      tenantWhere.categoryId = category.id;
    }

    if (tag) {
      // Issue #141 / SEC-007 / BE-011 — SQLite doesn't have JSON operators
      // we can rely on, so we filter by substring match on the JSON-serialized
      // tags column. Previously the tag was escaped only for `\`, `%`, `_`
      // (LIKE wildcards) but NOT for `"`, so a crafted `tag='"'` would match
      // every article. We now validate the tag against a strict kebab-case
      // regex BEFORE building the WHERE clause — anything else returns empty.
      if (!/^[a-z0-9-]{1,40}$/.test(tag)) {
        return NextResponse.json({ articles: [], total: 0, page, limit });
      }
      tenantWhere.tags = { contains: `"${tag}"` };
    }

    if (q) {
      // ILIKE isn't supported on SQLite; use case-insensitive `contains`.
      tenantWhere.OR = [
        { title: { contains: q } },
        { excerpt: { contains: q } },
        { content: { contains: q } },
      ];
    }

    // Determine sort order. For `newest` / `oldest` we add a secondary
    // `updatedAt` sort so drafts (no `publishedAt`) still order predictably.
    let orderBy: any[];
    switch (sort) {
      case "oldest":
        orderBy = [{ publishedAt: "asc" }, { updatedAt: "asc" }];
        break;
      case "popular":
        orderBy = [{ viewCount: "desc" }, { updatedAt: "desc" }];
        break;
      case "liked":
        orderBy = [{ likeCount: "desc" }, { updatedAt: "desc" }];
        break;
      case "az":
        orderBy = [{ title: "asc" }];
        break;
      case "newest":
      default:
        orderBy = [{ publishedAt: "desc" }, { updatedAt: "desc" }];
        break;
    }

    const total = await db.article.count({ where: tenantWhere });
    const rows = await db.article.findMany({
      where: tenantWhere,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        author: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, slug: true, color: true } },
      },
    });
    const articles = rows.map(serializeArticle);

    logger.debug("Blog articles listed", {
      requestId,
      status,
      count: articles.length,
      total,
    });

    return NextResponse.json({
      articles,
      total,
      page,
      limit,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (e: any) {
    logger.error("Blog articles list failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    // Issue #142 / SEC-018 / BE-012 — don't leak Prisma error internals
    // (column / constraint names, partial SQL) to the client. Log server-side,
    // return a generic message to the caller.
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/blog/articles
//
// Create a new article. Body:
//   { title, content?, excerpt?, categoryId?, tags?, coverImageUrl?,
//     status?, featured?, slug? }
//
// The slug is auto-derived from the title when not provided, and uniquified
// on collision. Drafts don't get a `publishedAt`; publishing sets it.
// ---------------------------------------------------------------------------

const CreateArticleSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(500_000).optional().default(""),
  excerpt: z.string().max(500).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional().default([]),
  // Issue #133 / SEC-009 — `z.string().url()` accepts any scheme Zod/WHATWG
  // considers valid (including `javascript:`, `data:`, `file:`). Restrict to
  // https:// so cover images can't become an XSS vector in a future
  // rendering context (og:image, iframe src, etc.).
  coverImageUrl: z.string().url().refine(
    (u) => /^https:\/\//.test(u),
    "coverImageUrl must be an https URL",
  ).optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional().default("DRAFT"),
  featured: z.boolean().optional().default(false),
  slug: z.string().optional(),
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "blog-articles-create";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  // Issue #130 / BE-003 / SEC-001 — require trader+ to create articles.
  // In dev mode this is bypassed (requireRole returns "admin").
  const role = await requireRole(req, "trader");
  if (!role.ok) return role.response!;

  // Issue #137 — resolve tenant context so the new article is stamped with
  // the caller's organizationId. In dev mode returns null — backwards-compat.
  const tenant = await requireTenant();

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateArticleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;
    const authorId = await resolveCurrentUserId();

    // Resolve the category id (caller may pass a slug or an id).
    let categoryId: string | null = null;
    if (data.categoryId) {
      const cat = await db.category.findFirst({
        where: { OR: [{ id: data.categoryId }, { slug: data.categoryId }] },
        select: { id: true },
      });
      categoryId = cat?.id ?? null;
    }

    const baseSlug = slugify(data.slug ?? data.title);
    const slug = await ensureUniqueSlug(baseSlug);

    // Footgun guard: can't publish an empty article — silently demote to DRAFT.
    const effectiveStatus =
      data.status === "PUBLISHED" && data.content.trim().length === 0
        ? "DRAFT"
        : data.status;

    const article = await db.article.create({
      data: {
        slug,
        title: data.title.trim(),
        content: data.content,
        excerpt: data.excerpt ?? null,
        coverImageUrl: data.coverImageUrl ?? null,
        status: effectiveStatus,
        featured: data.featured,
        readingMinutes: estimateReadingMinutes(data.content),
        tags: serializeTags(data.tags),
        categoryId,
        authorId,
        // Issue #137 — stamp the caller's organizationId on the new article.
        organizationId: tenant.organizationId,
        publishedAt: effectiveStatus === "PUBLISHED" ? new Date() : null,
      },
      include: {
        author: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, slug: true, color: true } },
      },
    });

    logger.info("Blog article created", {
      requestId,
      slug: article.slug,
      status: article.status,
      authorId: authorId ?? "anon",
    });

    return NextResponse.json({ article: serializeArticle(article) }, { status: 201 });
  } catch (e: any) {
    logger.error("Blog article create failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
