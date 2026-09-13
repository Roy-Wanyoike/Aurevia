// DeFi Llama on-chain analytics integration.
//
// Completely free — no API key required. Docs: https://defillama.com/docs/api
// Endpoints used (all under https://api.llama.fi):
//   - /v2/chains                 — current TVL per chain
//   - /v2/historicalChainTvl     — total TVL history (all chains)
//   - /protocols                 — top protocols by TVL
//
// Results cached 5 minutes in-memory; macro TVL numbers don't move fast enough
// to justify hammering the upstream on every page load.

const DEFILLAMA_BASE = "https://api.llama.fi";
const FETCH_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 5 * 60_000;

export interface ChainTvl {
  name: string;
  tvl: number;
  chainSymbol: string;
}

export interface TvlHistoryPoint {
  date: number;  // epoch ms
  tvl: number;   // USD
}

export interface ProtocolTvl {
  name: string;
  tvl: number;
  chain: string;
  category: string;
}

interface Cached<T> {
  ts: number;
  value: T;
}

const chainsCache = new Map<string, Cached<ChainTvl[]>>();
const historyCache = new Map<string, Cached<TvlHistoryPoint[]>>();
const protocolsCache = new Map<string, Cached<ProtocolTvl[]>>();

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface LlamaChain {
  name?: string;
  tvl?: number;
  chainSymbol?: string;
  geckoId?: string;
}

interface LlamaHistoryPoint {
  date?: number;
  tvl?: number;
}

interface LlamaProtocol {
  name?: string;
  tvl?: number;
  chain?: string;
  category?: string;
}

export async function fetchChainsTvl(): Promise<ChainTvl[]> {
  const cached = chainsCache.get("chains");
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
  try {
    const res = await fetchWithTimeout(`${DEFILLAMA_BASE}/v2/chains`);
    if (!res.ok) {
      chainsCache.set("chains", { ts: Date.now(), value: [] });
      return [];
    }
    const data = (await res.json()) as LlamaChain[];
    if (!Array.isArray(data)) {
      chainsCache.set("chains", { ts: Date.now(), value: [] });
      return [];
    }
    const out: ChainTvl[] = data
      .map((c) => ({
        name: c.name ?? "Unknown",
        tvl: typeof c.tvl === "number" ? c.tvl : 0,
        chainSymbol: c.chainSymbol || c.geckoId || "",
      }))
      .filter((c) => c.tvl > 0)
      .sort((a, b) => b.tvl - a.tvl);
    chainsCache.set("chains", { ts: Date.now(), value: out });
    return out;
  } catch {
    return [];
  }
}

export async function fetchTotalTvlHistory(): Promise<TvlHistoryPoint[]> {
  const cached = historyCache.get("history");
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
  try {
    const res = await fetchWithTimeout(`${DEFILLAMA_BASE}/v2/historicalChainTvl`);
    if (!res.ok) {
      historyCache.set("history", { ts: Date.now(), value: [] });
      return [];
    }
    const data = (await res.json()) as LlamaHistoryPoint[];
    if (!Array.isArray(data)) {
      historyCache.set("history", { ts: Date.now(), value: [] });
      return [];
    }
    const out: TvlHistoryPoint[] = data
      .map((d) => ({
        date: (d.date ?? 0) * 1000,
        tvl: typeof d.tvl === "number" ? d.tvl : 0,
      }))
      .filter((p) => p.date > 0 && p.tvl > 0)
      .slice(-90); // last 90 days
    historyCache.set("history", { ts: Date.now(), value: out });
    return out;
  } catch {
    return [];
  }
}

export async function fetchProtocols(): Promise<ProtocolTvl[]> {
  const cached = protocolsCache.get("protocols");
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
  try {
    const res = await fetchWithTimeout(`${DEFILLAMA_BASE}/protocols`);
    if (!res.ok) {
      protocolsCache.set("protocols", { ts: Date.now(), value: [] });
      return [];
    }
    const data = (await res.json()) as LlamaProtocol[];
    if (!Array.isArray(data)) {
      protocolsCache.set("protocols", { ts: Date.now(), value: [] });
      return [];
    }
    const out: ProtocolTvl[] = data
      .map((p) => ({
        name: p.name ?? "Unknown",
        tvl: typeof p.tvl === "number" ? p.tvl : 0,
        chain: p.chain ?? "Unknown",
        category: p.category ?? "Unknown",
      }))
      .filter((p) => p.tvl > 0)
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 20);
    protocolsCache.set("protocols", { ts: Date.now(), value: out });
    return out;
  } catch {
    return [];
  }
}

// Convenience aggregate used by the route — fetch all three streams in parallel
// and bundle them into a single payload. Failures in any one stream degrade
// gracefully (empty array) rather than failing the whole request.
export interface OnchainSnapshot {
  chains: ChainTvl[];
  totalTvlUsd: number;
  history: TvlHistoryPoint[];
  protocols: ProtocolTvl[];
  source: "defillama";
  updatedAt: number;
}

export async function fetchOnchainSnapshot(): Promise<OnchainSnapshot> {
  const [chains, history, protocols] = await Promise.all([
    fetchChainsTvl(),
    fetchTotalTvlHistory(),
    fetchProtocols(),
  ]);
  const totalTvlUsd = chains.reduce((sum, c) => sum + c.tvl, 0);
  return {
    chains,
    totalTvlUsd,
    history,
    protocols,
    source: "defillama",
    updatedAt: Date.now(),
  };
}
