import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { requireTenant, withTenantFilter } from "@/lib/aurevia/auth/tenant";
import { logger } from "@/lib/aurevia/logger";
import { dayKey, parseTags } from "@/lib/aurevia/blog/shared";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/v1/blog/dashboard
//
// Returns the engagement analytics bundle for the Research Hub dashboard:
//   - KPI tiles: total articles, total views, total likes, total comments
//   - Views over time: 14-day daily series (per-day totals across all
//     articles, with day = YYYY-MM-DD UTC)
//   - Top articles by views: top 6 with title/slug/views/likes/comments
//   - Categories distribution: { name, color, count } per category
//   - Recent activity: 8 most-recent comments + 8 most-recent articles
//   - Tag cloud: unique tags across all published articles with counts
//
// All numbers are derived from the denormalized counters on the article
// rows + the ArticleView rollup table — no live aggregation across the
// entire ArticleView table on every request (that table grows fast).
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "blog-dashboard";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  // Issue #137 — tenant scoping. The dashboard only shows articles / comments
  // / views belonging to the caller's org (or system-owned when null).
  const tenant = await requireTenant();
  const baseArticleWhere = withTenantFilter<{ status: string }>({ status: "PUBLISHED" }, tenant);

  try {
    // KPI tiles — issue #190 / AUDIT-010. The previous implementation
    // fetched EVERY published article row into memory (findMany + reduce)
    // just to compute four KPI sums. On a mature blog that's thousands of
    // rows transferred + a JS-side reduce on every dashboard load. The DB
    // can compute all four sums in a single indexed aggregate query that
    // touches only the denormalized counters on the article rows. The
    // expensive `findMany` is now reserved for `topArticles` (top-6 by
    // viewCount) and `tagCloud` (needs every article's `tags` JSON).
    const kpis = await db.article.aggregate({
      where: baseArticleWhere,
      _sum: {
        viewCount: true,
        likeCount: true,
        commentCount: true,
      },
      _count: true,
    });

    const totalArticles = kpis._count;
    const totalViews = kpis._sum.viewCount ?? 0;
    const totalLikes = kpis._sum.likeCount ?? 0;
    const totalComments = kpis._sum.commentCount ?? 0;

    // 14-day views series — query the ArticleView rollup table.
    const days: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      days.push(dayKey(d));
    }
    const viewsByDayRows = await db.articleView.groupBy({
      by: ["day"],
      where: withTenantFilter({ day: { in: days } }, tenant),
      _count: { _all: true },
    });
    const viewsByDayMap = new Map<string, number>();
    for (const row of viewsByDayRows) {
      viewsByDayMap.set(row.day, row._count._all);
    }
    const viewsSeries = days.map((d) => ({ day: d, views: viewsByDayMap.get(d) ?? 0 }));

    // Top articles by views — issue #190. The previous implementation loaded
    // every article into memory, sorted in JS, then sliced the top 6. Let
    // Postgres/SQLite do the work: an indexed ORDER BY viewCount DESC with
    // take: 6 returns only 6 rows instead of the full table.
    const topArticleRows = await db.article.findMany({
      where: baseArticleWhere,
      orderBy: { viewCount: "desc" },
      take: 6,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImageUrl: true,
        viewCount: true,
        likeCount: true,
        commentCount: true,
        publishedAt: true,
        category: { select: { id: true, name: true, slug: true, color: true } },
      },
    });
    const topArticles = topArticleRows.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      excerpt: a.excerpt,
      coverImageUrl: a.coverImageUrl,
      views: a.viewCount,
      likes: a.likeCount,
      comments: a.commentCount,
      categoryName: a.category?.name ?? "Uncategorized",
      categoryColor: a.category?.color ?? "#94a3b8",
      publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    }));

    // Categories distribution.
    // Issue #189 / AUDIT-009 — the `_count` filter on `articles` previously
    // used only `{ status: "PUBLISHED" }`, which counts articles across ALL
    // tenants for each category. That leaks cross-tenant article counts to
    // every dashboard viewer. Thread the tenant filter through so only the
    // caller's org's published articles are counted (the `tenant` variable
    // is resolved at the top of the handler via `requireTenant()`).
    const categories = await db.category.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            articles: {
              where: withTenantFilter({ status: "PUBLISHED" }, tenant),
            },
          },
        },
      },
    });
    const categoryDistribution = categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      color: c.color,
      count: c._count.articles,
    }));

    // Recent comments — most recent 8 visible comments across all articles
    // in the caller's org.
    // Issue #143 / SEC-017 — filter by status=visible so moderated/hidden
    // comments don't appear in the dashboard feed.
    // Issue #137 — tenant-scoped.
    const recentComments = await db.articleComment.findMany({
      where: withTenantFilter({ status: "visible" }, tenant),
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        article: { select: { slug: true, title: true } },
      },
    });
    const recentActivity = recentComments.map((c) => ({
      id: c.id,
      type: "comment" as const,
      articleSlug: c.article.slug,
      articleTitle: c.article.title,
      authorName: c.authorName,
      contentPreview: c.content.slice(0, 120),
      createdAt: c.createdAt.toISOString(),
    }));

    // Tag cloud — flatten all article tags and count. Issue #190: this is
    // the second remaining findMany that legitimately needs every published
    // article row (because the tag cloud is computed from the per-article
    // `tags` JSON array, which the DB can't group by natively). The select
    // is trimmed to ONLY the `tags` column so we transfer one small column
    // per row instead of the entire KPI payload the old query returned.
    const tagArticleRows = await db.article.findMany({
      where: baseArticleWhere,
      select: { tags: true },
    });
    const tagCounts = new Map<string, number>();
    for (const a of tagArticleRows) {
      for (const t of parseTags(a.tags)) {
        tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      }
    }
    const tagCloud = [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    logger.debug("Blog dashboard assembled", {
      requestId,
      totalArticles,
      totalViews,
      totalLikes,
      totalComments,
    });

    return NextResponse.json({
      kpis: {
        totalArticles,
        totalViews,
        totalLikes,
        totalComments,
      },
      viewsSeries,
      topArticles,
      categoryDistribution,
      recentActivity,
      tagCloud,
    });
  } catch (e: any) {
    logger.error("Blog dashboard failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
