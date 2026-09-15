import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
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
// Returns: { liked: boolean, likeCount: number }
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? "blog-article-like";
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
        data: { articleId: article.id, fingerprint, userId },
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
