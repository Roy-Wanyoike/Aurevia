"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Newspaper,
  Search,
  Eye,
  Heart,
  MessageCircle,
  Clock,
  Sparkles,
  PenLine,
  BarChart3,
  Inbox,
  ChevronRight,
} from "lucide-react";
import {
  useArticles,
  useCategories,
  useSeedBlog,
  type SerializedArticle,
  type SerializedCategory,
} from "@/lib/aurevia/hooks/blog";
import { useUI } from "@/lib/aurevia/ui-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Research Hub — article list / landing view (issue #128).
//
// This is the entry point to Aurevia's publishing surface. Traders land here
// to read market research, browse trade setups, and click through to the
// full article page where comments + AI summary live. The view also
// doubles as the author's library — drafts are accessible via the status
// filter, and a "New Article" button jumps straight into the markdown
// editor.
//
// Layout:
//   - Header: title + subtitle + "New Article" / "Dashboard" buttons
//   - Filter bar: search, status, category, sort
//   - Featured rail: large cards for the top featured articles
//   - List: compact cards for the remaining articles
//   - Sidebar: category chips + tag cloud (collapses on mobile)
//
// The empty state seeds the database with demo content (idempotent —
// only runs if no articles/categories exist yet).
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: Array<{ value: "PUBLISHED" | "DRAFT" | "ARCHIVED" | "ALL"; label: string }> = [
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Drafts" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "ALL", label: "All" },
];

const SORT_OPTIONS: Array<{ value: "newest" | "oldest" | "popular" | "liked" | "az"; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "popular", label: "Most viewed" },
  { value: "liked", label: "Most liked" },
  { value: "az", label: "A → Z" },
];

export function BlogView() {
  const { openArticle, openBlogEditor, setView } = useUI();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"PUBLISHED" | "DRAFT" | "ARCHIVED" | "ALL">("PUBLISHED");
  const [categorySlug, setCategorySlug] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<"newest" | "oldest" | "popular" | "liked" | "az">("newest");

  // Debounce search input so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const articlesQ = useArticles({
    status,
    category: categorySlug,
    q: debouncedSearch || undefined,
    sort,
    limit: 50,
  });
  const categoriesQ = useCategories();
  const seedMut = useSeedBlog();

  const articles = useMemo(
    () => articlesQ.data?.articles ?? [],
    [articlesQ.data],
  );
  const categories = categoriesQ.data ?? [];

  // Auto-seed if the list is empty on first load and the user hasn't filtered.
  useEffect(() => {
    if (
      articlesQ.isLoading ||
      seedMut.isPending ||
      articles.length > 0 ||
      status !== "PUBLISHED" ||
      !!categorySlug ||
      debouncedSearch
    )
      return;
    // Auto-seed once on the empty published list.
    seedMut.mutate(undefined, {
      onSuccess: (data) => {
        if (!data.skipped) {
          toast.success("Research Hub seeded", {
            description: `${data.categories ?? 0} categories and ${data.articles ?? 0} demo articles added.`,
          });
        }
      },
      onError: (e: any) => {
        toast.error("Seed failed", { description: e?.message ?? "Could not seed demo content." });
      },
    });
  }, [articlesQ.isLoading, articles.length, status, categorySlug, debouncedSearch, seedMut]);

  const featured = useMemo(
    () => articles.filter((a) => a.featured).slice(0, 3),
    [articles],
  );
  const rest = useMemo(
    () => articles.filter((a) => !featured.find((f) => f.id === a.id)),
    [articles, featured],
  );

  // All unique tags across the current list (for the sidebar tag cloud).
  const tagCloud = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of articles) {
      for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  }, [articles]);

  const isLoading = articlesQ.isLoading && !articlesQ.data;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background/95 px-6 py-5 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-emerald-500">
              <Newspaper className="h-3.5 w-3.5" />
              Research Hub
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              Market Research &amp; Trade Commentary
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Aurevia operators publish market research, trade setups, and strategy notes.
              Articles are versioned, AI-assisted, and open for community discussion.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setView("blog-dashboard")}
              className="gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Dashboard
            </Button>
            <Button
              size="sm"
              onClick={() => openBlogEditor(null)}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <PenLine className="h-4 w-4" />
              New Article
            </Button>
          </div>
        </div>
      </header>

      {/* Filter bar */}
      <div className="border-b border-border bg-muted/30 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles by title, excerpt, or content..."
              className="pl-9"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as typeof status)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={categorySlug ?? "all"}
            onValueChange={(v) => setCategorySlug(v === "all" ? undefined : v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.slug}>
                  {c.name} ({c.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Body: main list + sidebar */}
      <div className="flex flex-1 flex-col gap-6 overflow-hidden p-6 lg:flex-row lg:gap-8">
        <div className="flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <ArticleListSkeleton />
          ) : articles.length === 0 ? (
            <EmptyState
              onSeed={() => seedMut.mutate()}
              isSeeding={seedMut.isPending}
              hasFilter={!!search || !!categorySlug || status !== "PUBLISHED"}
              onClearFilters={() => {
                setSearch("");
                setStatus("PUBLISHED");
                setCategorySlug(undefined);
                setSort("newest");
              }}
            />
          ) : (
            <div className="space-y-6">
              {featured.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Featured
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {featured.map((a) => (
                      <FeaturedCard key={a.id} article={a} onOpen={() => openArticle(a.slug)} />
                    ))}
                  </div>
                </section>
              )}
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {featured.length > 0 ? "Latest" : "Articles"}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {articles.length} article{articles.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {rest.map((a) => (
                    <ArticleRow key={a.id} article={a} onOpen={() => openArticle(a.slug)} />
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Sidebar — categories + tag cloud. Hidden on mobile, shown on lg+. */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-0 space-y-6">
            <SidebarCategories
              categories={categories}
              selected={categorySlug}
              onSelect={setCategorySlug}
            />
            {tagCloud.length > 0 && (
              <Card className="p-4">
                <h3 className="mb-3 text-sm font-semibold">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {tagCloud.map(([tag, count]) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer gap-1 hover:bg-secondary/80"
                      onClick={() => {
                        // Filter via the search box — tags are part of the
                        // article title/excerpt/content, so a substring
                        // search is a decent UX here.
                        setSearch(tag);
                      }}
                    >
                      {tag}
                      <span className="text-[10px] text-muted-foreground">{count}</span>
                    </Badge>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------------

function FeaturedCard({ article, onOpen }: { article: SerializedArticle; onOpen: () => void }) {
  return (
    <Card
      onClick={onOpen}
      className="group relative cursor-pointer overflow-hidden border-border/60 p-0 transition-all hover:border-primary/40 hover:shadow-md"
    >
      {article.coverImageUrl ? (
        <div
          className="h-32 w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${article.coverImageUrl})` }}
        />
      ) : (
        <div
          className="h-32 w-full"
          style={{
            background: `linear-gradient(135deg, ${article.categoryColor ?? "#10b981"}22, ${article.categoryColor ?? "#10b981"}08)`,
          }}
        />
      )}
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1 text-[10px]"
            style={{
              color: article.categoryColor ?? "#10b981",
              borderColor: `${article.categoryColor ?? "#10b981"}55`,
            }}
          >
            {article.categoryName ?? "Uncategorized"}
          </Badge>
          {article.aiSentiment && (
            <SentimentBadge sentiment={article.aiSentiment} />
          )}
        </div>
        <h3 className="line-clamp-2 text-base font-semibold leading-snug group-hover:text-primary">
          {article.title}
        </h3>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {article.excerpt ?? "No excerpt available."}
        </p>
        <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> {article.viewCount}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" /> {article.likeCount}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3 w-3" /> {article.commentCount}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {article.readingMinutes} min
          </span>
        </div>
      </div>
    </Card>
  );
}

function ArticleRow({ article, onOpen }: { article: SerializedArticle; onOpen: () => void }) {
  return (
    <Card
      onClick={onOpen}
      className="group flex cursor-pointer items-start gap-4 p-4 transition-all hover:border-primary/40 hover:bg-accent/30"
    >
      <div
        className="hidden h-20 w-24 shrink-0 rounded-md sm:block"
        style={{
          background: `linear-gradient(135deg, ${article.categoryColor ?? "#10b981"}33, ${article.categoryColor ?? "#10b981"}11)`,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1 text-[10px]"
            style={{
              color: article.categoryColor ?? "#10b981",
              borderColor: `${article.categoryColor ?? "#10b981"}55`,
            }}
          >
            {article.categoryName ?? "Uncategorized"}
          </Badge>
          {article.featured && (
            <Badge variant="secondary" className="gap-1 bg-amber-500/15 text-amber-600 text-[10px]">
              <Sparkles className="h-3 w-3" /> Featured
            </Badge>
          )}
          {article.aiSentiment && <SentimentBadge sentiment={article.aiSentiment} />}
          {article.status === "DRAFT" && (
            <Badge variant="secondary" className="bg-muted text-[10px]">
              Draft
            </Badge>
          )}
        </div>
        <h3 className="line-clamp-1 text-base font-semibold group-hover:text-primary">
          {article.title}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {article.excerpt ?? "No excerpt available."}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> {article.viewCount}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" /> {article.likeCount}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3 w-3" /> {article.commentCount}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {article.readingMinutes} min read
          </span>
          {article.authorName && (
            <span className="text-muted-foreground/80">
              by {article.authorName}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="hidden h-5 w-5 shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5 md:block" />
    </Card>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const s = sentiment.toLowerCase();
  const color =
    s === "bullish"
      ? "text-emerald-500 border-emerald-500/40 bg-emerald-500/10"
      : s === "bearish"
        ? "text-rose-500 border-rose-500/40 bg-rose-500/10"
        : "text-muted-foreground border-border bg-muted";
  return (
    <Badge variant="outline" className={cn("text-[10px]", color)}>
      {s}
    </Badge>
  );
}

function SidebarCategories({
  categories,
  selected,
  onSelect,
}: {
  categories: SerializedCategory[];
  selected?: string;
  onSelect: (slug: string | undefined) => void;
}) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold">Categories</h3>
      <div className="space-y-0.5">
        <button
          onClick={() => onSelect(undefined)}
          className={cn(
            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
            !selected
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          All categories
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.slug)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
              selected === c.slug
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              {c.name}
            </span>
            <span className="text-[10px] text-muted-foreground">{c.count}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function ArticleListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="flex items-start gap-4 p-4">
          <Skeleton className="hidden h-20 w-24 rounded-md sm:block" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({
  onSeed,
  isSeeding,
  hasFilter,
  onClearFilters,
}: {
  onSeed: () => void;
  isSeeding: boolean;
  hasFilter: boolean;
  onClearFilters: () => void;
}) {
  return (
    <Card className="p-12">
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Inbox className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <p className="text-base font-medium">No articles yet</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {hasFilter
              ? "No articles match your current filters. Try clearing them or seeding the Research Hub with demo content to see how it looks."
              : "Seed the Research Hub with starter categories and demo articles so you can see the publishing workflow end-to-end, then write your own."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={onSeed} disabled={isSeeding} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
            <Sparkles className="h-4 w-4" />
            {isSeeding ? "Seeding..." : "Seed demo content"}
          </Button>
          {hasFilter && (
            <Button variant="outline" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
