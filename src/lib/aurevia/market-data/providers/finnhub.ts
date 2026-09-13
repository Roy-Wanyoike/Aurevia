import type { Candle, Quote, Timeframe } from "../../types";
import type { MarketDataProvider } from "../provider";
import { getAsset } from "../assets";

// Finnhub REST provider.
//
// Free tier: 60 req/min, no daily cap. Equities + ETFs + FX + crypto supported
// via /stock/candle and /quote. Disabled gracefully when FINNHUB_API_KEY is
// absent — the gateway falls through to the next provider.
//
// Endpoints used (all under https://finnhub.io/api/v1):
//   - /stock/candle?symbol=...&resolution=D&from=...&to=...&token=...
//   - /quote?symbol=...&token=...
//
// Finnhub resolution codes: 1, 5, 15, 30, 60, D, W, M.
//   Aurevia canonical timeframes map onto these; 4h rounds up to "60" (hourly)
//   bars, then we slice the last N — caller controls bar count, not the
//   upstream aggregation.

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

const TIMEFRAME_TO_RESOLUTION: Record<Timeframe, "1" | "5" | "15" | "60" | "D"> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "4h": "60", // 4h not native — hourly bars, sliced
  "1d": "D",
};

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
  "4h": 14_400,
  "1d": 86_400,
};

interface Cached<T> {
  ts: number;
  value: T;
}

interface FinnhubCandleResponse {
  c?: number[]; // close
  o?: number[]; // open
  h?: number[]; // high
  l?: number[]; // low
  v?: number[]; // volume
  t?: number[]; // epoch seconds
  s?: string;   // "ok" | "no_data"
}

interface FinnhubQuoteResponse {
  c?: number; // current price
  d?: number; // change
  dp?: number; // percent change
  h?: number; // high
  l?: number; // low
  o?: number; // open
  pc?: number; // previous close
}

export class FinnhubProvider implements MarketDataProvider {
  readonly providerId = "finnhub";
  readonly isLive = true;
  private apiKey: string | undefined;
  private candleCache = new Map<string, Cached<Candle[]>>();
  private quoteCache = new Map<string, Cached<Quote | null>>();

  constructor() {
    this.apiKey = process.env.FINNHUB_API_KEY || undefined;
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

  async getCandles(
    symbol: string,
    timeframe: Timeframe,
    bars: number,
  ): Promise<Candle[]> {
    if (!this.isConfigured()) return [];
    const cacheKey = `${symbol}-${timeframe}-${bars}`;
    const cached = this.candleCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

    const resolution = TIMEFRAME_TO_RESOLUTION[timeframe];
    const stepSec = TIMEFRAME_SECONDS[timeframe];
    const nowSec = Math.floor(Date.now() / 1000);
    // Pull a 3x window so we have enough bars after market closures / weekends
    // to satisfy the requested count.
    const fromSec = nowSec - stepSec * bars * 3;
    const params = new URLSearchParams({
      symbol,
      resolution,
      from: String(fromSec),
      to: String(nowSec),
      token: this.apiKey as string,
    });
    const url = `${FINNHUB_BASE}/stock/candle?${params.toString()}`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) {
      throw new Error(`Finnhub HTTP ${res.status}`);
    }
    const json = (await res.json()) as FinnhubCandleResponse;
    // s === "no_data" or any missing array means no bars.
    if (json.s === "no_data" || !Array.isArray(json.c) || !Array.isArray(json.t) || json.c.length === 0) {
      this.candleCache.set(cacheKey, { ts: Date.now(), value: [] });
      return [];
    }
    const closes = json.c as number[];
    const opens = json.o ?? closes;
    const highs = json.h ?? closes;
    const lows = json.l ?? closes;
    const volumes = json.v ?? closes.map(() => 0);
    const times = json.t as number[];

    const candles: Candle[] = [];
    for (let i = 0; i < times.length; i++) {
      const close = closes[i];
      // Skip the synthetic 0 close that Finnhub occasionally returns at the
      // active (in-progress) bar; treating it as a real close would corrupt
      // every indicator computed downstream.
      if (!Number.isFinite(close) || close <= 0) continue;
      candles.push({
        time: times[i] * 1000, // s → ms
        open: opens[i] ?? close,
        high: highs[i] ?? close,
        low: lows[i] ?? close,
        close,
        volume: Number.isFinite(volumes[i]) ? volumes[i] : 0,
      });
    }
    candles.sort((a, b) => a.time - b.time);
    const trimmed = candles.slice(-bars);
    this.candleCache.set(cacheKey, { ts: Date.now(), value: trimmed });
    return trimmed;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    if (!this.isConfigured()) return null;
    const cached = this.quoteCache.get(symbol);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

    const params = new URLSearchParams({ symbol, token: this.apiKey as string });
    const url = `${FINNHUB_BASE}/quote?${params.toString()}`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) {
      throw new Error(`Finnhub quote HTTP ${res.status}`);
    }
    const json = (await res.json()) as FinnhubQuoteResponse;
    const price = json.c;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      // Finnhub returns zeros for non-US-market / unsupported symbols; treat
      // as "no quote" so the gateway can fall through.
      this.quoteCache.set(symbol, { ts: Date.now(), value: null });
      return null;
    }
    // Finnhub free tier does not expose bid/ask; synthesize a 2bp/4bp/8bp
    // spread based on asset class so risk spread checks see realistic values.
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
      volume24h: 0, // /quote does not surface volume; use candles if needed
      changePct: typeof json.dp === "number" && Number.isFinite(json.dp) ? json.dp : 0,
      timestamp: Date.now(),
    };
    this.quoteCache.set(symbol, { ts: Date.now(), value: quote });
    return quote;
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    if (!this.isConfigured()) return { ok: false, latencyMs: 0 };
    const t0 = Date.now();
    try {
      const params = new URLSearchParams({ symbol: "AAPL", token: this.apiKey as string });
      const res = await this.fetchWithTimeout(`${FINNHUB_BASE}/quote?${params.toString()}`);
      return { ok: res.ok, latencyMs: Date.now() - t0 };
    } catch {
      return { ok: false, latencyMs: Date.now() - t0 };
    }
  }
}
