import type { Candle, Quote, Timeframe } from "../types";

// Every market data provider implements this. The MarketDataGateway routes
// to the first healthy provider. If no provider has an API key, falls back
// to the simulated feed (clearly labeled).
export interface MarketDataProvider {
  readonly providerId: string;  // "polygon" | "alpaca" | "finnhub" | "simulated"
  readonly isLive: boolean;     // false for simulated
  isConfigured(): boolean;      // has API key?
  getCandles(symbol: string, timeframe: Timeframe, bars: number): Promise<Candle[]>;
  getQuote(symbol: string): Promise<Quote | null>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number }>;
}
