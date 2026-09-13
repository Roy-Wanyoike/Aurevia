import type { Candle, Quote, Timeframe } from "../types";
import type { MarketDataProvider } from "./provider";
import { PolygonProvider } from "./providers/polygon";
import { AlphaVantageProvider } from "./providers/alpha-vantage";
import { FinnhubProvider } from "./providers/finnhub";
import { SimulatedProvider } from "./providers/simulated";
import { logger } from "../logger";

// Gateway result envelope — callers (store, API routes) need to know which
// provider served the request and whether the data is live, so the UI can
// render the appropriate badge.
export interface GatewayResult {
  candles: Candle[];
  source: string;       // "polygon" | "alpaca" | "simulated"
  isLive: boolean;
}

export interface GatewayQuoteResult {
  quote: Quote | null;
  source: string;
  isLive: boolean;
}

// The gateway routes to the first configured+healthy provider. If no provider
// has an API key, it transparently falls back to the simulated feed — but the
// caller always knows the data is simulated via `isLive: false`.
//
// Adding a new provider: drop a new class implementing MarketDataProvider into
// `./providers/`, append it to the `providers` array below. No other changes
// required.
export class MarketDataGateway {
  private providers: MarketDataProvider[];

  constructor() {
    this.providers = [
      new PolygonProvider(),         // tries POLYGON_API_KEY
      new AlphaVantageProvider(),    // tries ALPHA_VANTAGE_API_KEY (free tier: 25/day, 5/min)
      new FinnhubProvider(),          // tries FINNHUB_API_KEY (quotes + candles)
      new SimulatedProvider(),        // always available fallback
    ];
  }

  async getCandles(
    symbol: string,
    timeframe: Timeframe,
    bars: number,
  ): Promise<GatewayResult> {
    for (const p of this.providers) {
      if (!p.isConfigured()) continue;
      try {
        const candles = await p.getCandles(symbol, timeframe, bars);
        if (candles.length > 0) {
          return { candles, source: p.providerId, isLive: p.isLive };
        }
      } catch (e: any) {
        logger.warn("Market data provider failed; falling through", {
          provider: p.providerId,
          symbol,
          timeframe,
          error: e?.message ?? String(e),
        });
      }
    }
    const sim = this.providers[this.providers.length - 1];
    return {
      candles: await sim.getCandles(symbol, timeframe, bars),
      source: "simulated",
      isLive: false,
    };
  }

  async getQuote(symbol: string): Promise<GatewayQuoteResult> {
    for (const p of this.providers) {
      if (!p.isConfigured()) continue;
      try {
        const quote = await p.getQuote(symbol);
        if (quote) return { quote, source: p.providerId, isLive: p.isLive };
      } catch (e: any) {
        logger.warn("Market data provider quote failed; falling through", {
          provider: p.providerId,
          symbol,
          error: e?.message ?? String(e),
        });
      }
    }
    const sim = this.providers[this.providers.length - 1];
    return { quote: await sim.getQuote(symbol), source: "simulated", isLive: false };
  }

  // The active provider is the first one that is configured. Used by /health
  // so the UI can badge the data source without making a full candles call.
  getActiveProvider(): { id: string; isLive: boolean } {
    const configured = this.providers.find((p) => p.isConfigured());
    return {
      id: configured?.providerId ?? "simulated",
      isLive: configured?.isLive ?? false,
    };
  }
}

// Singleton — preserve across hot reloads in dev. The gateway itself is
// stateless apart from each provider's internal 60s cache, so a single
// shared instance is correct.
const globalForAurevia = globalThis as unknown as { __aureviaGateway?: MarketDataGateway };
export const marketDataGateway: MarketDataGateway =
  globalForAurevia.__aureviaGateway ?? new MarketDataGateway();
if (process.env.NODE_ENV !== "production") {
  globalForAurevia.__aureviaGateway = marketDataGateway;
}
