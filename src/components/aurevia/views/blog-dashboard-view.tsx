"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  Newspaper,
  Eye,
  Heart,
  MessageCircle,
  TrendingUp,
  ArrowLeft,
  PenLine,
  Clock,
  Tag as TagIcon,
} from "lucide-react";
import { useBlogDashboard } from "@/lib/aurevia/hooks/blog";
import { useUI } from "@/lib/aurevia/ui-store";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Research Hub — analytics dashboard (issue #128).
//
// Surfaces engagement analytics for the publishing platform:
//   - KPI tiles: total articles, views, likes, comments
//   - 14-day views series (bar chart)
//   - Category distribution (pie chart)
//   - Top articles by views (compact list with click-through)
//   - Recent activity (most-recent comments)
//   - Tag cloud
//
// All numbers come from the /api/v1/blog/dashboard endpoint — no client-side
// aggregation. The denormalized counters on the article rows make this
// query fast even with thousands of articles.
// ---------------------------------------------------------------------------

const PIE_COLORS = ["#10b981", "#06b6d4", "#f59e0b", "#ec4899", "#a855f7", "#14b8a6", "#f97316", "#6366f1"];

export function BlogDashboardView() {
  const { setView, openArticle, openBlogEditor } = useUI();
  const q = useBlogDashboard();

  if (q.isLoading && !q.data) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!q.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-base font-medium">Dashboard unavailable</p>
        <Button onClick={() => q.refetch()} variant="outline">Retry</Button>
      </div>
    );
  }

  const d = q.data;
  const hasData = d.kpis.totalArticles > 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-emerald-500">
            <BarChart className="h-3.5 w-3.5" />
            Research Hub
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Engagement Dashboard</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            How your research is performing across views, likes, and discussion.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setView("blog")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to articles
          </Button>
          <Button size="sm" onClick={() => openBlogEditor(null)} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
            <PenLine className="h-4 w-4" /> New article
          </Button>
        </div>
      </div>

      {!hasData ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Newspaper className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-base font-medium">No published articles yet</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Publish your first article or seed the Research Hub with demo content
                from the article list view, then come back here to see the analytics.
              </p>
            </div>
            <Button onClick={() => setView("blog")} className="gap-2">
              Go to Research Hub
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiTile
              label="Published articles"
              value={d.kpis.totalArticles}
              icon={Newspaper}
              accent="#10b981"
            />
            <KpiTile
              label="Total views"
              value={d.kpis.totalViews}
              icon={Eye}
              accent="#06b6d4"
            />
            <KpiTile
              label="Total likes"
              value={d.kpis.totalLikes}
              icon={Heart}
              accent="#ec4899"
            />
            <KpiTile
              label="Total comments"
              value={d.kpis.totalComments}
              icon={MessageCircle}
              accent="#a855f7"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Views over time */}
            <Card className="p-4 lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Views over the last 14 days</h3>
                <span className="text-xs text-muted-foreground">UTC daily rollup</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.viewsSeries} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(s: string) => s.slice(5)}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                      width={28}
                    />
                    <RechartsTooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                      contentStyle={{
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      labelFormatter={(s: string) => `Day: ${s}`}
                    />
                    <Bar dataKey="views" radius={[3, 3, 0, 0]} fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Category distribution */}
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Articles by category</h3>
              {d.categoryDistribution.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                  No categories yet
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={d.categoryDistribution}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                        paddingAngle={2}
                      >
                        {d.categoryDistribution.map((entry, i) => (
                          <Cell
                            key={entry.id}
                            fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          background: "var(--background)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 10 }}
                        iconType="circle"
                        iconSize={8}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {/* Top articles + recent activity */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Top articles by views</h3>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="space-y-2">
                {d.topArticles.map((a, i) => (
                  <button
                    key={a.id}
                    onClick={() => openArticle(a.slug)}
                    className="flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/50"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm font-medium">{a.title}</div>
                      <div className="mt-0.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="h-2.5 w-2.5" /> {a.views}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="h-2.5 w-2.5" /> {a.likes}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-2.5 w-2.5" /> {a.comments}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px]"
                          style={{
                            color: a.categoryColor,
                            borderColor: `${a.categoryColor}55`,
                          }}
                        >
                          {a.categoryName}
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Recent comments</h3>
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              {d.recentActivity.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                  No comments yet
                </div>
              ) : (
                <div className="space-y-3">
                  {d.recentActivity.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => openArticle(a.articleSlug)}
                      className="flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/50"
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px]">
                          {a.authorName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs">
                          <span className="font-medium">{a.authorName}</span>{" "}
                          <span className="text-muted-foreground">on</span>{" "}
                          <span className="font-medium">{a.articleTitle}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {a.contentPreview}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(a.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Tag cloud */}
          {d.tagCloud.length > 0 && (
            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <TagIcon className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-semibold">Tag cloud</h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {d.tagCloud.map(({ tag, count }) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className={cn(
                      "cursor-pointer transition-all hover:bg-emerald-500/10 hover:text-emerald-600",
                    )}
                    style={{
                      fontSize: `${Math.min(14, 10 + Math.min(count, 8))}px`,
                    }}
                    onClick={() => {
                      // Switch to the article list view with this tag in the
                      // search box (the list view's filter reads from URL?view=blog).
                      setView("blog");
                    }}
                  >
                    {tag}
                    <span className="ml-1 text-[10px] text-muted-foreground">{count}</span>
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">
        {value.toLocaleString()}
      </div>
    </Card>
  );
}
