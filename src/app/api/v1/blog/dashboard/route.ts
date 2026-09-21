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
    // KPI tiles — denormalized counters on the article rows.
    const articles = await db.article.findMany({
      where: baseArticleWhere,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImageUrl: true,
        viewCount: true,
        likeCount: true,
        commentCount: true,
        tags: true,
        categoryId: true,
        publishedAt: true,
        category: { select: { id: true, name: true, slug: true, color: true } },
      },
    });

    const totalArticles = articles.length;
    const totalViews = articles.reduce((s, a) => s + a.viewCount, 0);
    const totalLikes = articles.reduce((s, a) => s + a.likeCount, 0);
    const totalComments = articles.reduce((s, a) => s + a.commentCount, 0);

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

    // Top articles by views.
    const topArticles = [...articles]
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 6)
      .map((a) => ({
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
    const categories = await db.category.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            articles: { where: { status: "PUBLISHED" } },
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

    // Tag cloud — flatten all article tags and count.
    const tagCounts = new Map<string, number>();
    for (const a of articles) {
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
