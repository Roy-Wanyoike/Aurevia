"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Cell,
} from "recharts";
import { useJournal } from "@/lib/aurevia/hooks";
import {
  fmtPrice,
  fmtPct,
  fmtDateTime,
  regimeColor,
  actionColor,
  gainColor,
} from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { BookOpen, Lightbulb, Inbox } from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Trading Journal view (issue #54).
//
// Three sections:
//   1. Journal entries table — every FILLED order with its market context
//      (regime / trend / volatility) at fill time + reason. Clicking a row
//      opens the asset-detail view for that symbol.
//   2. Analytics — trades-by-regime and trades-by-strategy bar charts.
//   3. Behavioral insight banner — surfaces one-line takeaways the operator
//      should know (most-traded regime, dominant strategy, win-rate hints).
//
// All numbers come from /api/v1/journal — no client-side aggregation, no
// hardcoded values. Empty state when no orders have been filled.
// ---------------------------------------------------------------------------

const REGIME_COLORS: Record<string, string> = {
  BULL: "#10b981",
  BEAR: "#ef4444",
  SIDEWAYS: "#94a3b8",
  ACCUMULATION: "#22c55e",
  DISTRIBUTION: "#f59e0b",
  BREAKOUT: "#10b981",
  BREAKDOWN: "#ef4444",
  RECOVERY: "#06b6d4",
  HIGH_VOLATILITY: "#f59e0b",
  LOW_VOLATILITY: "#06b6d4",
  CRASH: "#dc2626",
  UNKNOWN: "#6b7280",
};

const STRATEGY_COLORS = [
  "#10b981", "#06b6d4", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#f97316",
];

export function JournalView() {
  const journal = useJournal();
  const { openAsset } = useUI();

  if (journal.isLoading && !journal.data) {
    return <JournalSkeleton />;
  }

  const entries = journal.data?.entries ?? [];
  const analytics = journal.data?.analytics;
  const byRegime = analytics?.byRegime ?? {};
  const byStrategy = analytics?.byStrategy ?? {};

  // Sort regime/strategy entries desc by count so the dominant bucket leads.
  const regimeRows = Object.entries(byRegime)
    .map(([regime, count]) => ({ regime, count }))
    .sort((a, b) => b.count - a.count);
  const strategyRows = Object.entries(byStrategy)
    .map(([strategy, count], i) => ({
      strategy,
      count,
      color: STRATEGY_COLORS[i % STRATEGY_COLORS.length],
    }))
    .sort((a, b) => b.count - a.count);

  // Behavioral insight — pick the most actionable takeaway.
  const totalTrades = analytics?.totalTrades ?? 0;
  const topRegime = regimeRows[0];
  const topStrategy = strategyRows[0];
  const buyCount = entries.filter((e) => e.side === "BUY").length;
  const sellCount = entries.filter((e) => e.side === "SELL").length;
  const buyPct = totalTrades > 0 ? (buyCount / totalTrades) * 100 : 0;
  const buyBias = buyPct > 65 ? "strongly long-biased" : buyPct > 55 ? "long-biased" : buyPct < 35 ? "strongly short-biased" : buyPct < 45 ? "short-biased" : "balanced";

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Trading Journal</h2>
        <p className="text-sm text-muted-foreground">
          Every filled order with market context at fill time — regime, trend, volatility — and aggregate analytics by regime and strategy.
        </p>
      </div>

      {entries.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                No filled trades yet
              </p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Place a paper order from the Portfolio view. Once it fills, the
                trade will appear here with its market context and behavioral
                analytics.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* Behavioral insight banner */}
          <Card className="border-cyan-500/30 bg-cyan-500/5 p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" />
              <div className="space-y-1 text-sm">
                <div className="font-semibold text-cyan-400">
                  Behavioral Insight
                </div>
                <p className="text-muted-foreground">
                  You have executed{" "}
                  <span className="font-semibold text-foreground">
                    {totalTrades}
                  </span>{" "}
                  trade{totalTrades === 1 ? "" : "s"} —{" "}
                  <span className="text-emerald-400">{buyCount} BUY</span> /{" "}
                  <span className="text-red-400">{sellCount} SELL</span>{" "}
                  ({buyBias}).{" "}
                  {topRegime && (
                    <>
                      Most of your activity is in the{" "}
                      <Badge variant="outline" className={regimeColor(topRegime.regime)}>
                        {topRegime.regime}
                      </Badge>{" "}
                      regime ({topRegime.count} trade{topRegime.count === 1 ? "" : "s"}).
                    </>
                  )}{" "}
                  {topStrategy && (
                    <>
                      Dominant strategy:{" "}
                      <span className="font-mono font-semibold text-foreground">
                        {topStrategy.strategy}
                      </span>{" "}
                      ({topStrategy.count} trade{topStrategy.count === 1 ? "" : "s"}).
                    </>
                  )}
                </p>
              </div>
            </div>
          </Card>

          {/* Analytics: regime + strategy breakdown */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold">Trades by Regime</h3>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={regimeRows}
                    layout="vertical"
                    margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }} stroke="oklch(1 0 0 / 10%)" allowDecimals={false} />
                    <YAxis type="category" dataKey="regime" tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }} stroke="oklch(1 0 0 / 10%)" width={120} />
                    <RechartsTooltip
                      contentStyle={{
                        background: "oklch(0.19 0.012 250)",
                        border: "1px solid oklch(1 0 0 / 10%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(v: any, _n: string, item: any) => [
                        `${v} trade${v === 1 ? "" : "s"}`,
                        item.payload.regime,
                      ]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {regimeRows.map((r) => (
                        <Cell key={r.regime} fill={REGIME_COLORS[r.regime] ?? "#6b7280"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold">Trades by Strategy</h3>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={strategyRows}
                    layout="vertical"
                    margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }} stroke="oklch(1 0 0 / 10%)" allowDecimals={false} />
                    <YAxis type="category" dataKey="strategy" tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }} stroke="oklch(1 0 0 / 10%)" width={120} />
                    <RechartsTooltip
                      contentStyle={{
                        background: "oklch(0.19 0.012 250)",
                        border: "1px solid oklch(1 0 0 / 10%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(v: any, _n: string, item: any) => [
                        `${v} trade${v === 1 ? "" : "s"}`,
                        item.payload.strategy,
                      ]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {strategyRows.map((s) => (
                        <Cell key={s.strategy} fill={s.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Journal entries table */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-semibold">Journal Entries</h3>
              </div>
              <Badge variant="outline" className="text-xs">
                {entries.length} trade{entries.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="max-h-[60vh] overflow-auto rounded-md border border-border/60">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 bg-card">Time</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Regime</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead className="text-right">Vol</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e, i) => (
                    <TableRow
                      key={e.id ?? i}
                      onClick={() => openAsset(e.symbol)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          openAsset(e.symbol);
                        }
                      }}
                      className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <TableCell className="sticky left-0 z-10 bg-card whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDateTime(e.createdAt)}
                      </TableCell>
                      <TableCell className="font-semibold">{e.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={actionColor(e.side)}>
                          {e.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular">{e.quantity}</TableCell>
                      <TableCell className="text-right tabular">{fmtPrice(e.filledPrice)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {e.strategyKey}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={regimeColor(e.regime)}>
                          {e.regime}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${trendColorClass(e.trend)}`}>
                          {e.trend}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right tabular ${gainColor(e.volatility)}`}>
                        {fmtPct(e.volatility * 100)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={e.reason}>
                        {e.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function trendColorClass(direction: string): string {
  switch (direction) {
    case "UP":
      return "text-emerald-400";
    case "DOWN":
      return "text-red-400";
    default:
      return "text-muted-foreground";
  }
}

function JournalSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
