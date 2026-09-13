"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  useBacktests,
  useBacktestDetail,
  useRunBacktest,
  useMarkets,
  useStrategies,
  useMonteCarlo,
  type RunBacktestInput,
} from "@/lib/aurevia/hooks";
import { fmtUsd, fmtPct, fmtPrice, fmtDateTime, fmtTime, gainColor } from "@/lib/aurevia/format";
import { TIMEFRAMES } from "@/lib/aurevia/types";
import { EquityCurve } from "@/components/aurevia/charts/equity-curve";
import { StatTile } from "@/components/aurevia/charts/stat-tile";
import { useUI } from "@/lib/aurevia/ui-store";
import { toast } from "sonner";
import { Play, Clock, ArrowUpRight, ArrowDownRight, ShieldCheck, Activity, Dices } from "lucide-react";

export function BacktestsView() {
  const { selectedBacktestId, openBacktest } = useUI();
  const backtests = useBacktests();
  const markets = useMarkets();
  const strategies = useStrategies();
  const detail = useBacktestDetail(selectedBacktestId);
  const run = useRunBacktest();
  const qc = useQueryClient();

  const [form, setForm] = useState<RunBacktestInput>({
    strategyKey: "momentum",
    symbol: "AAPL",
    timeframe: "1d",
    bars: 500,
    initialCapital: 100000,
    commissionBps: 5,
    slippageBps: 8,
    positionPct: 0.95,
    allowShort: true,
    stopLossPct: 0.05,
    takeProfitPct: 0.15,
  });
  const [result, setResult] = useState<any | null>(null);

  // Active backtest id — either the just-run result or the user-selected
  // past backtest. Used to drive the Monte Carlo / Walk-Forward section.
  const activeBtId: string | null = result?.id ?? (selectedBacktestId ?? null);
  const mc = useMonteCarlo();

  function runMonteCarlo() {
    if (!activeBtId) {
      toast.error("Run or select a backtest first");
      return;
    }
    mc.mutate(
      { id: activeBtId },
      {
        onSuccess: () => toast.success("Robustness analysis complete"),
        onError: (e: any) => toast.error(e?.message ?? "Monte Carlo failed"),
      },
    );
  }

  function update<K extends keyof RunBacktestInput>(key: K, value: RunBacktestInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function runBacktest() {
    run.mutate(form, {
      onSuccess: (d: any) => {
        setResult(d.result);
        toast.success(`Backtest complete: ${d.result?.metrics?.totalReturnPct?.toFixed(2) ?? 0}% return`);
        qc.invalidateQueries({ queryKey: ["backtests"] });
      },
      onError: (e: any) => toast.error(e.message),
    });
  }

  const equity = result?.equityCurve ?? detail.data?.equityCurve ?? [];
  const metrics = result?.metrics ?? detail.data?.metrics ?? {};
  const trades = (result?.trades ?? detail.data?.trades ?? []).slice(-20).reverse();
  const meta = result?.summary ?? detail.data?.summary ?? {};

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Backtests</h2>
        <p className="text-sm text-muted-foreground">
          Run strategy backtests against historical data and inspect equity curves, metrics, and trade-by-trade results.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Run form */}
        <Card className="p-4 lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold">Run Backtest</h3>
          <div className="space-y-3">
            <Field label="Strategy">
              <Select value={form.strategyKey} onValueChange={(v) => update("strategyKey", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(strategies.data ?? []).map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Symbol">
              <Select value={form.symbol} onValueChange={(v) => update("symbol", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(markets.data ?? []).map((a) => (
                    <SelectItem key={a.symbol} value={a.symbol}>
                      {a.symbol} — {a.name.slice(0, 20)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Timeframe">
              <Select value={form.timeframe} onValueChange={(v) => update("timeframe", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEFRAMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bars">
                <Input type="number" value={form.bars ?? 500} onChange={(e) => update("bars", Number(e.target.value))} />
              </Field>
              <Field label="Initial Capital">
                <Input type="number" value={form.initialCapital ?? 100000} onChange={(e) => update("initialCapital", Number(e.target.value))} />
              </Field>
              <Field label="Commission (bps)">
                <Input type="number" value={form.commissionBps ?? 5} onChange={(e) => update("commissionBps", Number(e.target.value))} />
              </Field>
              <Field label="Slippage (bps)">
                <Input type="number" value={form.slippageBps ?? 8} onChange={(e) => update("slippageBps", Number(e.target.value))} />
              </Field>
              <Field label="Position %">
                <Input type="number" step="0.01" value={form.positionPct ?? 0.95} onChange={(e) => update("positionPct", Number(e.target.value))} />
              </Field>
              <Field label="Stop Loss %">
                <Input type="number" step="0.01" value={form.stopLossPct ?? 0.05} onChange={(e) => update("stopLossPct", Number(e.target.value))} />
              </Field>
              <Field label="Take Profit %">
                <Input type="number" step="0.01" value={form.takeProfitPct ?? 0.15} onChange={(e) => update("takeProfitPct", Number(e.target.value))} />
              </Field>
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-1.5">
                <Label htmlFor="allowShort" className="text-xs">Allow Short</Label>
                <Switch id="allowShort" checked={!!form.allowShort} onCheckedChange={(v) => update("allowShort", v)} />
              </div>
            </div>
            <Button onClick={runBacktest} disabled={run.isPending} className="w-full gap-2">
              <Play className="h-4 w-4" />
              {run.isPending ? "Running…" : "Run Backtest"}
            </Button>
          </div>
        </Card>

        {/* Results */}
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {result ? "Latest Result" : selectedBacktestId ? "Backtest Detail" : "Results"}
            </h3>
            {(meta.symbol || form.symbol) && (
              <Badge variant="outline" className="font-mono text-xs">
                {meta.strategyKey ?? form.strategyKey} · {meta.symbol ?? form.symbol} · {meta.timeframe ?? form.timeframe}
              </Badge>
            )}
          </div>

          {equity.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Run a backtest or select a past run from the list below to view its equity curve, metrics, and trades.
            </div>
          )}

          {equity.length > 0 && (
            <div className="space-y-4">
              <div className="rounded-md border border-border/60 p-3">
                <EquityCurve data={equity} height={240} />
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                <StatTile label="Total Return" value={fmtPct(metrics.totalReturnPct)} accent={metrics.totalReturnPct >= 0 ? "gain" : "loss"} />
                <StatTile label="Annual Return" value={fmtPct(metrics.annualReturnPct)} accent={metrics.annualReturnPct >= 0 ? "gain" : "loss"} />
                <StatTile label="Benchmark" value={fmtPct(metrics.benchmarkReturnPct)} accent={metrics.benchmarkReturnPct >= 0 ? "gain" : "loss"} />
                <StatTile label="Sharpe" value={fmtPrice(metrics.sharpe, 3)} />
                <StatTile label="Sortino" value={fmtPrice(metrics.sortino, 3)} />
                <StatTile label="Calmar" value={fmtPrice(metrics.calmar, 3)} />
                <StatTile label="Max Drawdown" value={fmtPct(metrics.maxDrawdownPct)} accent="loss" />
                <StatTile label="Win Rate" value={fmtPct(metrics.winRate)} accent="gain" />
                <StatTile label="Profit Factor" value={fmtPrice(metrics.profitFactor, 2)} />
                <StatTile label="Trades" value={`${metrics.numTrades ?? trades.length}`} />
                <StatTile label="Exposure" value={fmtPct((metrics.exposure ?? 0) * 100)} />
                <StatTile label="Volatility" value={fmtPct(metrics.volatility)} />
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trades (last 20)</h4>
                <div className="max-h-72 overflow-auto rounded-md border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 z-10 bg-card">Entry</TableHead>
                        <TableHead>Exit</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead className="text-right">Entry</TableHead>
                        <TableHead className="text-right">Exit</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                        <TableHead className="text-right">P&L %</TableHead>
                        <TableHead className="text-right">Bars</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trades.map((t: any, i: number) => {
                        const sideUp = t.side === "BUY" || t.side === "LONG";
                        return (
                          <TableRow key={i}>
                            <TableCell className="sticky left-0 z-10 bg-card text-xs text-muted-foreground">{fmtDateTime(t.entryTime)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{fmtTime(t.exitTime)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={sideUp ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}>
                                {t.side}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular">{fmtPrice(t.entryPrice)}</TableCell>
                            <TableCell className="text-right tabular">{fmtPrice(t.exitPrice)}</TableCell>
                            <TableCell className={`text-right tabular ${gainColor(t.pnl)}`}>
                              {t.pnl >= 0 ? <ArrowUpRight className="mr-1 inline h-3 w-3" /> : <ArrowDownRight className="mr-1 inline h-3 w-3" />}
                              {fmtUsd(t.pnl)}
                            </TableCell>
                            <TableCell className={`text-right tabular ${gainColor(t.pnlPct ?? (t.pnlPct ?? t.pnlPercent))}`}>{fmtPct(t.pnlPct ?? t.pnlPercent)}</TableCell>
                            <TableCell className="text-right tabular">{t.barsHeld ?? "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{t.reason ?? "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                      {trades.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="py-6 text-center text-xs text-muted-foreground">No trades recorded.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Robustness analysis — Monte Carlo + Walk-Forward. Appears whenever
          a backtest is selected or freshly produced. The user clicks "Run"
          to compute; results are cached in mutation state. */}
      {activeBtId && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">Robustness Analysis</h3>
              <Badge variant="outline" className="font-mono text-[10px]">
                {activeBtId}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={runMonteCarlo}
              disabled={mc.isPending}
              className="gap-1.5"
            >
              <Dices className={`h-3.5 w-3.5 ${mc.isPending ? "animate-spin" : ""}`} />
              {mc.isPending
                ? "Simulating…"
                : mc.data
                  ? "Re-run Monte Carlo"
                  : "Run Monte Carlo"}
            </Button>
          </div>

          {!mc.data && !mc.isPending && (
            <div className="rounded-md border border-dashed border-border/60 px-4 py-8 text-center text-xs text-muted-foreground">
              Click <span className="font-semibold text-foreground">Run Monte Carlo</span> to resample the trade sequence 100× and compute walk-forward Sharpes + an overall robustness score (0–100).
            </div>
          )}

          {mc.isPending && !mc.data && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
              <Skeleton className="h-48 md:col-span-4" />
            </div>
          )}

          {mc.data && (
            <div className="space-y-4">
              {/* Robustness score gauge */}
              <RobustnessScoreCard
                score={mc.data.robustness.score}
                survivalRate={mc.data.robustness.survivalRate}
                walkForwardStability={mc.data.robustness.walkForwardStability}
                originalSharpe={mc.data.robustness.originalSharpe}
              />

              {/* MC percentile bands */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatTile
                  label="MC p10 (worst 10%)"
                  value={fmtUsd(mc.data.monteCarlo.p10, 0)}
                  sub="Downside percentile"
                  accent="loss"
                />
                <StatTile
                  label="MC p50 (median)"
                  value={fmtUsd(mc.data.monteCarlo.p50, 0)}
                  sub="Central outcome"
                  accent="default"
                />
                <StatTile
                  label="MC p90 (best 10%)"
                  value={fmtUsd(mc.data.monteCarlo.p90, 0)}
                  sub="Upside percentile"
                  accent="gain"
                />
                <StatTile
                  label="Survival Rate"
                  value={`${mc.data.monteCarlo.survivalRate}%`}
                  sub={`Sims above initial capital (${mc.data.monteCarlo.simulations} runs)`}
                  accent={mc.data.monteCarlo.survivalRate >= 80 ? "gain" : mc.data.monteCarlo.survivalRate >= 50 ? "warn" : "loss"}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* MC distribution bar chart */}
                <MCBarsCard
                  p10={mc.data.monteCarlo.p10}
                  p50={mc.data.monteCarlo.p50}
                  p90={mc.data.monteCarlo.p90}
                  worst={mc.data.monteCarlo.worstCase}
                  best={mc.data.monteCarlo.bestCase}
                  initial={result?.initialCapital ?? detail.data?.initialCapital ?? 100000}
                />

                {/* Walk-forward window Sharpes */}
                <WalkForwardCard windows={mc.data.walkForward} />
              </div>

              <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Methodology:</span> Monte Carlo resamples the trade sequence 100× without replacement (each sim uses every trade exactly once, in a shuffled order). Walk-Forward splits the trades into 4 chronological windows and computes the annualized Sharpe (×√252) and total return for each. The robustness score is 40% survival rate + 30% walk-forward stability (1 − spread of window Sharpes normalized by max magnitude) + 30% original Sharpe (capped at 2).
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Past backtests */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Past Backtests</h3>
        </div>
        <div className="max-h-80 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card">Created</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>TF</TableHead>
                <TableHead className="text-right">Initial</TableHead>
                <TableHead className="text-right">Final</TableHead>
                <TableHead className="text-right">Return</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(backtests.data ?? []).map((b) => {
                const ret = b.metrics?.totalReturnPct ?? 0;
                return (
                  <TableRow
                    key={b.id}
                    onClick={() => { openBacktest(b.id); setResult(null); }}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openBacktest(b.id);
                        setResult(null);
                      }
                    }}
                    className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <TableCell className="sticky left-0 z-10 bg-card text-xs text-muted-foreground">{fmtDateTime(b.createdAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{b.strategyKey}</TableCell>
                    <TableCell className="font-medium">{b.symbol}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.timeframe}</TableCell>
                    <TableCell className="text-right tabular">{fmtUsd(b.initialCapital)}</TableCell>
                    <TableCell className="text-right tabular">{fmtUsd(b.finalEquity)}</TableCell>
                    <TableCell className={`text-right tabular ${gainColor(ret)}`}>{fmtPct(ret)}</TableCell>
                    <TableCell className="text-right tabular">{b.numTrades}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{b.status}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(backtests.data ?? []).length === 0 && backtests.isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="py-0">
                    <div className="space-y-2 p-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 py-1.5">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-3 flex-1" />
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {(backtests.data ?? []).length === 0 && !backtests.isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="py-6 text-center text-xs text-muted-foreground">
                    No past backtests yet. Run your first one above.
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Robustness score card — a 0..100 gauge + the three component scores that
// blended into it. Mirrors the Risk Cockpit gauge style.
// ---------------------------------------------------------------------------

function RobustnessScoreCard({
  score,
  survivalRate,
  walkForwardStability,
  originalSharpe,
}: {
  score: number;
  survivalRate: number;
  walkForwardStability: number;
  originalSharpe: number;
}) {
  const color = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  const label = score >= 70 ? "Robust" : score >= 40 ? "Marginal" : "Fragile";
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="flex flex-col items-center justify-center">
          <div className="relative h-24 w-24">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="oklch(1 0 0 / 8%)"
                strokeWidth="10"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={color}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 264} 264`}
                style={{ transition: "stroke-dasharray 0.4s ease-out" }}
              />
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold tabular" style={{ color }}>
                {score}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                {label}
              </div>
            </div>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">Robustness Score</div>
        </div>

        <RobustnessComponent
          label="Survival Rate"
          value={`${survivalRate}%`}
          score={survivalRate}
          weight="40%"
        />
        <RobustnessComponent
          label="Walk-Forward Stability"
          value={`${walkForwardStability}%`}
          score={Math.max(0, Math.min(100, walkForwardStability))}
          weight="30%"
        />
        <RobustnessComponent
          label="Original Sharpe"
          value={originalSharpe.toFixed(2)}
          score={Math.max(0, Math.min(100, (originalSharpe / 2) * 100))}
          weight="30%"
        />
      </div>
    </div>
  );
}

function RobustnessComponent({
  label,
  value,
  score,
  weight,
}: {
  label: string;
  value: string;
  score: number;
  weight: string;
}) {
  const color =
    score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {label}
          <span className="ml-1 text-[10px] text-muted-foreground/60">
            ({weight})
          </span>
        </span>
        <span className="font-semibold tabular text-foreground">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, score))}%`,
            backgroundColor: color,
            transition: "width 0.4s ease-out",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MC distribution bar chart — worst / p10 / p50 / p90 / best, with the
// initial-capital reference line drawn through the bars.
// ---------------------------------------------------------------------------

function MCBarsCard({
  p10,
  p50,
  p90,
  worst,
  best,
  initial,
}: {
  p10: number;
  p50: number;
  p90: number;
  worst: number;
  best: number;
  initial: number;
}) {
  const data = [
    { label: "Worst", value: worst, fill: "#ef4444" },
    { label: "p10", value: p10, fill: "#f59e0b" },
    { label: "p50", value: p50, fill: "#10b981" },
    { label: "p90", value: p90, fill: "#06b6d4" },
    { label: "Best", value: best, fill: "#a855f7" },
  ];
  const minVal = Math.min(...data.map((d) => d.value), initial);
  const maxVal = Math.max(...data.map((d) => d.value), initial);
  const padding = (maxVal - minVal) * 0.08 || 1000;
  const domain: [number, number] = [minVal - padding, maxVal + padding];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Dices className="h-4 w-4 text-amber-400" />
        <h4 className="text-sm font-semibold">Monte Carlo Final Equity Distribution</h4>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }}
              stroke="oklch(1 0 0 / 10%)"
            />
            <YAxis
              orientation="right"
              tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }}
              stroke="oklch(1 0 0 / 10%)"
              tickFormatter={(v) => fmtPrice(v, 0)}
              width={60}
              domain={domain}
            />
            <ReferenceLine
              y={initial}
              stroke="oklch(1 0 0 / 35%)"
              strokeDasharray="4 4"
              label={{
                value: `Initial ${fmtUsd(initial, 0)}`,
                position: "insideTopLeft",
                fill: "oklch(0.68 0.012 250)",
                fontSize: 10,
              }}
            />
            <RechartsTooltip
              contentStyle={{
                background: "oklch(0.19 0.012 250)",
                border: "1px solid oklch(1 0 0 / 10%)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(v: any) => [fmtUsd(v as number, 0), "Equity"]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.label} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Walk-forward window Sharpes — bar chart with a zero reference line so
// positive (green) and negative (red) windows are obvious at a glance.
// ---------------------------------------------------------------------------

function WalkForwardCard({
  windows,
}: {
  windows: { start: number; end: number; sharpe: number; returnPct: number }[];
}) {
  const data = windows.map((w, i) => ({
    label: `W${i + 1}`,
    sharpe: w.sharpe,
    returnPct: w.returnPct,
    fill: w.sharpe >= 0 ? "#10b981" : "#ef4444",
  }));
  const sharpes = data.map((d) => d.sharpe);
  const maxAbs = Math.max(1, ...sharpes.map(Math.abs));
  const domain: [number, number] = [-maxAbs, maxAbs];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-cyan-400" />
        <h4 className="text-sm font-semibold">Walk-Forward Window Sharpes</h4>
      </div>
      <div className="h-56">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Not enough trades to split into 4 windows.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }}
                stroke="oklch(1 0 0 / 10%)"
              />
              <YAxis
                orientation="right"
                tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }}
                stroke="oklch(1 0 0 / 10%)"
                tickFormatter={(v) => v.toFixed(1)}
                width={50}
                domain={domain}
              />
              <ReferenceLine y={0} stroke="oklch(1 0 0 / 25%)" />
              <RechartsTooltip
                contentStyle={{
                  background: "oklch(0.19 0.012 250)",
                  border: "1px solid oklch(1 0 0 / 10%)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(_v: any, _n: string, item: any) => [
                  `Sharpe ${item.payload.sharpe.toFixed(2)} · Return ${fmtPct(item.payload.returnPct)}`,
                  item.payload.label,
                ]}
              />
              <Bar dataKey="sharpe" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.label} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Each window covers ~25% of the trade sequence. Consistency across windows is the strongest signal of robustness.
      </p>
    </Card>
  );
}

