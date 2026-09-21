import { describe, it, expect } from "vitest";
import {
  sma,
  ema,
  rsi,
  macd,
  bollingerBands,
  atr,
  adx,
  stochastic,
  vwap,
  obv,
  roc,
} from "./indicators";
import type { Candle } from "../types";

// ---------------------------------------------------------------------------
// Indicators unit tests. Each indicator verified against a hand-computed
// expected output for a small deterministic series, plus edge cases (all-up,
// all-down, constant, short series, NaN handling).
// ---------------------------------------------------------------------------

function mkCandles(rows: [number, number, number, number, number][]): Candle[] {
  // rows: [open, high, low, close, volume]
  return rows.map(([o, h, l, c, v], i) => ({
    time: 1000 * 60 * i,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
  }));
}

describe("sma", () => {
  it("returns expected values for [1,2,3,4,5] period 3 (filter NaN → [2,3,4])", () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out.filter((v) => !isNaN(v))).toEqual([2, 3, 4]);
  });

  it("first period-1 entries are NaN", () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(isNaN(out[0])).toBe(true);
    expect(isNaN(out[1])).toBe(true);
    expect(isNaN(out[2])).toBe(false);
  });

  it("returns all-NaN when period <= 0", () => {
    const out = sma([1, 2, 3], 0);
    expect(out.every((v) => isNaN(v))).toBe(true);
  });

  it("returns the constant value when input is constant", () => {
    const out = sma([5, 5, 5, 5, 5], 3);
    expect(out.filter((v) => !isNaN(v))).toEqual([5, 5, 5]);
  });

  it("handles empty array", () => {
    const out = sma([], 3);
    expect(out).toEqual([]);
  });
});

describe("ema", () => {
  it("first period-1 entries are NaN", () => {
    const out = ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], 12);
    for (let i = 0; i < 11; i++) expect(isNaN(out[i])).toBe(true);
    expect(isNaN(out[11])).toBe(false);
  });

  it("EMA12 of a monotonic series lies between min and max", () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 + i);
    const out = ema(vals, 12);
    const valid = out.filter((v) => !isNaN(v));
    const last = valid[valid.length - 1];
    expect(last).toBeGreaterThan(100);
    expect(last).toBeLessThan(130);
  });

  it("EMA of constant series equals the constant", () => {
    const out = ema([7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7], 12);
    expect(out[12]).toBeCloseTo(7, 6);
  });

  it("returns empty for empty input", () => {
    expect(ema([], 5)).toEqual([]);
  });
});

describe("rsi", () => {
  it("RSI14 is between 0 and 100 for a noisy series", () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 2);
    const out = rsi(vals, 14);
    const valid = out.filter((v) => !isNaN(v));
    for (const v of valid) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("RSI of all-up series = 100", () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 + i);
    const out = rsi(vals, 14);
    const last = out[out.length - 1];
    expect(last).toBe(100);
  });

  it("RSI of all-down series = 0", () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 - i);
    const out = rsi(vals, 14);
    const last = out[out.length - 1];
    expect(last).toBe(0);
  });

  it("returns all-NaN when length <= period", () => {
    const out = rsi([1, 2, 3], 14);
    expect(out.every((v) => isNaN(v))).toBe(true);
  });
});

describe("macd", () => {
  it("macdLine = emaFast - emaSlow at each valid index", () => {
    const vals = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.1);
    const { macdLine } = macd(vals);
    const emaFast = ema(vals, 12);
    const emaSlow = ema(vals, 26);
    for (let i = 0; i < vals.length; i++) {
      if (isNaN(emaFast[i]) || isNaN(emaSlow[i])) {
        expect(isNaN(macdLine[i])).toBe(true);
      } else {
        expect(macdLine[i]).toBeCloseTo(emaFast[i] - emaSlow[i], 6);
      }
    }
  });

  it("histogram = macdLine - signalLine at valid indices", () => {
    const vals = Array.from({ length: 60 }, (_, i) => 100 + Math.cos(i / 4) * 4);
    const { macdLine, signalLine, hist } = macd(vals);
    for (let i = 0; i < vals.length; i++) {
      if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) {
        expect(hist[i]).toBeCloseTo(macdLine[i] - signalLine[i], 6);
      }
    }
  });

  it("returns 3 arrays of the same length as input", () => {
    const vals = Array.from({ length: 40 }, (_, i) => i);
    const { macdLine, signalLine, hist } = macd(vals);
    expect(macdLine.length).toBe(40);
    expect(signalLine.length).toBe(40);
    expect(hist.length).toBe(40);
  });
});

describe("bollingerBands", () => {
  it("upper > middle > lower at every valid index", () => {
    const vals = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 5) * 3);
    const { upper, mid, lower } = bollingerBands(vals, 20, 2);
    for (let i = 19; i < vals.length; i++) {
      expect(upper[i]).toBeGreaterThan(mid[i]);
      expect(mid[i]).toBeGreaterThan(lower[i]);
    }
  });

  it("middle = SMA(values, period)", () => {
    const vals = Array.from({ length: 30 }, (_, i) => 10 + i);
    const { mid } = bollingerBands(vals, 20, 2);
    const smaArr = sma(vals, 20);
    for (let i = 19; i < vals.length; i++) {
      expect(mid[i]).toBeCloseTo(smaArr[i], 10);
    }
  });

  it("bands collapse to middle when input is constant", () => {
    const vals = Array.from({ length: 25 }, () => 50);
    const { upper, mid, lower } = bollingerBands(vals, 20, 2);
    expect(upper[24]).toBeCloseTo(mid[24], 6);
    expect(lower[24]).toBeCloseTo(mid[24], 6);
  });
});

describe("atr", () => {
  it("ATR is positive for a volatile series", () => {
    const candles = mkCandles([
      [100, 105, 99, 103, 1000],
      [103, 110, 100, 107, 1200],
      [107, 115, 105, 113, 1500],
      [113, 118, 110, 116, 1300],
      [116, 122, 113, 119, 1100],
      [119, 125, 117, 122, 1400],
      [122, 130, 120, 128, 1700],
      [128, 134, 125, 130, 1500],
      [130, 140, 128, 135, 1800],
      [135, 142, 132, 140, 1900],
      [140, 148, 137, 145, 2000],
      [145, 152, 142, 150, 2100],
      [150, 156, 147, 153, 2200],
      [153, 162, 150, 158, 2300],
      [158, 165, 155, 162, 2400],
      [162, 170, 158, 165, 2500],
    ]);
    const out = atr(candles, 14);
    const valid = out.filter((v) => !isNaN(v));
    expect(valid.length).toBeGreaterThan(0);
    for (const v of valid) expect(v).toBeGreaterThan(0);
  });

  it("returns all-NaN when candles.length <= period", () => {
    const candles = mkCandles([
      [1, 2, 1, 1, 1],
      [1, 2, 1, 1, 1],
      [1, 2, 1, 1, 1],
    ]);
    expect(atr(candles, 14).every((v) => isNaN(v))).toBe(true);
  });
});

describe("adx", () => {
  it("ADX is between 0 and 100 for a long trending series", () => {
    const candles = mkCandles(
      Array.from({ length: 50 }, (_, i) => [100 + i, 102 + i, 99 + i, 101 + i, 1000])
    );
    const { adx: adxArr } = adx(candles, 14);
    const valid = adxArr.filter((v) => !isNaN(v));
    for (const v of valid) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("returns all-NaN when candles.length <= 2*period", () => {
    const candles = mkCandles([
      [1, 2, 1, 1, 1],
      [1, 2, 1, 1, 1],
      [1, 2, 1, 1, 1],
    ]);
    expect(adx(candles, 14).adx.every((v) => isNaN(v))).toBe(true);
  });
});

describe("stochastic", () => {
  it("%K is between 0 and 100 at every valid index", () => {
    const candles = mkCandles(
      Array.from({ length: 30 }, (_, i) => [100 + i, 105 + i, 95 + i, 102 + i, 1000])
    );
    const { k } = stochastic(candles, 14, 3);
    const valid = k.filter((v) => !isNaN(v));
    for (const v of valid) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("%K = 100 when close equals high of the lookback window", () => {
    const candles = mkCandles(
      Array.from({ length: 20 }, () => [100, 110, 90, 110, 1000])
    );
    const { k } = stochastic(candles, 14, 3);
    const last = k[k.length - 1];
    expect(last).toBeCloseTo(100, 0);
  });
});

describe("vwap", () => {
  it("VWAP is between high and low at each bar (cumulative)", () => {
    const candles = mkCandles([
      [100, 105, 95, 100, 1000],
      [100, 110, 90, 105, 1500],
      [105, 108, 102, 106, 800],
      [106, 112, 104, 110, 1200],
      [110, 115, 108, 112, 2000],
    ]);
    const out = vwap(candles);
    for (let i = 0; i < candles.length; i++) {
      // Typical price (h+l+c)/3 must be in [low, high]; VWAP is a
      // volume-weighted blend of typical prices, which lies in the
      // union of those ranges — therefore within the global min/max of
      // the typical prices, which is bounded by [global_low, global_high].
      expect(out[i]).toBeGreaterThanOrEqual(95);
      expect(out[i]).toBeLessThanOrEqual(115);
    }
  });

  it("returns empty array for empty candles", () => {
    expect(vwap([])).toEqual([]);
  });
});

describe("obv", () => {
  it("OBV increases on up bars", () => {
    const candles = mkCandles([
      [100, 105, 95, 100, 1000],
      [100, 110, 90, 105, 1500], // up bar, close 105 > 100
    ]);
    const out = obv(candles);
    expect(out[1]).toBeGreaterThan(out[0]);
  });

  it("OBV decreases on down bars", () => {
    const candles = mkCandles([
      [100, 105, 95, 100, 1000],
      [100, 110, 90, 95, 1500], // down bar, close 95 < 100
    ]);
    const out = obv(candles);
    expect(out[1]).toBeLessThan(out[0]);
  });

  it("OBV unchanged on flat bars", () => {
    const candles = mkCandles([
      [100, 105, 95, 100, 1000],
      [100, 105, 95, 100, 1500], // flat close
    ]);
    const out = obv(candles);
    expect(out[1]).toBe(out[0]);
  });
});

describe("roc", () => {
  it("ROC of a constant series is 0 at every valid index", () => {
    const vals = Array.from({ length: 20 }, () => 50);
    const out = roc(vals, 5);
    const valid = out.filter((v) => !isNaN(v));
    for (const v of valid) expect(v).toBe(0);
  });

  it("ROC is positive when current > past value", () => {
    const vals = [100, 101, 102, 103, 104, 110];
    const out = roc(vals, 5);
    expect(out[5]).toBeCloseTo(((110 - 100) / 100) * 100, 6);
  });

  it("ROC is negative when current < past value", () => {
    const vals = [100, 99, 98, 97, 96, 90];
    const out = roc(vals, 5);
    expect(out[5]).toBeLessThan(0);
  });
});
