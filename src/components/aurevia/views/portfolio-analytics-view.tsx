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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { usePortfolioAnalytics, usePortfolio } from "@/lib/aurevia/hooks";
import { fmtUsd, fmtPct } from "@/lib/aurevia/format";
import { StatTile } from "@/components/aurevia/charts/stat-tile";
import { QueryState } from "@/components/aurevia/query-state";
import { PieChart as PieIcon, ShieldAlert, AlertTriangle, Info } from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Portfolio Analytics view (issue #52).
//
// Surfaces the risk-engine numbers a portfolio manager needs at a glance:
//   - VaR (95% / 99%) + CVaR (95%) as both % and dollar magnitude
//   - Beta vs SPY (position-weighted)
//   - Herfindahl concentration index + max single position weight
//   - Sector exposure donut
//   - Per-position weight bars (highlights any > 25%)
//
// The numbers come straight from the API route — no client-side math, no
// hardcoded values. When the portfolio has no open positions, the route
// returns 422 and we render an empty-state card explaining what to do.
// ---------------------------------------------------------------------------

const SECTOR_COLORS = [
  "#10b981", // emerald-500
  "#06b6d4", // cyan-500
  "#f59e0b", // amber-500
  "#a855f7", // purple-500
  "#ef4444", // red-500
  "#3b82f6", // blue-500 — but never used as a primary brand color
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
];

const CONCENTRATION_LIMIT_PCT = 25; // any single position > 25% triggers a warning

export function PortfolioAnalyticsView() {
  const analytics = usePortfolioAnalytics();
  const portfolio = usePortfolio();

  const positions: any[] = portfolio.data?.positions ?? [];
  const totalMV = positions.reduce(
    (s, p) => s + Math.abs(p.marketValue ?? 0),
    0,
  );

  const positionWeightData = positions
    .map((p) => ({
      symbol: p.symbol,
      weight: totalMV > 0 ? (Math.abs(p.marketValue ?? 0) / totalMV) * 100 : 0,
      marketValue: Math.abs(p.marketValue ?? 0),
      side: p.side,
    }))
    .sort((a, b) => b.weight - a.weight);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Portfolio Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Value-at-Risk, Conditional VaR, Beta vs SPY, sector exposure, and concentration — computed from the 30-day daily returns of every open position.
        </p>
      </div>

      <QueryState
        isLoading={analytics.isLoading && !analytics.data}
        isError={analytics.isError && !analytics.data}
        error={analytics.error}
        isEmpty={
          !analytics.isLoading &&
          !analytics.data &&
          (analytics.error as any)?.message?.includes("422") === false &&
          positions.length === 0
        }
        emptyTitle="No open positions"
        emptyDescription="Open at least one position to compute portfolio-level risk analytics. Use the Portfolio view to place a paper order."
        onRetry={() => analytics.refetch()}
        data={analytics.data}
      >
        {(d) => (
          <>
            {/* Risk band — VaR / CVaR / Beta tiles */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <StatTile
                label="VaR 95%"
                value={fmtPct(d.var95.returnPct)}
                sub={`${fmtUsd(d.var95.dollar)} over 1 day`}
                accent="loss"
              />
              <StatTile
                label="VaR 99%"
                value={fmtPct(d.var99.returnPct)}
                sub={`${fmtUsd(d.var99.dollar)} over 1 day`}
                accent="loss"
              />
              <StatTile
                label="CVaR 95%"
                value={fmtPct(d.cvar95.returnPct)}
                sub={`${fmtUsd(d.cvar95.dollar)} tail avg`}
                accent="loss"
              />
              <StatTile
                label="Beta vs SPY"
                value={d.beta.toFixed(2)}
                sub={
                  d.beta > 1.1
                    ? "Aggressive — high market sensitivity"
                    : d.beta < 0.9
                      ? "Defensive — low market sensitivity"
                      : "Market-like exposure"
                }
                accent={
                  d.beta > 1.5 || d.beta < 0.3 ? "warn" : "default"
                }
              />
              <StatTile
                label="Concentration (HHI)"
                value={d.concentration.toFixed(2)}
                sub={`Max pos ${(d.maxConcentration * 100).toFixed(1)}%`}
                accent={
                  d.maxConcentration * 100 > CONCENTRATION_LIMIT_PCT
                    ? "warn"
                    : "default"
                }
              />
            </div>

            {/* Concentration warning */}
            {d.maxConcentration * 100 > CONCENTRATION_LIMIT_PCT && (
              <Card className="border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-amber-400">
                      Single position exceeds {(d.maxConcentration * 100).toFixed(1)}% of gross market value
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Aurevia&apos;s risk profile caps single-name exposure at {(CONCENTRATION_LIMIT_PCT).toFixed(0)}% by default. Consider trimming or hedging this position before adding new risk. Use the Risk Cockpit to review all limits at once.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Sector exposure donut */}
              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PieIcon className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold">Sector Exposure</h3>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {fmtUsd(d.totalMarketValue, 0)} gross
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="relative h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={d.sectors}
                          dataKey="marketValue"
                          nameKey="sector"
                          cx="50%"
                          cy="50%"
                          innerRadius={56}
                          outerRadius={92}
                          paddingAngle={1}
                          stroke="oklch(0.16 0.012 250)"
                          strokeWidth={2}
                        >
                          {d.sectors.map((_, i) => (
                            <Cell
                              key={i}
                              fill={SECTOR_COLORS[i % SECTOR_COLORS.length]}
                            />
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
                            `${fmtUsd(v, 0)} (${item.payload.exposurePct.toFixed(1)}%)`,
                            item.payload.sector,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Sectors
                      </span>
                      <span className="text-lg font-semibold">
                        {d.sectors.length}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {d.sectors
                      .slice()
                      .sort((a, b) => b.marketValue - a.marketValue)
                      .map((s, i) => (
                        <div
                          key={s.sector}
                          className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-sm"
                              style={{
                                backgroundColor:
                                  SECTOR_COLORS[i % SECTOR_COLORS.length],
                              }}
                            />
                            <span className="text-xs font-medium">
                              {s.sector}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs tabular font-semibold">
                              {s.exposurePct.toFixed(1)}%
                            </div>
                            <div className="text-[10px] tabular text-muted-foreground">
                              {fmtUsd(s.marketValue, 0)}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </Card>

              {/* Position weights bar chart */}
              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-400" />
                    <h3 className="text-sm font-semibold">
                      Position Weights
                    </h3>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {positionWeightData.length} positions
                  </Badge>
                </div>
                {positionWeightData.length === 0 ? (
                  <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
                    No open positions
                  </div>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={positionWeightData}
                        layout="vertical"
                        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="oklch(1 0 0 / 6%)"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v.toFixed(0)}%`}
                          tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }}
                          stroke="oklch(1 0 0 / 10%)"
                        />
                        <YAxis
                          type="category"
                          dataKey="symbol"
                          tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }}
                          stroke="oklch(1 0 0 / 10%)"
                          width={56}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            background: "oklch(0.19 0.012 250)",
                            border: "1px solid oklch(1 0 0 / 10%)",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                          formatter={(v: any, _n: string, item: any) => [
                            `${(v as number).toFixed(1)}% · ${fmtUsd(item.payload.marketValue, 0)} · ${item.payload.side}`,
                            "Weight",
                          ]}
                        />
                        <Bar
                          dataKey="weight"
                          radius={[0, 4, 4, 0]}
                          fill="#f59e0b"
                          // Color cells individually so over-limit positions
                          // stand out from the rest.
                          shape={(props: any) => {
                            const { x, y, width, height, payload } = props;
                            const overLimit =
                              payload.weight > CONCENTRATION_LIMIT_PCT;
                            const fill = overLimit
                              ? "#ef4444"
                              : payload.side === "LONG"
                                ? "#10b981"
                                : "#f59e0b";
                            return (
                              <rect
                                x={x}
                                y={y}
                                width={width}
                                height={height}
                                rx={4}
                                ry={4}
                                fill={fill}
                              />
                            );
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {positionWeightData.length > 0 && (
                  <div className="mt-2 flex items-center justify-end gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-3 rounded-sm bg-emerald-500" />
                      LONG
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-3 rounded-sm bg-amber-500" />
                      SHORT
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-3 rounded-sm bg-red-500" />
                      &gt; {CONCENTRATION_LIMIT_PCT}% (over limit)
                    </span>
                  </div>
                )}
              </Card>
            </div>

            {/* Methodology footer */}
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="font-semibold text-foreground">
                    Methodology
                  </div>
                  <p>
                    VaR / CVaR are computed from the historical distribution of position-weighted daily portfolio returns over the last {d.sampleDays} bars. VaR is the (α·N)-th worst return; CVaR is the mean of the tail beyond VaR. Beta is the covariance of portfolio returns with SPY over the same window, normalized by SPY variance. Concentration is the Herfindahl index (Σ wᵢ²); max position weight is the largest single wᵢ.
                  </p>
                  <p className="text-[11px] italic">
                    Returns are derived from the same deterministic simulated market feed the rest of Aurevia trusts — connect a real market data provider to compute these from live prices.
                  </p>
                </div>
              </div>
            </Card>
          </>
        )}
      </QueryState>

      {/* Loading skeleton when portfolio has not been hydrated yet */}
      {portfolio.isLoading && !portfolio.data && (
        <Card className="p-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        </Card>
      )}
    </div>
  );
}
