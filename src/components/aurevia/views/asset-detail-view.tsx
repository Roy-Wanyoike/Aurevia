"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAsset } from "@/lib/aurevia/hooks";
import {
  fmtPrice,
  fmtPct,
  fmtCompact,
  fmtUsd,
  gainColor,
  gainBg,
  regimeColor,
  trendColor,
  drawdownColor,
} from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { CandlestickChart } from "@/components/aurevia/charts/candlestick-chart";
import {
  ArrowUpRight,
  ArrowDownRight,
  FlaskConical,
  Minus,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
} from "lucide-react";

const REGIME_DESCRIPTION: Record<string, string> = {
  BULL: "Sustained upward drift with buyers in control. Favors trend-following and breakout strategies.",
  BEAR: "Sustained downward drift with sellers in control. Favor capital preservation and short bias.",
  ACCUMULATION: "Sideways base building by informed buyers. Range-bound, readying for a potential breakout.",
  DISTRIBUTION: "Sideways top formation by informed sellers. Range-bound, watch for breakdown.",
  BREAKOUT: "Price breaking above resistance with expanding volume. Momentum entry opportunity.",
  BREAKDOWN: "Price breaking below support with expanding volume. Defensive / short bias.",
  HIGH_VOLATILITY: "Elevated realized volatility. Reduce position sizing and tighten risk controls.",
  LOW_VOLATILITY: "Subdued volatility. Mean-reversion and premium-capture strategies favored.",
  CRASH: "Disorderly selling, liquidity cascading. Defensive only — circuit breakers likely active.",
  RECOVERY: "Rebounding off an oversold regime with constructive price action.",
  RANGE: "Directionless oscillation around a mean. Range-trading favored over trend strategies.",
};

export function AssetDetailView() {
  const { selectedSymbol, setView } = useUI();
  const { data, isLoading } = useAsset(selectedSymbol);

  if (isLoading || !data) {
    return (
      <div className="space-y-6 p-6">
        <Header symbol={selectedSymbol} />
        <div className="py-12 text-center text-sm text-muted-foreground">Loading {selectedSymbol} analysis…</div>
      </div>
    );
  }

  const { asset, candles, quote, indicators, trend, regime } = data;
  const up = quote.changePct >= 0;

  const indicatorTiles = Object.entries(indicators ?? {}).slice(0, 12);
  const direction = trend.direction ?? "FLAT";
  const strength = Math.min(100, Math.max(0, trend.strength * 100));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">{asset.symbol}</h2>
            <Badge variant="secondary">{asset.exchange}</Badge>
            <Badge variant="outline">{asset.assetType}</Badge>
            {asset.sector && <Badge variant="outline" className="text-muted-foreground">{asset.sector}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{asset.name}</p>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-4xl font-bold tabular">{fmtPrice(quote.price)}</span>
            <Badge variant="outline" className={`mb-1.5 gap-1 ${gainBg(quote.changePct)}`}>
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              <span className="tabular">{fmtPct(quote.changePct)}</span>
            </Badge>
            <Badge variant="outline" className={`mb-1.5 ${regimeColor(regime)}`}>{regime}</Badge>
          </div>
        </div>
        <Button onClick={() => setView("backtests")} className="gap-2">
          <FlaskConical className="h-4 w-4" /> Quick Backtest
        </Button>
      </div>

      {/* Chart */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Price Action</h3>
          <span className="text-xs text-muted-foreground">Volume {fmtCompact(quote.volume24h)} · Spread {fmtPrice(quote.spread, 4)}</span>
        </div>
        <CandlestickChart candles={candles} overlays={[]} height={340} showVolume />
      </Card>

      {/* Indicators */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Indicators</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {indicatorTiles.map(([key, value]) => {
            const v = Number(value);
            let color = "text-foreground";
            if (key.toLowerCase().startsWith("rsi")) {
              if (v > 70) color = "text-red-400";
              else if (v < 30) color = "text-emerald-400";
            }
            return (
              <div key={key} className="rounded-md border border-border/60 bg-card/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{key}</div>
                <div className={`mt-1 text-lg font-semibold tabular ${color}`}>{fmtPrice(v, 4)}</div>
              </div>
            );
          })}
          {indicatorTiles.length === 0 && (
            <div className="col-span-full py-6 text-center text-xs text-muted-foreground">No indicators available.</div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Trend */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            {direction === "UP" ? <TrendingUp className="h-4 w-4 text-emerald-400" /> :
             direction === "DOWN" ? <TrendingDown className="h-4 w-4 text-red-400" /> :
             <Minus className="h-4 w-4 text-muted-foreground" />}
            <h3 className="text-sm font-semibold">Trend</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Direction</span>
              <Badge variant="outline" className={gainBg(direction === "UP" ? 1 : direction === "DOWN" ? -1 : 0)}>{direction}</Badge>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-muted-foreground">Strength</span>
                <span className={`tabular ${trendColor(direction)}`}>{strength.toFixed(0)}%</span>
              </div>
              <Progress value={strength} className="h-1.5" />
            </div>
            <Row label="Duration" value={`${trend.durationBars} bars`} />
            <Row label="Momentum" value={fmtPrice(trend.momentum, 4)} className={gainColor(trend.momentum)} />
            <Row label="Volatility" value={fmtPrice(trend.volatility, 4)} />
            <Row label="Drawdown" value={fmtPct(trend.drawdown * 100)} className={drawdownColor(trend.drawdown)} />
            <Row label="Support" value={fmtPrice(trend.support)} />
            <Row label="Resistance" value={fmtPrice(trend.resistance)} />
            <div className="flex gap-2 pt-1">
              {trend.breakout && <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Breakout</Badge>}
              {trend.breakdown && <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Breakdown</Badge>}
              {!trend.breakout && !trend.breakdown && <span className="text-xs text-muted-foreground">No breakout/breakdown signal</span>}
            </div>
          </div>
        </Card>

        {/* Regime */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-semibold">Regime</h3>
          </div>
          <div className="mb-3">
            <Badge variant="outline" className={`px-3 py-1 text-sm ${regimeColor(regime)}`}>{regime}</Badge>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {REGIME_DESCRIPTION[regime] ?? "Regime not explicitly classified. Engine is monitoring structure."}
          </p>
        </Card>

        {/* Quote snapshot */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Quote Snapshot</h3>
          <div className="space-y-2 text-sm">
            <Row label="Last Price" value={fmtPrice(quote.price)} />
            <Row label="Bid" value={fmtPrice(quote.bid)} />
            <Row label="Ask" value={fmtPrice(quote.ask)} />
            <Row label="Spread" value={fmtPrice(quote.spread, 4)} />
            <Row label="24h Volume" value={fmtCompact(quote.volume24h)} />
            <Row label="24h Change" value={fmtPct(quote.changePct)} className={gainColor(quote.changePct)} />
            <Row label="Bid Value" value={fmtUsd(quote.bid)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Header({ symbol }: { symbol: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-2xl font-bold tracking-tight">{symbol}</h2>
      <p className="text-sm text-muted-foreground">Single-asset analysis: price action, indicators, trend, and regime classification.</p>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular ${className ?? ""}`}>{value}</span>
    </div>
  );
}
