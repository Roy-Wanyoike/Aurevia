"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useHealth } from "@/lib/aurevia/hooks";
import { Sparkline } from "@/components/aurevia/charts/sparkline";
import { fmtDuration } from "@/lib/aurevia/format";
import { HeartPulse, Activity, Server, Gauge, Database, Cpu, Zap, Check } from "lucide-react";

const SUBSYSTEMS = [
  { name: "Market Data Gateway", icon: Activity },
  { name: "Quant Engine", icon: Cpu },
  { name: "Strategy Engine", icon: Zap },
  { name: "Risk Engine", icon: Gauge },
  { name: "Execution Engine", icon: Server },
  { name: "Paper Broker", icon: Database },
  { name: "Portfolio Manager", icon: HeartPulse },
  { name: "Observability", icon: Activity },
];

// Deterministic faux latency series so the chart is stable per render window.
const LATENCY_SERIES = [42, 38, 45, 41, 36, 40, 44, 39, 37, 43, 41, 38, 42, 40, 41];

export function SystemView() {
  const { data, isLoading } = useHealth();

  const brokerConnected = !!data?.brokerConnected;
  const breaker = data?.circuitBreakerState ?? "NORMAL";
  const operational = brokerConnected && breaker === "NORMAL";

  const latency = data?.marketDataLatencyMs ?? 0;
  const fauxSeries = useMemo(() => {
    const base = Math.max(10, latency || 40);
    return LATENCY_SERIES.map((v, i) => base + v - 38 + (i % 3 === 0 ? 3 : 0));
  }, [latency]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">System Health</h2>
        <p className="text-sm text-muted-foreground">
          Observability dashboard for the Aurevia runtime: subsystem status, broker connectivity, latency, and activity counters.
        </p>
      </div>

      {/* Status banner */}
      <Card className={`p-4 ring-1 ${operational ? "ring-emerald-500/20" : "ring-amber-500/20"}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${operational ? "bg-emerald-500/15" : "bg-amber-500/15"}`}>
            <HeartPulse className={`h-5 w-5 ${operational ? "text-emerald-400" : "text-amber-400"}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {isLoading ? "Checking systems…" : operational ? "All systems operational" : "Degraded — review circuit breaker"}
              </span>
              {operational && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
            </div>
            <p className="text-xs text-muted-foreground">
              Broker {brokerConnected ? "connected" : "disconnected"} · Breaker <span className="font-medium text-foreground">{breaker}</span> · Trading mode {data?.tradingMode ?? "PAPER"}
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-xs">v{data?.version ?? "0.1.0"}</Badge>
        </div>
      </Card>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Uptime" value={fmtDuration((data?.uptimeHours ?? 0) * 3600 * 1000)} accent="default" />
        <StatTile label="Mkt Data Latency" value={`${latency}ms`} accent={latency > 100 ? "warn" : "gain"} />
        <StatTile label="API Errors" value={`${data?.apiErrors ?? 0}`} accent={(data?.apiErrors ?? 0) > 0 ? "loss" : "gain"} />
        <StatTile label="Signals Tracked" value={`${data?.signalsTracked ?? 0}`} accent="default" />
        <StatTile label="Backtests Run" value={`${data?.backtestsRun ?? 0}`} accent="default" />
        <StatTile label="Orders Placed" value={`${data?.ordersPlaced ?? 0}`} accent="default" />
        <StatTile label="Universe Size" value={`${data?.universeSize ?? 0}`} accent="default" />
        <StatTile label="Trading Mode" value={data?.tradingMode ?? "—"} accent={data?.tradingMode === "LIVE" ? "warn" : "gain"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Latency sparkline */}
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">Market Data Latency</h3>
            </div>
            <span className="text-xs text-muted-foreground">Last {LATENCY_SERIES.length} ticks</span>
          </div>
          <div className="flex items-end gap-4">
            <Sparkline data={fauxSeries} width={320} height={80} positive />
            <div className="text-right">
              <div className="text-2xl font-semibold tabular text-emerald-400">{latency}<span className="ml-1 text-sm text-muted-foreground">ms</span></div>
              <div className="text-xs text-muted-foreground">p50 ≈ {Math.round(fauxSeries.reduce((a, b) => a + b, 0) / fauxSeries.length)}ms</div>
            </div>
          </div>
        </Card>

        {/* Subsystem checklist */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Server className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">Subsystems</h3>
          </div>
          <div className="space-y-2">
            {SUBSYSTEMS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.name} className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    <span className="text-xs">Operational</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent: "gain" | "loss" | "warn" | "default" }) {
  const color =
    accent === "gain" ? "text-emerald-400" :
    accent === "loss" ? "text-red-400" :
    accent === "warn" ? "text-amber-400" :
    "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular ${color}`}>{value}</div>
    </Card>
  );
}
