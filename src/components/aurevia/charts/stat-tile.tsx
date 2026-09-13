"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  spark?: number[];
  accent?: "default" | "gain" | "loss" | "warn";
  className?: string;
}

export function StatTile({ label, value, sub, delta, spark, accent = "default", className }: StatTileProps) {
  const accentRing =
    accent === "gain" ? "ring-emerald-500/20" :
    accent === "loss" ? "ring-red-500/20" :
    accent === "warn" ? "ring-amber-500/20" :
    "ring-border/50";
  return (
    <Card className={cn("p-4 ring-1", accentRing, className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        {delta !== undefined && (
          <span className={cn("text-xs font-semibold tabular", delta >= 0 ? "text-emerald-400" : "text-red-400")}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tabular text-foreground">{value}</div>
          {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        </div>
        {spark && spark.length > 1 && (
          <Sparkline data={spark} width={100} height={32} positive={accent !== "loss"} />
        )}
      </div>
    </Card>
  );
}
