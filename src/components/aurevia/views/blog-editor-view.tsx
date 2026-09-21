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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  Eye,
  Code,
  Bot,
  Sparkles,
  Wand2,
  Tag as TagIcon,
  Plus,
  X,
  Loader2,
  Send,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import {
  useArticle,
  useCategories,
  useCreateArticle,
  useUpdateArticle,
  useAiAssist,
  type AiAssistAction,
} from "@/lib/aurevia/hooks/blog";
import { useUI } from "@/lib/aurevia/ui-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Research Hub — article editor view (issue #128).
//
// Split-pane markdown editor with live preview, category + tags + cover
// image metadata, status control, and an AI-assist panel that calls the
// /api/v1/blog/ai-assist route to summarize, suggest tags, classify
// sentiment, polish prose, or generate a starter draft from a topic.
//
// Modes:
//   - New article  → no `selectedArticleSlug` set, defaults to a blank draft
//   - Edit article → `selectedArticleSlug` set; loads the existing article
//
// The editor preserves unsaved changes locally (in-memory only — drafts
// don't persist across reloads yet). On save, the mutation invalidates the
// relevant query keys so the list / dashboard refetch.
// ---------------------------------------------------------------------------

const STATUS_VALUES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
type StatusValue = (typeof STATUS_VALUES)[number];

const AI_ACTIONS: Array<{
  action: AiAssistAction;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    action: "summarize",
    label: "Generate summary",
    description: "1-2 sentence auto-excerpt used in the list view.",
    icon: Sparkles,
  },
  {
    action: "suggestTags",
    label: "Suggest tags",
    description: "3-7 kebab-case tags based on the content.",
    icon: TagIcon,
  },
  {
    action: "sentiment",
    label: "Classify sentiment",
    description: "Bullish / bearish / neutral with confidence.",
    icon: TrendingUp,
  },
  {
    action: "improve",
    label: "Polish prose",
    description: "Tighten the draft — preserves your voice and intent.",
    icon: Wand2,
  },
  {
    action: "generate",
    label: "Generate draft",
    description: "Starter draft from a topic prompt (replaces current content).",
    icon: Bot,
  },
];

export function BlogEditorView() {
  const { selectedArticleSlug, setView, openArticle } = useUI();
  const isEditing = !!selectedArticleSlug;

  const articleQ = useArticle(selectedArticleSlug);
  const categoriesQ = useCategories();
  const createMut = useCreateArticle();
  const updateMut = useUpdateArticle();
  const aiMut = useAiAssist();

  // Local form state. We seed it from the fetched article once.
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [status, setStatus] = useState<StatusValue>("DRAFT");
  const [featured, setFeatured] = useState(false);
  const [topic, setTopic] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Load the article once when editing.
  useEffect(() => {
    if (!isEditing) {
      setHasLoaded(true);
      return;
    }
    if (articleQ.data && !hasLoaded) {
      const a = articleQ.data;
      setTitle(a.title);
      setExcerpt(a.excerpt ?? "");
      setContent(a.content);
      setCategoryId(a.categoryId);
      setTags(a.tags);
      setCoverImageUrl(a.coverImageUrl ?? "");
      setStatus(a.status as StatusValue);
      setFeatured(a.featured);
      setHasLoaded(true);
    }
  }, [articleQ.data, isEditing, hasLoaded]);

  const dirty = useMemo(() => {
    if (!isEditing) {
      // New article — dirty if any field has content.
      return (
        title.trim().length > 0 ||
        content.trim().length > 0 ||
        excerpt.trim().length > 0
      );
    }
    const a = articleQ.data;
    if (!a) return false;
    return (
      title !== a.title ||
      excerpt !== (a.excerpt ?? "") ||
      content !== a.content ||
      categoryId !== a.categoryId ||
      JSON.stringify(tags) !== JSON.stringify(a.tags) ||
      coverImageUrl !== (a.coverImageUrl ?? "") ||
      status !== a.status ||
      featured !== a.featured
    );
  }, [isEditing, articleQ.data, title, excerpt, content, categoryId, tags, coverImageUrl, status, featured]);

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!t) return;
    if (tags.includes(t)) {
      setTagInput("");
      return;
    }
    if (tags.length >= 20) {
      toast.success("Tag limit reached", { description: "Max 20 tags per article." });
      return;
    }
    setTags([...tags, t]);
    setTagInput("");
  };

  const handleSave = (publish?: boolean) => {
    if (!title.trim()) {
      toast.error("Title required", { description: "Add a title before saving." });
      return;
    }
    const nextStatus = publish ? "PUBLISHED" : status;
    const payload = {
      title: title.trim(),
      content,
      excerpt: excerpt.trim() || null,
      categoryId,
      tags,
      coverImageUrl: coverImageUrl.trim() || null,
      status: nextStatus,
      featured,
    };
    if (isEditing && selectedArticleSlug) {
      updateMut.mutate(
        { slug: selectedArticleSlug, ...payload },
        {
          onSuccess: (data) => {
            toast.success(
              publish ? "Article published" : "Draft saved",
              {
                description: publish
                  ? "Your article is now visible in the Research Hub."
                  : "Changes saved.",
              },
            );
            if (publish && data.article.slug !== selectedArticleSlug) {
              // Slug changed — update the URL.
              openArticle(data.article.slug);
            } else if (publish) {
              openArticle(data.article.slug);
            }
          },
          onError: (e: any) => {
            toast.error("Save failed", { description: e?.message ?? "Could not save the article." });
          },
        },
      );
    } else {
      createMut.mutate(
        { ...payload, status: nextStatus },
        {
          onSuccess: (data) => {
            toast.success(
              publish ? "Article published" : "Draft created",
              {
                description: publish
                  ? "Your article is now visible in the Research Hub."
                  : "Saved as a draft.",
              },
            );
            // FINAL-011 — only navigate to the reader on publish. Save-draft
            // keeps the author in the editor so they can keep iterating.
            if (publish) {
              openArticle(data.article.slug);
            }
          },
          onError: (e: any) => {
            toast.error("Create failed", { description: e?.message ?? "Could not create the article." });
          },
        },
      );
    }
  };

  const handleAiAssist = (action: AiAssistAction) => {
    if (action === "generate" && !topic.trim()) {
      toast.error("Topic required", { description: "Enter a topic to generate a draft from." });
      return;
    }
    if (action !== "generate" && !content.trim()) {
      toast.error("Content required", { description: "Add some content first." });
      return;
    }
    aiMut.mutate(
      {
        action,
        content: action === "generate" ? undefined : content,
        topic: action === "generate" ? topic : undefined,
        articleId: articleQ.data?.id,
      },
      {
        onSuccess: (result) => {
          if (action === "summarize" && result.summary) {
            setExcerpt(result.summary);
            toast.success("Summary generated", { description: "Excerpt updated." });
          } else if (action === "suggestTags" && result.tags) {
            const merged = [...new Set([...tags, ...result.tags])].slice(0, 20);
            setTags(merged);
            toast.success("Tags suggested", {
              description: `Added ${result.tags.length} tag${result.tags.length === 1 ? "" : "s"}.`,
            });
          } else if (action === "sentiment" && result.sentiment) {
            toast.success(`Sentiment: ${result.sentiment}`, {
              description: result.reason ?? `Confidence: ${Math.round((result.confidence ?? 0) * 100)}%`,
            });
          } else if (action === "improve" && result.improved) {
            setContent(result.improved);
            toast.success("Prose polished", { description: "Content updated." });
          } else if (action === "generate" && result.content) {
            if (content.trim() && !window.confirm("Replace the current content with the generated draft?")) {
              return;
            }
            setContent(result.content);
            toast.success("Draft generated", { description: "Content updated." });
          }
        },
        onError: (e: any) => {
          toast.error("AI assist failed", { description: e?.message ?? "Could not complete the AI action." });
        },
      },
    );
  };

  if (isEditing && articleQ.isLoading && !hasLoaded) {
    return (
      <div className="flex h-full flex-col p-6">
        <Skeleton className="h-8 w-40" />
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_320px]">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="flex h-full flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("blog")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <span className="text-sm text-muted-foreground">
              {isEditing ? "Editing" : "New article"}
              {dirty && <span className="ml-2 text-amber-500">● unsaved</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
              <button
                onClick={() => setPreviewMode(false)}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                  !previewMode ? "bg-accent text-foreground" : "text-muted-foreground",
                )}
              >
                <Code className="h-3 w-3" /> Markdown
              </button>
              <button
                onClick={() => setPreviewMode(true)}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                  previewMode ? "bg-accent text-foreground" : "text-muted-foreground",
                )}
              >
                <Eye className="h-3 w-3" /> Preview
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSave(false)}
              disabled={isSaving || !title.trim()}
              className="gap-2"
            >
              <Save className="h-4 w-4" /> Save draft
            </Button>
            <Button
              size="sm"
              onClick={() => handleSave(true)}
              disabled={isSaving || !title.trim() || !content.trim()}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Send className="h-4 w-4" /> Publish
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Editor column */}
          <div className="space-y-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Article title..."
              className="text-lg font-semibold"
            />
            <Input
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Excerpt — one-sentence summary shown in the list view (leave blank to use the AI-generated summary)..."
            />

            {previewMode ? (
              <Card className="min-h-[500px] p-6">
                <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-p:leading-relaxed prose-li:leading-relaxed prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-th:border prose-th:border-border prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2">
                  {content.trim() ? (
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
                          <a {...props} target="_blank" rel="noopener noreferrer" />
                        ),
                      }}
                    >{content}</ReactMarkdown>
                  ) : (
                    <p className="text-muted-foreground italic">
                      No content yet. Switch to Markdown mode to start writing,
                      or use the AI assist panel to generate a draft.
                    </p>
                  )}
                </div>
              </Card>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={"Write your article in markdown...\n\n# Heading\n\n## Subheading\n\n- bullet\n- bullet\n\n```python\nprint('hello world')\n```\n\n| Col A | Col B |\n| --- | --- |\n| 1 | 2 |"}
                className="min-h-[500px] resize-y font-mono text-sm leading-relaxed"
              />
            )}

            {/* Tag editor */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Tags
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="gap-1"
                  >
                    {t}
                    <button
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove tag ${t}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <div className="flex items-center gap-1">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="add tag..."
                    className="h-7 w-32 text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAddTag}
                    className="h-7 px-2"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar column — metadata + AI assist */}
          <aside className="space-y-4">
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Article settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Category
                  </label>
                  <Select
                    value={categoryId ?? "none"}
                    onValueChange={(v) => setCategoryId(v === "none" ? null : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select category..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {(categoriesQ.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Status
                  </label>
                  <Select
                    value={status}
                    onValueChange={(v) => setStatus(v as StatusValue)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_VALUES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0) + s.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Cover image URL (optional)
                  </label>
                  <Input
                    value={coverImageUrl}
                    onChange={(e) => setCoverImageUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="text-xs font-medium">Featured</span>
                  <button
                    onClick={() => setFeatured((v) => !v)}
                    className={cn(
                      "relative h-5 w-9 rounded-full transition-colors",
                      featured ? "bg-emerald-500" : "bg-muted",
                    )}
                    aria-pressed={featured}
                    aria-label="Toggle featured"
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                        featured ? "left-[18px]" : "left-0.5",
                      )}
                    />
                  </button>
                </div>
              </div>
            </Card>

            {/* AI Assist panel */}
            <Card className="border-emerald-500/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Bot className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-semibold">AI assist</h3>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Server-side LLM calls via z-ai-web-dev-sdk. Each action runs once
                and caches the result on the article (when editing).
              </p>
              <div className="space-y-2">
                {AI_ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.action}
                      onClick={() => handleAiAssist(a.action)}
                      disabled={aiMut.isPending}
                      className="flex w-full items-start gap-2 rounded-md border border-border bg-background p-2 text-left transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-foreground">{a.label}</div>
                        <div className="text-[10px] text-muted-foreground">{a.description}</div>
                      </div>
                      {aiMut.isPending && aiMut.variables?.action === a.action && (
                        <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />
                      )}
                    </button>
                  );
                })}
              </div>
              {AI_ACTIONS.find((a) => a.action === "generate") && (
                <div className="mt-3">
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Topic for draft generation..."
                    className="text-xs"
                  />
                </div>
              )}
            </Card>

            {/* Article stats when editing */}
            {isEditing && articleQ.data && (
              <Card className="p-4">
                <h3 className="mb-3 text-sm font-semibold">Engagement</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Views" value={articleQ.data.viewCount} />
                  <Stat label="Likes" value={articleQ.data.likeCount} />
                  <Stat label="Comments" value={articleQ.data.commentCount} />
                </div>
                {articleQ.data.aiSentiment && (
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">AI sentiment</span>
                    <SentimentChip sentiment={articleQ.data.aiSentiment} />
                  </div>
                )}
              </Card>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div className="text-base font-semibold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function SentimentChip({ sentiment }: { sentiment: string }) {
  const s = sentiment.toLowerCase();
  const Icon = s === "bullish" ? TrendingUp : s === "bearish" ? TrendingDown : Minus;
  const color =
    s === "bullish"
      ? "text-emerald-500"
      : s === "bearish"
        ? "text-rose-500"
        : "text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("gap-1", color)}>
      <Icon className="h-3 w-3" /> {s}
    </Badge>
  );
}
