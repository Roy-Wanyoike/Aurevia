"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatTile } from "@/components/aurevia/charts/stat-tile";
import { usePortfolio, useResetPortfolio, usePlaceOrder } from "@/lib/aurevia/hooks";
import { fmtPrice, fmtUsd, fmtPct, gainColor } from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { toast } from "sonner";
import { Wallet, ArrowUpRight, ArrowDownRight, RotateCcw, Send } from "lucide-react";

const SYMBOLS = ["AAPL", "MSFT", "NVDA", "BTC", "ETH", "SPY", "QQQ", "TSLA", "AMZN", "GOOGL", "META"];

export function PortfolioView() {
  const { data, isLoading } = usePortfolio();
  const reset = useResetPortfolio();
  const place = usePlaceOrder();
  const qc = useQueryClient();
  const { openAsset } = useUI();

  const [order, setOrder] = useState({ symbol: "AAPL", side: "BUY" as "BUY" | "SELL", quantity: 100 });

  function submitOrder() {
    if (!order.quantity || order.quantity <= 0) {
      toast.error("Quantity must be positive");
      return;
    }
    place.mutate(
      { symbol: order.symbol, side: order.side, quantity: order.quantity, strategyKey: "manual", reason: "Manual order ticket" },
      {
        onSuccess: () => {
          toast.success(`${order.side} ${order.quantity} ${order.symbol} submitted`);
          qc.invalidateQueries({ queryKey: ["portfolio"] });
        },
        onError: (e: any) => toast.error(e.message),
      }
    );
  }

  function resetPortfolio() {
    reset.mutate(undefined, {
      onSuccess: () => {
        toast.success("Portfolio reset to initial state");
        qc.invalidateQueries({ queryKey: ["portfolio"] });
      },
      onError: (e: any) => toast.error(e.message),
    });
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-6 p-6">
        <Header />
        <div className="py-12 text-center text-sm text-muted-foreground">Loading portfolio…</div>
      </div>
    );
  }

  const equity = data?.equity ?? 100000;
  const cash = data?.cash ?? 100000;
  const marketValue = data?.marketValue ?? 0;
  const unrealizedPnl = data?.unrealizedPnl ?? 0;
  const realizedPnl = data?.realizedPnl ?? 0;
  const fees = data?.fees ?? 0;
  const exposure = (data?.exposure ?? 0) * 100;
  const drawdown = (data?.drawdown ?? 0) * 100;
  const positions: any[] = data?.positions ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-2">
        <Header />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <RotateCcw className="h-3.5 w-3.5" /> Reset Portfolio
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset portfolio?</AlertDialogTitle>
              <AlertDialogDescription>
                This will close all open positions, restore cash to the initial capital, and clear realized P&L. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={resetPortfolio}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Equity" value={fmtUsd(equity)} sub={`Cash ${fmtUsd(cash)}`} accent={unrealizedPnl >= 0 ? "gain" : "loss"} />
        <StatTile label="Market Value" value={fmtUsd(marketValue)} sub={`${positions.length} position${positions.length === 1 ? "" : "s"}`} accent="default" />
        <StatTile label="Unrealized P&L" value={fmtUsd(unrealizedPnl)} accent={unrealizedPnl >= 0 ? "gain" : "loss"} />
        <StatTile label="Realized P&L" value={fmtUsd(realizedPnl)} accent={realizedPnl >= 0 ? "gain" : "loss"} />
        <StatTile label="Fees" value={fmtUsd(fees)} accent="warn" />
        <StatTile label="Exposure" value={`${exposure.toFixed(0)}%`} accent={exposure > 90 ? "warn" : "default"} />
        <StatTile label="Drawdown" value={fmtPct(drawdown)} accent={drawdown > 5 ? "loss" : "default"} />
        <StatTile label="Peak Equity" value={fmtUsd(data?.peakEquity ?? equity)} accent="default" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Positions */}
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">Positions</h3>
            <Badge variant="outline" className="text-xs">{positions.length}</Badge>
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-md border border-border/60">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-card">Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Avg Entry</TableHead>
                  <TableHead className="text-right">Mark</TableHead>
                  <TableHead className="text-right">Mkt Value</TableHead>
                  <TableHead className="text-right">uP&L</TableHead>
                  <TableHead className="text-right">uP&L %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((p: any) => {
                  const pnl = p.unrealizedPnl ?? 0;
                  const pnlPct = p.unrealizedPnlPct ?? (p.avgEntryPrice ? (pnl / (p.avgEntryPrice * p.quantity)) * 100 : 0);
                  return (
                    <TableRow key={p.symbol} onClick={() => openAsset(p.symbol)} className="cursor-pointer">
                      <TableCell className="sticky left-0 z-10 bg-card font-semibold">{p.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.side === "LONG" || p.side === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}>
                          {p.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular">{p.quantity}</TableCell>
                      <TableCell className="text-right tabular">{fmtPrice(p.avgEntryPrice)}</TableCell>
                      <TableCell className="text-right tabular">{fmtPrice(p.marketPrice ?? p.markPrice)}</TableCell>
                      <TableCell className="text-right tabular">{fmtUsd(p.marketValue ?? (p.marketPrice ?? p.markPrice ?? 0) * p.quantity)}</TableCell>
                      <TableCell className={`text-right tabular ${gainColor(pnl)}`}>
                        {pnl >= 0 ? <ArrowUpRight className="mr-1 inline h-3 w-3" /> : <ArrowDownRight className="mr-1 inline h-3 w-3" />}
                        {fmtUsd(pnl)}
                      </TableCell>
                      <TableCell className={`text-right tabular ${gainColor(pnlPct)}`}>{fmtPct(pnlPct)}</TableCell>
                    </TableRow>
                  );
                })}
                {positions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      No open positions. Use the order ticket to place a manual trade.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Order ticket */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Send className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold">Manual Order Ticket</h3>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Symbol</Label>
              <Select value={order.symbol} onValueChange={(v) => setOrder((o) => ({ ...o, symbol: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SYMBOLS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant={order.side === "BUY" ? "default" : "outline"}
                onClick={() => setOrder((o) => ({ ...o, side: "BUY" }))}
                className="w-full"
              >
                BUY
              </Button>
              <Button
                size="sm"
                variant={order.side === "SELL" ? "default" : "outline"}
                onClick={() => setOrder((o) => ({ ...o, side: "SELL" }))}
                className="w-full"
              >
                SELL
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Quantity</Label>
              <Input type="number" value={order.quantity} onChange={(e) => setOrder((o) => ({ ...o, quantity: Number(e.target.value) }))} />
            </div>
            <Button onClick={submitOrder} disabled={place.isPending} className="w-full gap-2">
              <Send className="h-4 w-4" />
              {place.isPending ? "Submitting…" : `Place ${order.side} Order`}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-2xl font-bold tracking-tight">Portfolio</h2>
      <p className="text-sm text-muted-foreground">
        Paper-trading portfolio: equity summary, open positions, and a manual order ticket for ad-hoc execution.
      </p>
    </div>
  );
}
