import type { Candle, Regime } from "../types";
import { rsi, adx, bollingerBands } from "./indicators";
import { detectTrend } from "./trend";

// ---------------------------------------------------------------------------
// Market regime detection. Combines trend direction, volatility, RSI
// extremes, ADX strength, and drawdown to classify the current market state.
// Deterministic — same candles always produce the same regime.
// ---------------------------------------------------------------------------

export function detectRegime(candles: Candle[]): Regime {
  if (candles.length < 60) return "SIDEWAYS";
  const closes = candles.map((c) => c.close);
  const last = closes.length - 1;
  const trend = detectTrend(candles);
  const rsiArr = rsi(closes, 14);
  const { adx: adxArr } = adx(candles, 14);
  const bb = bollingerBands(closes, 20, 2);
  const rsiVal = lastVal(rsiArr, last);
  const adxVal = lastVal(adxArr, last);
  const price = closes[last];
  const bbUpper = lastVal(bb.upper, last);
  const bbLower = lastVal(bb.lower, last);
  const bbMid = lastVal(bb.mid, last);

  // Crash: very large down bar plus elevated volatility.
  const recent = closes.slice(-5);
  const drop5 = recent[0] ? (recent[recent.length - 1] - recent[0]) / recent[0] : 0;
  if (drop5 < -0.08 && trend.volatility > 0.4) return "CRASH";

  // High volatility with no clear trend.
  if (trend.volatility > 0.45 && trend.strength < 0.35) return "HIGH_VOLATILITY";
  if (trend.volatility < 0.12 && trend.strength < 0.3) return "LOW_VOLATILITY";

  // Accumulation / distribution: sideways with rising/falling volume-weighted
  // price position inside the Bollinger band.
  const bbPos = bbMid !== 0 ? (price - bbLower) / (bbUpper - bbLower) : 0.5;
  if (trend.direction === "FLAT") {
    if (rsiVal < 40 && bbPos < 0.4) return "ACCUMULATION";
    if (rsiVal > 60 && bbPos > 0.6) return "DISTRIBUTION";
    return "SIDEWAYS";
  }

  // Breakout / breakdown: price at band extreme + ADX rising + trend fresh.
  if (trend.direction === "UP" && price > bbUpper * 0.995 && adxVal > 25 && trend.durationBars < 8) {
    return "BREAKOUT";
  }
  if (trend.direction === "DOWN" && price < bbLower * 1.005 && adxVal > 25 && trend.durationBars < 8) {
    return "BREAKDOWN";
  }

  // Recovery: trend still down but momentum turning up + RSI rising from oversold.
  if (trend.direction === "DOWN" && trend.momentum > 0 && rsiVal > 45 && rsiVal < 60) {
    return "RECOVERY";
  }

  if (trend.direction === "UP" && adxVal > 20) return "BULL";
  if (trend.direction === "DOWN" && adxVal > 20) return "BEAR";

  return "SIDEWAYS";
}

function lastVal(arr: number[], i: number): number {
  for (let j = i; j >= 0; j--) {
    if (!isNaN(arr[j])) return arr[j];
  }
  return 0;
}
