import type { Candle, Quote, Timeframe } from "../../types";
import type { MarketDataProvider } from "../provider";
import { getAsset } from "../assets";

// Polygon.io REST provider.
//
// - Aggregates: GET https://api.polygon.io/v2/aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{from}/{to}?apiKey=KEY
// - Last trade: GET https://api.polygon.io/v2/last/trade/{symbol}?apiKey=KEY
//
// Disabled gracefully if POLYGON_API_KEY is absent. Results cached 60s in-memory.

const POLYGON_BASE = "https://api.polygon.io";
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

const TIMEFRAME_TO_POLYGON: Record<Timeframe, { multiplier: number; timespan: string }> = {
  "1m": { multiplier: 1, timespan: "minute" },
  "5m": { multiplier: 5, timespan: "minute" },
  "15m": { multiplier: 15, timespan: "minute" },
  "1h": { multiplier: 1, timespan: "hour" },
  "4h": { multiplier: 4, timespan: "hour" },
  "1d": { multiplier: 1, timespan: "day" },
};

interface Cached<T> {
  ts: number;
  value: T;
}

interface PolygonAggResponse {
  results?: Array<{
    t: number;        // epoch ms
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  }>;
  status?: string;
  error?: string;
}

interface PolygonLastTradeResponse {
  status?: string;
  results?: { T?: string; p?: number; s?: number; t?: number };
}

export class PolygonProvider implements MarketDataProvider {
  readonly providerId = "polygon";
  readonly isLive = true;
  private apiKey: string | undefined;
  private candleCache = new Map<string, Cached<Candle[]>>();
  private quoteCache = new Map<string, Cached<Quote | null>>();

  constructor() {
    this.apiKey = process.env.POLYGON_API_KEY || undefined;
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async getCandles(symbol: string, timeframe: Timeframe, bars: number): Promise<Candle[]> {
    if (!this.isConfigured()) return [];
    const cacheKey = `${symbol}-${timeframe}-${bars}`;
    const cached = this.candleCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

    const { multiplier, timespan } = TIMEFRAME_TO_POLYGON[timeframe];
    const tfMs = timeframeToMs(timeframe);
    const now = Date.now();
    const fromMs = now - tfMs * bars;
    const from = new Date(fromMs).toISOString().slice(0, 10);
    const to = new Date(now).toISOString().slice(0, 10);

    const url = `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${multiplier}/${timespan}/${from}/${to}?apiKey=${this.apiKey}&limit=${bars}&sort=asc`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) {
      throw new Error(`Polygon aggs HTTP ${res.status}`);
    }
    const json = (await res.json()) as PolygonAggResponse;
    if (!json.results || json.results.length === 0) {
      this.candleCache.set(cacheKey, { ts: Date.now(), value: [] });
      return [];
    }
    const candles: Candle[] = json.results.map((r) => ({
      time: r.t,
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v ?? 0,
    }));
    this.candleCache.set(cacheKey, { ts: Date.now(), value: candles });
    return candles;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    if (!this.isConfigured()) return null;
    const cached = this.quoteCache.get(symbol);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

    const url = `${POLYGON_BASE}/v2/last/trade/${encodeURIComponent(symbol)}?apiKey=${this.apiKey}`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Polygon last/trade HTTP ${res.status}`);
    const json = (await res.json()) as PolygonLastTradeResponse;
    if (!json.results || typeof json.results.p !== "number") {
      this.quoteCache.set(symbol, { ts: Date.now(), value: null });
      return null;
    }
    const price = json.results.p;
    const asset = getAsset(symbol);
    const spreadBps =
      symbol.startsWith("BTC") || symbol.startsWith("ETH") ? 8 :
      asset && asset.assetType === "fx" ? 4 :
      2;
    const spread = price * (spreadBps / 10000);
    const quote: Quote = {
      symbol,
      price,
      bid: price - spread / 2,
      ask: price + spread / 2,
      spread,
      volume24h: 0,
      changePct: 0,
      timestamp: json.results.t ?? Date.now(),
    };
    this.quoteCache.set(symbol, { ts: Date.now(), value: quote });
    return quote;
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    if (!this.isConfigured()) return { ok: false, latencyMs: 0 };
    const t0 = Date.now();
    try {
      const url = `${POLYGON_BASE}/v2/aggs/ticker/AAPL/range/1/day/${new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)}/${new Date().toISOString().slice(0, 10)}?apiKey=${this.apiKey}&limit=1`;
      const res = await this.fetchWithTimeout(url);
      return { ok: res.ok, latencyMs: Date.now() - t0 };
    } catch {
      return { ok: false, latencyMs: Date.now() - t0 };
    }
  }
}

function timeframeToMs(tf: Timeframe): number {
  switch (tf) {
    case "1m": return 60_000;
    case "5m": return 5 * 60_000;
    case "15m": return 15 * 60_000;
    case "1h": return 60 * 60_000;
    case "4h": return 4 * 60 * 60_000;
    case "1d": return 24 * 60 * 60_000;
  }
}
