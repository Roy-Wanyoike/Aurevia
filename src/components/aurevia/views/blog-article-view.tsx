"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Eye,
  Heart,
  MessageCircle,
  Clock,
  Sparkles,
  PenLine,
  Trash2,
  Send,
  Bot,
  Wifi,
  Users,
} from "lucide-react";
import {
  useArticle,
  useComments,
  useCreateComment,
  useTrackView,
  useToggleLike,
  useUpdateArticle,
  useDeleteArticle,
  type SerializedComment,
} from "@/lib/aurevia/hooks/blog";
import { useBlogChat } from "@/lib/aurevia/hooks/use-blog-chat";
import { useUI } from "@/lib/aurevia/ui-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Research Hub — single-article reader view (issue #128).
//
// Layout:
//   - Back button → returns to the article list
//   - Cover / header: title, meta, sentiment, tags
//   - AI summary panel (when present)
//   - Article body: rendered markdown (GFM-enabled)
//   - Engagement bar: like toggle, view/share/read-time
//   - Live comments thread: posts + reply box + typing indicator
//
// Realtime:
//   - On mount, the view joins the article's room on the blog-chat socket
//     (port 3004). New comments posted by other readers arrive via the
//     `blog:comment` event and are prepended to the local list.
//   - The "X readers on this article" presence chip in the header is fed
//     by the chat service's presence broadcasts.
//   - Typing indicator: when the user types in the comment box, the view
//     emits `blog:typing` (throttled). Other readers see "Alex is typing..."
// ---------------------------------------------------------------------------

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function relativeTime(iso: string) {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export function BlogArticleView() {
  const { selectedArticleSlug, setView, openBlogEditor } = useUI();
  const slug = selectedArticleSlug;

  const articleQ = useArticle(slug);
  const commentsQ = useComments(slug);
  const createCommentMut = useCreateComment();
  const trackViewMut = useTrackView();
  const likeMut = useToggleLike();
  const updateMut = useUpdateArticle();
  const deleteMut = useDeleteArticle();
  const chat = useBlogChat();

  const [authorName, setAuthorName] = useState("");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [hasTrackedView, setHasTrackedView] = useState(false);
  const [liked, setLiked] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const article = articleQ.data;

  // Join the article's realtime room.
  useEffect(() => {
    if (!slug) return;
    chat.joinArticle(slug);
    return () => {
      chat.leaveArticle();
    };
  }, [slug, chat]);

  // Identify ourselves to the chat service using localStorage name or
  // the demo user's name.
  useEffect(() => {
    if (article?.authorName) {
      const stored = window.localStorage.getItem("aurevia:reader-name");
      chat.identify(stored ?? article.authorName);
    }
  }, [article?.authorName, chat]);

  // Track view once per page-load.
  useEffect(() => {
    if (!slug || hasTrackedView || articleQ.isLoading) return;
    setHasTrackedView(true);
    trackViewMut.mutate(slug);
  }, [slug, hasTrackedView, articleQ.isLoading, trackViewMut]);

  // Throttle typing indicator: when the user types in the draft box, emit
  // `isTyping=true` immediately, then emit `isTyping=false` after 1.5s of
  // inactivity.
  useEffect(() => {
    if (!slug || !draft) return;
    if (!isTyping) {
      setIsTyping(true);
      chat.sendTyping(slug, authorName || "Reader", true);
    }
    const t = setTimeout(() => {
      setIsTyping(false);
      chat.sendTyping(slug, authorName || "Reader", false);
    }, 1500);
    return () => clearTimeout(t);
  }, [draft, slug, authorName, chat, isTyping]);

  // Merge server-fetched comments with any live comments that arrived via
  // the websocket since page load. Dedup by id.
  const allComments = useMemo(() => {
    const server = commentsQ.data ?? [];
    // Live comments come from the WS service — they don't carry articleId
    // or status fields, so we normalize them to the SerializedComment shape.
    const live: SerializedComment[] = chat.liveComments.map((c) => ({
      id: c.id,
      articleId: slug ?? "",
      authorName: c.authorName,
      authorId: null,
      content: c.content,
      parentId: c.parentId,
      status: "visible",
      createdAt: c.createdAt,
    }));
    const seen = new Set<string>();
    const merged: SerializedComment[] = [];
    for (const c of [...live, ...server]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push(c);
    }
    return merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [commentsQ.data, chat.liveComments, slug]);

  const typingPeersList = Object.values(chat.typingPeers).slice(-3);

  if (articleQ.isLoading && !article) {
    return <ArticleSkeleton />;
  }
  if (!article) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-base font-medium">Article not found</p>
        <p className="text-sm text-muted-foreground">
          The article you're looking for may have been deleted or never existed.
        </p>
        <Button onClick={() => setView("blog")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Research Hub
        </Button>
      </div>
    );
  }

  const handleCreateComment = () => {
    if (!slug) return;
    if (!draft.trim()) return;
    createCommentMut.mutate(
      {
        slug,
        authorName: authorName.trim() || undefined,
        content: draft.trim(),
        parentId: replyTo,
      },
      {
        onSuccess: (data) => {
          // Broadcast to other readers via the websocket.
          chat.broadcastComment(slug, data.comment);
          setDraft("");
          setReplyTo(null);
          // Clear typing indicator locally.
          setIsTyping(false);
          chat.sendTyping(slug, authorName || "Reader", false);
        },
        onError: (e: any) => {
          toast.error("Comment failed", { description: e?.message ?? "Could not post comment." });
        },
      },
    );
  };

  const handleToggleLike = () => {
    if (!slug) return;
    setLiked((v) => !v);
    likeMut.mutate(slug, {
      onError: () => setLiked((v) => !v),
    });
  };

  const handleToggleFeatured = () => {
    if (!slug) return;
    updateMut.mutate(
      { slug, featured: !article.featured },
      {
        onSuccess: () => {
          toast.success(
            article.featured ? "Unfeatured" : "Featured",
            {
              description: article.featured
                ? "Removed from the featured rail."
                : "Added to the featured rail.",
            },
          );
        },
      },
    );
  };

  const handleDelete = () => {
    if (!slug) return;
    if (!window.confirm("Delete this article permanently? This cannot be undone.")) return;
    deleteMut.mutate(slug, {
      onSuccess: () => {
        toast.success("Article deleted", { description: "The article has been permanently removed." });
        setView("blog");
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Sticky header — back button + engagement bar */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("blog")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Research Hub
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openBlogEditor(article.slug)}
              className="gap-2"
            >
              <PenLine className="h-4 w-4" /> Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleFeatured}
              className={cn(
                "gap-2",
                article.featured && "text-amber-500 hover:text-amber-600",
              )}
            >
              <Sparkles className="h-4 w-4" />
              {article.featured ? "Unfeature" : "Feature"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              className="gap-2 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {/* Article header */}
          <article>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {article.categoryName && (
                <Badge
                  variant="outline"
                  className="gap-1"
                  style={{
                    color: article.categoryColor ?? "#10b981",
                    borderColor: `${article.categoryColor ?? "#10b981"}55`,
                  }}
                >
                  {article.categoryName}
                </Badge>
              )}
              {article.aiSentiment && (
                <Badge variant="outline">
                  {article.aiSentiment}
                </Badge>
              )}
              {article.featured && (
                <Badge variant="secondary" className="gap-1 bg-amber-500/15 text-amber-600">
                  <Sparkles className="h-3 w-3" /> Featured
                </Badge>
              )}
              {article.status !== "PUBLISHED" && (
                <Badge variant="secondary" className="bg-muted">
                  {article.status}
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight">
              {article.title}
            </h1>
            {article.excerpt && (
              <p className="mt-3 text-base text-muted-foreground">
                {article.excerpt}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {article.authorName && (
                <span className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[10px]">
                      {initials(article.authorName)}
                    </AvatarFallback>
                  </Avatar>
                  by {article.authorName}
                </span>
              )}
              {article.publishedAt && (
                <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {article.readingMinutes} min read
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" /> {article.viewCount} views
              </span>
              {/* Presence chip */}
              <span className="flex items-center gap-1 text-emerald-500">
                <Users className="h-3 w-3" />
                {chat.presence?.onArticle ?? 0} reading
              </span>
              {chat.connected && (
                <span className="flex items-center gap-1 text-emerald-500">
                  <Wifi className="h-3 w-3" /> Live
                </span>
              )}
            </div>

            {/* Tags */}
            {article.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {article.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            )}

            {/* AI summary panel */}
            {article.aiSummary && (
              <Card className="mt-6 border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="flex items-start gap-3">
                  <Bot className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <div className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                      AI Summary
                    </div>
                    <p className="text-sm text-foreground">{article.aiSummary}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Article body */}
            {/* Issue #133 / FE-003 / SEC-008 — sanitize the rendered HTML via
                rehype-sanitize. The default schema strips `javascript:`,
                `data:`, `vbscript:` URL schemes from anchor `href` attributes
                and disallows raw `<script>` / inline event handlers. We also
                override the `a` element via the `components` prop to inject
                `target="_blank" rel="noopener noreferrer"` so external links
                open in a new tab without leaking referrer / window.opener. */}
            <div className="prose prose-sm dark:prose-invert mt-6 max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-p:leading-relaxed prose-li:leading-relaxed prose-a:text-primary prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-table:overflow-hidden prose-th:border prose-th:border-border prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-img:rounded-xl prose-a:break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeSanitize, {
                  ...defaultSchema,
                  attributes: {
                    ...defaultSchema.attributes,
                    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
                  },
                }]]}
                components={{
                  a: ({ node: _node, ...props }) => (
                    <a
                      {...props}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  ),
                }}
              >
                {article.content}
              </ReactMarkdown>
            </div>
          </article>

          {/* Engagement bar */}
          <div className="mt-8 flex items-center justify-between border-y border-border py-3">
            <div className="flex items-center gap-3">
              <Button
                variant={liked ? "default" : "outline"}
                size="sm"
                onClick={handleToggleLike}
                disabled={likeMut.isPending}
                className={cn(
                  "gap-2",
                  liked && "bg-rose-500 text-white hover:bg-rose-600",
                )}
              >
                <Heart className={cn("h-4 w-4", liked && "fill-current")} />
                {article.likeCount + (liked ? 1 : 0)}
              </Button>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageCircle className="h-4 w-4" /> {article.commentCount + chat.liveComments.length} comments
              </span>
            </div>
          </div>

          {/* Comments */}
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Discussion</h2>
              <span className="text-xs text-muted-foreground">
                {allComments.length} comment{allComments.length === 1 ? "" : "s"}
              </span>
            </div>

            {/* Comment composer */}
            <Card className="mb-6 p-4">
              <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Your name (optional)"
                  className="sm:max-w-[240px]"
                />
              </div>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  replyTo
                    ? "Write your reply..."
                    : "Share your thoughts on this research..."
                }
                rows={3}
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {replyTo && (
                    <>
                      Replying to a comment &mdash;{" "}
                      <button
                        className="text-primary hover:underline"
                        onClick={() => setReplyTo(null)}
                      >
                        cancel
                      </button>
                    </>
                  )}
                </span>
                <Button
                  onClick={handleCreateComment}
                  disabled={!draft.trim() || createCommentMut.isPending}
                  className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Send className="h-4 w-4" />
                  {createCommentMut.isPending ? "Posting..." : "Post comment"}
                </Button>
              </div>
            </Card>

            {/* Typing indicator */}
            {typingPeersList.length > 0 && (
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex gap-0.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: "0.15s" }} />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: "0.3s" }} />
                </span>
                {typingPeersList.map((p) => p.name).join(", ")}{" "}
                {typingPeersList.length === 1 ? "is" : "are"} typing...
              </div>
            )}

            {/* Comments list — flat list with optional threading */}
            <div className="space-y-3">
              {commentsQ.isLoading && !commentsQ.data ? (
                <CommentSkeleton />
              ) : allComments.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No comments yet. Be the first to start the discussion.
                  </p>
                </div>
              ) : (
                <>
                  {allComments
                    .filter((c) => !c.parentId)
                    .map((comment) => (
                      <CommentBlock
                        key={comment.id}
                        comment={comment}
                        replies={allComments.filter((r) => r.parentId === comment.id)}
                        onReply={() => setReplyTo(comment.id)}
                      />
                    ))}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function CommentBlock({
  comment,
  replies,
  onReply,
}: {
  comment: SerializedComment;
  replies: SerializedComment[];
  onReply: () => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">
            {initials(comment.authorName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{comment.authorName}</span>
            <span className="text-xs text-muted-foreground">
              {relativeTime(comment.createdAt)}
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words">
            {comment.content}
          </p>
          <button
            onClick={onReply}
            className="mt-2 text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            Reply
          </button>
        </div>
      </div>
      {replies.length > 0 && (
        <div className="mt-3 space-y-3 border-l-2 border-border pl-4">
          {replies.map((r) => (
            <div key={r.id} className="flex items-start gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px]">
                  {initials(r.authorName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{r.authorName}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {relativeTime(r.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-foreground whitespace-pre-wrap break-words">
                  {r.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ArticleSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-3">
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-3">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
