"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { useMarketPulse } from "@/lib/aurevia/hooks";
import {
  fmtPct,
  regimeColor,
  accentColor,
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
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Market Pulse (issue #43).
//
// At-a-glance global market health: a Fear & Greed semicircular gauge, an
// Advancers vs Decliners bar, regime distribution donut, sector performance
// heatmap, and SMA50/SMA200 breadth progress bars. Every figure comes from
// /api/v1/market-pulse — nothing is hardcoded.
// ---------------------------------------------------------------------------

// Fear & Greed color band thresholds — the gauge stroke and label tint
// match the spec: red <25, orange 25-45, yellow 45-55, light-green 55-75,
// green >75.
function fearGreedColor(score: number): string {
  if (score < 25) return "oklch(0.65 0.21 25)";     // red
  if (score < 45) return "oklch(0.70 0.18 50)";     // orange
  if (score < 55) return "oklch(0.82 0.15 95)";     // yellow
  if (score < 75) return "oklch(0.78 0.15 145)";    // light green
  return "oklch(0.72 0.17 162)";                    // green
}

function fearGreedTextColor(score: number): string {
  if (score < 25) return "text-red-400";
  if (score < 45) return "text-orange-400";
  if (score < 55) return "text-yellow-400";
  if (score < 75) return "text-emerald-300";
  return "text-emerald-400";
}

// Build the SVG arc path for a semicircular gauge from 180° (left) to 0°
// (right). Score 0..100 maps to a sweep starting at 180° going clockwise.
function semicircleArc(score: number, radius: number): string {
  const angle = (180 - (score / 100) * 180) * (Math.PI / 180);
  const cx = radius;
  const cy = radius;
  const x = cx + radius * Math.cos(angle);
  const y = cy - radius * Math.sin(angle);
  // large-arc-flag = 0 since the sweep never exceeds 180°.
  return `M 0 ${cy} A ${radius} ${radius} 0 0 1 ${x} ${y}`;
}

function sectorHeatColor(changePct: number): string {
  // Green scale for positive, red scale for negative — 3 stops each so the
  // heatmap reads at a glance across the universe.
  if (changePct >= 3) return "bg-emerald-500/80 text-emerald-50";
  if (changePct >= 1) return "bg-emerald-500/50 text-emerald-50";
  if (changePct > 0) return "bg-emerald-500/20 text-emerald-300";
  if (changePct === 0) return "bg-muted text-muted-foreground";
  if (changePct > -1) return "bg-red-500/20 text-red-300";
  if (changePct > -3) return "bg-red-500/50 text-red-50";
  return "bg-red-500/80 text-red-50";
}

// Map a regime to a color used in the donut chart slices. Stays in sync with
// the regimeColor() helper but emits a solid bg color (no border) since the
// donut slices need fill, not the badge treatment.
function regimeFill(regime: string): string {
  switch (regime) {
    case "BULL":
    case "BREAKOUT":
    case "ACCUMULATION":
      return "oklch(0.72 0.17 162)";   // emerald
    case "BEAR":
    case "BREAKDOWN":
    case "CRASH":
      return "oklch(0.65 0.21 25)";    // red
    case "HIGH_VOLATILITY":
    case "DISTRIBUTION":
      return "oklch(0.70 0.18 50)";    // orange
    case "RECOVERY":
    case "LOW_VOLATILITY":
      return "oklch(0.70 0.13 210)";  // cyan
    case "SIDEWAYS":
    case "RANGE":
      return "oklch(0.70 0.02 250)";   // muted gray-blue
    default:
      return "oklch(0.55 0.02 250)";
  }
}

export function MarketPulseView() {
  const { data, isLoading } = useMarketPulse();

  if (isLoading || !data) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">Market Pulse</h2>
          <p className="text-sm text-muted-foreground">
            Loading global market health snapshot…
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const {
    advancers,
    decliners,
    unchanged,
    total,
    breadth,
    regimeDistribution,
    sectorPerformance,
    fearGreed,
  } = data;

  const advPct = total > 0 ? (advancers / total) * 100 : 0;
  const decPct = total > 0 ? (decliners / total) * 100 : 0;
  const unchPct = total > 0 ? (unchanged / total) * 100 : 0;

  // Donut chart data — recharts wants an array of {name, value} records.
  const regimeChartData = regimeDistribution.map((r) => ({
    name: r.regime,
    value: r.count,
    pct: r.pct,
    fill: regimeFill(r.regime),
  }));

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Market Pulse</h2>
        <p className="text-sm text-muted-foreground">
          Global market health snapshot across {total} assets — advancers/decliners, regime distribution, sector performance, market breadth and a composite Fear &amp; Greed score.
        </p>
      </div>

      {/* Top row: Fear & Greed gauge + Advancers/Decliners + Breadth */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Fear & Greed gauge */}
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <GaugeIcon className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Fear &amp; Greed</h3>
          </div>
          <FearGreedGauge score={fearGreed.score} />
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className={cn("text-base font-bold", fearGreedTextColor(fearGreed.score))}>
                {fearGreed.label}
              </span>
              <span className="text-2xl font-bold tabular text-foreground">
                {fearGreed.score}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 text-center">
              <ComponentTile label="Breadth" value={fearGreed.components.breadth} />
              <ComponentTile label="Momentum" value={fearGreed.components.momentum} />
              <ComponentTile label="Vol Inverse" value={fearGreed.components.volatility} />
            </div>
          </div>
        </Card>

        {/* Advancers vs Decliners */}
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold">Advancers vs Decliners</h3>
          </div>
          <div className="space-y-4">
            {/* Stacked horizontal bar — emerald for advancers, red for decliners, muted for unchanged */}
            <div className="flex h-8 w-full overflow-hidden rounded-md border border-border/60">
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
            <BreadthBar
              label="Above SMA50"
              count={breadth.aboveSma50}
              total={total}
              pct={breadth.pctAboveSma50}
            />
            <BreadthBar
              label="Above SMA200"
              count={breadth.aboveSma200}
              total={total}
              pct={breadth.pctAboveSma200}
            />
            <div className="rounded-md border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Why this matters:</span> Sustained breadth above 60% signals broad participation (healthy bull); below 40% warns of narrowing leadership (late-stage or distribution).
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom row: Regime donut + Sector heatmap */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Regime distribution donut */}
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-400" />
              <h3 className="text-sm font-semibold">Regime Distribution</h3>
            </div>
            <Badge variant="outline" className="text-xs">{total} assets</Badge>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="relative h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={regimeChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={1}
                    stroke="oklch(0.16 0.012 250)"
                    strokeWidth={2}
                  >
                    {regimeChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      background: "oklch(0.19 0.012 250)",
                      border: "1px solid oklch(1 0 0 / 10%)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(v: any, _n: string, item: any) => [
                      `${v} (${item.payload.pct.toFixed(1)}%)`,
                      item.payload.name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label — top regime */}
              {regimeChartData.length > 0 && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Top regime
                  </span>
                  <span className="text-sm font-semibold">
                    {regimeChartData[0].name}
                  </span>
                  <span className="text-xs tabular text-muted-foreground">
                    {regimeChartData[0].pct.toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              {regimeDistribution.map((r) => (
                <div key={r.regime} className="flex items-center justify-between text-xs">
                  <Badge variant="outline" className={cn("justify-start", regimeColor(r.regime))}>
                    {r.regime}
                  </Badge>
                  <span className="tabular text-muted-foreground">
                    {r.count} · {r.pct.toFixed(1)}%
                  </span>
                </div>
              ))}
              {regimeDistribution.length === 0 && (
                <div className="text-xs text-muted-foreground">No regime data available.</div>
              )}
            </div>
          </div>
        </Card>

        {/* Sector performance heatmap */}
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold">Sector Performance</h3>
            </div>
            <span className="text-xs text-muted-foreground">Avg 24h change %</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {sectorPerformance.map((s) => (
              <button
                key={s.sector}
                className={cn(
                  "flex flex-col gap-0.5 rounded-md border border-border/40 p-3 text-left transition-transform hover:scale-[1.02]",
                  sectorHeatColor(s.avgChangePct),
                )}
                title={`${s.sector} — avg ${fmtPct(s.avgChangePct)} across ${s.count} asset${s.count === 1 ? "" : "s"}`}
              >
                <span className="truncate text-xs font-medium">{s.sector}</span>
                <span className="text-lg font-bold tabular">
                  {fmtPct(s.avgChangePct)}
                </span>
                <span className="text-[10px] opacity-80">
                  {s.count} asset{s.count === 1 ? "" : "s"}
                </span>
              </button>
            ))}
            {sectorPerformance.length === 0 && (
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

// Semicircular gauge — SVG arc fill colored by score band. No external chart
// dependency; we draw the arc directly because recharts' RadialBar can't do
// a clean 180° gauge without fighting the layout.
function FearGreedGauge({ score }: { score: number }) {
  const size = 180;
  const radius = 80;
  const cx = size / 2;
  const cy = 80;
  // Background track — full semicircle in muted color
  const trackPath = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;
  // Filled arc — partial sweep based on score
  const fillPath = semicircleArc(score, radius);
  const color = fearGreedColor(score);

  return (
    <div className="flex justify-center">
      <svg width={size} height={size / 2 + 24} viewBox={`0 0 ${size} ${size / 2 + 24}`}>
        {/* Track */}
        <path d={trackPath} fill="none" stroke="oklch(1 0 0 / 8%)" strokeWidth={14} strokeLinecap="round" />
        {/* Fill */}
        <path d={fillPath} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
        {/* Tick marks at 25/50/75 */}
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
        {/* Score label */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="fill-foreground font-bold tabular"
          style={{ fontSize: 28 }}
        >
          {score}
        </text>
        <text
          x={cx}
          y={cy + 14}
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

function ComponentTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/50 bg-card/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold tabular text-foreground">{value}</div>
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
  const color = accentColor(accent);
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

function BreadthBar({
  label,
  count,
  total,
  pct,
}: {
  label: string;
  count: number;
  total: number;
  pct: number;
}) {
  // Color the breadth bar by participation: above 60% green, 40-60% amber,
  // below 40% red. Gives an instant read on whether the move has legs.
  const barColor =
    pct >= 60 ? "bg-emerald-500/70" : pct >= 40 ? "bg-amber-500/70" : "bg-red-500/70";
  const accent = pct >= 60 ? "gain" : pct >= 40 ? "warn" : "loss";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("tabular font-medium", accentColor(accent))}>
          {count} / {total} · {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn("h-full transition-all", barColor)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
