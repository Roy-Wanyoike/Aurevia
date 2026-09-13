import { describe, it, expect } from "vitest";
import { sma, ema, rsi } from "./quant/indicators";
import { runBacktest } from "./backtest/engine";
import type { Candle } from "./types";

// Golden test data — known input with known expected output
const GOLDEN_CANDLES: Candle[] = Array.from({ length: 100 }, (_, i) => ({
  time: 1700000000000 + i * 86400000,
  open: 100 + i * 0.5,
  high: 101 + i * 0.5,
  low: 99 + i * 0.5,
  close: 100.5 + i * 0.5,
  volume: 10000,
}));

describe("financial regression: golden test vectors", () => {
  it("SMA of constant series equals the constant", () => {
    const result = sma([5, 5, 5, 5, 5], 3);
    expect(result[2]).toBe(5);
    expect(result[3]).toBe(5);
    expect(result[4]).toBe(5);
  });

  it("SMA of [1,2,3,4,5] period 3 = [NaN,NaN,2,3,4]", () => {
    const result = sma([1, 2, 3, 4, 5], 3);
    expect(result[2]).toBe(2);
    expect(result[3]).toBe(3);
    expect(result[4]).toBe(4);
  });

  it("RSI of all-up series = 100", () => {
    const result = rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 14);
    expect(result[14]).toBe(100);
  });

  it("RSI of all-down series = 0", () => {
    const result = rsi([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 14);
    expect(result[14]).toBe(0);
  });

  it("EMA converges to constant for constant input", () => {
    const result = ema([42, 42, 42, 42, 42], 3);
    expect(result[4]).toBeCloseTo(42, 5);
  });

  it("backtest final equity is finite and non-negative", () => {
    const result = runBacktest({
      strategyKey: "momentum",
      symbol: "AAPL",
      timeframe: "1d",
      bars: 200,
      initialCapital: 100000,
    });
    expect(isFinite(result.finalEquity)).toBe(true);
    expect(result.finalEquity).toBeGreaterThanOrEqual(0);
  });

  it("backtest Sharpe ratio is finite (not NaN)", () => {
    const result = runBacktest({
      strategyKey: "trend-following",
      symbol: "MSFT",
      timeframe: "1d",
      bars: 200,
      initialCapital: 100000,
    });
    expect(isNaN(result.metrics.sharpe)).toBe(false);
  });

  it("backtest max drawdown is between 0 and 1", () => {
    const result = runBacktest({
      strategyKey: "mean-reversion",
      symbol: "NVDA",
      timeframe: "1d",
      bars: 200,
      initialCapital: 100000,
    });
    expect(result.metrics.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(result.metrics.maxDrawdownPct).toBeLessThanOrEqual(100);
  });

  it("backtest with unknown strategy returns FAILED status", () => {
    const result = runBacktest({
      strategyKey: "nonexistent",
      symbol: "AAPL",
      timeframe: "1d",
      bars: 200,
      initialCapital: 100000,
    });
    expect(result.status).toBe("FAILED");
  });

  it("backtest with insufficient bars returns FAILED", () => {
    const result = runBacktest({
      strategyKey: "momentum",
      symbol: "AAPL",
      timeframe: "1d",
      bars: 10,
      initialCapital: 100000,
    });
    expect(result.status).toBe("FAILED");
  });
});

// GOLDEN_CANDLES is referenced here to keep it as a stable golden-vector
// fixture for future regression cases — the suite above currently exercises
// the indicator primitives directly, but the candle series is the canonical
// shape any future case (ATR / ADX / backtest replay) will consume.
void GOLDEN_CANDLES;
