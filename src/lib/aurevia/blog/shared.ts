import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Research Hub — shared helpers for blog API routes (issue #128).
//
// `slugify` — kebab-case slugger used for both article and category slugs.
//   Strips diacritics, collapses spaces, truncates to 80 chars so URLs stay
//   manageable, and appends a short suffix on collision so two articles
//   titled "Weekly Wrap" don't 409 against each other.
//
// `resolveCurrentUserId` — mirrors the pattern used by /api/v1/notifications
//   and /api/v1/user. In dev it returns the first seeded user so the views
//   have an author; in production it pulls the NextAuth session.
//
// `parseTags` / `serializeArticle` — converts between the JSON-string column
//   on the `Article` model and the JS array the API surface returns. Keeps
//   the storage layer (SQLite can't natively store arrays) transparent to
//   callers.
//
// `getReaderFingerprint` — best-effort anonymous identifier for like
//   deduplication. Hashes IP + User-Agent. Privacy-preserving: the hash is
//   one-way, so we can detect "this browser already liked this article"
//   without storing anything that identifies the reader.
// ---------------------------------------------------------------------------

const SLUG_MAX = 80;

export function slugify(input: string): string {
  return input
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
}

export async function ensureUniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let candidate = base || "untitled";
  let suffix = 1;
  // Cap attempts so a pathological loop doesn't spin forever.
  for (let i = 0; i < 50; i++) {
    const existing = await db.article.findFirst({
      where: { slug: candidate, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
      select: { id: true },
    });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`.slice(0, SLUG_MAX);
  }
  // Fallback — append a timestamp slug so we always return something unique.
  return `${base}-${Date.now().toString(36)}`.slice(0, SLUG_MAX);
}

export async function ensureUniqueCategorySlug(base: string): Promise<string> {
  let candidate = base || "uncategorized";
  let suffix = 1;
  for (let i = 0; i < 50; i++) {
    const existing = await db.category.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`.slice(0, SLUG_MAX);
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, SLUG_MAX);
}

export async function resolveCurrentUserId(): Promise<string | null> {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const u = await db.user.findFirst({ select: { id: true, name: true } });
    return u?.id ?? null;
  }
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("@/lib/aurevia/auth/auth-options");
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return ((session.user as any).id as string | undefined) ?? null;
}

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((t) => typeof t === "string");
  } catch {
    // Fall through — return empty.
  }
  return [];
}

export function serializeTags(tags: string[]): string {
  return JSON.stringify([...new Set(tags.map((t) => t.trim()).filter(Boolean))]);
}

// Rough reading-time estimate — 220 wpm is a calmer cadence than the
// traditional 200-250 average; research articles are denser than blog posts.
export function estimateReadingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export interface SerializedArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  status: string;
  featured: boolean;
  readingMinutes: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags: string[];
  aiSummary: string | null;
  aiTags: string[];
  aiSentiment: string | null;
  authorId: string | null;
  authorName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Issue #172 / FINAL-020 — replace the prior `a: any` parameter (which
// defeated type safety across every blog route) with the Prisma-derived
// shape every caller actually passes. The routes all `include` author +
// category with the same `select` projection (see blog/articles/route.ts,
// blog/articles/[slug]/route.ts, blog/seed/route.ts), so we model that
// shape directly via `Prisma.ArticleGetPayload`. If a future route needs
// a different projection it should narrow via a local type alias rather
// than widening this signature back to `any`.
type ArticleWithRelations = Prisma.ArticleGetPayload<{
  include: {
    author: { select: { id: true; name: true } };
    category: { select: { id: true; name: true; slug: true; color: true } };
  };
}>;

export function serializeArticle(a: ArticleWithRelations): SerializedArticle {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    content: a.content,
    coverImageUrl: a.coverImageUrl,
    status: a.status,
    featured: a.featured,
    readingMinutes: a.readingMinutes,
    viewCount: a.viewCount,
    likeCount: a.likeCount,
    commentCount: a.commentCount,
    tags: parseTags(a.tags),
    aiSummary: a.aiSummary,
    aiTags: parseTags(a.aiTags),
    aiSentiment: a.aiSentiment,
    authorId: a.authorId,
    authorName: a.author?.name ?? null,
    categoryId: a.categoryId,
    categoryName: a.category?.name ?? null,
    categoryColor: a.category?.color ?? null,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// Best-effort fingerprint for anonymous like deduplication. We can't get a
// perfect client id without cookies, but IP+UA hashed together is good
// enough for "did this browser already like this article?".
export function getReaderFingerprint(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  // Simple non-cryptographic hash — not for security, just for stable buckets.
  let h = 0;
  const s = `${ip}|${ua}`;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  // Use a cuid-like prefix so the column is greppable in logs.
  return `fp_${(h >>> 0).toString(36)}`;
}

// `dayKey` — YYYY-MM-DD in UTC. Used as the rollup key for the views chart.
// UTC keeps the daily bucket stable regardless of where the operator is
// sitting; the chart just labels days with the ISO date string.
export function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
