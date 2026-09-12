"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMarkets,
  useAlerts,
  useAlertAction,
  type AlertRow,
} from "@/lib/aurevia/hooks";
import { fmtPrice, fmtPct, fmtDateTime } from "@/lib/aurevia/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  History,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Alerts view (issue #48).
//
// Three sections:
//   1. Create form — pick type (price / RSI / change%), symbol, condition
//      (above / below) and a numeric threshold. Submit creates the alert.
//   2. Active alerts — list with remove buttons + the current value next to
//      the threshold so the user can see how close they are to firing.
//   3. Triggered history — fired alerts with the value + timestamp they
//      fired at.
//
// When the GET returns freshly-triggered alerts (the route runs checkAlerts
// on every list call), the view toasts each one — so the user gets in-app
// notifications when an alert fires, without needing to keep the tab focused.
// A ref guard prevents duplicate toasts for the same alert id across
// refetches.
// ---------------------------------------------------------------------------

type AlertType = "price" | "rsi" | "changePct";
type AlertCondition = "above" | "below";

const TYPE_OPTIONS: { value: AlertType; label: string; placeholder: string; suffix: string }[] = [
  { value: "price", label: "Price", placeholder: "e.g. 185.00", suffix: "$" },
  { value: "rsi", label: "RSI (14)", placeholder: "0..100", suffix: "" },
  { value: "changePct", label: "24h Change %", placeholder: "e.g. 2.5", suffix: "%" },
];
const CONDITION_OPTIONS: { value: AlertCondition; label: string }[] = [
  { value: "above", label: "Above" },
  { value: "below", label: "Below" },
];

export function AlertsView() {
  const markets = useMarkets();
  const { data, isLoading } = useAlerts();
  const action = useAlertAction();
  const qc = useQueryClient();

  const [type, setType] = useState<AlertType>("price");
  const [symbol, setSymbol] = useState<string>("AAPL");
  const [condition, setCondition] = useState<AlertCondition>("above");
  const [threshold, setThreshold] = useState<string>("");

  // Track which alert ids we've already toasted, so the same fire doesn't
  // pop a notification on every refetch.
  const toastedRef = useRef<Set<string>>(new Set());

  const all = data?.alerts ?? [];
  const triggeredNow = data?.triggered ?? [];
  const active = useMemo(() => all.filter((a) => a.active), [all]);
  const fired = useMemo(() => all.filter((a) => !a.active).sort((a, b) => (b.triggeredAt ?? 0) - (a.triggeredAt ?? 0)), [all]);

  // In-app toast whenever freshly-triggered alerts come back from the route.
  useEffect(() => {
    for (const t of triggeredNow) {
      if (toastedRef.current.has(t.id)) continue;
      toastedRef.current.add(t.id);
      toast.success(`Alert fired: ${t.symbol} ${typeLabel(t.type)} ${t.condition} ${formatThreshold(t.type, t.threshold)}`, {
        description: `Triggered at ${formatThreshold(t.type, t.triggerValue ?? 0)} · ${fmtDateTime(t.triggeredAt)}`,
        icon: <BellRing className="h-4 w-4" />,
      });
    }
  }, [triggeredNow]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const thr = parseFloat(threshold);
    if (!isFinite(thr)) {
      toast.error("Threshold must be a finite number");
      return;
    }
    if (type === "rsi" && (thr < 0 || thr > 100)) {
      toast.error("RSI threshold must be between 0 and 100");
      return;
    }
    action.mutate(
      { action: "create", type, symbol, condition, threshold: thr },
      {
        onSuccess: (res) => {
          toast.success(`Alert created for ${symbol}`);
          setThreshold("");
          qc.invalidateQueries({ queryKey: ["alerts"] });
        },
        onError: (e: Error) => toast.error(e.message ?? "Failed to create alert"),
      },
    );
  }

  function handleDelete(id: string, label: string) {
    action.mutate(
      { action: "delete", id },
      {
        onSuccess: () => {
          toast.success(`Alert removed (${label})`);
          // Drop from the toasted set so a recreated alert with a new id
          // can re-fire its toast.
          toastedRef.current.delete(id);
          qc.invalidateQueries({ queryKey: ["alerts"] });
        },
        onError: (e: Error) => toast.error(e.message ?? "Failed to delete alert"),
      },
    );
  }

  function handleCheckNow() {
    action.mutate(
      { action: "check" },
      {
        onSuccess: (res) => {
          if ((res.triggered ?? []).length > 0) {
            // The toast effect will fire on the next refetch of useAlerts;
            // also surface a count here for immediate feedback.
            toast.success(`${res.triggered?.length ?? 0} alert(s) just fired`);
          } else {
            toast.info("No alerts fired");
          }
          qc.invalidateQueries({ queryKey: ["alerts"] });
        },
        onError: (e: Error) => toast.error(e.message ?? "Failed to check alerts"),
      },
    );
  }

  const typeMeta = TYPE_OPTIONS.find((t) => t.value === type)!;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-amber-400" />
          <h2 className="text-2xl font-bold tracking-tight">Alerts</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Create price, RSI and 24h-change alerts. Conditions are evaluated on every signal scan; in-app toasts fire the moment one is satisfied.
        </p>
      </div>

      {/* Create form */}
      <Card className="p-6">
        <div className="mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold">Create Alert</h3>
        </div>
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 md:grid-cols-5 md:items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as AlertType)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Symbol</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(markets.data ?? []).map((a) => (
                  <SelectItem key={a.symbol} value={a.symbol}>
                    {a.symbol} — {a.name.slice(0, 18)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Condition</Label>
            <Select value={condition} onValueChange={(v) => setCondition(v as AlertCondition)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Threshold</Label>
            <div className="flex items-center gap-1">
              {typeMeta.suffix === "$" && <span className="text-xs text-muted-foreground">$</span>}
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder={typeMeta.placeholder}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="h-9"
                required
              />
              {typeMeta.suffix === "%" && <span className="text-xs text-muted-foreground">%</span>}
            </div>
          </div>
          <Button type="submit" disabled={action.isPending} className="h-9">
            <Plus className="mr-1 h-4 w-4" /> Create
          </Button>
        </form>
      </Card>

      {/* Action bar — manual check */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-400">
            <BellRing className="h-3 w-3" /> {active.length} active
          </Badge>
          <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> {fired.length} fired
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleCheckNow} disabled={action.isPending}>
          <BellRing className="mr-1.5 h-3.5 w-3.5" /> Check now
        </Button>
      </div>

      {/* Active alerts */}
      <Card className="p-0">
        <div className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Active Alerts</h3>
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <ActiveAlertsTable
            alerts={active}
            onRemove={(a) => handleDelete(a.id, alertLabel(a))}
          />
        )}
      </Card>

      {/* Triggered history */}
      <Card className="p-0">
        <div className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">Triggered History</h3>
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <FiredAlertsTable alerts={fired} />
        )}
      </Card>

      {/* Empty-state hint */}
      {!isLoading && all.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-foreground">No alerts yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use the form above to create your first alert. Conditions are evaluated against live market data.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

// --- Active alerts table -----------------------------------------------------
// Renders active alerts with a Remove button per row. The "current value"
// column is intentionally omitted — we don't have per-symbol live values on
// the client; the user gets feedback through the fire toast + the triggered
// history table. Threshold is formatted with the right unit for its type.
function ActiveAlertsTable({
  alerts,
  onRemove,
}: {
  alerts: AlertRow[];
  onRemove: (a: AlertRow) => void;
}) {
  if (alerts.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No active alerts. Create one above to start monitoring.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Condition</TableHead>
            <TableHead className="text-right">Threshold</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-semibold">{a.symbol ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">{typeLabel(a.type)}</Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    a.condition === "above"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-red-500/30 bg-red-500/10 text-red-400",
                  )}
                >
                  {a.condition}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular font-medium">
                {formatThreshold(a.type, a.threshold)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {fmtDateTime(a.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(a)}
                  className="h-7 text-red-400 hover:text-red-300"
                  aria-label={`Remove alert for ${a.symbol}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Triggered history table -------------------------------------------------
function FiredAlertsTable({ alerts }: { alerts: AlertRow[] }) {
  if (alerts.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No triggered alerts yet. Active alerts will land here when their conditions fire.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Condition</TableHead>
            <TableHead className="text-right">Threshold</TableHead>
            <TableHead className="text-right">Fired At</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-semibold">{a.symbol ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">{typeLabel(a.type)}</Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    a.condition === "above"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-red-500/30 bg-red-500/10 text-red-400",
                  )}
                >
                  {a.condition}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular">
                {formatThreshold(a.type, a.threshold)}
              </TableCell>
              <TableCell className="text-right tabular text-emerald-400">
                {formatThreshold(a.type, a.triggerValue ?? 0)}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {fmtDateTime(a.triggeredAt)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {fmtDateTime(a.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function typeLabel(t: AlertType): string {
  switch (t) {
    case "price": return "Price";
    case "rsi": return "RSI";
    case "changePct": return "24h Δ%";
  }
}

function alertLabel(a: AlertRow): string {
  return `${a.symbol} ${typeLabel(a.type)} ${a.condition} ${formatThreshold(a.type, a.threshold)}`;
}

function formatThreshold(type: AlertType, value: number): string {
  switch (type) {
    case "price": return fmtPrice(value);
    case "rsi": return value.toFixed(1);
    case "changePct": return fmtPct(value);
  }
}
