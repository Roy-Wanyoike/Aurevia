"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useSignals, useScanSignals, useStrategies } from "@/lib/aurevia/hooks";
import { fmtPrice, fmtTime, actionColor, decisionColor, gainColor } from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { toast } from "sonner";
import { Radio, RefreshCw, Filter, X } from "lucide-react";

export function SignalsView() {
  const [symbol, setSymbol] = useState("");
  const [strategy, setStrategy] = useState("");
  const { openAsset } = useUI();
  const signals = useSignals(symbol || undefined, strategy || undefined);
  const scan = useScanSignals();
  const strategies = useStrategies();
  const qc = useQueryClient();

  function clearFilters() {
    setSymbol("");
    setStrategy("");
  }

  function runScan() {
    scan.mutate(undefined, {
      onSuccess: (d) => {
        toast.success(`Scanned ${d.scanned} assets, ${d.newSignals.length} new signals`);
        qc.invalidateQueries({ queryKey: ["signals"] });
      },
      onError: (e: any) => toast.error(e.message),
    });
  }

  const rows = signals.data ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Signals</h2>
        <p className="text-sm text-muted-foreground">
          Live signal feed produced by strategy engines against the universe. Filter by symbol or strategy, or trigger a manual scan.
        </p>
      </div>

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Symbol</label>
              <Input
                placeholder="e.g. AAPL"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="h-9 max-w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Strategy</label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue placeholder="All strategies" />
                </SelectTrigger>
                <SelectContent>
                  {(strategies.data ?? []).map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
          <Button variant="outline" size="default" onClick={runScan} disabled={scan.isPending} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${scan.isPending ? "animate-spin" : ""}`} />
            Scan Universe
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold">Live Feed</span>
            <Badge variant="outline" className="text-xs">{rows.length} signals</Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            {symbol ? `symbol=${symbol}` : "all symbols"} · {strategy ? `strategy=${strategy}` : "all strategies"}
          </div>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card">Time</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="w-32">Confidence</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const conf = Math.min(100, Math.max(0, s.confidence * 100));
                return (
                  <TableRow key={s.id}>
                    <TableCell className="sticky left-0 z-10 bg-card text-xs text-muted-foreground">{fmtTime(s.timestamp)}</TableCell>
                    <TableCell>
                      <button onClick={() => openAsset(s.symbol)} className="font-medium text-foreground hover:text-emerald-400">
                        {s.symbol}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={actionColor(s.action)}>{s.action}</Badge>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="font-mono text-[10px]">{s.strategyKey}</Badge></TableCell>
                    <TableCell className="text-right tabular">{fmtPrice(s.price)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={conf} className="h-1.5" />
                        <span className="tabular text-xs text-muted-foreground">{conf.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {s.risk ? (
                        <Badge variant="outline" className={decisionColor(s.risk.decision)}>{s.risk.decision}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                      {s.reasons?.[0] ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && signals.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-0">
                    <div className="space-y-2 p-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-2">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-3 w-12" />
                          <Skeleton className="h-5 w-14" />
                          <Skeleton className="h-3 flex-1" />
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {rows.length === 0 && !signals.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    No signals match the current filters. Click 'Scan Universe' to generate fresh signals.
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
