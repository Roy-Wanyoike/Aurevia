"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useEconomic, type EconomicIndicator } from "@/lib/aurevia/hooks";
import { fmtCompact, fmtPct, gainColor } from "@/lib/aurevia/format";
import {
  Globe,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  RefreshCw,
  Banknote,
  Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Aurevia Macro Intelligence view (issue #105).
//
// Renders the latest macroeconomic indicators from the St. Louis Fed's free
// FRED API: GDP, CPI (Inflation), Unemployment Rate, Fed Funds Rate, 10Y and
// 2Y Treasury yields. Each indicator shows value, period-over-period change,
// and observation date.
//
// Layout:
//   1. Header — Globe icon + title + count badge + source badge.
//   2. Empty/disabled state — shown when FRED_API_KEY is unset OR when no
//      indicators come back; renders clear copy explaining how to enable.
//   3. Indicator grid — 6 cards (3-col on md+) showing value + change + date.
//   4. Detail table — sortable-ish read of all indicators with units.
//
// Auto-refreshes every 5 minutes via the useEconomic refetchInterval.
// ---------------------------------------------------------------------------

export function MacroView() {
  const { data, isLoading, isError, error, refetch } = useEconomic();

  const indicators = useMemo(
    () => data?.indicators ?? [],
    [data?.indicators],
  );
  const disabled = data?.source === "disabled";
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Globe className="h-5 w-5 text-cyan-400" />
          <h2 className="text-2xl font-bold tracking-tight">Macro Intelligence</h2>
          <Badge
            variant="outline"
            className="border-cyan-500/30 bg-cyan-500/10 text-cyan-400"
          >
            {total} indicators
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              disabled
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
            )}
            title={
              disabled
                ? "FRED_API_KEY is not set — set it to enable live macro data"
                : "Live data via the Federal Reserve Bank of St. Louis (FRED)"
            }
          >
            {disabled ? "DISABLED" : "FRED · LIVE"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => refetch()}
            aria-label="Refresh macro indicators"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Latest readings from the Federal Reserve Bank of St. Louis (FRED).
          Auto-refreshes every 5 minutes.
        </p>
      </div>

      {/* Disabled / empty state — clear copy, never an error */}
      {disabled ? (
        <DisabledState />
      ) : isLoading && indicators.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Couldn&apos;t load macro data
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </Card>
      ) : indicators.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Globe className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">No data yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              FRED returned no observations. Try the refresh button.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Indicator cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {indicators.map((ind) => (
              <IndicatorCard key={ind.seriesId} indicator={ind} />
            ))}
          </div>

          {/* Detail table */}
          <Card className="p-0">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">All Indicators</h3>
            </div>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Indicator</TableHead>
                    <TableHead>Series ID</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {indicators.map((ind) => (
                    <TableRow key={ind.seriesId}>
                      <TableCell className="font-medium">{ind.label}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {ind.seriesId}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular">
                        {formatValue(ind)}
                      </TableCell>
                      <TableCell
                        className={cn("text-right tabular", gainColor(ind.changePct))}
                      >
                        {fmtPct(ind.changePct, 2)}
                      </TableCell>
                      <TableCell className="text-xs uppercase text-muted-foreground">
                        {ind.unit}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ind.date}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function DisabledState() {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="space-y-1 text-sm">
          <p className="font-medium text-amber-300">
            Macro intelligence is disabled.
          </p>
          <p className="text-xs text-amber-300/80">
            Set <code className="font-mono text-amber-200">FRED_API_KEY</code> in your
            environment to pull live GDP, CPI, Unemployment, Fed Funds and Treasury
            yield data from the Federal Reserve Bank of St. Louis (FRED). The free
            tier has no daily cap.
          </p>
          <p className="pt-1 text-xs text-muted-foreground">
            Register at{" "}
            <a
              href="https://fred.stlouisfed.org/docs/api/api_key.html"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              fred.stlouisfed.org
            </a>{" "}
            to obtain an API key.
          </p>
        </div>
      </div>
    </Card>
  );
}

function IndicatorCard({ indicator }: { indicator: EconomicIndicator }) {
  const Icon = ICONS[indicator.seriesId] ?? ICONS.__default;
  const changeColorCls = gainColor(indicator.changePct);
  const ChangeIcon =
    indicator.changePct > 0.01
      ? TrendingUp
      : indicator.changePct < -0.01
        ? TrendingDown
        : Minus;
  return (
    <Card className="p-4 ring-1 ring-border/50 transition-colors hover:border-border/80">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {indicator.label}
          </span>
        </div>
        <Badge
          variant="outline"
          className={cn("gap-1 text-xs", changeColorCls)}
        >
          <ChangeIcon className="h-3 w-3" />
          {fmtPct(indicator.changePct, 2)}
        </Badge>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <div className="text-2xl font-semibold tabular text-foreground">
            {formatValue(indicator)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            <span className="uppercase">{indicator.unit}</span> · {indicator.date}
          </div>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground/70">
          {indicator.seriesId}
        </span>
      </div>
    </Card>
  );
}

// Static icon lookup — assigning from a module-scoped record keeps ESLint's
// `react-hooks/static-components` rule happy (no function-call lookups inside
// render).
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  GDP: Landmark,
  FEDFUNDS: Banknote,
  DGS10: Banknote,
  DGS2: Banknote,
  __default: Globe,
};

// Format the indicator value based on its unit so numbers stay scannable.
function formatValue(ind: EconomicIndicator): string {
  switch (ind.unit) {
    case "pct":
      return `${ind.value.toFixed(2)}%`;
    case "index":
      return ind.value.toLocaleString("en-US", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
    case "usd-bn":
      return `$${fmtCompact(ind.value * 1_000_000_000)}`;
    default:
      return ind.value.toString();
  }
}
