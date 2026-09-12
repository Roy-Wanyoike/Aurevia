"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketPulse } from "@/lib/aurevia/hooks";
import {
  fmtPct,
  gainColor,
  gainBg,
  regimeColor,
} from "@/lib/aurevia/format";
import { cn } from "@/lib/utils";
import {
  Gauge as GaugeIcon,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Layers,
  Target,
  AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Market Pulse (issue #43).
//
// At-a-glance global market health, sourced entirely from
// /api/v1/market-pulse (no hardcoded numbers):
//   1. Header + subtitle
//   2. Fear & Greed semicircular SVG gauge (0..100, color-banded)
//   3. Advancers vs Decliners horizontal bar + Market Breadth progress bars
//   4. Regime distribution list with count badges
//   5. Sector performance grid (color-coded avg change%)
//
// Loading + error states are handled so the view never throws into the
// router — a skeleton renders while the query is in flight, and an error
// card renders if the endpoint fails.
// ---------------------------------------------------------------------------

// Fear & Greed color bands per spec:
//   red <25, orange 25-45, yellow 45-55, light-green 55-75, green >75
function fearGreedStroke(score: number): string {
  if (score < 25) return "oklch(0.65 0.21 25)";    // red
  if (score < 45) return "oklch(0.70 0.18 50)";    // orange
  if (score < 55) return "oklch(0.82 0.15 95)";    // yellow
  if (score < 75) return "oklch(0.78 0.15 145)";   // light green
  return "oklch(0.72 0.17 162)";                    // green
}

function fearGreedLabel(score: number): string {
  if (score < 25) return "Extreme Fear";
  if (score < 45) return "Fear";
  if (score < 55) return "Neutral";
  if (score < 75) return "Greed";
  return "Extreme Greed";
}

function fearGreedText(score: number): string {
  if (score < 25) return "text-red-400";
  if (score < 45) return "text-orange-400";
  if (score < 55) return "text-yellow-400";
  if (score < 75) return "text-emerald-300";
  return "text-emerald-400";
}

// Sweep arc for a semicircular gauge. Score 0..100 maps to a sweep starting
// at 180° (left) going clockwise to 0° (right). The arc never exceeds 180°,
// so large-arc-flag is always 0.
function semicircleArc(score: number, radius: number): string {
  const angle = (180 - (score / 100) * 180) * (Math.PI / 180);
  const cx = radius;
  const cy = radius;
  const x = cx + radius * Math.cos(angle);
  const y = cy - radius * Math.sin(angle);
  return `M 0 ${cy} A ${radius} ${radius} 0 0 1 ${x} ${y}`;
}

export function MarketPulseView() {
  const { data, isLoading, isError, error, refetch } = useMarketPulse();

  if (isLoading && !data) {
    return (
      <div className="space-y-6 p-6">
        <Header totalAssets={null} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6 p-6">
        <Header totalAssets={null} />
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Couldn’t load market pulse
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

  const {
    advancers,
    decliners,
    unchanged,
    totalAssets,
    breadth,
    regimeDist,
    sectors,
    fearGreed,
  } = data;

  const total = totalAssets || 1;
  const advPct = (advancers / total) * 100;
  const decPct = (decliners / total) * 100;
  const unchPct = (unchanged / total) * 100;

  // Regime entries sorted by count desc so the dominant regime leads.
  const regimeEntries = Object.entries(regimeDist).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6 p-6">
      <Header totalAssets={totalAssets} />

      {/* Top row: Fear & Greed gauge + Advancers/Decliners + Breadth */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Fear & Greed gauge */}
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <GaugeIcon className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Fear &amp; Greed</h3>
          </div>
          <FearGreedGauge score={fearGreed} />
          <div className="mt-4 flex items-center justify-between">
            <span className={cn("text-base font-bold", fearGreedText(fearGreed))}>
              {fearGreedLabel(fearGreed)}
            </span>
            <span className="text-xs text-muted-foreground">0–100 scale</span>
          </div>
        </Card>

        {/* Advancers vs Decliners */}
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold">Advancers vs Decliners</h3>
          </div>
          <div className="space-y-4">
            {/* Stacked horizontal bar — green advancers, muted unchanged, red decliners */}
            <div
              className="flex h-8 w-full overflow-hidden rounded-md border border-border/60"
              role="img"
              aria-label={`${advancers} advancers, ${decliners} decliners, ${unchanged} unchanged out of ${totalAssets} assets`}
            >
              <div
                className="flex items-center justify-center bg-emerald-500/70 text-xs font-medium text-emerald-50 transition-all"
                style={{ width: `${advPct}%` }}
                title={`${advancers} advancers (${advPct.toFixed(1)}%)`}
              >
                {advPct > 8 && advancers}
              </div>
              <div
                className="flex items-center justify-center bg-muted/60 text-xs font-medium text-muted-foreground transition-all"
                style={{ width: `${unchPct}%` }}
                title={`${unchanged} unchanged (${unchPct.toFixed(1)}%)`}
              >
                {unchPct > 8 && unchanged}
              </div>
              <div
                className="flex items-center justify-center bg-red-500/70 text-xs font-medium text-red-50 transition-all"
                style={{ width: `${decPct}%` }}
                title={`${decliners} decliners (${decPct.toFixed(1)}%)`}
              >
                {decPct > 8 && decliners}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <AdStat
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Advancers"
                value={advancers}
                pct={advPct}
                accent="gain"
              />
              <AdStat
                icon={<Minus className="h-3.5 w-3.5" />}
                label="Unchanged"
                value={unchanged}
                pct={unchPct}
                accent="default"
              />
              <AdStat
                icon={<TrendingDown className="h-3.5 w-3.5" />}
                label="Decliners"
                value={decliners}
                pct={decPct}
                accent="loss"
              />
            </div>
          </div>
        </Card>

        {/* Market breadth */}
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">Market Breadth</h3>
          </div>
          <div className="space-y-4">
            <BreadthRow
              label="Above SMA50"
              pct={breadth.aboveSma50Pct}
            />
            <BreadthRow
              label="Above SMA200"
              pct={breadth.aboveSma200Pct}
            />
            <div className="rounded-md border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Why this matters:</span>{" "}
              sustained breadth above 60% signals broad participation (healthy bull);
              below 40% warns of narrowing leadership (late-stage or distribution).
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom row: Regime distribution + Sector performance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Regime distribution */}
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-400" />
              <h3 className="text-sm font-semibold">Regime Distribution</h3>
            </div>
            <Badge variant="outline" className="text-xs">{totalAssets} assets</Badge>
          </div>
          <div className="space-y-1.5">
            {regimeEntries.map(([regime, count]) => (
              <div
                key={regime}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <Badge variant="outline" className={cn("justify-start", regimeColor(regime))}>
                  {regime}
                </Badge>
                <div className="flex flex-1 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full bg-primary/70"
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                  <span className="tabular text-muted-foreground">
                    {count}
                  </span>
                </div>
              </div>
            ))}
            {regimeEntries.length === 0 && (
              <div className="text-xs text-muted-foreground">No regime data available.</div>
            )}
          </div>
        </Card>

        {/* Sector performance */}
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold">Sector Performance</h3>
            </div>
            <span className="text-xs text-muted-foreground">Avg 24h change %</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {sectors.map((s) => (
              <div
                key={s.name}
                className={cn(
                  "flex flex-col gap-0.5 rounded-md border p-3",
                  gainBg(s.avgChange),
                )}
                title={`${s.name} — avg ${fmtPct(s.avgChange)} across ${s.count} asset${s.count === 1 ? "" : "s"}`}
              >
                <span className="truncate text-xs font-medium">{s.name}</span>
                <span className={cn("text-lg font-bold tabular", gainColor(s.avgChange))}>
                  {fmtPct(s.avgChange)}
                </span>
                <span className="text-[10px] opacity-80">
                  {s.count} asset{s.count === 1 ? "" : "s"}
                </span>
              </div>
            ))}
            {sectors.length === 0 && (
              <div className="col-span-full py-6 text-center text-xs text-muted-foreground">
                No sector data available.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Header({ totalAssets }: { totalAssets: number | null }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-2xl font-bold tracking-tight">Market Pulse</h2>
      <p className="text-sm text-muted-foreground">
        Global market health snapshot
        {totalAssets !== null
          ? ` across ${totalAssets} assets — advancers/decliners, regime distribution, sector performance, market breadth and a composite Fear & Greed score.`
          : " — loading…"}
      </p>
    </div>
  );
}

// Semicircular gauge — SVG arc fill colored by score band. Drawn directly
// (no chart lib) so the 180° sweep + tick marks render cleanly.
function FearGreedGauge({ score }: { score: number }) {
  const size = 200;
  const radius = 84;
  const cx = size / 2;
  const cy = 92;
  const trackPath = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;
  const fillPath = semicircleArc(score, radius);
  const stroke = fearGreedStroke(score);

  return (
    <div className="flex justify-center">
      <svg width={size} height={size / 2 + 28} viewBox={`0 0 ${size} ${size / 2 + 28}`}>
        {/* Track */}
        <path d={trackPath} fill="none" stroke="oklch(1 0 0 / 8%)" strokeWidth={14} strokeLinecap="round" />
        {/* Fill */}
        <path d={fillPath} fill="none" stroke={stroke} strokeWidth={14} strokeLinecap="round" />
        {/* Tick marks at 25 / 50 / 75 */}
        {[25, 50, 75].map((tick) => {
          const angle = (180 - (tick / 100) * 180) * (Math.PI / 180);
          const x1 = cx + (radius - 10) * Math.cos(angle);
          const y1 = cy - (radius - 10) * Math.sin(angle);
          const x2 = cx + (radius + 6) * Math.cos(angle);
          const y2 = cy - (radius + 6) * Math.sin(angle);
          return (
            <line
              key={tick}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="oklch(1 0 0 / 25%)"
              strokeWidth={1}
            />
          );
        })}
        {/* Score number */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          className="fill-foreground font-bold tabular"
          style={{ fontSize: 30 }}
        >
          {score}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
          / 100
        </text>
      </svg>
    </div>
  );
}

function AdStat({
  icon,
  label,
  value,
  pct,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  pct: number;
  accent: "gain" | "loss" | "default";
}) {
  const color =
    accent === "gain"
      ? "text-emerald-400"
      : accent === "loss"
        ? "text-red-400"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border/50 bg-card/40 p-2.5">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 text-xl font-bold tabular", color)}>{value}</div>
      <div className={cn("text-[10px] tabular", color)}>{pct.toFixed(1)}%</div>
    </div>
  );
}

function BreadthRow({ label, pct }: { label: string; pct: number }) {
  // Color the bar by participation: above 60% green, 40–60% amber, below red.
  const accent =
    pct >= 60 ? "gain" : pct >= 40 ? "warn" : "loss";
  const color =
    accent === "gain"
      ? "text-emerald-400"
      : accent === "warn"
        ? "text-amber-400"
        : "text-red-400";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("tabular font-medium", color)}>{pct.toFixed(1)}%</span>
      </div>
      <Progress
        value={Math.min(100, pct)}
        className="h-2.5"
        // shadcn Progress reads --progress-foreground for the bar; we override
        // per-row so the color matches the participation band.
        style={{
          // @ts-expect-error custom CSS var consumed by the Progress primitive
          "--progress-foreground":
            accent === "gain"
              ? "oklch(0.72 0.17 162)"
              : accent === "warn"
                ? "oklch(0.75 0.15 70)"
                : "oklch(0.65 0.21 25)",
        }}
      />
    </div>
  );
}
