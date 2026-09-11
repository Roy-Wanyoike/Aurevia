import type { MarketContext, Signal } from "../types";
import { Strategy, toSignal, ACTION, clamp01 } from "./base";

export const momentumStrategy: Strategy = {
  key: "momentum",
  name: "Momentum",
  description:
    "Enters on strong positive momentum with RSI in healthy range (50-72) and MACD histogram rising. Exits when momentum fades or RSI becomes overbought.",
  category: "momentum",
  version: "1.0.0",
  defaultParams: { rsiMin: 50, rsiMax: 72, momentumMin: 0.02, confidenceBase: 0.55 },
  evaluate(ctx, params) {
    const p = { ...this.defaultParams, ...params };
    const { indicators: ind, quote, trend, asset } = ctx;
    const reasons: string[] = [];

    const momentumOK = ind.momentum > Number(p.momentumMin);
    const rsiOK = ind.rsi14 >= Number(p.rsiMin) && ind.rsi14 <= Number(p.rsiMax);
    const macdRising = ind.macdHist > 0;

    if (momentumOK && rsiOK && macdRising && trend.direction !== "DOWN") {
      reasons.push(`10-bar momentum ${(ind.momentum * 100).toFixed(2)}% above threshold`);
      reasons.push(`RSI(14) ${ind.rsi14.toFixed(1)} in healthy zone`);
      reasons.push(`MACD histogram positive (${ind.macdHist.toFixed(4)})`);
      const conf = clamp01(
        Number(p.confidenceBase) +
          Math.min(0.3, ind.momentum * 2) +
          (trend.direction === "UP" ? 0.1 : 0)
      );
      return {
        strategyKey: this.key,
        symbol: asset.symbol,
        action: ACTION.BUY,
        confidence: conf,
        price: quote.price,
        reasons,
      };
    }

    // Exit / short when momentum flips negative
    if (ind.momentum < -Number(p.momentumMin) && ind.rsi14 < 45 && ind.macdHist < 0) {
      reasons.push(`Momentum flipped negative (${(ind.momentum * 100).toFixed(2)}%)`);
      reasons.push(`RSI(14) cooling to ${ind.rsi14.toFixed(1)}`);
      return {
        strategyKey: this.key,
        symbol: asset.symbol,
        action: ACTION.SELL,
        confidence: clamp01(0.5 + Math.abs(ind.momentum)),
        price: quote.price,
        reasons,
      };
    }

    return null;
  },
};

export const trendFollowingStrategy: Strategy = {
  key: "trend-following",
  name: "Trend Following",
  description:
    "Long when price > SMA20 > SMA50 and ADX > 25 (strong trend). Exit when trend flattens or SMA20 crosses below SMA50.",
  category: "trend",
  version: "1.0.0",
  defaultParams: { adxMin: 25, confidenceBase: 0.5 },
  evaluate(ctx, params) {
    const p = { ...this.defaultParams, ...params };
    const { indicators: ind, quote, trend, asset } = ctx;
    const reasons: string[] = [];

    if (
      quote.price > ind.sma20 &&
      ind.sma20 > ind.sma50 &&
      ind.adx14 > Number(p.adxMin) &&
      trend.direction === "UP"
    ) {
      reasons.push(`Price above SMA20 (${ind.sma20.toFixed(2)}) above SMA50 (${ind.sma50.toFixed(2)})`);
      reasons.push(`ADX(14) ${ind.adx14.toFixed(1)} confirms strong trend`);
      reasons.push(`Trend strength ${(trend.strength * 100).toFixed(0)}%`);
      const conf = clamp01(
        Number(p.confidenceBase) +
          (ind.adx14 - Number(p.adxMin)) / 100 +
          trend.strength * 0.2
      );
      return {
        strategyKey: this.key,
        symbol: asset.symbol,
        action: ACTION.BUY,
        confidence: conf,
        price: quote.price,
        reasons,
      };
    }

    if (ind.sma20 < ind.sma50 && trend.direction === "DOWN" && ind.adx14 > Number(p.adxMin)) {
      reasons.push(`SMA20 below SMA50 — downtrend confirmed`);
      reasons.push(`ADX(14) ${ind.adx14.toFixed(1)} signals strong bearish trend`);
      return {
        strategyKey: this.key,
        symbol: asset.symbol,
        action: ACTION.SELL,
        confidence: clamp01(0.5 + (ind.adx14 - Number(p.adxMin)) / 100),
        price: quote.price,
        reasons,
      };
    }

    return null;
  },
};

export const maCrossoverStrategy: Strategy = {
  key: "ma-crossover",
  name: "MA Crossover (EMA12/26)",
  description:
    "Long when EMA12 crosses above EMA26 with rising MACD histogram. Exit / short on the opposite cross.",
  category: "trend",
  version: "1.0.0",
  defaultParams: { confidenceBase: 0.5 },
  evaluate(ctx, params) {
    const p = { ...this.defaultParams, ...params };
    const { indicators: ind, quote, asset } = ctx;
    const reasons: string[] = [];

    if (ind.ema12 > ind.ema26 && ind.macdHist > 0) {
      reasons.push(`EMA12 (${ind.ema12.toFixed(2)}) above EMA26 (${ind.ema26.toFixed(2)})`);
      reasons.push(`MACD histogram positive (${ind.macdHist.toFixed(4)})`);
      const conf = clamp01(Number(p.confidenceBase) + Math.min(0.3, ind.macdHist / quote.price * 50));
      return {
        strategyKey: this.key,
        symbol: asset.symbol,
        action: ACTION.BUY,
        confidence: conf,
        price: quote.price,
        reasons,
      };
    }
    if (ind.ema12 < ind.ema26 && ind.macdHist < 0) {
      reasons.push(`EMA12 below EMA26 with negative MACD histogram`);
      return {
        strategyKey: this.key,
        symbol: asset.symbol,
        action: ACTION.SELL,
        confidence: clamp01(0.5 + Math.min(0.3, Math.abs(ind.macdHist) / quote.price * 50)),
        price: quote.price,
        reasons,
      };
    }
    return null;
  },
};

export const meanReversionStrategy: Strategy = {
  key: "mean-reversion",
  name: "Mean Reversion (Bollinger)",
  description:
    "Buys when price closes below lower Bollinger Band and RSI < 30 (oversold). Sells when price reverts above the middle band or RSI > 70.",
  category: "mean-reversion",
  version: "1.0.0",
  defaultParams: { rsiOversold: 30, rsiOverbought: 70, confidenceBase: 0.55 },
  evaluate(ctx, params) {
    const p = { ...this.defaultParams, ...params };
    const { indicators: ind, quote, asset } = ctx;
    const reasons: string[] = [];

    if (quote.price < ind.bollingerLower && ind.rsi14 < Number(p.rsiOversold)) {
      reasons.push(`Price ${quote.price.toFixed(2)} below lower Bollinger Band ${ind.bollingerLower.toFixed(2)}`);
      reasons.push(`RSI(14) ${ind.rsi14.toFixed(1)} oversold`);
      const conf = clamp01(Number(p.confidenceBase) + (Number(p.rsiOversold) - ind.rsi14) / 100);
      return {
        strategyKey: this.key,
        symbol: asset.symbol,
        action: ACTION.BUY,
        confidence: conf,
        price: quote.price,
        reasons,
      };
    }
    if (quote.price > ind.bollingerUpper && ind.rsi14 > Number(p.rsiOverbought)) {
      reasons.push(`Price ${quote.price.toFixed(2)} above upper Bollinger Band`);
      reasons.push(`RSI(14) ${ind.rsi14.toFixed(1)} overbought`);
      return {
        strategyKey: this.key,
        symbol: asset.symbol,
        action: ACTION.SELL,
        confidence: clamp01(0.55 + (ind.rsi14 - Number(p.rsiOverbought)) / 100),
        price: quote.price,
        reasons,
      };
    }
    return null;
  },
};

export const breakoutStrategy: Strategy = {
  key: "breakout",
  name: "Breakout",
  description:
    "Long when price breaks above resistance with expanding volume and rising ATR. Exit on breakdown below support.",
  category: "breakout",
  version: "1.0.0",
  defaultParams: { confidenceBase: 0.55 },
  evaluate(ctx, params) {
    const p = { ...this.defaultParams, ...params };
    const { quote, trend, asset } = ctx;
    const reasons: string[] = [];

    if (trend.breakout && trend.direction !== "DOWN") {
      reasons.push(`Price broke above resistance ${trend.resistance.toFixed(2)}`);
      reasons.push(`ATR(14) elevated at ${ctx.indicators.atr14.toFixed(2)}`);
      reasons.push(`Trend strength ${(trend.strength * 100).toFixed(0)}%`);
      const conf = clamp01(Number(p.confidenceBase) + trend.strength * 0.3);
      return {
        strategyKey: this.key,
        symbol: asset.symbol,
        action: ACTION.BUY,
        confidence: conf,
        price: quote.price,
        reasons,
      };
    }
    if (trend.breakdown) {
      reasons.push(`Price broke below support ${trend.support.toFixed(2)}`);
      return {
        strategyKey: this.key,
        symbol: asset.symbol,
        action: ACTION.SELL,
        confidence: clamp01(0.55 + trend.strength * 0.3),
        price: quote.price,
        reasons,
      };
    }
    return null;
  },
};

export const STRATEGIES: Strategy[] = [
  momentumStrategy,
  trendFollowingStrategy,
  maCrossoverStrategy,
  meanReversionStrategy,
  breakoutStrategy,
];

export const STRATEGY_MAP: Record<string, Strategy> = Object.fromEntries(
  STRATEGIES.map((s) => [s.key, s])
);

// Run every enabled strategy against a context and collect signals.
export function evaluateAll(ctx: MarketContext): Signal[] {
  const out: Signal[] = [];
  for (const s of STRATEGIES) {
    const raw = s.evaluate(ctx);
    const sig = toSignal(raw);
    if (sig) out.push(sig);
  }
  return out;
}

export { toSignal };
