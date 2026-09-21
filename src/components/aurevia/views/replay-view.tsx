"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { StatTile } from "@/components/aurevia/charts/stat-tile";
import { CandlestickChart } from "@/components/aurevia/charts/candlestick-chart";
import { useMarkets, useReplay, type ReplayState } from "@/lib/aurevia/hooks";
import { fmtUsd, fmtPrice, fmtDateTime } from "@/lib/aurevia/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  PlayCircle,
  Play,
  Pause,
  SkipForward,
  FastForward,
  AlertTriangle,
  AlertCircle,
  Wallet,
  ScrollText,
  RotateCcw,
  Send,
  EyeOff,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Market Replay view (issue #50).
//
// A bar-by-bar replay trainer. Setup form lets the operator pick a symbol,
// number of bars to seed (default 300), and starting capital (default
// $100,000). After "Start Replay":
//
//   - Candlestick chart shows only the visible bars (cursor slices the
//     history; bars after the cursor are hidden — no look-ahead).
//   - Step controls: Step Forward (advance 1), Step 5 (advance 5), Speed
//     selector (1x/5x/10x bars per tick), auto-play toggle.
//   - Trade ticket: side (BUY/SELL), quantity, Place Order — fills at the
//     cursor bar's close.
//   - P&L panel: current cash, open positions, recent trades.
//   - "Future is hidden" amber badge reminds the user the chart is gated
//     by the cursor.
//
// Uses local React state for the session; the useReplay mutation drives
// every transition (start / next / trade / state).
// ---------------------------------------------------------------------------

type SpeedKey = 1 | 5 | 10;
const SPEED_OPTIONS: SpeedKey[] = [1, 5, 10];
const DEFAULT_BARS = 300;
const DEFAULT_CAPITAL = 100_000;
const DEFAULT_QTY = 100;

export function ReplayView() {
  const markets = useMarkets();
  const replay = useReplay();

  // Setup form state (used before a session is active)
  const [symbol, setSymbol] = useState<string>("AAPL");
  const [bars, setBars] = useState<number>(DEFAULT_BARS);
  const [capital, setCapital] = useState<number>(DEFAULT_CAPITAL);

  // Active session state
  const [state, setState] = useState<ReplayState | null>(null);

  // Controls
  const [speed, setSpeed] = useState<SpeedKey>(1);
  const [autoPlay, setAutoPlay] = useState<boolean>(false);

  // Trade ticket
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState<number>(DEFAULT_QTY);

  // Auto-play timer. Advances the cursor by `speed` bars every 1.2s while
  // enabled and not at the end of the series. Cleared on unmount / pause /
  // end-of-series. End-of-series is detected on each tick (in the success
  // callback) rather than in the effect body — calling setState directly in
  // the effect is a React anti-pattern (react-hooks/set-state-in-effect).
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!autoPlay || !state) return;
    timerRef.current = setInterval(() => {
      replay.mutate(
        { action: "next", cursor: speed },
        {
          onSuccess: (s) => {
            setState(s);
            if (s.cursor >= s.totalBars) {
              setAutoPlay(false);
              toast.info("Reached end of replay data");
            }
          },
          onError: (e: Error) => {
            toast.error(e.message ?? "Replay step failed");
            setAutoPlay(false);
          },
        },
      );
    }, 1200);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [autoPlay, state, speed, replay]);

  const handleStart = useCallback(() => {
    setAutoPlay(false);
    replay.mutate(
      { action: "start", symbol, bars, capital },
      {
        onSuccess: (s) => {
          setState(s);
          toast.success(`Replay started: ${s.symbol} · ${s.totalBars} bars`);
        },
        onError: (e: Error) => toast.error(e.message ?? "Replay start failed"),
      },
    );
  }, [replay, symbol, bars, capital]);

  const handleStep = useCallback(
    (advance: number) => {
      if (!state) return;
      if (state.cursor >= state.totalBars) {
        toast.info("Already at the end of the replay data");
        return;
      }
      replay.mutate(
        { action: "next", cursor: advance },
        {
          onSuccess: (s) => setState(s),
          onError: (e: Error) => toast.error(e.message ?? "Replay step failed"),
        },
      );
    },
    [replay, state],
  );

  const handleTrade = useCallback(() => {
    if (!state) return;
    if (!(quantity > 0) || !Number.isFinite(quantity)) {
      toast.error("Quantity must be a positive number");
      return;
    }
    replay.mutate(
      { action: "trade", side, quantity },
      {
        onSuccess: (s) => {
          setState((prev) => (prev ? { ...prev, ...s } : prev));
          toast.success(`${side} ${quantity} ${state.symbol} @ ${fmtPrice(s.currentPrice)}`);
        },
        onError: (e: Error) => toast.error(e.message ?? "Trade failed"),
      },
    );
  }, [replay, state, side, quantity]);

  const handleReset = useCallback(() => {
    setAutoPlay(false);
    setState(null);
    setSide("BUY");
    setQuantity(DEFAULT_QTY);
    setBars(DEFAULT_BARS);
    setCapital(DEFAULT_CAPITAL);
  }, []);

  // Markets catalog drives the symbol picker. If it fails to load, the setup
  // form would render with an empty symbol dropdown — surface a proper error
  // state with Retry instead. Replay mutation errors are already surfaced as
  // toasts in the mutate callbacks above. NB: this early return runs AFTER
  // every useState/useRef/useEffect/useCallback call above so the Rules of
  // Hooks are preserved.
  if (markets.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm font-medium">Failed to load markets data</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {markets.error instanceof Error
            ? markets.error.message
            : "Unknown error — the markets catalog could not be fetched."}
        </p>
        <Button variant="outline" size="sm" onClick={() => markets.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!state) {
    return (
      <SetupForm
        symbol={symbol}
        setSymbol={setSymbol}
        bars={bars}
        setBars={setBars}
        capital={capital}
        setCapital={setCapital}
        markets={markets.data ?? []}
        marketsLoading={markets.isLoading}
        onStart={handleStart}
        isStarting={replay.isPending}
      />
    );
  }

  // Derived values for the active session
  const visibleCandles = state.visibleCandles;
  const progress = state.totalBars > 0 ? (state.cursor / state.totalBars) * 100 : 0;
  const atEnd = state.cursor >= state.totalBars;
  const pnl = state.cash + positionsValue(state) - state.capital;
  const pnlPct = state.capital > 0 ? (pnl / state.capital) * 100 : 0;

  return (
    <div className="space-y-6 p-6">
      <Header
        symbol={state.symbol}
        cursor={state.cursor}
        totalBars={state.totalBars}
        atEnd={atEnd}
        onReset={handleReset}
      />

      {/* Chart + controls */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs tabular">
              Bar {state.cursor} / {state.totalBars}
            </Badge>
            <Badge variant="outline" className="text-xs tabular">
              @ {fmtPrice(state.currentPrice)}
            </Badge>
            {atEnd && (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-400"
              >
                End of data
              </Badge>
            )}
          </div>
          <Badge
            variant="outline"
            className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-400"
            title="Bars after the cursor are hidden — no look-ahead."
          >
            <EyeOff className="mr-1 h-3 w-3" />
            Future is hidden
          </Badge>
        </div>

        <CandlestickChart candles={visibleCandles} height={340} showVolume />

        {/* Progress bar showing cursor position in the total series */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-cyan-500 transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step controls */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleStep(1)}
            disabled={replay.isPending || atEnd}
            className="gap-1.5"
          >
            <SkipForward className="h-3.5 w-3.5" /> Step Forward
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleStep(5)}
            disabled={replay.isPending || atEnd}
            className="gap-1.5"
          >
            <FastForward className="h-3.5 w-3.5" /> Step 5
          </Button>
          <div className="mx-1 h-5 w-px bg-border/60" />
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Speed
          </Label>
          <Select
            value={String(speed)}
            onValueChange={(v) => setSpeed(Number(v) as SpeedKey)}
          >
            <SelectTrigger className="h-8 w-[88px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPEED_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}× bars/tick
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mx-1 h-5 w-px bg-border/60" />
          <Button
            size="sm"
            variant={autoPlay ? "default" : "outline"}
            onClick={() => {
              if (atEnd) {
                toast.info("Already at the end of the replay data");
                return;
              }
              setAutoPlay((p) => !p);
            }}
            disabled={replay.isPending || atEnd}
            className="gap-1.5"
            aria-pressed={autoPlay}
          >
            {autoPlay ? (
              <>
                <Pause className="h-3.5 w-3.5" /> Pause
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Auto-play
              </>
            )}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* P&L panel */}
        <Card className="p-4 lg:col-span-1">
          <div className="mb-3 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">P&amp;L Panel</h3>
          </div>
          <div className="space-y-3">
            <StatTile
              label="Cash"
              value={fmtUsd(state.cash)}
              sub={`Capital ${fmtUsd(state.capital)}`}
              accent="default"
            />
            <StatTile
              label="Unrealized P&L"
              value={fmtUsd(pnl)}
              sub={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% of capital`}
              accent={pnl >= 0 ? "gain" : "loss"}
            />
            <div className="rounded-md border border-border/60 bg-card/40 p-3">
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Open Positions</span>
                <span className="tabular">{state.positions.length}</span>
              </div>
              {state.positions.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  No trades yet — use the ticket to open a position.
                </p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {state.positions.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-sm border border-border/40 px-2 py-1.5 text-xs"
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          p.side === "BUY"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-red-500/30 bg-red-500/10 text-red-400",
                        )}
                      >
                        {p.side}
                      </Badge>
                      <span className="font-mono tabular">{p.qty} @ {fmtPrice(p.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Trade ticket */}
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Send className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold">Trade Ticket</h3>
            <span className="text-xs text-muted-foreground">
              Fills at the cursor bar&apos;s close — no look-ahead.
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Side</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={side === "BUY" ? "default" : "outline"}
                  onClick={() => setSide("BUY")}
                >
                  BUY
                </Button>
                <Button
                  size="sm"
                  variant={side === "SELL" ? "default" : "outline"}
                  onClick={() => setSide("SELL")}
                >
                  SELL
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Quantity</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="h-9"
              />
            </div>
            <Button
              onClick={handleTrade}
              disabled={replay.isPending || !quantity || quantity <= 0}
              className="h-9 gap-1.5"
            >
              <Send className="h-4 w-4" />
              Place Order
            </Button>
          </div>

          {/* Cost preview */}
          <div className="mt-3 rounded-md border border-border/60 bg-card/40 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Symbol</span>
              <span className="font-mono font-semibold">{state.symbol}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">Fill Price (cursor close)</span>
              <span className="font-mono tabular">{fmtPrice(state.currentPrice)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">Order Value</span>
              <span className="font-mono tabular">
                {fmtUsd(state.currentPrice * quantity)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">Cash After</span>
              <span
                className={cn(
                  "font-mono tabular font-semibold",
                  side === "BUY"
                    ? state.cash - state.currentPrice * quantity < 0
                      ? "text-red-400"
                      : "text-emerald-400"
                    : "text-emerald-400",
                )}
              >
                {fmtUsd(
                  side === "BUY"
                    ? state.cash - state.currentPrice * quantity
                    : state.cash + state.currentPrice * quantity,
                )}
              </span>
            </div>
          </div>

          {/* Trades history */}
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <ScrollText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Trades
              </span>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {state.trades.length}
              </Badge>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-border/60">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Bar</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.trades.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                        No trades placed yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    state.trades
                      .slice()
                      .reverse()
                      .map((t, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                t.side === "BUY"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                  : "border-red-500/30 bg-red-500/10 text-red-400",
                              )}
                            >
                              {t.side}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular">{t.qty}</TableCell>
                          <TableCell className="text-right tabular">{fmtPrice(t.price)}</TableCell>
                          <TableCell className="text-right tabular text-muted-foreground">
                            {t.bar}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {fmtDateTime(t.time)}
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup form (rendered before a session is active)
// ---------------------------------------------------------------------------
function SetupForm({
  symbol,
  setSymbol,
  bars,
  setBars,
  capital,
  setCapital,
  markets,
  marketsLoading,
  onStart,
  isStarting,
}: {
  symbol: string;
  setSymbol: (s: string) => void;
  bars: number;
  setBars: (n: number) => void;
  capital: number;
  setCapital: (n: number) => void;
  markets: { symbol: string; name: string }[];
  marketsLoading: boolean;
  onStart: () => void;
  isStarting: boolean;
}) {
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5 text-cyan-400" />
          <h2 className="text-2xl font-bold tracking-tight">Market Replay</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Bar-by-bar replay trainer. Pick a symbol, choose how much history to seed, set a starting capital, then step forward and practice execution against real historical bars.
        </p>
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Start a Replay Session</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Symbol</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {marketsLoading && markets.length === 0 ? (
                  <SelectItem value={symbol} disabled>Loading universe…</SelectItem>
                ) : (
                  markets.map((a) => (
                    <SelectItem key={a.symbol} value={a.symbol}>
                      {a.symbol} — {a.name.slice(0, 22)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Bars to seed</Label>
            <Input
              type="number"
              min={60}
              max={2000}
              step={10}
              value={bars}
              onChange={(e) => setBars(Number(e.target.value))}
              className="h-9"
            />
            <p className="text-[10px] text-muted-foreground">60..2000 — first 60 bars are visible; the cursor advances through the rest.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Starting Capital ($)</Label>
            <Input
              type="number"
              min={1}
              step={1000}
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              className="h-9"
            />
            <p className="text-[10px] text-muted-foreground">Replay cash — your live paper portfolio is never touched.</p>
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={onStart} disabled={isStarting} className="gap-2">
            <PlayCircle className="h-4 w-4" />
            {isStarting ? "Starting…" : "Start Replay"}
          </Button>
        </div>
      </Card>

      <Card className="flex items-start gap-3 border-amber-500/30 bg-amber-500/5 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="text-xs text-muted-foreground">
          <p className="font-semibold text-amber-300">Future is hidden.</p>
          <p className="mt-1">
            Bars after the cursor are not visible until you step into them. Trades fill at the cursor bar&apos;s close — no look-ahead bias. This is a training tool, not a paper-trading replacement; the live portfolio in <code className="rounded bg-muted px-1 py-0.5 text-[10px]">/api/v1/portfolio</code> is never modified.
          </p>
        </div>
      </Card>
    </div>
  );
}

function Header({
  symbol,
  cursor: _cursor,
  totalBars,
  atEnd,
  onReset,
}: {
  symbol: string;
  cursor: number;
  totalBars: number;
  atEnd: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5 text-cyan-400" />
          <h2 className="text-2xl font-bold tracking-tight">Market Replay</h2>
          <Badge variant="outline" className="text-sm">{symbol}</Badge>
          {atEnd && (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
              End of data
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Stepping through {totalBars} bars of {symbol} history. Bars after the cursor are hidden — no look-ahead.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onReset} className="gap-1.5">
        <RotateCcw className="h-3.5 w-3.5" /> New Session
      </Button>
    </div>
  );
}

// Mark-to-market value of replay positions at the current cursor price.
// Longs contribute +qty*price; shorts are tracked as proceeds-credited
// so their "position value" is also qty*price (we'd need to buy them back
// to close). This is a simplified MTM for the P&L display only.
function positionsValue(state: ReplayState): number {
  if (!state.positions.length) return 0;
  return state.positions.reduce((s, p) => s + p.qty * state.currentPrice, 0);
}
