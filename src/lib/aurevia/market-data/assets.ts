import type { AssetInfo } from "../types";

// Aurevia asset catalog — seeded universe. Mix of equities, ETFs, crypto, FX.
// Prices are illustrative starting points for the simulated feed.
export const ASSET_CATALOG: AssetInfo[] = [
  // Mega-cap equities
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", assetType: "equity", sector: "Technology", currency: "USD" },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ", assetType: "equity", sector: "Technology", currency: "USD" },
  { symbol: "NVDA", name: "NVIDIA Corp.", exchange: "NASDAQ", assetType: "equity", sector: "Semiconductors", currency: "USD" },
  { symbol: "AMZN", name: "Amazon.com Inc.", exchange: "NASDAQ", assetType: "equity", sector: "Consumer Discretionary", currency: "USD" },
  { symbol: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", assetType: "equity", sector: "Communication Services", currency: "USD" },
  { symbol: "META", name: "Meta Platforms Inc.", exchange: "NASDAQ", assetType: "equity", sector: "Communication Services", currency: "USD" },
  { symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ", assetType: "equity", sector: "Consumer Discretionary", currency: "USD" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", assetType: "equity", sector: "Financials", currency: "USD" },
  { symbol: "V", name: "Visa Inc.", exchange: "NYSE", assetType: "equity", sector: "Financials", currency: "USD" },
  { symbol: "WMT", name: "Walmart Inc.", exchange: "NYSE", assetType: "equity", sector: "Consumer Staples", currency: "USD" },
  // ETFs
  { symbol: "SPY", name: "SPDR S&P 500 ETF", exchange: "ARCA", assetType: "etf", sector: "Index", currency: "USD" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ", assetType: "etf", sector: "Index", currency: "USD" },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", exchange: "ARCA", assetType: "etf", sector: "Index", currency: "USD" },
  // Crypto
  { symbol: "BTC", name: "Bitcoin", exchange: "COINBASE", assetType: "crypto", sector: "Digital Asset", currency: "USD" },
  { symbol: "ETH", name: "Ethereum", exchange: "COINBASE", assetType: "crypto", sector: "Digital Asset", currency: "USD" },
  { symbol: "SOL", name: "Solana", exchange: "COINBASE", assetType: "crypto", sector: "Digital Asset", currency: "USD" },
  // FX
  { symbol: "EURUSD", name: "Euro / US Dollar", exchange: "FX", assetType: "fx", sector: "Forex", currency: "USD" },
  { symbol: "GBPUSD", name: "British Pound / US Dollar", exchange: "FX", assetType: "fx", sector: "Forex", currency: "USD" },
];

// Base prices and volatility (annualized) used by the simulated feed to seed
// the deterministic random walk. These are illustrative.
export const BASE_PRICES: Record<string, { price: number; vol: number; drift: number }> = {
  AAPL: { price: 228, vol: 0.26, drift: 0.12 },
  MSFT: { price: 420, vol: 0.24, drift: 0.14 },
  NVDA: { price: 128, vol: 0.52, drift: 0.35 },
  AMZN: { price: 185, vol: 0.30, drift: 0.13 },
  GOOGL: { price: 165, vol: 0.28, drift: 0.12 },
  META: { price: 505, vol: 0.34, drift: 0.18 },
  TSLA: { price: 245, vol: 0.58, drift: 0.08 },
  JPM: { price: 215, vol: 0.22, drift: 0.10 },
  V: { price: 275, vol: 0.20, drift: 0.11 },
  WMT: { price: 78, vol: 0.18, drift: 0.09 },
  SPY: { price: 560, vol: 0.14, drift: 0.10 },
  QQQ: { price: 485, vol: 0.18, drift: 0.13 },
  IWM: { price: 218, vol: 0.22, drift: 0.08 },
  BTC: { price: 62000, vol: 0.65, drift: 0.30 },
  ETH: { price: 2950, vol: 0.72, drift: 0.28 },
  SOL: { price: 148, vol: 0.90, drift: 0.40 },
  EURUSD: { price: 1.085, vol: 0.08, drift: 0.0 },
  GBPUSD: { price: 1.305, vol: 0.09, drift: 0.01 },
};

export const ASSET_MAP: Record<string, AssetInfo> = Object.fromEntries(
  ASSET_CATALOG.map((a) => [a.symbol, a])
);

export function getAsset(symbol: string): AssetInfo | undefined {
  return ASSET_MAP[symbol.toUpperCase()];
}
