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
import {
  useBacktests,
  useBacktestDetail,
  useRunBacktest,
  type RunBacktestInput,
} from "@/lib/aurevia/hooks";
import { fmtUsd, fmtPct, fmtPrice, fmtDateTime, fmtTime, gainColor } from "@/lib/aurevia/format";
import { EquityCurve } from "@/components/aurevia/charts/equity-curve";
import { StatTile } from "@/components/aurevia/charts/stat-tile";
import { useUI } from "@/lib/aurevia/ui-store";
import { toast } from "sonner";
import { Play, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";

const SYMBOLS = ["AAPL", "MSFT", "NVDA", "BTC", "ETH", "SPY", "QQQ", "TSLA", "AMZN", "GOOGL", "META"];
const STRATEGY_KEYS = ["momentum", "trend-following", "ma-crossover", "mean-reversion", "breakout"];
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

export function BacktestsView() {
  const { selectedBacktestId, openBacktest } = useUI();
  const backtests = useBacktests();
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
                  {STRATEGY_KEYS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Symbol">
              <Select value={form.symbol} onValueChange={(v) => update("symbol", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SYMBOLS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                <div className="max-h-72 overflow-y-auto rounded-md border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entry</TableHead>
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
                            <TableCell className="text-xs text-muted-foreground">{fmtDateTime(t.entryTime)}</TableCell>
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

      {/* Past backtests */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Past Backtests</h3>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
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
                    className="cursor-pointer"
                  >
                    <TableCell className="text-xs text-muted-foreground">{fmtDateTime(b.createdAt)}</TableCell>
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
              {(backtests.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-6 text-center text-xs text-muted-foreground">
                    {backtests.isLoading ? "Loading past runs…" : "No past backtests yet. Run your first one above."}
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
