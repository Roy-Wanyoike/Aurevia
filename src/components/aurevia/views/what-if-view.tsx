"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
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
import { StatTile } from "@/components/aurevia/charts/stat-tile";
import {
  useMarkets,
  usePortfolio,
  useRunScenario,
  type ScenarioResult,
} from "@/lib/aurevia/hooks";
import { fmtUsd, fmtPct, gainColor } from "@/lib/aurevia/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  GitCompareArrows,
  Zap,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia What-If Simulator view (issue #51).
//
// Lets the operator stress-test the current paper portfolio against a
// hypothetical shock:
//   1. Preset scenarios — one-click "Tech crash", "Market crash", "Crypto
//      crash", "Rate hike" buttons that submit a fixed shock payload.
//   2. Custom scenario — pick a symbol (or "Whole book") + drag a shock %
//      slider from -50% to +50%, then "Run Scenario".
//
// Results render as a before→after equity strip, a P&L summary card, and an
// affected-positions table with a `correlated` badge for same-sector names
// that took a partial shock. If the simulated equity would go negative, a
// red warning banner appears.
//
// The simulation is read-only — it never mutates portfolio, risk, or order
// state. Same-sector positions take 50% of the shock so the user sees
// realistic cross-name exposure (see /api/v1/scenario route).
// ---------------------------------------------------------------------------

interface PresetScenario {
  key: string;
  label: string;
  description: string;
  symbol?: string; // omitted → whole-book shock
  shockPct: number; // -0.5..0.5
  icon: React.ComponentType<{ className?: string }>;
  accent: "red" | "amber" | "purple" | "emerald";
}

const PRESETS: PresetScenario[] = [
  {
    key: "tech-crash",
    label: "Tech Crash",
    description: "−10% on Technology sector",
    // Use a representative mega-cap as the direct shock target; same-sector
    // names (MSFT, NVDA, GOOGL, META) will take the correlated 50% impact.
    symbol: "AAPL",
    shockPct: -0.1,
    icon: TrendingDown,
    accent: "red",
  },
  {
    key: "market-crash",
    label: "Market Crash",
    description: "−15% on whole book",
    shockPct: -0.15,
    icon: TrendingDown,
    accent: "red",
  },
  {
    key: "crypto-crash",
    label: "Crypto Crash",
    description: "−30% on Digital Asset sector",
    symbol: "BTC",
    shockPct: -0.3,
    icon: TrendingDown,
    accent: "red",
  },
  {
    key: "rate-hike",
    label: "Rate Hike",
    description: "+1% on whole book",
    shockPct: 0.01,
    icon: TrendingUp,
    accent: "emerald",
  },
];

function presetAccent(accent: PresetScenario["accent"]): string {
  switch (accent) {
    case "red":
      return "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15";
    case "amber":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15";
    case "purple":
      return "border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/15";
    case "emerald":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15";
  }
}

// Slider works in integer steps; convert -50..+50 to a -0.5..+0.5 shock.
const SLIDER_MIN = -50;
const SLIDER_MAX = 50;
const SLIDER_STEP = 1;

export function WhatIfView() {
  const markets = useMarkets();
  const portfolio = usePortfolio();
  const scenario = useRunScenario();

  // Custom scenario state. `symbol` empty string means "whole book".
  const [symbol, setSymbol] = useState<string>("AAPL");
  const [wholeBook, setWholeBook] = useState<boolean>(false);
  const [sliderValue, setSliderValue] = useState<number>(-10); // -50..+50 (percent)

  const shockPct = sliderValue / 100; // -0.5..+0.5

  const positions = portfolio.data?.positions ?? [];
  const equity = portfolio.data?.equity ?? 0;
  const cash = portfolio.data?.cash ?? 0;

  function runPreset(p: PresetScenario) {
    scenario.mutate(
      { symbol: p.symbol, shockPct: p.shockPct },
      {
        onSuccess: () => toast.success(`Scenario simulated: ${p.label}`),
        onError: (e: Error) => toast.error(e.message ?? "Scenario failed"),
      },
    );
  }

  function runCustom() {
    scenario.mutate(
      { symbol: wholeBook ? undefined : symbol, shockPct },
      {
        onSuccess: () =>
          toast.success(
            `Custom scenario: ${wholeBook ? "whole book" : symbol} @ ${fmtPct(shockPct * 100)}`,
          ),
        onError: (e: Error) => toast.error(e.message ?? "Scenario failed"),
      },
    );
  }

  function resetSlider() {
    setSliderValue(-10);
    setWholeBook(false);
    setSymbol("AAPL");
  }

  const result = scenario.data;
  const isLoading = portfolio.isLoading && !portfolio.data;

  return (
    <div className="space-y-6 p-6">
      <Header />

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : positions.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Preset scenario buttons */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold">Preset Scenarios</h3>
              <span className="text-xs text-muted-foreground">
                One-click stress tests against the current portfolio
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PRESETS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => runPreset(p)}
                    disabled={scenario.isPending}
                    className={cn(
                      "flex flex-col gap-2 rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      presetAccent(p.accent),
                    )}
                    aria-label={`Run preset: ${p.label}`}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-mono tabular">
                        {(p.shockPct >= 0 ? "+" : "") + (p.shockPct * 100).toFixed(0) + "%"}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{p.label}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {p.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Custom scenario */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">Custom Scenario</h3>
              <span className="text-xs text-muted-foreground">
                Pick a target + drag the shock slider
              </span>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Shock Target</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={wholeBook ? "default" : "outline"}
                      onClick={() => setWholeBook(true)}
                    >
                      Whole Book
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!wholeBook ? "default" : "outline"}
                      onClick={() => setWholeBook(false)}
                    >
                      Single Symbol
                    </Button>
                    {!wholeBook && (
                      <Select value={symbol} onValueChange={setSymbol}>
                        <SelectTrigger className="h-9 w-[220px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(markets.data ?? []).map((a) => (
                            <SelectItem key={a.symbol} value={a.symbol}>
                              {a.symbol} — {a.name.slice(0, 22)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {wholeBook
                      ? "Every open position takes the full shock directly."
                      : "Same-sector positions take 50% of the shock (correlated impact)."}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Shock Percentage</Label>
                    <span
                      className={cn(
                        "font-mono text-sm font-semibold tabular",
                        shockPct > 0
                          ? "text-emerald-400"
                          : shockPct < 0
                            ? "text-red-400"
                            : "text-muted-foreground",
                      )}
                    >
                      {fmtPct(shockPct * 100)}
                    </span>
                  </div>
                  <Slider
                    value={[sliderValue]}
                    min={SLIDER_MIN}
                    max={SLIDER_MAX}
                    step={SLIDER_STEP}
                    onValueChange={(v) => setSliderValue(v[0])}
                    aria-label="Shock percentage"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>−50%</span>
                    <span>0%</span>
                    <span>+50%</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button
                    onClick={runCustom}
                    disabled={scenario.isPending}
                    className="gap-2"
                  >
                    <GitCompareArrows className="h-4 w-4" />
                    {scenario.isPending ? "Simulating…" : "Run Scenario"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetSlider}
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </Button>
                </div>
              </div>

              {/* Portfolio context */}
              <div className="rounded-md border border-border/60 bg-card/40 p-4 text-xs">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Info className="h-3 w-3" /> Current Portfolio Context
                </div>
                <dl className="grid grid-cols-2 gap-y-2">
                  <dt className="text-muted-foreground">Equity</dt>
                  <dd className="text-right font-mono tabular font-semibold">{fmtUsd(equity)}</dd>
                  <dt className="text-muted-foreground">Cash</dt>
                  <dd className="text-right font-mono tabular">{fmtUsd(cash)}</dd>
                  <dt className="text-muted-foreground">Open positions</dt>
                  <dd className="text-right font-mono tabular">{positions.length}</dd>
                  <dt className="text-muted-foreground">Gross market value</dt>
                  <dd className="text-right font-mono tabular">
                    {fmtUsd(positions.reduce((s, p: any) => s + (p.marketValue ?? 0), 0))}
                  </dd>
                </dl>
                <p className="mt-3 border-t border-border/60 pt-2 text-[10px] text-muted-foreground/80">
                  The simulation is read-only — your portfolio is never modified.
                </p>
              </div>
            </div>
          </Card>

          {/* Results */}
          {scenario.isPending && !result ? (
            <Card className="p-6">
              <Skeleton className="h-32 w-full" />
            </Card>
          ) : result ? (
            <ResultsPanel result={result} />
          ) : null}
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <GitCompareArrows className="h-5 w-5 text-cyan-400" />
        <h2 className="text-2xl font-bold tracking-tight">What-If Simulator</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Stress-test your current portfolio against hypothetical shocks. Same-sector positions take a correlated 50% impact; the simulation is read-only.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-400" />
      <div>
        <p className="text-sm font-medium text-foreground">No open positions to simulate</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Open a paper position from the Portfolio view, then come back here to stress-test it.
        </p>
      </div>
    </Card>
  );
}

function ResultsPanel({ result }: { result: ScenarioResult }) {
  const negative = result.newEquity < 0;
  const pnlPct = result.equityImpactPct;
  const pnl = result.pnlImpact;
  const pnlGain = pnl >= 0;

  return (
    <div className="space-y-4">
      {negative && (
        <Card className="flex items-start gap-3 border-red-500/40 bg-red-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300">
              Equity would go negative
            </p>
            <p className="mt-0.5 text-xs text-red-200/80">
              Under this scenario, projected equity drops to {fmtUsd(result.newEquity)}. The circuit breaker would halt trading in real life — adjust the shock or trim the position.
            </p>
          </div>
        </Card>
      )}

      {/* Before → After equity strip */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatTile
          label="Original Equity"
          value={fmtUsd(result.originalEquity)}
          accent="default"
        />
        <Card
          className={cn(
            "flex flex-col justify-center gap-1 p-4 ring-1",
            negative
              ? "ring-red-500/30"
              : pnlGain
                ? "ring-emerald-500/20"
                : "ring-red-500/20",
          )}
        >
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <ArrowRight className="h-3 w-3" />
            Shocked
            <Badge
              variant="outline"
              className={cn(
                "ml-auto text-[10px]",
                pnlGain
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400",
              )}
            >
              {fmtPct(pnlPct)}
            </Badge>
          </div>
          <div
            className={cn(
              "text-2xl font-bold tabular",
              negative ? "text-red-400" : gainColor(pnl),
            )}
          >
            {fmtUsd(result.newEquity)}
          </div>
        </Card>
        <StatTile
          label="P&L Impact"
          value={fmtUsd(pnl)}
          sub={`${fmtPct(pnlPct)} of equity`}
          accent={pnlGain ? "gain" : "loss"}
        />
      </div>

      {/* Affected positions table */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold">Affected Positions</h3>
          </div>
          <Badge variant="outline" className="text-xs">
            {result.impacts.length} position{result.impacts.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Market Value</TableHead>
                <TableHead className="text-right">Shock %</TableHead>
                <TableHead className="text-right">P&L Impact</TableHead>
                <TableHead className="text-right">Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.impacts
                .slice()
                .sort((a, b) => Math.abs(b.pnlImpact) - Math.abs(a.pnlImpact))
                .map((row) => (
                  <TableRow key={row.symbol}>
                    <TableCell className="font-semibold">{row.symbol}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          row.side === "LONG"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-red-500/30 bg-red-500/10 text-red-400",
                        )}
                      >
                        {row.side}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {fmtUsd(row.marketValue)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular",
                        row.shockPct > 0
                          ? "text-emerald-400"
                          : row.shockPct < 0
                            ? "text-red-400"
                            : "text-muted-foreground",
                      )}
                    >
                      {fmtPct(row.shockPct * 100)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular font-semibold",
                        gainColor(row.pnlImpact),
                      )}
                    >
                      {row.pnlImpact >= 0 ? "+" : ""}
                      {fmtUsd(row.pnlImpact)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.shockPct === 0 ? (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Unaffected
                        </Badge>
                      ) : row.correlated ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-400"
                        >
                          Correlated
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-cyan-500/30 bg-cyan-500/10 text-[10px] text-cyan-400"
                        >
                          Direct
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
