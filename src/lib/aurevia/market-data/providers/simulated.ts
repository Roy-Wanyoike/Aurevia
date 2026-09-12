import type { Candle, Quote, Timeframe } from "../../types";
import type { MarketDataProvider } from "../provider";
import { generateCandles, buildQuote } from "../feed";

// Simulated provider — wraps the existing deterministic GBM + regime-switching
// feed. Always available as the fallback when no real provider is configured.
// Clearly labeled as isLive = false.
export class SimulatedProvider implements MarketDataProvider {
  readonly providerId = "simulated";
  readonly isLive = false;

  isConfigured(): boolean {
    return true; // always available
  }

  async getCandles(symbol: string, timeframe: Timeframe, bars: number): Promise<Candle[]> {
    return generateCandles(symbol, timeframe, bars);
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const candles = generateCandles(symbol, "1d", 60);
    if (candles.length === 0) return null;
    return buildQuote(symbol, candles);
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    return { ok: true, latencyMs: 1 };
  }
}
