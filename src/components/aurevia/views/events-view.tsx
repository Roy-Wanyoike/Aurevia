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
import { useMarkets, useEvents, type MarketEvent, type EventType } from "@/lib/aurevia/hooks";
import { fmtDateTime } from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { cn } from "@/lib/utils";
import {
  Calendar,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  DollarSign,
  Coins,
  Cpu,
  FileText,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Market Events view (issue #47).
//
// Calendar / timeline of upcoming synthetic events derived from the asset
// catalog — equities get earnings + dividend events, crypto gets halving +
// upgrade events. All entries are CLEARLY LABELED synthetic; the amber
// banner at the top tells the user to connect Finnhub for real calendar
// dates.
//
// Layout:
//   1. Header — Calendar icon + title + count badge + synthetic-source badge.
//   2. Amber disclaimer banner — synthetic calendar notice.
//   3. Filter bar — type Select (All / earnings / dividend / halving / upgrade)
//      + symbol Select (optional).
//   4. Timeline list — events grouped by date, each row carries a type badge
//      (earnings=emerald, dividend=cyan, halving=amber, upgrade=purple),
//      symbol, title, description, importance badge, scheduled-at date.
//      Clicking an event opens the asset-detail view via openAsset(symbol).
//
// Auto-refreshes every 60s via the useEvents refetchInterval.
// ---------------------------------------------------------------------------

const ALL_TYPES = "__ALL__";
const ALL_SYMBOLS = "__ALL__";

const TYPE_META: Record<EventType, { label: string; icon: React.ComponentType<{ className?: string }>; badge: string }> = {
  earnings: {
    label: "Earnings",
    icon: DollarSign,
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  dividend: {
    label: "Dividend",
    icon: Coins,
    badge: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  },
  halving: {
    label: "Halving",
    icon: Cpu,
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  upgrade: {
    label: "Upgrade",
    icon: FileText,
    badge: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  },
};

const TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "earnings", label: "Earnings" },
  { value: "dividend", label: "Dividend" },
  { value: "halving", label: "Halving" },
  { value: "upgrade", label: "Upgrade" },
];

export function EventsView() {
  const markets = useMarkets();
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);
  const [symbolFilter, setSymbolFilter] = useState<string>(ALL_SYMBOLS);

  // Backend fetches all events for the symbol (or the whole universe). We
  // narrow by type on the client to avoid losing entries when the user
  // toggles between filters.
  const { data, isLoading, isError, error, refetch } = useEvents(
    symbolFilter === ALL_SYMBOLS ? undefined : symbolFilter,
  );

  const filtered = useMemo(() => {
    const all = data?.events ?? [];
    if (typeFilter === ALL_TYPES) return all;
    return all.filter((e) => e.type === (typeFilter as EventType));
  }, [data, typeFilter]);

  // Group by calendar day so the timeline reads naturally.
  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div className="space-y-6 p-6">
      <Header count={data?.total ?? null} source={data?.source} />

      {/* Synthetic-data disclaimer */}
      <div
        role="note"
        className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-300"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="text-sm">
          <p className="font-medium">
            Synthetic calendar — connect Finnhub API for real events.
          </p>
          <p className="mt-0.5 text-xs text-amber-300/80">
            Earnings, dividend, halving and upgrade dates are generated from the
            asset catalog for illustration. Pair with a real earnings calendar
            provider to surface live corporate-action dates.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="events-type-filter" className="text-xs text-muted-foreground">
              Type
            </label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger id="events-type-filter" className="h-9 w-40">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>All types</SelectItem>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="events-symbol-filter" className="text-xs text-muted-foreground">
              Symbol
            </label>
            <Select value={symbolFilter} onValueChange={setSymbolFilter}>
              <SelectTrigger id="events-symbol-filter" className="h-9 w-56">
                <SelectValue placeholder="All symbols" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SYMBOLS}>All symbols</SelectItem>
                {(markets.data ?? []).map((a) => (
                  <SelectItem key={a.symbol} value={a.symbol}>
                    {a.symbol} — {a.name.slice(0, 18)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Timeline */}
      {isLoading && filtered.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <div>
            <p className="text-sm font-medium text-foreground">Couldn&apos;t load events</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Calendar className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">No upcoming events</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Adjust the filters above or wait for the next refresh cycle.
            </p>
          </div>
        </Card>
      ) : (
        <div className="max-h-[calc(100vh-22rem)] space-y-5 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/90 py-1 backdrop-blur">
                <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {g.events.length} event{g.events.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="space-y-2">
                {g.events.map((ev) => (
                  <EventRow key={ev.id} event={ev} />
                ))}
              </div>
            </div>
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
        <Calendar className="h-5 w-5 text-cyan-400" />
        <h2 className="text-2xl font-bold tracking-tight">Events</h2>
        {count !== null && (
          <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
            {count} events
          </Badge>
        )}
        <Badge
          variant="outline"
          className="border-amber-500/30 bg-amber-500/10 text-amber-400"
          title="Synthetic calendar derived from the asset catalog"
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
        Upcoming earnings, dividend, halving and upgrade events for the tradeable
        universe. Auto-refreshes every 60s.
      </p>
    </div>
  );
}

function EventRow({ event }: { event: MarketEvent }) {
  const { openAsset } = useUI();
  const meta = TYPE_META[event.type];
  const Icon = meta.icon;

  return (
    <Card className="p-4 transition-colors hover:border-border/80">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* Title + symbol */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("gap-1 text-xs", meta.badge)}>
              <Icon className="h-3 w-3" />
              {meta.label}
            </Badge>
            <button
              type="button"
              onClick={() => openAsset(event.symbol)}
              className="group inline-flex items-center gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Open ${event.symbol} asset detail`}
            >
              <span className="font-mono text-sm font-semibold text-foreground group-hover:underline">
                {event.symbol}
              </span>
              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
            <span className="text-sm font-medium text-foreground">{event.title}</span>
          </div>
          {/* Description */}
          <p className="text-xs text-muted-foreground">{event.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
          <ImportanceBadge importance={event.importance} />
          <time
            dateTime={new Date(event.scheduledAt).toISOString()}
            className="text-xs tabular text-muted-foreground"
          >
            {fmtDateTime(event.scheduledAt)} UTC
          </time>
        </div>
      </div>
    </Card>
  );
}

function ImportanceBadge({ importance }: { importance: MarketEvent["importance"] }) {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DayGroup {
  key: string;
  label: string;
  events: MarketEvent[];
}

function groupByDay(events: MarketEvent[]): DayGroup[] {
  // Bucket by UTC date so the timeline is stable regardless of the viewer's
  // timezone — avoids SSR/client hydration mismatch in the day headers.
  const buckets = new Map<string, MarketEvent[]>();
  for (const ev of events) {
    const d = new Date(ev.scheduledAt);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const arr = buckets.get(key) ?? [];
    arr.push(ev);
    buckets.set(key, arr);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, evs]) => {
      const d = new Date(key + "T00:00:00Z");
      return {
        key,
        label: d.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }),
        events: evs,
      };
    });
}
