"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMarkets, usePortfolio, useHealth, useSystemStats, useSignals, useTrends, useSparklines, useScanSignals } from "@/lib/aurevia/hooks";
import { fmtPrice, fmtPct, fmtUsd, gainColor, accentColor, regimeColor, actionColor, decisionColor, fmtTime } from "@/lib/aurevia/format";
import { StatTile } from "@/components/aurevia/charts/stat-tile";
import { Sparkline } from "@/components/aurevia/charts/sparkline";
import { useUI } from "@/lib/aurevia/ui-store";
import { Activity, ArrowUpRight, ArrowDownRight, ShieldAlert, Radio, Zap, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// "Updated Xs ago" — re-renders every second so the age visibly ticks
// between background refetches. Without this the dashboard reads as a
// frozen screenshot; with it the system feels alive (issue #36).
function useAgeLabel(ts: number | null | undefined): string {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);
  if (!ts) return "Awaiting first tick…";
  const age = Date.now() - ts;
  if (age < 0) return "Just now";
  if (age < 60_000) return `Updated ${Math.max(1, Math.floor(age / 1000))}s ago`;
  if (age < 3_600_000) return `Updated ${Math.floor(age / 60_000)}m ago`;
  return `Updated ${Math.floor(age / 3_600_000)}h ago`;
}

export function DashboardView() {
  const markets = useMarkets();
  const portfolio = usePortfolio();
  const health = useHealth();
  // Issue #183 / R-13 — the public /api/v1/health no longer returns the
  // operational fields (brokerConnected, marketDataLatencyMs, signals /
  // backtests counters); fetch them from the authenticated admin/system
  // snapshot instead. The basic status fields (tradingMode, breaker,
  // uptime, dataSource) still come from /api/v1/health so the card renders
  // even if the admin endpoint is unreachable for a viewer-role user.
  const system = useSystemStats();
  const signals = useSignals();
  const trends = useTrends();
  const sparklines = useSparklines(30);
  const scan = useScanSignals();
  const qc = useQueryClient();
  const { openAsset, setView } = useUI();

  const equity = portfolio.data?.equity ?? 100000;
  const pnl = portfolio.data?.unrealizedPnl ?? 0;
  const pnlPct = equity > 0 ? (pnl / equity) * 100 : 0;
  const exposure = portfolio.data?.exposure ?? 0;
  const drawdown = portfolio.data?.drawdown ?? 0;
  const positions = portfolio.data?.positions ?? [];

  const topMovers = [...(markets.data ?? [])]
    .sort((a, b) => Math.abs(b.quote.changePct) - Math.abs(a.quote.changePct))
    .slice(0, 6);

  const recentSignals = (signals.data ?? []).slice(0, 6);
  const regimeCounts = trends.data?.distribution ?? {};

  // Tick every second so the "Updated Xs ago" badge under System Status
  // visibly ages between health refetches.
  const lastUpdatedLabel = useAgeLabel(
    system.data?.health.lastTickAt ? Date.parse(system.data.health.lastTickAt) : undefined,
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Market Intelligence Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Real-time market analytics, strategy signals, and controlled paper-trading execution.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Portfolio Equity"
          value={fmtUsd(equity)}
          sub={`Unrealized P&L ${fmtUsd(pnl)}`}
          delta={pnlPct}
          accent={pnl >= 0 ? "gain" : "loss"}
        />
        <StatTile
          label="Exposure"
          value={`${(exposure * 100).toFixed(0)}%`}
          sub={`${positions.length} open position${positions.length === 1 ? "" : "s"}`}
          accent={exposure > 0.9 ? "warn" : "default"}
        />
        <StatTile
          label="Max Drawdown"
          value={`${(drawdown * 100).toFixed(2)}%`}
          sub={`Peak equity ${fmtUsd(portfolio.data?.peakEquity ?? equity)}`}
          accent={drawdown > 0.05 ? "loss" : "default"}
        />
        <StatTile
          label="Universe"
          value={`${markets.data?.length ?? 0}`}
          sub={`${trends.data?.rows?.length ?? 0} assets analyzed`}
          accent="default"
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Top movers */}
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold">Top Movers</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setView("markets")} className="text-xs text-muted-foreground">
              View all →
            </Button>
          </div>
          <div className="space-y-1">
            {topMovers.map((a) => {
              const up = a.quote.changePct >= 0;
              return (
                <button
                  key={a.symbol}
                  onClick={() => openAsset(a.symbol)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-secondary text-xs font-semibold">
                      {a.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{a.symbol}</div>
                      <div className="text-xs text-muted-foreground">{a.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Sparkline
                      data={sparklines.data?.[a.symbol]?.closes ?? [a.quote.price]}
                      width={60}
                      height={20}
                      positive={up}
                    />
                    <div className="text-right">
                      <div className="text-sm font-medium tabular">{fmtPrice(a.quote.price)}</div>
                      <div className={`text-xs tabular ${gainColor(a.quote.changePct)}`}>
                        {up ? <ArrowUpRight className="inline h-3 w-3" /> : <ArrowDownRight className="inline h-3 w-3" />}
                        {fmtPct(a.quote.changePct)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {topMovers.length === 0 && (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md px-2 py-2">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-2.5 w-32" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-5 w-16" />
                      <div className="space-y-1.5 text-right">
                        <Skeleton className="h-3 w-12 ml-auto" />
                        <Skeleton className="h-2.5 w-14 ml-auto" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* System status */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className={cn("h-4 w-4", accentColor(health.data?.circuitBreakerState === "NORMAL" ? "gain" : "loss"))} />
              <h3 className="text-sm font-semibold">System Status</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setView("system")} className="text-xs text-muted-foreground">
              Details →
            </Button>
          </div>
          <div className="space-y-2.5 text-sm">
            <StatusRow label="Trading Mode" value={health.data?.tradingMode ?? "—"} accent="default" pulse />
            <StatusRow
              label="Circuit Breaker"
              value={health.data?.circuitBreakerState ?? "—"}
              accent={health.data?.circuitBreakerState === "NORMAL" ? "gain" : "loss"}
            />
            <StatusRow label="Broker" value={system.data?.health.brokerConnected ? "Connected" : "Disconnected"} accent={system.data?.health.brokerConnected ? "gain" : "loss"} />
            <StatusRow label="Mkt Data Latency" value={`${system.data?.health.marketDataLatencyMs ?? 0}ms`} accent="default" />
            <StatusRow label="Signals Tracked" value={`${system.data?.store.signalsTracked ?? 0}`} accent="default" />
            <StatusRow label="Backtests Run" value={`${system.data?.store.backtestsRun ?? 0}`} accent="default" />
            <StatusRow label="Uptime" value={`${health.data?.uptimeHours ?? 0}h`} accent="default" />
          </div>
          {/* "Updated Xs ago" — gives the card a heartbeat and tells the
              user the data is fresh without making them read a timestamp
              (issue #36 — humanized numbers with context). */}
          <div className="mt-3 flex items-center gap-1.5 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden />
            <span className="tabular">{lastUpdatedLabel}</span>
          </div>
        </Card>
      </div>

      {/* Signals + Regimes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">Live Signals</h3>
            </div>
            <Button
              variant="outline"
              size="default"
              disabled={scan.isPending}
              onClick={() => {
                scan.mutate(undefined, {
                  onSuccess: (d) => {
                    toast.success(`Scanned ${d.scanned} assets, ${d.newSignals.length} new signals`);
                    qc.invalidateQueries({ queryKey: ["signals"] });
                  },
                  onError: (e: any) => toast.error(e.message),
                });
              }}
              className="gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${scan.isPending ? "animate-spin" : ""}`} />
              Scan
            </Button>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {recentSignals.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No active signals. Click <span className="text-foreground">Scan</span> to evaluate the universe.
              </div>
            )}
            {recentSignals.map((s) => (
              <button
                key={s.id}
                onClick={() => openAsset(s.symbol)}
                className="flex w-full items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2 text-left transition-colors hover:bg-accent/30"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={actionColor(s.action)}>{s.action}</Badge>
                  <div>
                    <div className="text-sm font-medium">{s.symbol}</div>
                    <div className="text-xs text-muted-foreground">{s.strategyKey} · {fmtTime(s.timestamp)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <div className="text-sm tabular">{fmtPrice(s.price)}</div>
                    <div className="text-xs text-muted-foreground">conf {(s.confidence * 100).toFixed(0)}%</div>
                  </div>
                  {s.risk && (
                    <Badge variant="outline" className={decisionColor(s.risk.decision)}>
                      {s.risk.decision}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-purple-400" />
              <h3 className="text-sm font-semibold">Regime Distribution</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setView("regimes")} className="text-xs text-muted-foreground">
              All →
            </Button>
          </div>
          <div className="space-y-2">
            {Object.entries(regimeCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([regime, count]) => (
                <div key={regime} className="flex items-center justify-between text-sm">
                  <Badge variant="outline" className={regimeColor(regime)}>{regime}</Badge>
                  <span className="tabular text-muted-foreground">{count as number}</span>
                </div>
              ))}
            {Object.keys(regimeCounts).length === 0 && (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatusRow({ label, value, accent, pulse }: { label: string; value: string; accent?: "gain" | "loss" | "warn" | "default"; pulse?: boolean }) {
  const color = accentColor(accent ?? "default");
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-1.5 font-medium tabular ${color}`}>
        {pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
        {value}
      </span>
    </div>
  );
}
