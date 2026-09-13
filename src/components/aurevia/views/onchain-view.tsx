"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Area,
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useOnchain, type ChainTvl, type ProtocolTvl } from "@/lib/aurevia/hooks";
import { fmtCompact, fmtUsd, fmtDateTime } from "@/lib/aurevia/format";
import {
  Boxes,
  RefreshCw,
  AlertTriangle,
  Coins,
  Network,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Aurevia On-Chain Intelligence view (issue #106).
//
// Renders TVL data from DeFi Llama — a free public API (no key required):
//   - Total TVL across all chains (hero stat)
//   - 90-day total TVL history (area chart)
//   - Top chains by TVL (table)
//   - Top protocols by TVL (table)
//
// Layout:
//   1. Header — Boxes icon + title + source badge + refresh.
//   2. Hero stat — aggregate TVL across all chains.
//   3. Total TVL history (90d) — area chart.
//   4. Two-column grid: Chains table | Protocols table.
//
// Auto-refreshes every 5 minutes via useOnchain refetchInterval.
// ---------------------------------------------------------------------------

export function OnchainView() {
  const { data, isLoading, isError, error, refetch } = useOnchain();

  const chains = useMemo(() => data?.chains ?? [], [data?.chains]);
  const protocols = useMemo(() => data?.protocols ?? [], [data?.protocols]);
  const history = useMemo(() => data?.history ?? [], [data?.history]);
  const totalTvlUsd = data?.totalTvlUsd ?? 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Boxes className="h-5 w-5 text-cyan-400" />
          <h2 className="text-2xl font-bold tracking-tight">On-Chain Intelligence</h2>
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            title="Free public API — no key required"
          >
            DEFILLAMA · LIVE
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => refetch()}
            aria-label="Refresh on-chain data"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Total Value Locked across DeFi chains + top protocols, sourced live
          from DeFi Llama. Auto-refreshes every 5 minutes.
        </p>
      </div>

      {isLoading && totalTvlUsd === 0 ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-72 w-full rounded-lg" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-72 w-full rounded-lg" />
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
        </div>
      ) : isError ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Couldn&apos;t load on-chain data
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </Card>
      ) : totalTvlUsd === 0 && chains.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Boxes className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">No data yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              DeFi Llama may be temporarily unreachable. Try the refresh button.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Hero stats */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card className="p-4 ring-1 ring-emerald-500/20">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total TVL (All Chains)
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular text-foreground">
                {fmtUsd(totalTvlUsd)}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {chains.length} chains tracked
              </div>
            </Card>
            <Card className="p-4 ring-1 ring-border/50">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Top Chain
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular text-foreground">
                {chains[0]?.name ?? "—"}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {chains[0] ? fmtUsd(chains[0].tvl) : "—"}
              </div>
            </Card>
            <Card className="p-4 ring-1 ring-border/50">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Top Protocol
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular text-foreground">
                {protocols[0]?.name ?? "—"}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {protocols[0] ? fmtUsd(protocols[0].tvl) : "—"}
              </div>
            </Card>
          </div>

          {/* TVL history chart */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Total TVL — Last 90 Days</h3>
              <span className="text-xs text-muted-foreground">
                Updated {data ? fmtDateTime(data.updatedAt) : "—"} UTC
              </span>
            </div>
            <TvlHistoryChart history={history} />
          </Card>

          {/* Two-column tables */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChainsCard chains={chains} />
            <ProtocolsCard protocols={protocols} />
          </div>
        </>
      )}
    </div>
  );
}

function TvlHistoryChart({
  history,
}: {
  history: { date: number; tvl: number }[];
}) {
  if (!history || history.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        No history available.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="tvl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.72 0.17 162)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="oklch(0.72 0.17 162)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(t) =>
            new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          }
          tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }}
          stroke="oklch(1 0 0 / 10%)"
          minTickGap={30}
        />
        <YAxis
          orientation="right"
          tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }}
          stroke="oklch(1 0 0 / 10%)"
          tickFormatter={(v) => `$${fmtCompact(v)}`}
          width={70}
          domain={["auto", "auto"]}
        />
        <Tooltip
          contentStyle={{
            background: "oklch(0.19 0.012 250)",
            border: "1px solid oklch(1 0 0 / 10%)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelFormatter={(t) => fmtDateTime(t as number)}
          formatter={(v: any) => [fmtUsd(Number(v)), "TVL"]}
        />
        <Area
          type="monotone"
          dataKey="tvl"
          stroke="oklch(0.72 0.17 162)"
          strokeWidth={2}
          fill="url(#tvl)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ChainsCard({ chains }: { chains: ChainTvl[] }) {
  const top = chains.slice(0, 12);
  return (
    <Card className="p-0">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Top Chains by TVL</h3>
      </div>
      <div className="max-h-96 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Chain</TableHead>
              <TableHead className="text-right">TVL</TableHead>
              <TableHead className="text-right">% Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                  No chain data available.
                </TableCell>
              </TableRow>
            ) : (
              top.map((c, i) => {
                const total = chains.reduce((s, x) => s + x.tvl, 0);
                const share = total > 0 ? (c.tvl / total) * 100 : 0;
                return (
                  <TableRow key={c.name}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right tabular">{fmtUsd(c.tvl)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">
                      {share.toFixed(2)}%
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function ProtocolsCard({ protocols }: { protocols: ProtocolTvl[] }) {
  return (
    <Card className="p-0">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Top Protocols by TVL</h3>
      </div>
      <div className="max-h-96 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>Protocol</TableHead>
              <TableHead>Chain</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">TVL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {protocols.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                  No protocol data available.
                </TableCell>
              </TableRow>
            ) : (
              protocols.map((p) => (
                <TableRow key={`${p.name}-${p.chain}`}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.chain}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-[10px] uppercase")}>
                      {p.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular">{fmtUsd(p.tvl)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
