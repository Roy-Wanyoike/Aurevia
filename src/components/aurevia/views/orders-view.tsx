"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { usePortfolio } from "@/lib/aurevia/hooks";
import { fmtPrice, fmtUsd, gainColor } from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { ScrollText, ArrowRight } from "lucide-react";

const LIFECYCLE = [
  { state: "CREATED", desc: "Order ticket constructed locally with symbol, side, quantity." },
  { state: "SUBMITTED", desc: "Sent to the paper broker for acknowledgment." },
  { state: "ACKNOWLEDGED", desc: "Broker accepted and queued the order for fill." },
  { state: "PARTIALLY_FILLED", desc: "Some quantity executed; remainder open." },
  { state: "FILLED", desc: "Order fully executed against the order book." },
  { state: "REJECTED", desc: "Broker refused the order (risk, liquidity, etc.)." },
  { state: "CANCELLED", desc: "User or risk engine cancelled before fill." },
];

export function OrdersView() {
  const { data, isLoading } = usePortfolio();
  const { setView, openAsset } = useUI();
  const positions: any[] = data?.positions ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Orders</h2>
        <p className="text-sm text-muted-foreground">
          Order lifecycle reference and currently active (open) orders. Place and reset orders from the Portfolio view.
        </p>
      </div>

      {/* Lifecycle */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold">Order Lifecycle</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {LIFECYCLE.map((l, i) => (
            <div key={l.state} className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  l.state === "FILLED"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : l.state === "REJECTED" || l.state === "CANCELLED"
                    ? "bg-red-500/15 text-red-400 border-red-500/30"
                    : l.state === "PARTIALLY_FILLED"
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : "bg-muted text-muted-foreground"
                }
              >
                {l.state}
              </Badge>
              {i < LIFECYCLE.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LIFECYCLE.map((l) => (
            <div key={l.state} className="rounded-md border border-border/60 bg-card/40 p-2.5">
              <div className="text-xs font-semibold">{l.state}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{l.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Active orders (positions as proxies) */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Active Orders / Open Positions</h3>
            <Badge variant="outline" className="text-xs">{positions.length}</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => setView("portfolio")} className="gap-1.5">
            Go to Portfolio <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="max-h-[50vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Mark</TableHead>
                <TableHead className="text-right">uP&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((p: any) => {
                const pnl = p.unrealizedPnl ?? 0;
                return (
                  <TableRow key={p.symbol} onClick={() => openAsset(p.symbol)} className="cursor-pointer">
                    <TableCell className="font-semibold">{p.symbol}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={p.side === "LONG" || p.side === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}>
                        {p.side}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">FILLED</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular">{p.quantity}</TableCell>
                    <TableCell className="text-right tabular">{fmtPrice(p.avgEntryPrice)}</TableCell>
                    <TableCell className="text-right tabular">{fmtPrice(p.marketPrice ?? p.markPrice)}</TableCell>
                    <TableCell className={`text-right tabular ${gainColor(pnl)}`}>{fmtUsd(pnl)}</TableCell>
                  </TableRow>
                );
              })}
              {positions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    {isLoading ? "Loading…" : "No active orders. Orders are placed and tracked in the paper broker via the Portfolio view."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Note</h3>
        <p className="text-sm text-muted-foreground">
          Orders are tracked by the in-process paper broker. The full execution log (CREATED → SUBMITTED → ACKNOWLEDGED →
          FILLED / REJECTED / CANCELLED) is stored server-side; this view shows currently open positions as a proxy for
          active orders. Use the <span className="text-foreground">Portfolio</span> view to submit new manual orders or
          reset the paper account.
        </p>
      </Card>
    </div>
  );
}
