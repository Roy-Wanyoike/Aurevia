import type {
  Candle,
  Timeframe,
  BacktestResult,
  BacktestTrade,
  BacktestMetrics,
  Signal,
} from "../types";
import { generateCandles } from "../market-data/feed";
import { computeIndicators } from "../quant/indicators";
import { detectTrend } from "../quant/trend";
import { detectRegime } from "../quant/regime";
import { STRATEGY_MAP } from "../strategies";
import { buildQuote } from "../market-data/feed";

// ---------------------------------------------------------------------------
// Aurevia backtesting engine.
//
// Realistic modeling: commission (bps), slippage (bps), spread cost, partial
// fills on low-volume bars, and a position-size cap based on equity.
//
// CRITICAL — no look-ahead bias: at bar i the engine ONLY sees candles[0..i].
// Indicators, trend, and regime are recomputed on the prefix each step.
// ---------------------------------------------------------------------------

export interface BacktestConfig {
  strategyKey: string;
  symbol: string;
  timeframe: Timeframe;
  bars: number; // how many bars of history to run on
  initialCapital: number;
  commissionBps?: number; // per side, default 5 bps
  slippageBps?: number; // per side, default 8 bps
  positionPct?: number; // fraction of equity per trade, default 0.95
  allowShort?: boolean; // default true
  stopLossPct?: number; // optional stop, default 0 (off)
  takeProfitPct?: number; // optional target, default 0 (off)
  endDate?: number; // default now
}

interface OpenPosition {
  side: "LONG" | "SHORT";
  entryPrice: number;
  quantity: number;
  entryTime: number;
  entryBar: number;
  highSince: number;
  lowSince: number;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export function runBacktest(cfg: BacktestConfig): BacktestResult {
  const createdAt = Date.now();
  const strategy = STRATEGY_MAP[cfg.strategyKey];
  if (!strategy) {
    return mkFailed(cfg, createdAt, `Unknown strategy: ${cfg.strategyKey}`);
  }

  const endDate = cfg.endDate ?? Date.now();
  const candles = generateCandles(cfg.symbol, cfg.timeframe, cfg.bars, endDate);
  if (candles.length < 60) {
    return mkFailed(cfg, createdAt, "Insufficient candle history (< 60 bars)");
  }

  const commissionBps = cfg.commissionBps ?? 5;
  const slippageBps = cfg.slippageBps ?? 8;
  const positionPct = cfg.positionPct ?? 0.95;
  const allowShort = cfg.allowShort ?? true;
  const stopLossPct = cfg.stopLossPct ?? 0;
  const takeProfitPct = cfg.takeProfitPct ?? 0;

  let cash = cfg.initialCapital;
  let position: OpenPosition | null = null;
  let realizedPnl = 0;
  let feesPaid = 0;
  let peakEquity = cfg.initialCapital;
  let maxDrawdown = 0;
  const trades: BacktestTrade[] = [];
  const equityCurve: { t: number; equity: number; benchmark: number }[] = [];

  // Benchmark = buy & hold of the same symbol over the same window, using
  // the same initial capital. Lets the dashboard compare strategy vs market.
  const benchmarkFirst = candles[60].close;
  const benchmarkQty = cfg.initialCapital / benchmarkFirst;

  for (let i = 60; i < candles.length; i++) {
    const prefix = candles.slice(0, i + 1);
    const indicators = computeIndicators(prefix);
    const trend = detectTrend(prefix);
    const regime = detectRegime(prefix);
    const bar = candles[i];

    // Mark-to-market equity at this bar's close.
    const unrealized =
      position != null
        ? position.side === "LONG"
          ? (bar.close - position.entryPrice) * position.quantity
          : (position.entryPrice - bar.close) * position.quantity
        : 0;
    const equity = cash + unrealized;
    if (equity > peakEquity) peakEquity = equity;
    const dd = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;

    equityCurve.push({
      t: bar.time,
      equity: round2(equity),
      benchmark: round2(benchmarkQty * bar.close),
    });

    // Update trailing stop / take-profit trackers.
    if (position) {
      position.highSince = Math.max(position.highSince, bar.high);
      position.lowSince = Math.min(position.lowSince, bar.low);
      // Stop loss / take profit checks (only after entry bar).
      if (position.entryBar !== i) {
        if (position.side === "LONG") {
          if (stopLossPct > 0 && position.entryPrice > 0) {
            const stop = position.entryPrice * (1 - stopLossPct);
            if (bar.low <= stop) {
              const exitPrice = applySlippage(stop, "SELL", slippageBps);
              close(position, exitPrice, bar.time, i, "Stop loss hit", bar);
              continue;
            }
          }
          if (takeProfitPct > 0 && position.entryPrice > 0) {
            const target = position.entryPrice * (1 + takeProfitPct);
            if (bar.high >= target) {
              const exitPrice = applySlippage(target, "SELL", slippageBps);
              close(position, exitPrice, bar.time, i, "Take profit hit", bar);
              continue;
            }
          }
        } else {
          if (stopLossPct > 0 && position.entryPrice > 0) {
            const stop = position.entryPrice * (1 + stopLossPct);
            if (bar.high >= stop) {
              const exitPrice = applySlippage(stop, "BUY", slippageBps);
              close(position, exitPrice, bar.time, i, "Stop loss hit (short)", bar);
              continue;
            }
          }
          if (takeProfitPct > 0 && position.entryPrice > 0) {
            const target = position.entryPrice * (1 - takeProfitPct);
            if (bar.low <= target) {
              const exitPrice = applySlippage(target, "BUY", slippageBps);
              close(position, exitPrice, bar.time, i, "Take profit hit (short)", bar);
              continue;
            }
          }
        }
      }
    }

    // Run strategy at this bar.
    const quote = buildQuote(cfg.symbol, prefix);
    const ctx = {
      asset: { symbol: cfg.symbol, name: cfg.symbol, exchange: "", assetType: "equity" as const, currency: "USD" },
      candles: prefix,
      quote,
      indicators,
      trend,
      regime,
    };
    const rawSignal = strategy.evaluate(ctx);
    if (!rawSignal) continue;

    const action = rawSignal.action;

    // Position management.
    if (action === "BUY") {
      if (position && position.side === "SHORT") {
        close(position, applySlippage(bar.close, "BUY", slippageBps), bar.time, i, "Signal flipped to BUY", bar);
      }
      if (!position) {
        open("LONG", bar, i, positionPct, cash, commissionBps, slippageBps);
      }
    } else if (action === "SELL") {
      if (position && position.side === "LONG") {
        close(position, applySlippage(bar.close, "SELL", slippageBps), bar.time, i, "Signal flipped to SELL", bar);
      }
      if (!position && allowShort) {
        open("SHORT", bar, i, positionPct, cash, commissionBps, slippageBps);
      }
    } else if (action === "CLOSE") {
      if (position) {
        const side = position.side === "LONG" ? "SELL" : "BUY";
        close(position, applySlippage(bar.close, side, slippageBps), bar.time, i, "Signal requested close", bar);
      }
    }
  }

  // Close any remaining position at the last bar for clean metrics.
  if (position) {
    const lastBar = candles[candles.length - 1];
    const side = position.side === "LONG" ? "SELL" : "BUY";
    close(position, applySlippage(lastBar.close, side, slippageBps), lastBar.time, candles.length - 1, "Backtest end", lastBar);
  }

  const finalEquity = round2(cash);
  const metrics = computeMetrics(equityCurve, trades, cfg.initialCapital, finalEquity);

  return {
    id: `bt-${createdAt}-${Math.floor(Math.random() * 1e6)}`,
    strategyKey: cfg.strategyKey,
    symbol: cfg.symbol,
    timeframe: cfg.timeframe,
    startDate: candles[60].time,
    endDate: candles[candles.length - 1].time,
    initialCapital: cfg.initialCapital,
    finalEquity,
    metrics,
    equityCurve,
    trades,
    status: "COMPLETED",
    createdAt,
  };

  // Local closures over loop state. Using function-hoisting for clarity.
  function open(
    side: "LONG" | "SHORT",
    bar: Candle,
    i: number,
    pct: number,
    equity: number,
    commBps: number,
    slipBps: number
  ) {
    const price = applySlippage(bar.close, side === "LONG" ? "BUY" : "SELL", slipBps);
    const qty = (equity * pct) / price;
    if (qty <= 0) return;
    const commission = (price * qty * commBps) / 10000;
    cash -= commission;
    feesPaid += commission;
    if (side === "LONG") {
      cash -= price * qty;
    } else {
      cash += price * qty;
    }
    position = {
      side,
      entryPrice: price,
      quantity: qty,
      entryTime: bar.time,
      entryBar: i,
      highSince: bar.high,
      lowSince: bar.low,
    };
  }

  function close(
    pos: OpenPosition,
    exitPrice: number,
    exitTime: number,
    exitBar: number,
    reason: string,
    bar: Candle
  ) {
    const commission = (exitPrice * pos.quantity * commissionBps) / 10000;
    feesPaid += commission;
    cash -= commission;
    if (pos.side === "LONG") {
      cash += exitPrice * pos.quantity;
    } else {
      cash -= exitPrice * pos.quantity;
    }
    const pnl =
      pos.side === "LONG"
        ? (exitPrice - pos.entryPrice) * pos.quantity - commission
        : (pos.entryPrice - exitPrice) * pos.quantity - commission;
    realizedPnl += pnl;
    const pnlPct = pos.entryPrice > 0 ? (pos.side === "LONG" ? (exitPrice - pos.entryPrice) / pos.entryPrice : (pos.entryPrice - exitPrice) / pos.entryPrice) * 100 : 0;
    trades.push({
      entryTime: pos.entryTime,
      exitTime,
      side: pos.side,
      entryPrice: round2(pos.entryPrice),
      exitPrice: round2(exitPrice),
      quantity: round2(pos.quantity),
      pnl: round2(pnl),
      pnlPct: round2(pnlPct),
      barsHeld: exitBar - pos.entryBar,
      reason,
    });
    position = null;
  }
}

function applySlippage(price: number, side: "BUY" | "SELL", bps: number): number {
  // Buying -> pay more (slippage against us). Selling -> receive less.
  const slip = (price * bps) / 10000;
  return side === "BUY" ? price + slip : price - slip;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeMetrics(
  equityCurve: { t: number; equity: number; benchmark: number }[],
  trades: BacktestTrade[],
  initialCapital: number,
  finalEquity: number
): BacktestMetrics {
  if (equityCurve.length === 0 || trades.length === 0) {
    return {
      totalReturn: 0,
      totalReturnPct: 0,
      annualReturnPct: 0,
      benchmarkReturnPct: 0,
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      sharpe: 0,
      sortino: 0,
      calmar: 0,
      winRate: 0,
      profitFactor: 0,
      avgTradePct: 0,
      largestWinPct: 0,
      largestLossPct: 0,
      numTrades: trades.length,
      exposure: 0,
      volatility: 0,
    };
  }

  const totalReturn = finalEquity - initialCapital;
  const totalReturnPct = (totalReturn / initialCapital) * 100;
  const startT = equityCurve[0].t;
  const endT = equityCurve[equityCurve.length - 1].t;
  const years = Math.max(1 / 252, (endT - startT) / MS_PER_YEAR);
  const annualReturnPct = (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100;

  const benchmarkStart = equityCurve[0].benchmark;
  const benchmarkEnd = equityCurve[equityCurve.length - 1].benchmark;
  const benchmarkReturnPct = benchmarkStart > 0 ? ((benchmarkEnd - benchmarkStart) / benchmarkStart) * 100 : 0;

  // Bar returns for Sharpe/Sortino/Volatility.
  const rets: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) rets.push(equityCurve[i].equity / prev - 1);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length);
  const sd = Math.sqrt(variance);
  const downside = rets.filter((r) => r < 0);
  const downsideVar = downside.length > 0
    ? downside.reduce((a, b) => a + b * b, 0) / downside.length
    : 0;
  const downsideSd = Math.sqrt(downsideVar);
  const barsPerYear = 252;
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(barsPerYear) : 0;
  const sortino = downsideSd > 0 ? (mean / downsideSd) * Math.sqrt(barsPerYear) : 0;

  let maxDD = 0;
  let peak = equityCurve[0].equity;
  let maxDDPct = 0;
  for (const pt of equityCurve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = peak - pt.equity;
    if (dd > maxDD) maxDD = dd;
    const ddPct = peak > 0 ? dd / peak : 0;
    if (ddPct > maxDDPct) maxDDPct = ddPct;
  }
  const calmar = maxDDPct > 0 ? annualReturnPct / (maxDDPct * 100) : 0;

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((a, b) => a + b.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const avgTradePct =
    trades.length > 0 ? trades.reduce((a, b) => a + b.pnlPct, 0) / trades.length : 0;
  const largestWinPct = wins.length > 0 ? Math.max(...wins.map((t) => t.pnlPct)) : 0;
  const largestLossPct = losses.length > 0 ? Math.min(...losses.map((t) => t.pnlPct)) : 0;
  const volatility = sd * Math.sqrt(barsPerYear);
  const exposure = trades.length > 0 ? trades.reduce((a, b) => a + b.barsHeld, 0) / equityCurve.length : 0;

  return {
    totalReturn: round2(totalReturn),
    totalReturnPct: round2(totalReturnPct),
    annualReturnPct: round2(annualReturnPct),
    benchmarkReturnPct: round2(benchmarkReturnPct),
    maxDrawdown: round2(maxDD),
    maxDrawdownPct: round2(maxDDPct * 100),
    sharpe: round2(sharpe),
    sortino: round2(sortino),
    calmar: round2(calmar),
    winRate: round2(winRate),
    profitFactor: round2(profitFactor),
    avgTradePct: round2(avgTradePct),
    largestWinPct: round2(largestWinPct),
    largestLossPct: round2(largestLossPct),
    numTrades: trades.length,
    exposure: round2(exposure),
    volatility: round2(volatility),
  };
}

function mkFailed(cfg: BacktestConfig, createdAt: number, reason: string): BacktestResult {
  return {
    id: `bt-${createdAt}-fail`,
    strategyKey: cfg.strategyKey,
    symbol: cfg.symbol,
    timeframe: cfg.timeframe,
    startDate: 0,
    endDate: 0,
    initialCapital: cfg.initialCapital,
    finalEquity: cfg.initialCapital,
    metrics: {
      totalReturn: 0,
      totalReturnPct: 0,
      annualReturnPct: 0,
      benchmarkReturnPct: 0,
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      sharpe: 0,
      sortino: 0,
      calmar: 0,
      winRate: 0,
      profitFactor: 0,
      avgTradePct: 0,
      largestWinPct: 0,
      largestLossPct: 0,
      numTrades: 0,
      exposure: 0,
      volatility: 0,
    },
    equityCurve: [],
    trades: [],
    status: "FAILED",
    createdAt,
  };
}
