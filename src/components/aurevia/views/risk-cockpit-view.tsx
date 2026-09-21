"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  useRisk,
  usePortfolio,
  useHealth,
  usePortfolioAnalytics,
  useSetBreaker,
} from "@/lib/aurevia/hooks";
import {
  breakerColor,
  fmtPct,
  fmtUsd,
  fmtTime,
} from "@/lib/aurevia/format";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldX,
  Power,
  AlertOctagon,
  AlertTriangle,
  Gauge,
  TrendingDown,
  Layers,
  Pause,
  CircleSlash,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Risk Cockpit view (issue #53).
//
// A unified risk dashboard — distinct from the Risk Engine view which is
// about profile editing + breaker controls. This view is the operations
// console: one risk-score gauge, a grid of every active risk metric vs its
// limit, emergency-stop buttons, and the historical risk-event timeline.
//
// The risk score blends three components:
//   - drawdown vs max drawdown limit (40%)
//   - exposure vs max exposure limit (30%)
//   - position concentration (30%)
// Each is normalized to 0..100 (higher = more risk). The gauge turns amber
// past 60 and red past 80, mirroring the circuit-breaker state colors.
// ---------------------------------------------------------------------------

interface RiskProfile {
  maxPositionPct?: number;
  maxPortfolioPct?: number;
  maxLeverage?: number;
  maxDailyLossPct?: number;
  maxWeeklyLossPct?: number;
  maxDrawdownPct?: number;
  maxSpread?: number;
  maxVolatility?: number;
  minLiquidity?: number;
  cooldownMinutes?: number;
  circuitBreakerState?: string;
  tradingMode?: string;
  [k: string]: any;
}

export function RiskCockpitView() {
  const risk = useRisk();
  const portfolio = usePortfolio();
  const health = useHealth();
  const analytics = usePortfolioAnalytics();
  const setBreaker = useSetBreaker();
  const qc = useQueryClient();

  const [pendingEmergency, setPendingEmergency] = useState<
    "soft" | "hard" | "emergency" | null
  >(null);

  if (risk.isLoading && !risk.data) {
    return <RiskCockpitSkeleton />;
  }

  const profile = (risk.data?.profile ?? {}) as RiskProfile;
  const portfolioState = portfolio.data;
  const breakerState =
    profile.circuitBreakerState ??
    risk.data?.portfolio?.circuitBreakerState ??
    "NORMAL";
  const tradingMode = profile.tradingMode ?? "PAPER";

  // --- Compute the risk-score components -------------------------------------
  const drawdown = (portfolioState?.drawdown ?? 0) * 100;
  const maxDd = (profile.maxDrawdownPct ?? 0.1) * 100;
  const drawdownScore = Math.min(100, (drawdown / Math.max(0.01, maxDd)) * 100);

  const exposure = (portfolioState?.exposure ?? 0) * 100;
  const maxExp = (profile.maxPortfolioPct ?? 1) * 100;
  const exposureScore = Math.min(100, (exposure / Math.max(0.01, maxExp)) * 100);

  const concentration =
    (analytics.data?.concentration ?? 0) * 100; // 0..100 already (0..1 → 0..100)
  const concentrationScore = Math.min(100, concentration);

  const riskScore = Math.round(
    drawdownScore * 0.4 + exposureScore * 0.3 + concentrationScore * 0.3,
  );

  // --- Daily loss ------------------------------------------------------------
  const dayStart = risk.data?.dayStartEquity ?? portfolioState?.equity ?? 100000;
  const equity = portfolioState?.equity ?? 100000;
  const dayLossPct =
    dayStart > 0 ? ((equity - dayStart) / dayStart) * 100 : 0;
  const maxDailyLoss = (profile.maxDailyLossPct ?? 0.03) * 100;
  // dayLoss is negative — magnitude vs limit:
  const dailyLossScore = Math.min(
    100,
    (Math.abs(Math.min(0, dayLossPct)) / Math.max(0.01, maxDailyLoss)) * 100,
  );

  // --- Leverage --------------------------------------------------------------
  const leverage = portfolioState?.leverage ?? 0;
  const maxLev = profile.maxLeverage ?? 1;
  const leverageScore = Math.min(100, (leverage / Math.max(0.01, maxLev)) * 100);

  // --- VaR 95% ---------------------------------------------------------------
  const var95 = analytics.data?.var95?.returnPct ?? 0;
  const varScore = Math.min(100, Math.abs(var95) * 20); // 5% daily VaR = score 100

  // --- Position concentration (max weight) ----------------------------------
  const maxConcentration = analytics.data?.maxConcentration ?? 0;
  const maxPositionPct = profile.maxPositionPct ?? 0.1;
  const maxPosScore = Math.min(
    100,
    (maxConcentration / Math.max(0.01, maxPositionPct)) * 100,
  );

  const brokerConnected = health.data?.brokerConnected ?? false;
  const brokerHealthScore = brokerConnected ? 0 : 100;

  function confirmEmergency() {
    if (!pendingEmergency) return;
    const state =
      pendingEmergency === "soft"
        ? "CAUTION"
        : pendingEmergency === "hard"
          ? "TRADING_PAUSED"
          : "TRADING_PAUSED";
    const reason =
      pendingEmergency === "soft"
        ? "Soft stop — entering CAUTION mode (operator-initiated)"
        : pendingEmergency === "hard"
          ? "Hard stop — TRADING_PAUSED (operator-initiated)"
          : "Emergency stop — TRADING_PAUSED (operator-initiated emergency)";
    setBreaker.mutate(
      { state, reason },
      {
        onSuccess: () => {
          toast.success(`Emergency control activated: ${state}`);
          qc.invalidateQueries({ queryKey: ["risk"] });
          qc.invalidateQueries({ queryKey: ["health"] });
        },
        onError: (e: any) => toast.error(e.message),
      },
    );
    setPendingEmergency(null);
  }

  const events: any[] = risk.data?.events ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Risk Cockpit</h2>
        <p className="text-sm text-muted-foreground">
          Unified risk console — the live score, every metric vs its limit, emergency controls, and the historical risk-event timeline.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Risk-score gauge */}
        <Card className="p-6 lg:col-span-1">
          <div className="mb-4 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold">Risk Score</h3>
          </div>
          <RiskGauge score={riskScore} />
          <div className="mt-4 space-y-2">
            <ScoreRow label="Drawdown vs limit" score={drawdownScore} />
            <ScoreRow label="Exposure vs limit" score={exposureScore} />
            <ScoreRow label="Concentration (HHI)" score={concentrationScore} />
          </div>
        </Card>

        {/* Metric grid */}
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Risk Metrics</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={breakerColor(breakerState)}>
                {breakerState}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {tradingMode}
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <MetricTile
              icon={Layers}
              label="Exposure"
              value={`${exposure.toFixed(1)}%`}
              limit={`${maxExp.toFixed(0)}%`}
              score={exposureScore}
            />
            <MetricTile
              icon={TrendingDown}
              label="Drawdown"
              value={fmtPct(drawdown)}
              limit={`${maxDd.toFixed(1)}%`}
              score={drawdownScore}
            />
            <MetricTile
              icon={TrendingDown}
              label="Daily Loss"
              value={fmtPct(dayLossPct)}
              limit={`-${maxDailyLoss.toFixed(1)}%`}
              score={dailyLossScore}
            />
            <MetricTile
              icon={Gauge}
              label="Leverage"
              value={`${leverage.toFixed(2)}x`}
              limit={`${maxLev.toFixed(1)}x`}
              score={leverageScore}
            />
            <MetricTile
              icon={AlertTriangle}
              label="VaR 95% (1d)"
              value={fmtPct(var95)}
              limit={analytics.data ? "5% target" : "—"}
              score={varScore}
              hint={
                analytics.data
                  ? `${fmtUsd(analytics.data.var95.dollar, 0)}`
                  : "No positions"
              }
            />
            <MetricTile
              icon={Layers}
              label="Max Position"
              value={`${(maxConcentration * 100).toFixed(1)}%`}
              limit={`${(maxPositionPct * 100).toFixed(0)}%`}
              score={maxPosScore}
              hint={
                analytics.data
                  ? `HHI ${(analytics.data.concentration ?? 0).toFixed(2)}`
                  : "—"
              }
            />
            <MetricTile
              icon={Pause}
              label="Circuit Breaker"
              value={breakerState}
              limit="NORMAL"
              score={breakerState === "NORMAL" ? 0 : breakerState === "CAUTION" ? 50 : 100}
            />
            <MetricTile
              icon={brokerConnected ? ShieldCheck : ShieldX}
              label="Broker Health"
              value={brokerConnected ? "Connected" : "Disconnected"}
              limit="Connected"
              score={brokerHealthScore}
            />
          </div>
        </Card>
      </div>

      {/* Emergency controls */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <AlertOctagon className="h-4 w-4 text-red-400" />
          <h3 className="text-sm font-semibold">Emergency Controls</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <EmergencyButton
            kind="soft"
            current={breakerState}
            pending={pendingEmergency === "soft"}
            disabled={setBreaker.isPending || breakerState === "CAUTION"}
            onClick={() => setPendingEmergency("soft")}
          />
          <EmergencyButton
            kind="hard"
            current={breakerState}
            pending={pendingEmergency === "hard"}
            disabled={setBreaker.isPending || breakerState === "TRADING_PAUSED"}
            onClick={() => setPendingEmergency("hard")}
          />
          <EmergencyButton
            kind="emergency"
            current={breakerState}
            pending={pendingEmergency === "emergency"}
            disabled={setBreaker.isPending || breakerState === "TRADING_PAUSED"}
            onClick={() => setPendingEmergency("emergency")}
          />
        </div>

        <AlertDialog
          open={pendingEmergency !== null}
          onOpenChange={(o) => !o && setPendingEmergency(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingEmergency === "soft"
                  ? "Activate Soft Stop (CAUTION)?"
                  : pendingEmergency === "hard"
                    ? "Activate Hard Stop (TRADING_PAUSED)?"
                    : "Activate Emergency Stop?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingEmergency === "soft"
                  ? "New orders will be marked PAUSED for manual review. Existing positions are not affected."
                  : pendingEmergency === "hard"
                    ? "All new orders will be blocked immediately. Existing positions remain open. Operator action is required to resume."
                    : "Emergency halt — all new orders blocked immediately. Existing positions remain protected. Operator action is required to resume. Use this only when the portfolio is at imminent risk."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmEmergency}
                className={
                  pendingEmergency === "emergency" || pendingEmergency === "hard"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-amber-600 text-white hover:bg-amber-700"
                }
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>

      {/* Risk event timeline */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Risk Event Timeline</h3>
          </div>
          <Badge variant="outline" className="text-xs">
            {events.length} event{events.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="max-h-96 overflow-y-auto rounded-md border border-border/60">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e: any, i: number) => (
                <TableRow key={e.id ?? i}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {fmtTime(e.timestamp ?? e.time)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {e.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={severityColor(e.severity)}>
                      {e.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {e.message}
                  </TableCell>
                </TableRow>
              ))}
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                    No risk events recorded yet. Risk evaluations, breaker transitions, and rejected orders will appear here.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk-score gauge — semicircular arc with needle.
// 0..60 green, 60..80 amber, 80..100 red.
// ---------------------------------------------------------------------------

function RiskGauge({ score }: { score: number }) {
  // Semicircle 180 degrees; 0 at left, 100 at right.
  const angle = (score / 100) * 180;
  const color =
    score >= 80 ? "#ef4444" : score >= 60 ? "#f59e0b" : "#10b981";
  const label =
    score >= 80 ? "Critical" : score >= 60 ? "Elevated" : "Healthy";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-32 w-full">
        <svg viewBox="0 0 200 110" className="h-full w-full">
          {/* Background arc */}
          <path
            d="M 10 100 A 90 90 0 0 1 190 100"
            fill="none"
            stroke="oklch(1 0 0 / 8%)"
            strokeWidth={14}
            strokeLinecap="round"
          />
          {/* Colored progress arc */}
          <path
            d="M 10 100 A 90 90 0 0 1 190 100"
            fill="none"
            stroke={color}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 283} 283`}
            style={{ transition: "stroke-dasharray 0.4s ease-out" }}
          />
          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map((t) => {
            const a = (t / 100) * 180 - 180;
            const rad = (a * Math.PI) / 180;
            const x1 = 100 + 78 * Math.cos(rad);
            const y1 = 100 + 78 * Math.sin(rad);
            const x2 = 100 + 92 * Math.cos(rad);
            const y2 = 100 + 92 * Math.sin(rad);
            return (
              <line
                key={t}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="oklch(1 0 0 / 12%)"
                strokeWidth={1.5}
              />
            );
          })}
          {/* Needle */}
          <line
            x1={100}
            y1={100}
            x2={100 + 78 * Math.cos(((angle - 180) * Math.PI) / 180)}
            y2={100 + 78 * Math.sin(((angle - 180) * Math.PI) / 180)}
            stroke="oklch(0.95 0 0)"
            strokeWidth={2.5}
            strokeLinecap="round"
            style={{ transition: "all 0.4s ease-out" }}
          />
          <circle cx={100} cy={100} r={5} fill="oklch(0.95 0 0)" />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-1">
          <div
            className="text-3xl font-bold tabular"
            style={{ color }}
          >
            {score}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
        </div>
      </div>
      <div className="mt-2 flex w-full justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

function ScoreRow({ label, score }: { label: string; score: number }) {
  const color =
    score >= 80 ? "bg-red-500" : score >= 60 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular font-semibold">{score.toFixed(0)}</span>
      </div>
      <Progress value={score} className="h-1.5" />
      <div
        className={`h-0.5 w-full rounded-full ${color} opacity-70`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

interface MetricTileProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  limit: string;
  score: number;
  hint?: string;
}

function MetricTile({ icon: Icon, label, value, limit, score, hint }: MetricTileProps) {
  const color =
    score >= 80
      ? "text-red-400 border-red-500/30 bg-red-500/5"
      : score >= 60
        ? "text-amber-400 border-amber-500/30 bg-amber-500/5"
        : "text-emerald-400 border-emerald-500/30 bg-emerald-500/5";
  return (
    <div className={`rounded-md border p-3 ${color}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="mt-1.5 text-lg font-semibold tabular text-foreground">
        {value}
      </div>
      {hint && (
        <div className="text-[10px] tabular text-muted-foreground">{hint}</div>
      )}
      <div className="mt-1.5">
        <Progress value={score} className="h-1" />
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>limit {limit}</span>
          <span>{score.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

interface EmergencyButtonProps {
  kind: "soft" | "hard" | "emergency";
  current: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}

function EmergencyButton({ kind, current, disabled, onClick }: EmergencyButtonProps) {
  const config = {
    soft: {
      label: "Soft Stop",
      sub: "CAUTION",
      icon: Pause,
      color: "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 text-amber-400",
      activeFor: "CAUTION",
    },
    hard: {
      label: "Hard Stop",
      sub: "TRADING_PAUSED",
      icon: Power,
      color: "border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10 text-orange-400",
      activeFor: "TRADING_PAUSED",
    },
    emergency: {
      label: "Emergency Stop",
      sub: "TRADING_PAUSED",
      icon: CircleSlash,
      color: "border-red-500/40 bg-red-500/5 hover:bg-red-500/10 text-red-400",
      activeFor: "TRADING_PAUSED",
    },
  } as const;
  const c = config[kind];
  const Icon = c.icon;
  const isActive = current === c.activeFor && (kind === "soft" || current === "TRADING_PAUSED");
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-start gap-3 rounded-md border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${c.color}`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="space-y-0.5">
        <div className="text-sm font-semibold">{c.label}</div>
        <div className="text-[11px] text-muted-foreground">
          Sets breaker to <span className="font-mono">{c.sub}</span>
        </div>
        {isActive && (
          <div className="text-[10px] text-emerald-400">● Active</div>
        )}
      </div>
    </button>
  );
}

function severityColor(s: string): string {
  switch ((s ?? "").toUpperCase()) {
    case "INFO":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "WARN":
    case "WARNING":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "ERROR":
    case "CRITICAL":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function RiskCockpitSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-1" />
        <Skeleton className="h-64 lg:col-span-2" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
