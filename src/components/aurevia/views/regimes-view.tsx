"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useRegimes } from "@/lib/aurevia/hooks";
import { regimeColor } from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { Activity } from "lucide-react";

const REGIME_ORDER = ["BULL", "BREAKOUT", "ACCUMULATION", "RECOVERY", "LOW_VOLATILITY", "RANGE", "DISTRIBUTION", "HIGH_VOLATILITY", "BEAR", "BREAKDOWN", "CRASH"];

export function RegimesView() {
  const { data, isLoading } = useRegimes();
  const { openAsset } = useUI();
  const distribution: Record<string, any[]> = data?.distribution ?? {};
  const summary: any[] = data?.summary ?? [];

  const total = Object.values(distribution).reduce((acc, list) => acc + (Array.isArray(list) ? list.length : 0), 0);
  const entries = Object.entries(distribution).sort((a, b) => {
    const ai = REGIME_ORDER.indexOf(a[0]);
    const bi = REGIME_ORDER.indexOf(b[0]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  const maxCount = Math.max(1, ...entries.map(([, list]) => (Array.isArray(list) ? list.length : 0)));

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Regimes</h2>
        <p className="text-sm text-muted-foreground">
          Market-regime distribution across the universe, with per-regime asset lists. Click any asset to open detailed analysis.
        </p>
      </div>

      {/* Distribution bar chart */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-semibold">Distribution</h3>
          <Badge variant="outline" className="text-xs">{total} assets</Badge>
        </div>
        <div className="space-y-2">
          {entries.map(([regime, list]) => {
            const count = Array.isArray(list) ? list.length : 0;
            const pct = (count / maxCount) * 100;
            return (
              <div key={regime} className="flex items-center gap-3">
                <Badge variant="outline" className={`w-44 justify-start ${regimeColor(regime)}`}>{regime}</Badge>
                <div className="relative h-6 flex-1 overflow-hidden rounded bg-muted/40">
                  <div
                    className={`absolute inset-y-0 left-0 ${regimeColor(regime).split(" ")[0].replace("/15", "/40")} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                  <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium tabular">
                    {count} assets
                  </span>
                </div>
              </div>
            );
          })}
          {entries.length === 0 && isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-6 flex-1" />
                </div>
              ))}
            </div>
          )}
          {entries.length === 0 && !isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No regime data available.
            </div>
          )}
        </div>
        {summary.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-4 text-xs sm:grid-cols-3 lg:grid-cols-4">
            {summary.map((s: any) => (
              <div key={s.regime} className="flex items-center justify-between">
                <span className="text-muted-foreground">{s.regime}</span>
                <span className="tabular font-medium">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Per-regime cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {entries.map(([regime, list]) => {
          const items = Array.isArray(list) ? list : [];
          return (
            <Card key={regime} className={`p-4 ring-1 ${ringFor(regime)}`}>
              <div className="mb-3 flex items-center justify-between">
                <Badge variant="outline" className={regimeColor(regime)}>{regime}</Badge>
                <span className="text-xs text-muted-foreground">{items.length} asset{items.length === 1 ? "" : "s"}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((a: any, i: number) => (
                  <button
                    key={`${a.symbol}-${i}`}
                    onClick={() => openAsset(a.symbol)}
                    className="rounded-md border border-border/60 bg-card/40 px-2 py-1 text-xs font-medium transition-colors hover:bg-accent/40"
                  >
                    {a.symbol}
                  </button>
                ))}
                {items.length === 0 && (
                  <span className="text-xs text-muted-foreground">No assets in this regime.</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ringFor(regime: string): string {
  switch (regime) {
    case "BULL":
    case "BREAKOUT":
    case "ACCUMULATION":
      return "ring-emerald-500/20";
    case "BEAR":
    case "BREAKDOWN":
    case "CRASH":
      return "ring-red-500/20";
    case "HIGH_VOLATILITY":
    case "DISTRIBUTION":
      return "ring-amber-500/20";
    case "RECOVERY":
    case "LOW_VOLATILITY":
      return "ring-cyan-500/20";
    default:
      return "ring-border/50";
  }
}
