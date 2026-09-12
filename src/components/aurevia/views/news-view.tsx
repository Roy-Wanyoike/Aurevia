"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useMarkets, useNews, type NewsArticle } from "@/lib/aurevia/hooks";
import { fmtDateTime, fmtPct } from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { cn } from "@/lib/utils";
import {
  Newspaper,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia News Intelligence view (issue #46).
//
// Renders market-aware synthetic news generated from the current market data.
// The backend (/api/v1/news) reads the live regime, change%, RSI, trend
// strength and volatility for each asset and projects them into a headline +
// summary + sentiment + importance rating. ALL entries are synthetic and
// CLEARLY LABELED — they are AI-generated market commentary based on current
// data, NOT real news articles. The amber banner at the top states this so
// the user is never misled.
//
// Layout:
//   1. Header — Newspaper icon + title + count badge + synthetic-source badge.
//   2. Amber disclaimer banner — synthetic commentary notice.
//   3. Filter bar — symbol Select (All symbols by default).
//   4. Article list — headline, summary, source, symbol badge, sentiment
//      badge (green/amber/red), importance badge, published-at timestamp.
//      Clicking an article calls openAsset(symbol) so the user can drill in.
//
// Auto-refreshes every 60s via the useNews refetchInterval.
// ---------------------------------------------------------------------------

const ALL_SYMBOLS = "__ALL__";

export function NewsView() {
  const markets = useMarkets();
  const [symbolFilter, setSymbolFilter] = useState<string>(ALL_SYMBOLS);
  // The hook accepts an optional symbol; pass `undefined` when "All symbols"
  // is selected so the backend returns the top-10 most-active set.
  const { data, isLoading, isError, error, refetch } = useNews(
    symbolFilter === ALL_SYMBOLS ? undefined : symbolFilter,
  );

  const articles = useMemo(() => data?.articles ?? [], [data]);

  return (
    <div className="space-y-6 p-6">
      <Header count={data?.total ?? null} source={data?.source} />

      {/* Synthetic-data disclaimer — must stay visible at all times so the
          user is never misled into thinking these are real news articles. */}
      <div
        role="note"
        className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-300"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="text-sm">
          <p className="font-medium">
            Market commentary generated from current data — not real news articles.
          </p>
          <p className="mt-0.5 text-xs text-amber-300/80">
            Headlines, summaries and sentiment scores are derived from live regime,
            change%, RSI and trend signals. Connect a real news provider (Finnhub,
            Polygon, Tiingo) to replace this synthetic feed.
          </p>
        </div>
      </div>

      {/* Filter bar — symbol Select with "All symbols" affordance. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label
            htmlFor="news-symbol-filter"
            className="text-xs text-muted-foreground"
          >
            Symbol
          </label>
          <Select value={symbolFilter} onValueChange={setSymbolFilter}>
            <SelectTrigger id="news-symbol-filter" className="h-9 w-56">
              <SelectValue placeholder="All symbols" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SYMBOLS}>All symbols (top 10)</SelectItem>
              {(markets.data ?? []).map((a) => (
                <SelectItem key={a.symbol} value={a.symbol}>
                  {a.symbol} — {a.name.slice(0, 18)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Article list */}
      {isLoading && articles.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Couldn&apos;t load news
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </Card>
      ) : articles.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Newspaper className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">No news yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Select a different symbol or wait for the next refresh cycle.
            </p>
          </div>
        </Card>
      ) : (
        <div className="max-h-[calc(100vh-22rem)] space-y-3 overflow-y-auto pr-1">
          {articles.map((a) => (
            <NewsCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function Header({ count, source }: { count: number | null; source?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Newspaper className="h-5 w-5 text-cyan-400" />
        <h2 className="text-2xl font-bold tracking-tight">News</h2>
        {count !== null && (
          <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
            {count} articles
          </Badge>
        )}
        <Badge
          variant="outline"
          className="border-amber-500/30 bg-amber-500/10 text-amber-400"
          title="Synthetic commentary generated from current market data"
        >
          <AlertTriangle className="mr-1 h-3 w-3" />
          SYNTHETIC
        </Badge>
        {source && (
          <Badge variant="outline" className="ml-auto text-xs">
            {source}
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Market-aware commentary derived from regime, change%, RSI and trend
        signals. Auto-refreshes every 60s.
      </p>
    </div>
  );
}

function NewsCard({ article }: { article: NewsArticle }) {
  const { openAsset } = useUI();

  return (
    <Card className="p-4 transition-colors hover:border-border/80">
      <div className="flex flex-col gap-2">
        {/* Headline + symbol */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => openAsset(article.symbol)}
            className="group flex items-start gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            aria-label={`Open ${article.symbol} asset detail`}
          >
            <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:underline">
              {article.headline}
            </h3>
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <Badge
            variant="outline"
            className="shrink-0 border-cyan-500/30 bg-cyan-500/10 font-mono text-xs text-cyan-400"
          >
            {article.symbol}
          </Badge>
        </div>

        {/* Summary */}
        <p className="text-sm text-muted-foreground">{article.summary}</p>

        {/* Footer: source, sentiment, importance, time */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-muted-foreground/80">{article.source}</span>
          <span aria-hidden>·</span>
          <SentimentBadge sentiment={article.sentiment} />
          <ImportanceBadge importance={article.importance} />
          <span aria-hidden>·</span>
          <time dateTime={new Date(article.publishedAt).toISOString()}>
            {fmtDateTime(article.publishedAt)} UTC
          </time>
        </div>
      </div>
    </Card>
  );
}

function SentimentBadge({ sentiment }: { sentiment: number }) {
  // Green for positive (>0.1), red for negative (<-0.1), amber for neutral.
  let cls = "border-amber-500/30 bg-amber-500/10 text-amber-400";
  let Icon = Minus;
  let label = "Neutral";
  if (sentiment > 0.1) {
    cls = "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    Icon = TrendingUp;
    label = "Bullish";
  } else if (sentiment < -0.1) {
    cls = "border-red-500/30 bg-red-500/10 text-red-400";
    Icon = TrendingDown;
    label = "Bearish";
  }
  return (
    <Badge variant="outline" className={cn("gap-1 text-xs", cls)}>
      <Icon className="h-3 w-3" />
      {label} {fmtPct(sentiment * 100, 0)}
    </Badge>
  );
}

function ImportanceBadge({ importance }: { importance: NewsArticle["importance"] }) {
  let cls = "bg-muted text-muted-foreground";
  if (importance === "high") {
    cls = "border-red-500/30 bg-red-500/10 text-red-400";
  } else if (importance === "medium") {
    cls = "border-amber-500/30 bg-amber-500/10 text-amber-400";
  } else if (importance === "low") {
    cls = "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  }
  return (
    <Badge variant="outline" className={cn("text-xs capitalize", cls)}>
      {importance}
    </Badge>
  );
}
