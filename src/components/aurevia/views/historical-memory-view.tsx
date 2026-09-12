"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useMarkets, useSimilarity } from "@/lib/aurevia/hooks";
import {
  fmtPct,
  gainColor,
  regimeColor,
} from "@/lib/aurevia/format";
import { cn } from "@/lib/utils";
import {
  History,
  AlertTriangle,
  Activity,
  Gauge,
  Sparkles,
  Target,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Historical Memory view (issue #45).
//
// For the selected symbol, the backend computes a feature vector at the
// current bar and compares it to historical bars via Euclidean distance.
// The view surfaces:
//   1. The current bar's feature snapshot (regime, RSI, momentum, trend
//      strength, volatility) so the user can see what "now" looks like.
//   2. A top-15 table of historically similar moments, with the forward
//      5-bar / 20-bar returns that followed each match.
//   3. Summary stats — average / median forward returns and win-rate.
//   4. An amber disclaimer reminding the user this is evidence, not prediction.
//
// Symbol selection is driven by useMarkets() — the universe is the single
// source of truth (issue #29 — no hardcoded tickers). The query refetches
// when the symbol changes (useQuery's queryKey includes it).
// ---------------------------------------------------------------------------

export function HistoricalMemoryView() {
  const markets = useMarkets();
  const [symbol, setSymbol] = useState<string>("AAPL");
  const { data, isLoading, isError, error, refetch } = useSimilarity(symbol);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Historical Memory</h2>
        <p className="text-sm text-muted-foreground">
          Find moments in this asset&apos;s history that look statistically similar to right now, then see what happened next.
        </p>
      </div>

      {/* Symbol selector */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-amber-400" />
            <label className="text-xs font-medium text-muted-foreground">Symbol</label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="w-[220px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(markets.data ?? []).map((a) => (
                  <SelectItem key={a.symbol} value={a.symbol}>
                    {a.symbol} — {a.name.slice(0, 22)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {data && (
            <Badge variant="outline" className="justify-start">
              {data.matches.length} matches · {data.stats.sampleCount} samples
            </Badge>
          )}
        </div>
      </Card>

      {isLoading && !data && <LoadingState />}

      {isError && (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Couldn&apos;t load similarity matches
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="mt-2 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Retry
          </button>
        </Card>
      )}

      {data && (
        <>
          {/* Current-state card */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">Current Bar Snapshot</h3>
              <Badge variant="outline" className="ml-auto">
                {data.symbol}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <FeatureTile
                label="Regime"
                value={
                  <Badge variant="outline" className={cn("justify-start", regimeColor(data.currentRegime))}>
                    {data.currentRegime}
                  </Badge>
                }
                icon={<Activity className="h-3.5 w-3.5" />}
              />
              <FeatureTile
                label="RSI (14)"
                value={
                  <span className="tabular text-foreground">
                    {(data.currentFeatures.rsi * 100).toFixed(1)}
                  </span>
                }
              />
              <FeatureTile
                label="Momentum"
                value={
                  <span className={cn("tabular", gainColor(data.currentFeatures.momentum))}>
                    {fmtPct(data.currentFeatures.momentum * 100)}
                  </span>
                }
              />
              <FeatureTile
                label="Trend Strength"
                value={
                  <span className="tabular text-foreground">
                    {(data.currentFeatures.trendStrength * 100).toFixed(0)}%
                  </span>
                }
              />
              <FeatureTile
                label="Volatility"
                value={
                  <span className="tabular text-foreground">
                    {(data.currentFeatures.volatility * 100).toFixed(1)}%
                  </span>
                }
              />
            </div>
          </Card>

          {/* Stats card */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-6">
              <div className="mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold">Forward-Return Stats</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatBlock
                  label="5-bar avg"
                  value={data.stats.avgForwardReturn5d * 100}
                />
                <StatBlock
                  label="20-bar avg"
                  value={data.stats.avgForwardReturn20d * 100}
                />
                <StatBlock
                  label="5-bar median"
                  value={data.stats.medianReturn5d * 100}
                />
                <StatBlock
                  label="20-bar median"
                  value={data.stats.medianReturn20d * 100}
                />
              </div>
            </Card>

            <Card className="p-6">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold">Win Rates</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <WinRateBlock
                  label="5-bar win rate"
                  pct={data.stats.winRate5d}
                />
                <WinRateBlock
                  label="20-bar win rate"
                  pct={data.stats.winRate20d}
                />
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                Win rate = share of historical matches where the forward return was positive.
                Treat as base-rate context, not a forecast.
              </div>
            </Card>
          </div>

          {/* Matches table */}
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-semibold">Top Similar Historical Moments</h3>
              </div>
              <span className="text-xs text-muted-foreground">
                Sorted by similarity, descending
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Similarity</TableHead>
                    <TableHead className="text-right">Fwd 5d</TableHead>
                    <TableHead className="text-right">Fwd 20d</TableHead>
                    <TableHead>Regime</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.matches.map((m, idx) => (
                    <TableRow key={`${m.time}-${idx}`}>
                      <TableCell className="text-muted-foreground">
                        {new Date(m.time).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "2-digit",
                          timeZone: "UTC",
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="tabular font-medium text-foreground">
                          {(m.similarity * 100).toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className={cn("text-right tabular", gainColor(m.forwardReturn5d * 100))}>
                        {fmtPct(m.forwardReturn5d * 100)}
                      </TableCell>
                      <TableCell className={cn("text-right tabular", gainColor(m.forwardReturn20d * 100))}>
                        {fmtPct(m.forwardReturn20d * 100)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("justify-start", regimeColor(m.regime))}>
                          {m.regime}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.matches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        No similar historical moments found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Amber disclaimer */}
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="text-xs font-semibold text-amber-300">
                  Historical evidence, not prediction
                </p>
                <p className="mt-0.5 text-xs text-amber-200/80">
                  {data.disclaimer}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Skeleton className="h-40 rounded-lg" />
      <Skeleton className="h-40 rounded-lg" />
      <Skeleton className="h-72 rounded-lg lg:col-span-2" />
    </div>
  );
}

function FeatureTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-card/40 p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/50 bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-xl font-bold tabular", gainColor(value))}>
        {fmtPct(value)}
      </div>
    </div>
  );
}

function WinRateBlock({ label, pct }: { label: string; pct: number }) {
  // Win-rate color band: ≥60% emerald, 50–60% amber, <50% red.
  const barColor =
    pct >= 60 ? "bg-emerald-500/70" : pct >= 50 ? "bg-amber-500/70" : "bg-red-500/70";
  const text =
    pct >= 60 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400";
  return (
    <div className="rounded-md border border-border/50 bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-bold tabular", text)}>{pct.toFixed(0)}%</div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted/60">
        <div className={cn("h-full transition-all", barColor)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
