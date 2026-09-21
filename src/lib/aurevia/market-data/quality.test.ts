import { describe, it, expect } from "vitest";
import {
  computeDataQuality,
  FRESHNESS_WINDOW_MS_100,
  FRESHNESS_WINDOW_MS_0,
} from "./quality";
import type { Candle } from "../types";

const NOW = Date.now();
const DAY_MS = 86_400_000;

function candle(time: number, close: number, open?: number): Candle {
  const o = open ?? close;
  return {
    time,
    open: o,
    high: Math.max(o, close),
    low: Math.min(o, close),
    close,
    volume: 1000,
  };
}

function freshSeries(n: number, intervalMs: number = DAY_MS): Candle[] {
  // Most-recent bar is "now - intervalMs" so freshness lands at 100.
  const out: Candle[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(candle(NOW - i * intervalMs, 100 + i * 0.01));
  }
  return out;
}

describe("computeDataQuality", () => {
  // --- Empty / null input ---

  it("returns zeroed score for empty array", () => {
    const q = computeDataQuality([], "simulated");
    expect(q.score).toBe(0);
    expect(q.freshness).toBe(0);
    expect(q.completeness).toBe(0);
    expect(q.accuracy).toBe(0);
    expect(q.gaps).toBe(0);
    expect(q.outliers).toBe(0);
    expect(q.source).toBe("simulated");
    expect(q.lastUpdate).toBe(0);
  });

  it("returns zeroed score for null input", () => {
    const q = computeDataQuality(null);
    expect(q.score).toBe(0);
  });

  it("returns zeroed score for undefined input", () => {
    const q = computeDataQuality(undefined);
    expect(q.score).toBe(0);
  });

  // --- Fresh candles ---

  it("returns high score for fresh, complete, accurate series", () => {
    const candles = freshSeries(60);
    const q = computeDataQuality(candles, "polygon");
    expect(q.freshness).toBe(100);
    expect(q.completeness).toBe(100);
    expect(q.accuracy).toBe(100);
    expect(q.score).toBeGreaterThanOrEqual(95);
    expect(q.gaps).toBe(0);
    expect(q.outliers).toBe(0);
    expect(q.source).toBe("polygon");
  });

  it("single fresh candle returns 100 freshness, 100 completeness, 100 accuracy", () => {
    const candles = [candle(NOW - 60_000, 100)];
    const q = computeDataQuality(candles);
    expect(q.freshness).toBe(100);
    expect(q.completeness).toBe(100);
    expect(q.accuracy).toBe(100);
  });

  // --- Stale candles (freshness decay) ---

  it("freshness = 0 when last candle is older than FRESHNESS_WINDOW_MS_0", () => {
    const candles = [candle(NOW - FRESHNESS_WINDOW_MS_0 - 1, 100)];
    const q = computeDataQuality(candles);
    expect(q.freshness).toBe(0);
  });

  it("freshness = 100 when last candle is within FRESHNESS_WINDOW_MS_100", () => {
    const candles = [candle(NOW - FRESHNESS_WINDOW_MS_100 + 60_000, 100)];
    const q = computeDataQuality(candles);
    expect(q.freshness).toBe(100);
  });

  it("freshness is between 0 and 100 when age is in the ramp window", () => {
    const midAge = (FRESHNESS_WINDOW_MS_100 + FRESHNESS_WINDOW_MS_0) / 2;
    const candles = [candle(NOW - midAge, 100)];
    const q = computeDataQuality(candles);
    expect(q.freshness).toBeGreaterThan(0);
    expect(q.freshness).toBeLessThan(100);
  });

  // --- Gapped candles (completeness decay) ---

  it("detects time gaps and lowers completeness", () => {
    // 5 candles at daily interval, but a 5-day gap between bars 3 and 4 —
    // interval jumps from 1 day to 5 days, well over the 2× threshold.
    const candles = [
      candle(NOW - 6 * DAY_MS, 100),
      candle(NOW - 5 * DAY_MS, 101),
      candle(NOW - 4 * DAY_MS, 102),
      // 5-day gap:
      candle(NOW - DAY_MS, 103),
      candle(NOW, 104),
    ];
    const q = computeDataQuality(candles);
    expect(q.gaps).toBeGreaterThanOrEqual(1);
    expect(q.completeness).toBeLessThan(100);
  });

  it("completeness stays 100 with uniform intervals", () => {
    const candles = freshSeries(30);
    const q = computeDataQuality(candles);
    expect(q.gaps).toBe(0);
    expect(q.completeness).toBe(100);
  });

  // --- Outlier candles (accuracy decay) ---

  it("detects outlier bar (>20% move) and lowers accuracy", () => {
    const candles = [
      candle(NOW - 4 * DAY_MS, 100),
      candle(NOW - 3 * DAY_MS, 101),
      candle(NOW - 2 * DAY_MS, 102),
      // >20% jump:
      candle(NOW - DAY_MS, 130),
      candle(NOW, 131),
    ];
    const q = computeDataQuality(candles);
    expect(q.outliers).toBeGreaterThanOrEqual(1);
    expect(q.accuracy).toBeLessThan(100);
  });

  it("accuracy stays 100 when moves are within OUTLIER_CHANGE_PCT", () => {
    const candles = [
      candle(NOW - 4 * DAY_MS, 100),
      candle(NOW - 3 * DAY_MS, 105), // 5%
      candle(NOW - 2 * DAY_MS, 110), // ~4.8%
      candle(NOW - DAY_MS, 115), // ~4.5%
      candle(NOW, 120), // ~4.3%
    ];
    const q = computeDataQuality(candles);
    expect(q.outliers).toBe(0);
    expect(q.accuracy).toBe(100);
  });

  it("outlier threshold exactly at OUTLIER_CHANGE_PCT does not fire", () => {
    // change of exactly 0.20 should NOT be > 0.20 — boundary check.
    const candles = [
      candle(NOW - DAY_MS, 100),
      candle(NOW, 120), // exactly 20% — not >20%
    ];
    const q = computeDataQuality(candles);
    expect(q.outliers).toBe(0);
  });

  it("handles zero-priced prior bar without throwing", () => {
    const candles = [
      candle(NOW - DAY_MS, 0),
      candle(NOW, 100),
    ];
    expect(() => computeDataQuality(candles)).not.toThrow();
    const q = computeDataQuality(candles);
    // 0-priced prior bar is skipped (division guard), so no outlier detected.
    expect(q.outliers).toBe(0);
  });

  // --- Composite weighting ---

  it("composite score weights freshness 40%, completeness 30%, accuracy 30%", () => {
    // Construct a series with: freshness=100, completeness=100, accuracy=80
    // expected composite = 100*0.4 + 100*0.3 + 80*0.3 = 40+30+24 = 94
    const candles = [
      candle(NOW - 4 * DAY_MS, 100),
      candle(NOW - 3 * DAY_MS, 100),
      candle(NOW - 2 * DAY_MS, 100),
      candle(NOW - DAY_MS, 100),
      candle(NOW, 130), // 30% jump — outlier
    ];
    const q = computeDataQuality(candles);
    expect(q.freshness).toBe(100);
    expect(q.completeness).toBe(100);
    // 1 outlier out of 5 = accuracy 80
    expect(q.accuracy).toBe(80);
    expect(q.score).toBe(94);
  });

  // --- Source propagation ---

  it("propagates the source string through the result", () => {
    const q = computeDataQuality(freshSeries(5), "alpaca");
    expect(q.source).toBe("alpaca");
  });

  it("defaults source to 'simulated' when not specified", () => {
    const q = computeDataQuality(freshSeries(5));
    expect(q.source).toBe("simulated");
  });

  // --- lastUpdate propagation ---

  it("lastUpdate reflects the last candle's time", () => {
    const last = NOW - 60_000;
    const candles = [candle(NOW - DAY_MS, 100), candle(last, 101)];
    const q = computeDataQuality(candles);
    expect(q.lastUpdate).toBe(last);
  });
});
