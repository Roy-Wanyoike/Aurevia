"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useHealth, useSystemStats } from "@/lib/aurevia/hooks";
import { Sparkline } from "@/components/aurevia/charts/sparkline";
import { QueryState } from "@/components/aurevia/query-state";
import { fmtDuration } from "@/lib/aurevia/format";
import { HeartPulse, Activity, Server, Gauge, Database, Cpu, Zap, Check, AlertTriangle } from "lucide-react";

const SUBSYSTEMS = [
  { name: "Market Data Gateway", icon: Activity, healthyKey: "brokerConnected" as const },
  { name: "Quant Engine", icon: Cpu, healthyKey: null },
  { name: "Strategy Engine", icon: Zap, healthyKey: null },
  { name: "Risk Engine", icon: Gauge, healthyKey: null },
  { name: "Execution Engine", icon: Server, healthyKey: "brokerConnected" as const },
  { name: "Paper Broker", icon: Database, healthyKey: "brokerConnected" as const },
  { name: "Portfolio Manager", icon: HeartPulse, healthyKey: null },
  { name: "Observability", icon: Activity, healthyKey: null },
];

// Combined shape consumed by the render-prop below. The public `/api/v1/health`
// probe returns only the basic fields (status, uptime, tradingMode, breaker,
// dataSource, dataIsLive, version) — issue #183 / R-13. The operational
// stats (broker, latency, apiErrors, signals/backtests/orders counters,
// universe size) come from the authenticated `/api/v1/admin/system`
// snapshot. We merge them into one shape so the existing layout stays
// intact while the public endpoint stays leak-free.
interface SystemViewData {
  uptimeHours: number;
  tradingMode: string;
  circuitBreakerState: string;
  version: string;
  brokerConnected: boolean;
  marketDataLatencyMs: number;
  apiErrors: number;
  signalsTracked: number;
  backtestsRun: number;
  ordersPlaced: number;
  universeSize: number;
}

export function SystemView() {
  const health = useHealth();
  const system = useSystemStats();
  // Real latency tracking — sample the admin/system endpoint every 10s (the
  // hook already refetches every 10s). We store the measured latencies in a
  // rolling buffer so the sparkline shows actual history, not fabricated data.
  const latencyBuffer = useRef<number[]>([]);
  const [latencySeries, setLatencySeries] = useState<number[]>([]);

  useEffect(() => {
    const latency = system.data?.health.marketDataLatencyMs;
    if (typeof latency === "number") {
      latencyBuffer.current = [...latencyBuffer.current, latency].slice(-30);
      setLatencySeries([...latencyBuffer.current]);
    }
  }, [system.data?.health.marketDataLatencyMs]);

  const data: SystemViewData | undefined =
    health.data && system.data
      ? {
          uptimeHours: health.data.uptimeHours,
          tradingMode: health.data.tradingMode,
          circuitBreakerState: health.data.circuitBreakerState,
          version: health.data.version,
          brokerConnected: system.data.health.brokerConnected,
          marketDataLatencyMs: system.data.health.marketDataLatencyMs,
          apiErrors: system.data.health.apiErrors,
          signalsTracked: system.data.store.signalsTracked,
          backtestsRun: system.data.store.backtestsRun,
          ordersPlaced: system.data.store.ordersPlaced,
          universeSize: system.data.store.universeSize,
        }
      : undefined;

  const brokerConnected = !!data?.brokerConnected;
  const breaker = data?.circuitBreakerState ?? "NORMAL";
  const operational = brokerConnected && breaker === "NORMAL";
  const latency = data?.marketDataLatencyMs ?? 0;
  const apiErrors = data?.apiErrors ?? 0;
  const p50 = latencySeries.length > 0 ? Math.round(latencySeries.reduce((a, b) => a + b, 0) / latencySeries.length) : 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">System Health</h2>
        <p className="text-sm text-muted-foreground">
          Observability dashboard for the Aurevia runtime: subsystem status, broker connectivity, latency, and activity counters.
        </p>
      </div>

      <QueryState
        isLoading={health.isLoading || system.isLoading}
        isError={system.isError || health.isError}
        error={system.error ?? health.error}
        onRetry={() => { system.refetch(); health.refetch(); }}
        data={data}
      >
        {(d) => (
          <>
            {/* Status banner */}
            <Card className={`p-4 ring-1 ${operational ? "ring-emerald-500/20" : "ring-amber-500/20"}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${operational ? "bg-emerald-500/15" : "bg-amber-500/15"}`}>
                  <HeartPulse className={`h-5 w-5 ${operational ? "text-emerald-400" : "text-amber-400"}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {operational ? "All systems operational" : "Degraded — review circuit breaker"}
                    </span>
                    {operational && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Broker {brokerConnected ? "connected" : "disconnected"} · Breaker <span className="font-medium text-foreground">{breaker}</span> · Trading mode {d.tradingMode}
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-xs">v{d.version}</Badge>
              </div>
            </Card>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Uptime" value={fmtDuration(d.uptimeHours * 3600 * 1000)} accent="default" />
              <StatTile label="Mkt Data Latency" value={`${latency}ms`} accent={latency > 100 ? "warn" : "gain"} />
              <StatTile label="API Errors" value={`${apiErrors}`} accent={apiErrors > 0 ? "loss" : "gain"} />
              <StatTile label="Signals Tracked" value={`${d.signalsTracked}`} accent="default" />
              <StatTile label="Backtests Run" value={`${d.backtestsRun}`} accent="default" />
              <StatTile label="Orders Placed" value={`${d.ordersPlaced}`} accent="default" />
              <StatTile label="Universe Size" value={`${d.universeSize}`} accent="default" />
              <StatTile label="Trading Mode" value={d.tradingMode} accent={d.tradingMode === "LIVE" ? "warn" : "default"} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Real latency sparkline */}
              <Card className="p-4 lg:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-cyan-400" />
                    <h3 className="text-sm font-semibold">Market Data Latency</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">{latencySeries.length} samples</span>
                </div>
                <div className="flex items-end gap-4">
                  {latencySeries.length > 1 ? (
                    <Sparkline data={latencySeries} width={320} height={80} positive />
                  ) : (
                    <div className="flex h-20 w-80 items-center justify-center text-xs text-muted-foreground">
                      Collecting samples…
                    </div>
                  )}
                  <div className="text-right">
                    <div className="text-2xl font-semibold tabular text-cyan-400">{latency}<span className="ml-1 text-sm text-muted-foreground">ms</span></div>
                    <div className="text-xs text-muted-foreground">p50 ≈ {p50}ms</div>
                  </div>
                </div>
              </Card>

              {/* Subsystem checklist — derived from real health data */}
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Server className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold">Subsystems</h3>
                </div>
                <div className="space-y-2">
                  {SUBSYSTEMS.map((s) => {
                    const Icon = s.icon;
                    // Derive real status: if the subsystem depends on broker
                    // connection, reflect that. Otherwise, healthy if breaker
                    // is NORMAL and we have data.
                    const subsystemHealthy = s.healthyKey ? Boolean(d[s.healthyKey]) : operational;
                    return (
                      <div key={s.name} className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium">{s.name}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 ${subsystemHealthy ? "text-emerald-400" : "text-amber-400"}`}>
                          {subsystemHealthy ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                          <span className="text-xs">{subsystemHealthy ? "Operational" : "Degraded"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </>
        )}
      </QueryState>
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
