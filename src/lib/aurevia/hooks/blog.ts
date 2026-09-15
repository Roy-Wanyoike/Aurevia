"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// TanStack Query hooks for the Research Hub blog module.
// Mirrors the patterns used by the rest of the Aurevia hooks file — each
// route gets its own typed wrapper, mutations invalidate the right query
// keys so the UI refetches cleanly.
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// --- Types (mirrors the API route's serialized shape) ---

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

export interface SerializedCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  count: number;
  createdAt: string;
}

export interface SerializedComment {
  id: string;
  articleId: string;
  authorName: string;
  authorId: string | null;
  content: string;
  parentId: string | null;
  status: string;
  createdAt: string;
}

// --- Articles list ---

export interface ListArticlesParams {
  status?: "PUBLISHED" | "DRAFT" | "ARCHIVED" | "ALL";
  category?: string;
  tag?: string;
  q?: string;
  featured?: boolean;
  authorId?: string;
  page?: number;
  limit?: number;
  sort?: "newest" | "oldest" | "popular" | "liked" | "az";
}

export function useArticles(params: ListArticlesParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.category) searchParams.set("category", params.category);
  if (params.tag) searchParams.set("tag", params.tag);
  if (params.q) searchParams.set("q", params.q);
  if (params.featured) searchParams.set("featured", "true");
  if (params.authorId) searchParams.set("authorId", params.authorId);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.sort) searchParams.set("sort", params.sort);
  const qs = searchParams.toString();
  return useQuery({
    queryKey: ["blog", "articles", params],
    queryFn: () =>
      fetchJson<{ articles: SerializedArticle[]; total: number; page: number; limit: number }>(
        `/api/v1/blog/articles${qs ? `?${qs}` : ""}`,
      ),
    staleTime: 30_000,
  });
}

// --- Single article ---

export function useArticle(slug: string | null | undefined) {
  return useQuery({
    queryKey: ["blog", "article", slug],
    queryFn: () =>
      fetchJson<{ article: SerializedArticle }>(`/api/v1/blog/articles/${slug}`).then(
        (d) => d.article,
      ),
    enabled: !!slug,
    staleTime: 30_000,
  });
}

// --- Create article ---

export function useCreateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      content?: string;
      excerpt?: string | null;
      categoryId?: string | null;
      tags?: string[];
      coverImageUrl?: string | null;
      status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
      featured?: boolean;
      slug?: string;
    }) =>
      fetchJson<{ article: SerializedArticle }>("/api/v1/blog/articles", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blog", "articles"] });
      qc.invalidateQueries({ queryKey: ["blog", "dashboard"] });
      qc.invalidateQueries({ queryKey: ["blog", "categories"] });
    },
  });
}

// --- Update article ---

export function useUpdateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      slug: string;
      title?: string;
      content?: string;
      excerpt?: string | null;
      categoryId?: string | null;
      tags?: string[];
      coverImageUrl?: string | null;
      status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
      featured?: boolean;
      newSlug?: string;
    }) => {
      const { slug, newSlug, ...body } = input;
      // If the caller wants to rename the slug, the API accepts a `slug`
      // body field. We rename our local `newSlug` to `slug` here so the
      // caller's TypeScript types stay clean (the slug in the URL path
      // and the slug in the body have different semantics).
      if (newSlug !== undefined) (body as any).slug = newSlug;
      return fetchJson<{ article: SerializedArticle }>(
        `/api/v1/blog/articles/${slug}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["blog", "article", vars.slug] });
      qc.invalidateQueries({ queryKey: ["blog", "articles"] });
      qc.invalidateQueries({ queryKey: ["blog", "dashboard"] });
    },
  });
}

// --- Delete article ---

export function useDeleteArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) =>
      fetchJson<{ ok: boolean }>(`/api/v1/blog/articles/${slug}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blog", "articles"] });
      qc.invalidateQueries({ queryKey: ["blog", "dashboard"] });
      qc.invalidateQueries({ queryKey: ["blog", "categories"] });
    },
  });
}

// --- Track view (fire-and-forget; no query cache impact) ---

export function useTrackView() {
  return useMutation({
    mutationFn: (slug: string) =>
      fetchJson<{ ok: boolean }>(`/api/v1/blog/articles/${slug}/view`, {
        method: "POST",
      }),
  });
}

// --- Like toggle ---

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) =>
      fetchJson<{ liked: boolean; likeCount: number }>(
        `/api/v1/blog/articles/${slug}/like`,
        { method: "POST" },
      ),
    onSuccess: (_data, slug) => {
      qc.invalidateQueries({ queryKey: ["blog", "article", slug] });
      qc.invalidateQueries({ queryKey: ["blog", "articles"] });
      qc.invalidateQueries({ queryKey: ["blog", "dashboard"] });
    },
  });
}

// --- Comments ---

export function useComments(slug: string | null | undefined) {
  return useQuery({
    queryKey: ["blog", "comments", slug],
    queryFn: () =>
      fetchJson<{ comments: SerializedComment[]; total: number }>(
        `/api/v1/blog/articles/${slug}/comments`,
      ).then((d) => d.comments),
    enabled: !!slug,
    // Long stale time — we manually invalidate on new comment events.
    staleTime: 60_000,
    refetchInterval: false,
  });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      slug: string;
      authorName?: string;
      content: string;
      parentId?: string | null;
    }) => {
      const { slug, ...body } = input;
      return fetchJson<{ comment: SerializedComment }>(
        `/api/v1/blog/articles/${slug}/comments`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["blog", "comments", vars.slug] });
      qc.invalidateQueries({ queryKey: ["blog", "article", vars.slug] });
      qc.invalidateQueries({ queryKey: ["blog", "articles"] });
      qc.invalidateQueries({ queryKey: ["blog", "dashboard"] });
    },
  });
}

// --- Categories ---

export function useCategories() {
  return useQuery({
    queryKey: ["blog", "categories"],
    queryFn: () =>
      fetchJson<{ categories: SerializedCategory[]; total: number }>(
        "/api/v1/blog/categories",
      ).then((d) => d.categories),
    staleTime: 60_000,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      color?: string;
      slug?: string;
    }) =>
      fetchJson<{ category: SerializedCategory }>("/api/v1/blog/categories", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blog", "categories"] });
      qc.invalidateQueries({ queryKey: ["blog", "dashboard"] });
    },
  });
}

// --- Dashboard ---

export interface BlogDashboard {
  kpis: {
    totalArticles: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
  };
  viewsSeries: { day: string; views: number }[];
  topArticles: Array<{
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    coverImageUrl: string | null;
    views: number;
    likes: number;
    comments: number;
    categoryName: string;
    categoryColor: string;
    publishedAt: string | null;
  }>;
  categoryDistribution: Array<{
    id: string;
    name: string;
    slug: string;
    color: string;
    count: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: "comment";
    articleSlug: string;
    articleTitle: string;
    authorName: string;
    contentPreview: string;
    createdAt: string;
  }>;
  tagCloud: Array<{ tag: string; count: number }>;
}

export function useBlogDashboard() {
  return useQuery({
    queryKey: ["blog", "dashboard"],
    queryFn: () =>
      fetchJson<BlogDashboard>("/api/v1/blog/dashboard"),
    staleTime: 30_000,
  });
}

// --- AI Assist ---

export type AiAssistAction =
  | "summarize"
  | "suggestTags"
  | "sentiment"
  | "improve"
  | "generate";

export interface AiAssistResult {
  summary?: string;
  tags?: string[];
  sentiment?: string;
  confidence?: number;
  reason?: string;
  improved?: string;
  content?: string;
}

export function useAiAssist() {
  return useMutation({
    mutationFn: (input: {
      action: AiAssistAction;
      content?: string;
      topic?: string;
      articleId?: string;
    }) =>
      fetchJson<{ action: string; result: AiAssistResult }>(
        "/api/v1/blog/ai-assist",
        { method: "POST", body: JSON.stringify(input) },
      ).then((d) => d.result),
  });
}

// --- Seed (one-shot) ---

export function useSeedBlog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchJson<{ ok: boolean; skipped: boolean; categories?: number; articles?: number }>(
        "/api/v1/blog/seed",
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blog"] });
    },
  });
}
