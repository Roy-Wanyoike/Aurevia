import type { Candle, TrendState, TrendDirection } from "../types";
import { sma, ema, atr } from "./indicators";

// ---------------------------------------------------------------------------
// Trend detection. Deterministic. Uses SMA slope, EMA stacking, ADX-like
// strength proxy, drawdown, support/resistance from recent extremes, and
// breakout/breakdown booleans.
// ---------------------------------------------------------------------------

export function detectTrend(candles: Candle[]): TrendState {
  const closes = candles.map((c) => c.close);
  if (closes.length < 50) {
    return {
      direction: "FLAT",
      strength: 0,
      durationBars: closes.length,
      momentum: 0,
      volatility: 0,
      drawdown: 0,
      support: closes[0] ?? 0,
      resistance: closes[0] ?? 0,
      breakout: false,
      breakdown: false,
    };
  }
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const atrArr = atr(candles, 14);
  const last = closes.length - 1;

  const price = closes[last];
  const s20 = sma20[last] || price;
  const s50 = sma50[last] || price;
  const e12 = ema12[last] || price;
  const e26 = ema26[last] || price;

  // Direction via stacking + slope of SMA50 over ~10 bars.
  const slope = (s50 - (sma50[last - 10] || s50)) / (s50 || 1);
  let direction: TrendDirection = "FLAT";
  if (price > s20 && s20 > s50 && slope > 0.0005) direction = "UP";
  else if (price < s20 && s20 < s50 && slope < -0.0005) direction = "DOWN";
  else direction = "FLAT";

  // Strength = normalized ADX-like proxy: |slope| scaled by inverse volatility.
  const atrVal = atrArr[last] || price * 0.02;
  const strengthRaw = Math.abs(slope) / (atrVal / price || 0.01);
  const strength = Math.max(0, Math.min(1, strengthRaw * 20));

  // Duration: number of consecutive bars the SMA20 has stayed on the same side
  // of SMA50.
  let durationBars = 0;
  for (let i = last; i >= 1; i--) {
    const a = sma20[i];
    const b = sma50[i];
    if (isNaN(a) || isNaN(b)) break;
    const sameUp = direction === "UP" && a > b;
    const sameDown = direction === "DOWN" && a < b;
    const sameFlat = direction === "FLAT" && Math.abs(a - b) / b < 0.005;
    if (sameUp || sameDown || sameFlat) durationBars++;
    else break;
  }

  // Momentum: 10-bar rate of change.
  const momentum = closes[last - 10] ? closes[last] / closes[last - 10] - 1 : 0;

  // Volatility: annualized std of log returns over last 20 bars.
  const window = closes.slice(Math.max(0, last - 20), last + 1);
  const rets: number[] = [];
  for (let i = 1; i < window.length; i++) rets.push(Math.log(window[i] / window[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length);
  const volatility = Math.sqrt(variance) * Math.sqrt(252);

  // Drawdown from recent peak (20-bar lookback).
  const peakWindow = closes.slice(Math.max(0, last - 50), last + 1);
  const peak = Math.max(...peakWindow);
  const drawdown = peak > 0 ? (peak - price) / peak : 0;

  // Support / resistance from 50-bar window.
  const srWindow = candles.slice(Math.max(0, last - 50), last + 1);
  const resistance = Math.max(...srWindow.map((c) => c.high));
  const support = Math.min(...srWindow.map((c) => c.low));

  // Breakout / breakdown: close crosses above resistance or below support by
  // a small ATR buffer.
  const buf = atrVal * 0.25;
  const breakout = price > resistance - buf && price >= closes[last - 1];
  const breakdown = price < support + buf && price <= closes[last - 1];

  return {
    direction,
    strength,
    durationBars,
    momentum,
    volatility,
    drawdown,
    support,
    resistance,
    breakout,
    breakdown,
  };
}
