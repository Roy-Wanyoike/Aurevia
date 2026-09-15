import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";
import { dayKey } from "@/lib/aurevia/blog/shared";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/v1/blog/articles/[slug]/view
//
// Records a single view on the article. Idempotent-ish: we always insert a
// new `ArticleView` row (so the chart sees every visit) AND increment the
// denormalized `viewCount` counter on the article. Per-day rollup via the
// `day` column makes the dashboard chart query a single GROUP BY.
//
// Browser clients should debounce this — call once per article per session,
// not on every render. (The hook in `useArticle` does this.)
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? "blog-article-view";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const { slug } = await params;
    const article = await db.article.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!article) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const today = dayKey();
    await db.$transaction([
      db.articleView.create({
        data: { articleId: article.id, day: today },
      }),
      db.article.update({
        where: { id: article.id },
        data: { viewCount: { increment: 1 } },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    logger.error("Blog article view tracking failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
