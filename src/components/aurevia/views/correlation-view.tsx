"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCorrelation } from "@/lib/aurevia/hooks";
import { cn } from "@/lib/utils";
import { Grid3x3, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Correlation Matrix (issue #44).
//
// Renders an N×N (currently 18×18) heatmap of Pearson return-correlations
// across the tradeable universe. Data comes from /api/v1/correlation as a
// flat list of { a, b, corr } cells; we rehydrate it into a 2-D lookup so
// the grid renders row-major.
//
// Color bands (per spec):
//   corr > 0.7          → emerald
//   0.3 ≤ corr ≤ 0.7    → light emerald
//   -0.3 < corr < 0.3   → muted (neutral)
//   -0.7 ≤ corr ≤ -0.3  → light red
//   corr < -0.7         → red
// The diagonal (a === b) is always 1.00.
// ---------------------------------------------------------------------------

function corrCellColor(corr: number): string {
  if (corr > 0.7) return "bg-emerald-500/80 text-emerald-50";
  if (corr >= 0.3) return "bg-emerald-500/30 text-emerald-200";
  if (corr > -0.3) return "bg-muted/60 text-muted-foreground";
  if (corr >= -0.7) return "bg-red-500/30 text-red-200";
  return "bg-red-500/80 text-red-50";
}

function corrLegendSwatch(band: string): string {
  switch (band) {
    case "strong-pos": return "bg-emerald-500/80";
    case "weak-pos": return "bg-emerald-500/30";
    case "neutral": return "bg-muted/60";
    case "weak-neg": return "bg-red-500/30";
    case "strong-neg": return "bg-red-500/80";
    default: return "bg-muted";
  }
}

export function CorrelationView() {
  const { data, isLoading, isError, error, refetch } = useCorrelation();

  // Rehydrate the flat matrix array into an O(1) lookup keyed by `${a}:${b}`.
  const lookup = useMemo(() => {
    const m = new Map<string, number>();
    if (data?.matrix) {
      for (const cell of data.matrix) m.set(`${cell.a}:${cell.b}`, cell.corr);
    }
    return m;
  }, [data]);

  const symbols = data?.symbols ?? [];

  if (isLoading && !data) {
    return (
      <div className="space-y-6 p-6">
        <Header count={null} />
        <Card className="p-6">
          <Skeleton className="h-[420px] w-full rounded-md" />
        </Card>
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
              Couldn’t load correlation matrix
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
      </div>
    );
  }

  // Grid has N+1 columns: one leading label column, then N symbol columns.
  const n = symbols.length;
  const cols = n + 1;
  // minmax(40px, 1fr) keeps cells readable on wide screens; the wrapper
  // scrolls horizontally on narrow viewports so the heatmap never clips.
  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${cols}, minmax(40px, 1fr))`,
  };

  return (
    <div className="space-y-6 p-6">
      <Header count={n} />

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Grid3x3 className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">Return Correlation Heatmap</h3>
          </div>
          <Badge variant="outline" className="text-xs">
            30-day log returns · {n}×{n}
          </Badge>
        </div>

        {/* Heatmap — horizontal scroll on small screens so 19 columns stay
            legible. The grid itself is sized to fit its content. */}
        <div className="overflow-x-auto">
          <div
            className="grid gap-px"
            style={gridStyle}
            role="table"
            aria-label={`Correlation matrix for ${n} assets`}
          >
            {/* Header row: empty corner cell + column symbols */}
            <div aria-hidden="true" className="sticky left-0 z-10 bg-card" />
            {symbols.map((s) => (
              <div
                key={`col-${s}`}
                className="flex items-center justify-center px-1 py-1.5 text-[10px] font-medium text-muted-foreground"
                title={s}
              >
                <span className="truncate">{s}</span>
              </div>
            ))}

            {/* Body rows: row label + N cells */}
            {symbols.map((rowSym) => (
              <RowFragment
                key={`row-${rowSym}`}
                rowSym={rowSym}
                colSymbols={symbols}
                lookup={lookup}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <LegendItem swatch="strong-pos" label="> 0.70" />
          <LegendItem swatch="weak-pos" label="0.30 – 0.70" />
          <LegendItem swatch="neutral" label="-0.30 – 0.30" />
          <LegendItem swatch="weak-neg" label="-0.70 – -0.30" />
          <LegendItem swatch="strong-neg" label="< -0.70" />
        </div>
      </Card>
    </div>
  );
}

function Header({ count }: { count: number | null }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-2xl font-bold tracking-tight">Correlation Matrix</h2>
      <p className="text-sm text-muted-foreground">
        {count !== null
          ? `${count}×${count} Pearson correlation of 30-day log returns across the tradeable universe — spot diversification clusters and risk concentration at a glance.`
          : "Loading correlation matrix…"}
      </p>
    </div>
  );
}

// A single heatmap row: the leading row label + one cell per column symbol.
// Split out as its own component so React doesn't re-render the whole grid
// when the tooltip/title string changes on hover.
function RowFragment({
  rowSym,
  colSymbols,
  lookup,
}: {
  rowSym: string;
  colSymbols: string[];
  lookup: Map<string, number>;
}) {
  return (
    <>
      {/* Sticky row label — stays visible while scrolling horizontally */}
      <div
        className="sticky left-0 z-10 flex items-center justify-end bg-card px-2 py-1 text-[10px] font-medium text-muted-foreground"
        title={rowSym}
      >
        <span className="truncate">{rowSym}</span>
      </div>
      {colSymbols.map((colSym) => {
        const corr = lookup.get(`${rowSym}:${colSym}`) ?? 0;
        const isDiagonal = rowSym === colSym;
        return (
          <div
            key={`${rowSym}:${colSym}`}
            className={cn(
              "flex aspect-square min-h-[36px] items-center justify-center rounded-sm text-[10px] font-medium tabular transition-transform hover:scale-110 hover:z-20 hover:ring-2 hover:ring-primary",
              corrCellColor(corr),
              isDiagonal && "ring-1 ring-inset ring-primary/40",
            )}
            title={`${rowSym} vs ${colSym}: ${corr.toFixed(2)}`}
            role="cell"
            aria-label={`${rowSym} vs ${colSym}: ${corr.toFixed(2)}`}
          >
            {corr.toFixed(2)}
          </div>
        );
      })}
    </>
  );
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-sm", corrLegendSwatch(swatch))} />
      <span className="tabular">{label}</span>
    </div>
  );
}
