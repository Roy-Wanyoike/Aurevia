import { describe, it, expect } from "vitest";
import {
  momentumStrategy,
  trendFollowingStrategy,
  maCrossoverStrategy,
  meanReversionStrategy,
  breakoutStrategy,
  STRATEGIES,
  STRATEGY_MAP,
  evaluateAll,
} from "./index";
import type { MarketContext, Indicators, Quote, TrendState, AssetInfo, Regime } from "../types";

// ---------------------------------------------------------------------------
// Strategy plugin unit tests. Each strategy is exercised with a hand-crafted
// MarketContext that places its indicators firmly inside / outside its
// trigger zone, verifying the BUY / SELL / null branch and the confidence
// clamping + reasons invariants.
// ---------------------------------------------------------------------------

function asset(): AssetInfo {
  return { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", assetType: "equity", sector: "Technology", currency: "USD" };
}

function quote(price: number): Quote {
  return {
    symbol: "AAPL",
    price,
    bid: price - 0.01,
    ask: price + 0.01,
    spread: 0.02,
    volume24h: 1_000_000,
    changePct: 0,
    timestamp: Date.now(),
  };
}

function trend(overrides: Partial<TrendState> = {}): TrendState {
  return {
    direction: "UP",
    strength: 0.6,
    durationBars: 30,
    momentum: 0.05,
    volatility: 0.2,
    drawdown: 0.02,
    support: 95,
    resistance: 110,
    breakout: false,
    breakdown: false,
    ...overrides,
  };
}

function indicators(overrides: Partial<Indicators> = {}): Indicators {
  return {
    sma20: 105,
    sma50: 100,
    sma200: 90,
    ema12: 106,
    ema26: 102,
    rsi14: 60,
    macd: 1.5,
    macdSignal: 1.2,
    macdHist: 0.3,
    bollingerUpper: 115,
    bollingerMiddle: 105,
    bollingerLower: 95,
    atr14: 2.5,
    adx14: 30,
    stochasticK: 70,
    stochasticD: 65,
    vwap: 105,
    obv: 1000,
    roc: 1.2,
    volatility: 0.25,
    momentum: 0.05,
    ...overrides,
  };
}

function ctx(overrides: Partial<MarketContext> = {}): MarketContext {
  return {
    asset: asset(),
    candles: [],
    quote: quote(108),
    indicators: indicators(),
    trend: trend(),
    regime: "BULL" as Regime,
    ...overrides,
  };
}

describe("STRATEGIES registry", () => {
  it("exports exactly 5 strategies", () => {
    expect(STRATEGIES.length).toBe(5);
  });

  it("STRATEGY_MAP has an entry for every strategy in STRATEGIES", () => {
    for (const s of STRATEGIES) {
      expect(STRATEGY_MAP[s.key]).toBeDefined();
      expect(STRATEGY_MAP[s.key].key).toBe(s.key);
    }
  });
});

describe("momentumStrategy", () => {
  it("BUY when momentum > threshold + RSI in range + MACD rising", () => {
    const sig = momentumStrategy.evaluate(ctx());
    expect(sig).not.toBeNull();
    expect(sig!.action).toBe("BUY");
  });

  it("returns null when momentum is below threshold", () => {
    const sig = momentumStrategy.evaluate(ctx({
      indicators: indicators({ momentum: 0.001 }),
    }));
    expect(sig).toBeNull();
  });

  it("confidence is between 0 and 1 when a signal is produced", () => {
    const sig = momentumStrategy.evaluate(ctx());
    if (sig) {
      expect(sig.confidence).toBeGreaterThanOrEqual(0);
      expect(sig.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("reasons array is non-empty when a signal is produced", () => {
    const sig = momentumStrategy.evaluate(ctx());
    if (sig) {
      expect(sig.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe("trendFollowingStrategy", () => {
  it("BUY when price > SMA20 > SMA50 + ADX > 25 + trend UP", () => {
    const sig = trendFollowingStrategy.evaluate(ctx({
      quote: quote(110),
      indicators: indicators({ sma20: 105, sma50: 100, adx14: 30 }),
      trend: trend({ direction: "UP" }),
    }));
    expect(sig).not.toBeNull();
    expect(sig!.action).toBe("BUY");
  });

  it("returns null when trend is FLAT", () => {
    const sig = trendFollowingStrategy.evaluate(ctx({
      trend: trend({ direction: "FLAT" }),
    }));
    expect(sig).toBeNull();
  });
});

describe("maCrossoverStrategy", () => {
  it("BUY when EMA12 > EMA26 + MACD histogram > 0", () => {
    const sig = maCrossoverStrategy.evaluate(ctx({
      indicators: indicators({ ema12: 110, ema26: 100, macdHist: 0.5 }),
    }));
    expect(sig).not.toBeNull();
    expect(sig!.action).toBe("BUY");
  });

  it("SELL when EMA12 < EMA26 + MACD histogram < 0", () => {
    const sig = maCrossoverStrategy.evaluate(ctx({
      indicators: indicators({ ema12: 90, ema26: 100, macdHist: -0.5 }),
    }));
    expect(sig).not.toBeNull();
    expect(sig!.action).toBe("SELL");
  });
});

describe("meanReversionStrategy", () => {
  it("BUY when price < lower Bollinger + RSI < 30 (oversold)", () => {
    const sig = meanReversionStrategy.evaluate(ctx({
      quote: quote(90),
      indicators: indicators({ bollingerLower: 95, bollingerUpper: 115, rsi14: 25 }),
    }));
    expect(sig).not.toBeNull();
    expect(sig!.action).toBe("BUY");
  });

  it("SELL when price > upper Bollinger + RSI > 70 (overbought)", () => {
    const sig = meanReversionStrategy.evaluate(ctx({
      quote: quote(120),
      indicators: indicators({ bollingerLower: 95, bollingerUpper: 115, rsi14: 75 }),
    }));
    expect(sig).not.toBeNull();
    expect(sig!.action).toBe("SELL");
  });
});

describe("breakoutStrategy", () => {
  it("BUY when trend.breakout is true and direction is not DOWN", () => {
    const sig = breakoutStrategy.evaluate(ctx({
      trend: trend({ breakout: true, direction: "UP" }),
    }));
    expect(sig).not.toBeNull();
    expect(sig!.action).toBe("BUY");
  });

  it("returns null when no breakout and no breakdown", () => {
    const sig = breakoutStrategy.evaluate(ctx({
      trend: trend({ breakout: false, breakdown: false }),
    }));
    expect(sig).toBeNull();
  });
});

describe("evaluateAll", () => {
  it("returns an array of Signal (or null merged out) for each strategy", () => {
    const signals = evaluateAll(ctx());
    expect(Array.isArray(signals)).toBe(true);
    // Each emitted signal must have a confidence in [0,1]
    for (const s of signals) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
      expect(s.symbol).toBe("AAPL");
      expect(s.reasons.length).toBeGreaterThan(0);
    }
  });
});
