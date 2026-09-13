import type { Candle, Quote, Timeframe, AssetInfo } from "../types";
import { BASE_PRICES, getAsset, ASSET_CATALOG } from "./assets";

// Mulberry32 — small, fast, deterministic PRNG. Seed per symbol so every asset
// has a stable, reproducible price history. Backtests rely on this determinism.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gaussian via Box-Muller using the supplied rng.
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Hash a string to a 32-bit seed.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

// Per-bar volatility scaling so that e.g. a daily bar carries ~1/sqrt(252) of
// the annualized volatility. This keeps regime behavior realistic across TFs.
function barVolScale(tf: Timeframe): number {
  const barsPerYear: Record<Timeframe, number> = {
    "1m": 252 * 390,
    "5m": 252 * 78,
    "15m": 252 * 26,
    "1h": 252 * 7,
    "4h": 252 * 1.75,
    "1d": 252,
  };
  return 1 / Math.sqrt(barsPerYear[tf]);
}

// Generate a deterministic series of OHLCV candles for `symbol`.
// The walk blends a slow drift, a regime-switching volatility component, and
// occasional trend regime bursts so that trend/breakout/regime detectors have
// something interesting to find. Look-ahead bias: NONE — each candle depends
// only on prior candles and the deterministic rng stream.
export function generateCandles(
  symbol: string,
  timeframe: Timeframe,
  bars: number,
  endTime: number = Date.now()
): Candle[] {
  const cfg = BASE_PRICES[symbol];
  if (!cfg) return [];

  const tfMs = TIMEFRAME_MS[timeframe];
  const startTime = endTime - bars * tfMs;
  const rng = mulberry32(hashSeed(`${symbol}-${timeframe}`));
  const volScale = barVolScale(timeframe);
  const baseVol = cfg.vol * volScale;
  const driftPerBar = cfg.drift / (252 * (TIMEFRAME_MS["1d"] / tfMs));

  const candles: Candle[] = [];
  let price = cfg.price;
  // Regime state machine: drift between calm / trending up / trending down / volatile.
  // Regime length and type are drawn from rng, so the series is reproducible.
  let regime: "calm" | "up" | "down" | "volatile" = "calm";
  let regimeRemaining = 20 + Math.floor(rng() * 60);

  let prevClose = price;
  for (let i = 0; i < bars; i++) {
    if (regimeRemaining <= 0) {
      const r = rng();
      if (r < 0.45) regime = "calm";
      else if (r < 0.7) regime = "up";
      else if (r < 0.88) regime = "down";
      else regime = "volatile";
      regimeRemaining = 20 + Math.floor(rng() * 80);
    }
    regimeRemaining--;

    let volMult = 1;
    let driftBoost = 0;
    switch (regime) {
      case "calm":
        volMult = 0.7;
        driftBoost = 0;
        break;
      case "up":
        volMult = 1.0;
        driftBoost = driftPerBar * 2.5;
        break;
      case "down":
        volMult = 1.1;
        driftBoost = -driftPerBar * 3;
        break;
      case "volatile":
        volMult = 1.9;
        driftBoost = 0;
        break;
    }

    const shock = gaussian(rng) * baseVol * volMult;
    const open = prevClose;
    const close = Math.max(open * (1 + driftBoost + shock), open * 0.5);
    const intraVol = baseVol * volMult * 0.7;
    const high = Math.max(open, close) * (1 + Math.abs(gaussian(rng)) * intraVol * 0.5);
    const low = Math.min(open, close) * (1 - Math.abs(gaussian(rng)) * intraVol * 0.5);
    const baseVolUnits = cfg.price > 1000 ? 100 : cfg.price > 100 ? 1000 : 10000;
    const volume = Math.max(
      1,
      Math.round(baseVolUnits * (0.5 + rng() * 1.5) * (regime === "volatile" ? 1.8 : 1))
    );

    candles.push({
      time: startTime + i * tfMs,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume,
    });
    prevClose = close;
  }
  return candles;
}

function round(n: number): number {
  if (n >= 1000) return Math.round(n * 100) / 100;
  if (n >= 10) return Math.round(n * 1000) / 1000;
  return Math.round(n * 10000) / 10000;
}

// Build a live quote from the most recent candles.
export function buildQuote(symbol: string, candles: Candle[]): Quote {
  if (candles.length === 0) {
    return {
      symbol,
      price: 0,
      bid: 0,
      ask: 0,
      spread: 0,
      volume24h: 0,
      changePct: 0,
      timestamp: Date.now(),
    };
  }
  const last = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2] : last;
  const cfg = BASE_PRICES[symbol];
  const spreadBps =
    symbol.startsWith("BTC") || symbol.startsWith("ETH")
      ? 8
      : symbol.length <= 6 && cfg && cfg.price < 10
        ? 20
        : 4;
  const spread = last.close * (spreadBps / 10000);
  const changePct = prev.close !== 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const volume24h = candles.slice(-24).reduce((s, c) => s + c.volume, 0);
  return {
    symbol,
    price: last.close,
    bid: last.close - spread / 2,
    ask: last.close + spread / 2,
    spread,
    volume24h,
    changePct,
    timestamp: last.time,
  };
}

// Convenience: fetch the most recent N daily candles for a symbol.
export function getDailyCandles(symbol: string, bars: number = 300): Candle[] {
  return generateCandles(symbol, "1d", bars);
}

export function getAllAssets(): AssetInfo[] {
  return ASSET_CATALOG;
}

export { getAsset };
