"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useRadar, type RadarOpportunity } from "@/lib/aurevia/hooks";
import { fmtPrice } from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { cn } from "@/lib/utils";
import {
  Radar as RadarIcon,
  TrendingUp,
  Activity,
  ArrowDownLeft,
  Route as RouteIcon,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Opportunity Radar view (issue #49).
//
// Five category cards in a responsive grid:
//   1. Breakouts      — trend.breakout === true
//   2. Momentum       — momentum > 0.02 && 50 <= RSI <= 70
//   3. Mean Reversion — price < bollingerLower && RSI < 35
//   4. Trend Following— price > sma20 > sma50 && ADX > 25
//   5. Risk Events    — volatility > 0.5 || drawdown > 8%
//
// Each card shows the category name, the count of opportunities, and a
// scrollable list of opportunities (symbol, conviction bar, risk badge,
// one-line reason). Clicking an opportunity calls openAsset(symbol) so the
// user can drill into the asset-detail view.
//
// Auto-refreshes every 30s via the useRadar refetchInterval.
// ---------------------------------------------------------------------------

type CategoryKey =
  | "breakouts"
  | "momentum"
  | "meanReversion"
  | "trendFollowing"
  | "riskEvents";

interface CategoryMeta {
  key: CategoryKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "emerald" | "cyan" | "amber" | "purple" | "red";
  hint: string;
}

const CATEGORIES: CategoryMeta[] = [
  { key: "breakouts",       label: "Breakouts",        icon: TrendingUp,   accent: "emerald", hint: "Price breaking above resistance" },
  { key: "momentum",        label: "Momentum",          icon: Activity,    accent: "cyan",    hint: "ROC > 2% with healthy RSI 50–70" },
  { key: "meanReversion",  label: "Mean Reversion",    icon: ArrowDownLeft, accent: "amber",  hint: "Below BB lower band, RSI < 35" },
  { key: "trendFollowing",  label: "Trend Following",   icon: RouteIcon,    accent: "purple",  hint: "Stacked SMAs + ADX > 25" },
  { key: "riskEvents",      label: "Risk Events",       icon: ShieldAlert,  accent: "red",     hint: "High volatility or drawdown" },
];

function accentClasses(accent: CategoryMeta["accent"]): { card: string; icon: string; bar: string; count: string } {
  switch (accent) {
    case "emerald":
      return {
        card: "border-emerald-500/20",
        icon: "text-emerald-400",
        bar: "bg-emerald-500/70",
        count: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
      };
    case "cyan":
      return {
        card: "border-cyan-500/20",
        icon: "text-cyan-400",
        bar: "bg-cyan-500/70",
        count: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
      };
    case "amber":
      return {
        card: "border-amber-500/20",
        icon: "text-amber-400",
        bar: "bg-amber-500/70",
        count: "border-amber-500/30 bg-amber-500/10 text-amber-400",
      };
    case "purple":
      return {
        card: "border-purple-500/20",
        icon: "text-purple-400",
        bar: "bg-purple-500/70",
        count: "border-purple-500/30 bg-purple-500/10 text-purple-400",
      };
    case "red":
      return {
        card: "border-red-500/20",
        icon: "text-red-400",
        bar: "bg-red-500/70",
        count: "border-red-500/30 bg-red-500/10 text-red-400",
      };
  }
}

export function RadarView() {
  const { data, isLoading, isError, error, refetch } = useRadar();
  const { openAsset } = useUI();

  if (isLoading && !data) {
    return (
      <div className="space-y-6 p-6">
        <Header count={null} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6 p-6">
        <Header count={null} />
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Couldn&apos;t load opportunity radar
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </Card>
      </div>
    );
  }

  const cats = data.categories;
  const totalOpportunities =
    cats.breakouts.opportunities.length +
    cats.momentum.opportunities.length +
    cats.meanReversion.opportunities.length +
    cats.trendFollowing.opportunities.length;

  return (
    <div className="space-y-6 p-6">
      <Header count={totalOpportunities} riskCount={cats.riskEvents.opportunities.length} universe={data.universeSize} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CATEGORIES.map((meta) => {
          const items = cats[meta.key].opportunities;
          return (
            <CategoryCard
              key={meta.key}
              meta={meta}
              count={items.length}
              opportunities={items}
              onOpen={openAsset}
            />
          );
        })}
      </div>
    </div>
  );
}

function Header({
  count,
  riskCount,
  universe,
}: {
  count: number | null;
  riskCount?: number;
  universe?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <RadarIcon className="h-5 w-5 text-purple-400" />
        <h2 className="text-2xl font-bold tracking-tight">Opportunity Radar</h2>
        {count !== null && (
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            {count} opportunities
          </Badge>
        )}
        {typeof riskCount === "number" && (
          <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-400">
            {riskCount} risk flags
          </Badge>
        )}
        {typeof universe === "number" && (
          <Badge variant="outline" className="ml-auto text-xs">
            Universe: {universe}
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Universe-wide scan of breakouts, momentum, mean-reversion setups, trend-following names, and risk flags. Auto-refreshes every 30s.
      </p>
    </div>
  );
}

function CategoryCard({
  meta,
  count,
  opportunities,
  onOpen,
}: {
  meta: CategoryMeta;
  count: number;
  opportunities: RadarOpportunity[];
  onOpen: (symbol: string) => void;
}) {
  const Icon = meta.icon;
  const acc = accentClasses(meta.accent);

  return (
    <Card className={cn("flex flex-col p-0", acc.card)}>
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", acc.icon)} />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{meta.label}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {meta.hint}
            </span>
          </div>
        </div>
        <Badge variant="outline" className={cn("text-xs", acc.count)}>
          {count}
        </Badge>
      </div>

      <div className="max-h-80 flex-1 overflow-y-auto p-2">
        {opportunities.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No {meta.label.toLowerCase()} in the universe right now.
          </div>
        ) : (
          <ul className="space-y-1">
            {opportunities.map((opp) => (
              <li key={`${meta.key}-${opp.symbol}`}>
                <button
                  type="button"
                  onClick={() => onOpen(opp.symbol)}
                  className="w-full rounded-md border border-transparent px-2 py-2 text-left transition-colors hover:border-border/60 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open ${opp.symbol} asset detail`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-semibold">{opp.symbol}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {opp.name}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs tabular text-muted-foreground">
                      {fmtPrice(opp.price)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex flex-1 items-center gap-1">
                      <span className="w-12 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Conv
                      </span>
                      <Progress
                        value={Math.max(2, opp.conviction * 100)}
                        className="h-1.5"
                        // Use the accent bar color via a child <div> override below.
                      />
                      <span className="w-8 shrink-0 text-right text-[10px] tabular text-muted-foreground">
                        {Math.round(opp.conviction * 100)}
                      </span>
                    </div>
                    <RiskBadge risk={opp.risk} />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {opp.reason}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function RiskBadge({ risk }: { risk: number }) {
  // Risk band: <0.2 low (emerald), 0.2–0.4 moderate (amber), 0.4–0.7 elevated
  // (orange), ≥0.7 high (red).
  let label = "Low";
  let cls = "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (risk >= 0.7) {
    label = "High";
    cls = "border-red-500/30 bg-red-500/10 text-red-400";
  } else if (risk >= 0.4) {
    label = "Elevated";
    cls = "border-orange-500/30 bg-orange-500/10 text-orange-400";
  } else if (risk >= 0.2) {
    label = "Mod";
    cls = "border-amber-500/30 bg-amber-500/10 text-amber-400";
  }
  return (
    <Badge variant="outline" className={cn("shrink-0 px-1.5 text-[10px]", cls)}>
      {label} {Math.round(risk * 100)}
    </Badge>
  );
}
