import type { Candle, Quote, Timeframe } from "../../types";
import type { MarketDataProvider } from "../provider";
import { getAsset } from "../assets";

// Alpha Vantage REST provider.
//
// Free tier: 25 requests/day, 5 req/min. The provider is disabled gracefully
// when ALPHA_VANTAGE_API_KEY is absent — the gateway falls through to the
// next provider in the chain.
//
// Endpoints used (all under https://www.alphavantage.co/query):
//   - TIME_SERIES_INTRADAY  (interval=1|5|15|30|60) — intraday OHLCV
//   - TIME_SERIES_DAILY                              — daily OHLCV
//   - GLOBAL_QUOTE                                    — last price + change%
//
// Disabled gracefully if ALPHA_VANTAGE_API_KEY is absent. Results cached 60s
// in-memory — never let a single slow upstream hold the request loop open.

const ALPHA_VANTAGE_BASE = "https://www.alphavantage.co";
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

// Map Aurevia canonical timeframes → Alpha Vantage intraday intervals.
// Daily is special-cased (separate function). 4h is not supported by the free
// tier; we fall back to 60min and let the caller slice the bars they need.
const TIMEFRAME_TO_INTERVAL: Record<Timeframe, "1min" | "5min" | "15min" | "30min" | "60min"> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1h": "60min",
  "4h": "60min", // 4h not native — back off to hourly
  "1d": "60min", // placeholder; daily takes a separate branch
};

interface Cached<T> {
  ts: number;
  value: T;
}

// Minimal response shapes Alpha Vantage returns. We only read the keys we use,
// so unknown extra fields are simply ignored.
interface AlphaVantageIntradayResponse {
  // The series key is dynamic (e.g. "Time Series (5min)"); use a record.
  [seriesKey: string]: Record<string, AlphaVantageBar> | string | undefined;
}

interface AlphaVantageDailyResponse {
  "Time Series (Daily)"?: Record<string, AlphaVantageBar>;
  "Error Message"?: string;
  Note?: string;
  Information?: string;
}

interface AlphaVantageBar {
  "1. open": string;
  "2. high": string;
  "3. low": string;
  "4. close": string;
  "5. volume": string;
}

interface AlphaVantageGlobalQuoteResponse {
  "Global Quote"?: {
    "01. symbol"?: string;
    "05. price"?: string;
    "06. volume"?: string;
    "09. change"?: string;
    "10. change percent"?: string;
  };
  "Error Message"?: string;
  Note?: string;
  Information?: string;
}

export class AlphaVantageProvider implements MarketDataProvider {
  readonly providerId = "alpha-vantage";
  readonly isLive = true;
  private apiKey: string | undefined;
  private candleCache = new Map<string, Cached<Candle[]>>();
  private quoteCache = new Map<string, Cached<Quote | null>>();

  constructor() {
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || undefined;
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

    // Daily uses a dedicated endpoint. Intraday shares one endpoint keyed by
    // interval. outputsize=compact = last 100 data points (sufficient for any
    // reasonable `bars` the engines request).
    const isDaily = timeframe === "1d";
    const params = new URLSearchParams({
      apikey: this.apiKey as string,
      outputsize: "compact",
      ...(isDaily
        ? { function: "TIME_SERIES_DAILY", symbol }
        : { function: "TIME_SERIES_INTRADAY", symbol, interval: TIMEFRAME_TO_INTERVAL[timeframe] }),
    });
    const url = `${ALPHA_VANTAGE_BASE}/query?${params.toString()}`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) {
      throw new Error(`Alpha Vantage HTTP ${res.status}`);
    }
    const json = isDaily
      ? ((await res.json()) as AlphaVantageDailyResponse)
      : ((await res.json()) as AlphaVantageIntradayResponse);

    // Free-tier rate-limit / error responses come back as 200 + a Note/Error
    // field. Treat them as "no data" so the gateway can fall through to the
    // next provider rather than crashing.
    const asRecord = json as Record<string, unknown>;
    if (typeof asRecord["Error Message"] === "string" || typeof asRecord.Note === "string" || typeof asRecord.Information === "string") {
      this.candleCache.set(cacheKey, { ts: Date.now(), value: [] });
      return [];
    }

    const seriesKey = isDaily
      ? "Time Series (Daily)"
      : `Time Series (${TIMEFRAME_TO_INTERVAL[timeframe]})`;
    const seriesRaw = asRecord[seriesKey] as Record<string, AlphaVantageBar> | string | undefined;
    if (!seriesRaw || typeof seriesRaw === "string") {
      this.candleCache.set(cacheKey, { ts: Date.now(), value: [] });
      return [];
    }
    const series = seriesRaw;

    // Alpha Vantage returns newest-first; sort ascending then trim to the
    // requested bar count from the tail (most recent).
    const candles: Candle[] = Object.entries(series)
      .map(([dateStr, ohlc]) => ({
        time: new Date(dateStr + " UTC").getTime(),
        open: parseFloat(ohlc["1. open"]),
        high: parseFloat(ohlc["2. high"]),
        low: parseFloat(ohlc["3. low"]),
        close: parseFloat(ohlc["4. close"]),
        volume: parseFloat(ohlc["5. volume"]),
      }))
      .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
      .sort((a, b) => a.time - b.time)
      .slice(-bars);

    this.candleCache.set(cacheKey, { ts: Date.now(), value: candles });
    return candles;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    if (!this.isConfigured()) return null;
    const cached = this.quoteCache.get(symbol);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

    const params = new URLSearchParams({
      function: "GLOBAL_QUOTE",
      symbol,
      apikey: this.apiKey as string,
    });
    const url = `${ALPHA_VANTAGE_BASE}/query?${params.toString()}`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) {
      throw new Error(`Alpha Vantage quote HTTP ${res.status}`);
    }
    const json = (await res.json()) as AlphaVantageGlobalQuoteResponse;
    if (json["Error Message"] || json.Note) {
      this.quoteCache.set(symbol, { ts: Date.now(), value: null });
      return null;
    }
    const q = json["Global Quote"];
    if (!q || typeof q["05. price"] !== "string") {
      this.quoteCache.set(symbol, { ts: Date.now(), value: null });
      return null;
    }
    const price = parseFloat(q["05. price"]);
    if (!Number.isFinite(price) || price <= 0) {
      this.quoteCache.set(symbol, { ts: Date.now(), value: null });
      return null;
    }
    const volume24h = parseFloat(q["06. volume"] ?? "0");
    // "10. change percent" arrives like "+1.23%" — strip the trailing %.
    const changePctRaw = (q["10. change percent"] ?? "").replace("%", "").trim();
    const changePct = Number.isFinite(parseFloat(changePctRaw)) ? parseFloat(changePctRaw) : 0;

    // Alpha Vantage does not surface bid/ask on the free GLOBAL_QUOTE tier.
    // Synthesize a 2bp spread (4bp for FX, 8bp for crypto) so downstream risk
    // checks see a realistic, asset-class-aware spread.
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
      volume24h: Number.isFinite(volume24h) ? volume24h : 0,
      changePct,
      timestamp: Date.now(),
    };
    this.quoteCache.set(symbol, { ts: Date.now(), value: quote });
    return quote;
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    if (!this.isConfigured()) return { ok: false, latencyMs: 0 };
    const t0 = Date.now();
    try {
      const params = new URLSearchParams({
        function: "GLOBAL_QUOTE",
        symbol: "AAPL",
        apikey: this.apiKey as string,
      });
      const res = await this.fetchWithTimeout(`${ALPHA_VANTAGE_BASE}/query?${params.toString()}`);
      return { ok: res.ok, latencyMs: Date.now() - t0 };
    } catch {
      return { ok: false, latencyMs: Date.now() - t0 };
    }
  }
}
