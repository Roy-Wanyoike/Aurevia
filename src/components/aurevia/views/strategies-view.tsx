"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStrategies } from "@/lib/aurevia/hooks";
import { Cpu } from "lucide-react";

function categoryColor(category: string): string {
  switch (category?.toLowerCase()) {
    case "momentum":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "trend":
    case "trend-following":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "mean-reversion":
    case "mean reversion":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "breakout":
      return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function StrategiesView() {
  const { data, isLoading } = useStrategies();
  const strategies = data ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Strategies</h2>
        <p className="text-sm text-muted-foreground">
          Catalog of pluggable strategy engines. Each strategy emits BUY / SELL / CLOSE signals based on its category and default parameters.
        </p>
      </div>

      {isLoading && <div className="py-12 text-center text-sm text-muted-foreground">Loading strategies…</div>}

      {!isLoading && strategies.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">No strategies registered.</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {strategies.map((s: any) => (
          <Card key={s.key ?? s.id} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
                  <Cpu className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{s.name}</div>
                  <div className="text-xs text-muted-foreground">v{s.version ?? "1.0.0"}</div>
                </div>
              </div>
              {s.category && (
                <Badge variant="outline" className={categoryColor(s.category)}>{s.category}</Badge>
              )}
            </div>

            <Badge variant="secondary" className="mt-3 w-fit font-mono text-[10px]">{s.key}</Badge>

            <p className="mt-3 text-sm text-muted-foreground">{s.description ?? "No description provided."}</p>

            {s.defaultParams && Object.keys(s.defaultParams).length > 0 && (
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border/60 pt-3 text-xs">
                {Object.entries(s.defaultParams).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="tabular font-medium">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
