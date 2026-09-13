"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useOrders, type OrderRow } from "@/lib/aurevia/hooks";
import { fmtPrice, fmtTime, fmtDateTime } from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { QueryState, TableSkeleton } from "@/components/aurevia/query-state";
import { ScrollText, ArrowRight } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "FILLED", label: "Filled" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "SUBMITTED", label: "Submitted" },
] as const;

function statusBadgeClass(status: string): string {
  switch (status) {
    case "FILLED":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "REJECTED":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "SUBMITTED":
    case "ACKNOWLEDGED":
    case "PARTIALLY_FILLED":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "CANCELLED":
    case "CANCEL_REQUESTED":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function sideBadgeClass(side: string): string {
  return side === "BUY"
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : "bg-red-500/15 text-red-400 border-red-500/30";
}

export function OrdersView() {
  const [status, setStatus] = useState<string>("ALL");
  const { setView, openAsset } = useUI();
  const q = useOrders(status === "ALL" ? undefined : status);

  const orders: OrderRow[] = q.data ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Orders</h2>
        <p className="text-sm text-muted-foreground">
          Real order history from the paper broker — every submit, fill, rejection, and cancellation
          recorded by the risk-gated execution engine.
        </p>
      </div>

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <ScrollText className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold">Order History</span>
            <Badge variant="outline" className="text-xs">{orders.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Order history table */}
      <Card className="p-0">
        <QueryState
          isLoading={q.isLoading}
          isError={q.isError}
          error={q.error}
          isEmpty={orders.length === 0}
          emptyTitle="No orders yet"
          emptyDescription="No orders match the current filter. Place an order from the Portfolio view to see it appear here."
          skeleton={<TableSkeleton rows={6} cols={9} />}
          data={orders}
        >
          {(rows) => (
            <div className="overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 bg-card">Time</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Filled Price</TableHead>
                    <TableHead className="text-right">Filled Qty</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell
                        className="sticky left-0 z-10 bg-card text-xs text-muted-foreground"
                        title={fmtDateTime(o.createdAt)}
                      >
                        {fmtTime(o.createdAt)}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => openAsset(o.symbol)}
                          className="font-medium text-foreground hover:text-emerald-400"
                        >
                          {o.symbol}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={sideBadgeClass(o.side)}>{o.side}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular">{o.quantity}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-[10px]">{o.orderType ?? "MARKET"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadgeClass(o.status)}>{o.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular">{o.filledPrice != null ? fmtPrice(o.filledPrice) : "—"}</TableCell>
                      <TableCell className="text-right tabular">{o.filledQty != null ? o.filledQty : "—"}</TableCell>
                      <TableCell>
                        {o.strategyKey ? (
                          <Badge variant="secondary" className="font-mono text-[10px]">{o.strategyKey}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground" title={o.reason}>
                        {o.reason ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </QueryState>
      </Card>

      {/* Empty-state CTA */}
      {orders.length === 0 && !q.isLoading && !q.isError && (
        <Card className="p-4">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div>
              <h3 className="text-sm font-semibold">No orders yet</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Place an order from the Portfolio view to start building your execution history.
              </p>
            </div>
            <button
              onClick={() => setView("portfolio")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              Go to Portfolio <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
