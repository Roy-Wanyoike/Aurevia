"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useTrends } from "@/lib/aurevia/hooks";
import {
  fmtPrice,
  fmtPct,
  gainColor,
  gainBg,
  regimeColor,
  trendColor,
} from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { TrendingUp, TrendingDown, Minus, ArrowUpDown } from "lucide-react";

type SortKey = "symbol" | "changePct" | "strength" | "volatility";
type SortDir = "asc" | "desc";

export function TrendsView() {
  const { data, isLoading } = useTrends();
  const { openAsset } = useUI();
  const [sortKey, setSortKey] = useState<SortKey>("changePct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = data?.rows ?? [];
  const dist = data?.distribution ?? {};

  const summary = useMemo(() => {
    const up = rows.filter((r: any) => r.direction === "UP").length;
    const down = rows.filter((r: any) => r.direction === "DOWN").length;
    const flat = rows.filter((r: any) => r.direction === "FLAT" || !r.direction).length;
    return { up, down, flat, total: rows.length };
  }, [rows]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a: any, b: any) => {
      const av = sortKey === "symbol" ? a.symbol : sortKey === "changePct" ? Math.abs(a.changePct ?? 0) : sortKey === "strength" ? (a.strength ?? 0) : (a.volatility ?? 0);
      const bv = sortKey === "symbol" ? b.symbol : sortKey === "changePct" ? Math.abs(b.changePct ?? 0) : sortKey === "strength" ? (b.strength ?? 0) : (b.volatility ?? 0);
      if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Trends</h2>
        <p className="text-sm text-muted-foreground">
          Trend structure across the universe — direction, strength, momentum, support/resistance, and regime classification.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile label="Universe" value={summary.total} icon={null} color="text-foreground" />
        <SummaryTile label="Up" value={summary.up} icon={<TrendingUp className="h-4 w-4" />} color="text-emerald-400" />
        <SummaryTile label="Down" value={summary.down} icon={<TrendingDown className="h-4 w-4" />} color="text-red-400" />
        <SummaryTile label="Flat" value={summary.flat} icon={<Minus className="h-4 w-4" />} color="text-muted-foreground" />
      </div>

      {/* Regime distribution compact */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Regime Distribution</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(dist)
            .sort((a, b) => (b[1] as number) - (a[1] as number))
            .map(([regime, count]) => (
              <Badge key={regime} variant="outline" className={regimeColor(regime)}>
                {regime} · {count as number}
              </Badge>
            ))}
          {Object.keys(dist).length === 0 && (
            <span className="text-xs text-muted-foreground">No regime data yet.</span>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0">
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card">
                  <button onClick={() => toggleSort("symbol")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Symbol <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </button>
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>
                  <button onClick={() => toggleSort("changePct")} className="inline-flex items-center gap-1 hover:text-foreground">
                    24h % <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </button>
                </TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="w-32">
                  <button onClick={() => toggleSort("strength")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Strength <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </button>
                </TableHead>
                <TableHead className="text-right">Bars</TableHead>
                <TableHead className="text-right">Momentum</TableHead>
                <TableHead className="text-right">
                  <button onClick={() => toggleSort("volatility")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Vol <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </button>
                </TableHead>
                <TableHead className="text-right">Drawdown</TableHead>
                <TableHead className="text-right">Support</TableHead>
                <TableHead className="text-right">Resistance</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Regime</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r: any) => {
                const strength = Math.min(100, Math.max(0, (r.strength ?? 0) * 100));
                return (
                  <TableRow key={r.symbol} onClick={() => openAsset(r.symbol)} className="cursor-pointer">
                    <TableCell className="sticky left-0 z-10 bg-card font-semibold">{r.symbol}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular">{fmtPrice(r.price)}</TableCell>
                    <TableCell className={`text-right tabular ${gainColor(r.changePct ?? 0)}`}>{fmtPct(r.changePct ?? 0)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={gainBg(r.direction === "UP" ? 1 : r.direction === "DOWN" ? -1 : 0)}>
                        {r.direction ?? "FLAT"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={strength} className="h-1.5" />
                        <span className={`tabular text-xs ${trendColor(r.direction ?? "FLAT")}`}>{strength.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{r.durationBars ?? "—"}</TableCell>
                    <TableCell className={`text-right tabular ${gainColor(r.momentum ?? 0)}`}>{fmtPrice(r.momentum, 4)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{fmtPrice(r.volatility, 4)}</TableCell>
                    <TableCell className={`text-right tabular ${gainColor(-(r.drawdown ?? 0))}`}>{fmtPct((r.drawdown ?? 0) * 100)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{fmtPrice(r.support)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{fmtPrice(r.resistance)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {r.breakout && <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">BK</Badge>}
                        {r.breakdown && <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]">BD</Badge>}
                        {!r.breakout && !r.breakdown && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={regimeColor(r.regime ?? "")}>{r.regime ?? "—"}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={14} className="py-12 text-center text-sm text-muted-foreground">
                    {isLoading ? "Loading trends…" : "No trend data available. Run a scan to populate the trend table."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular ${color}`}>
        {icon}
        {value}
      </div>
    </Card>
  );
}
