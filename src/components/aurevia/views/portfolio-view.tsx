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
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/aurevia/charts/stat-tile";
import { usePortfolio, useResetPortfolio, usePlaceOrder, useMarkets, useAsset } from "@/lib/aurevia/hooks";
import { fmtPrice, fmtUsd, fmtPct, gainColor } from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { toast } from "sonner";
import { Wallet, ArrowUpRight, ArrowDownRight, RotateCcw, Send, AlertTriangle, CheckCircle2 } from "lucide-react";

type OrderType = "MARKET" | "LIMIT" | "STOP";
const COMMISSION_BPS = 5; // 5 bps = 0.05% — matches default backtest commission

export function PortfolioView() {
  const { data, isLoading } = usePortfolio();
  const markets = useMarkets();
  const reset = useResetPortfolio();
  const place = usePlaceOrder();
  const qc = useQueryClient();
  const { openAsset } = useUI();

  const [order, setOrder] = useState({
    symbol: "AAPL",
    side: "BUY" as "BUY" | "SELL",
    quantity: 100,
    orderType: "MARKET" as OrderType,
    limitPrice: 0,
  });

  // Fetch the current quote for the selected symbol — used for cost preview.
  const asset = useAsset(order.symbol);

  const cash = data?.cash ?? 100000;
  const universe = markets.data ?? [];
  const symbolInUniverse = universe.some((a) => a.symbol === order.symbol);

  // Use the live quote from the asset detail endpoint; fall back to the
  // market-list quote if the detail hasn't loaded yet, then to 0.
  const price =
    asset.data?.quote?.price ??
    universe.find((a) => a.symbol === order.symbol)?.quote?.price ??
    0;

  // --- Validation ---------------------------------------------------------
  const qty = Number(order.quantity) || 0;
  const qtyValid = qty > 0 && Number.isFinite(qty);
  const symbolValid = symbolInUniverse;
  const needsLimitPrice = order.orderType === "LIMIT" || order.orderType === "STOP";
  const limitPrice = Number(order.limitPrice) || 0;
  const limitValid = !needsLimitPrice || (limitPrice > 0 && Number.isFinite(limitPrice));

  // Reference price for the cost preview — for MARKET use live quote, for
  // LIMIT/STOP use the entered limit price (best estimate of fill).
  const refPrice = needsLimitPrice && limitValid ? limitPrice : price;
  const grossCost = qty * refPrice;
  const commission = grossCost * (COMMISSION_BPS / 10_000);
  const estCost = grossCost + commission;

  const isBuy = order.side === "BUY";
  // For BUY the trade removes cash; for SELL we don't pre-validate cash
  // (you may be selling an existing long position).
  const cashAfter = isBuy ? cash - estCost : cash + grossCost - commission;
  const insufficientCash = isBuy && qtyValid && symbolValid && estCost > cash;

  const canSubmit =
    qtyValid &&
    symbolValid &&
    limitValid &&
    !insufficientCash &&
    refPrice > 0 &&
    !place.isPending;

  function submitOrder() {
    if (!qtyValid) {
      toast.error("Quantity must be a positive number");
      return;
    }
    if (!symbolValid) {
      toast.error(`${order.symbol} is not in the trading universe`);
      return;
    }
    if (needsLimitPrice && !limitValid) {
      toast.error(`${order.orderType} orders require a positive limit price`);
      return;
    }
    if (insufficientCash) {
      toast.error(`Insufficient cash: est. cost ${fmtUsd(estCost)} > available ${fmtUsd(cash)}`);
      return;
    }
    place.mutate(
      {
        symbol: order.symbol,
        side: order.side,
        quantity: qty,
        orderType: order.orderType,
        limitPrice: needsLimitPrice && limitValid ? limitPrice : undefined,
        strategyKey: "manual",
        reason: `Manual ${order.orderType} order ticket`,
      },
      {
        onSuccess: () => {
          toast.success(`${order.side} ${qty} ${order.symbol} @ ${order.orderType} submitted`);
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border/60 p-4">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
        <div className="space-y-2 rounded-lg border border-border/60 p-4">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const equity = data?.equity ?? 100000;
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
                    <TableRow
                      key={p.symbol}
                      onClick={() => openAsset(p.symbol)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openAsset(p.symbol);
                        }
                      }}
                      className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
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
                <SelectTrigger className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {universe.map((a) => (
                    <SelectItem key={a.symbol} value={a.symbol}>
                      {a.symbol} — {a.name.slice(0, 20)}
                    </SelectItem>
                  ))}
                  {!markets.isLoading && universe.length === 0 && (
                    <SelectItem value={order.symbol} disabled>
                      No assets available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {!symbolValid && (
                <p className="flex items-center gap-1 text-xs text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  {order.symbol} is not in the trading universe
                </p>
              )}
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

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Order Type</Label>
                <Select
                  value={order.orderType}
                  onValueChange={(v) => setOrder((o) => ({ ...o, orderType: v as OrderType }))}
                >
                  <SelectTrigger className="w-full h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKET">MARKET</SelectItem>
                    <SelectItem value="LIMIT">LIMIT</SelectItem>
                    <SelectItem value="STOP">STOP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Quantity</Label>
                <Input
                  type="number"
                  min={0}
                  value={order.quantity}
                  onChange={(e) => setOrder((o) => ({ ...o, quantity: Number(e.target.value) }))}
                  className={qtyValid ? "" : "border-red-500 focus-visible:ring-red-500"}
                />
              </div>
            </div>

            {!qtyValid && (
              <p className="flex items-center gap-1 text-xs text-red-400">
                <AlertTriangle className="h-3 w-3" />
                Quantity must be greater than 0
              </p>
            )}

            {(order.orderType === "LIMIT" || order.orderType === "STOP") && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {order.orderType} Price
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={order.limitPrice || ""}
                  placeholder={`Enter ${order.orderType.toLowerCase()} price`}
                  onChange={(e) => setOrder((o) => ({ ...o, limitPrice: Number(e.target.value) }))}
                  className={limitValid ? "" : "border-red-500 focus-visible:ring-red-500"}
                />
                {!limitValid && (
                  <p className="flex items-center gap-1 text-xs text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    {order.orderType} price must be greater than 0
                  </p>
                )}
              </div>
            )}

            {/* Cost preview */}
            <div className="space-y-1.5 rounded-md border border-border/60 bg-card/40 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Symbol</span>
                <span className="font-mono font-semibold">{order.symbol}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Side</span>
                <span className={isBuy ? "text-emerald-400" : "text-red-400"}>{order.side}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Qty</span>
                <span className="font-mono tabular">{qty}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-mono">{order.orderType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Ref. Price</span>
                <span className="font-mono tabular">
                  {refPrice > 0 ? fmtPrice(refPrice) : "—"}
                </span>
              </div>
              <div className="my-1 border-t border-border/60" />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Est. Cost</span>
                <span className="font-mono tabular font-semibold">{fmtUsd(estCost, 2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Commission (~{COMMISSION_BPS}bps)</span>
                <span className="font-mono tabular">{fmtUsd(commission, 2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Available Cash</span>
                <span className="font-mono tabular">{fmtUsd(cash, 2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">After Order</span>
                <span className={`font-mono tabular font-semibold ${cashAfter < 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {fmtUsd(cashAfter, 2)}
                </span>
              </div>
            </div>

            {insufficientCash && (
              <p className="flex items-center gap-1 text-xs text-red-400">
                <AlertTriangle className="h-3 w-3" />
                Insufficient cash — est. cost {fmtUsd(estCost, 2)} exceeds available {fmtUsd(cash, 2)}
              </p>
            )}

            {canSubmit && (
              <p className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Order validated — ready to submit
              </p>
            )}

            <Button onClick={submitOrder} disabled={!canSubmit} className="w-full gap-2">
              <Send className="h-4 w-4" />
              {place.isPending
                ? "Submitting…"
                : `Place ${order.side} ${order.orderType} Order`}
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
