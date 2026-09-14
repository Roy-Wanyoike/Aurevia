// FRED (Federal Reserve Economic Data) integration.
//
// Free API: https://fred.stlouisfed.org/docs/api/fred/
// Key series used by the MacroView:
//   GDP       Gross Domestic Product
//   CPIAUCSL  Consumer Price Index (urban, all items) — inflation proxy
//   UNRATE    Civilian Unemployment Rate
//   FEDFUNDS  Federal Funds Effective Rate
//   DGS10     10-Year Treasury Constant Maturity Rate
//   DGS2      2-Year Treasury Constant Maturity Rate
//
// Disabled gracefully when FRED_API_KEY is absent — callers receive `null`
// per series and an empty list from `fetchAllEconomicData`. The route still
// returns 200 with `source: "disabled"` so the UI can render a clear empty
// state instead of an error.

const FRED_BASE = "https://api.stlouisfed.org/fred";
const FETCH_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 5 * 60_000; // macro data changes slowly

export interface EconomicIndicator {
  seriesId: string;
  label: string;
  value: number;
  unit: string;
  date: string;       // ISO date the observation was published
  changePct: number;  // period-over-period change
}

// Human-friendly labels + display unit per series. FRED returns raw values;
// rates (UNRATE / FEDFUNDS / DGS*) are already in percent, while CPIAUCSL is
// an index and GDP is in billions of current dollars. We tag the unit so the
// UI can format appropriately.
interface SeriesMeta {
  label: string;
  unit: "pct" | "index" | "usd-bn";
}

const SERIES_META: Record<string, SeriesMeta> = {
  GDP: { label: "GDP", unit: "usd-bn" },
  CPIAUCSL: { label: "CPI (Inflation)", unit: "index" },
  UNRATE: { label: "Unemployment Rate", unit: "pct" },
  FEDFUNDS: { label: "Fed Funds Rate", unit: "pct" },
  DGS10: { label: "10Y Treasury Yield", unit: "pct" },
  DGS2: { label: "2Y Treasury Yield", unit: "pct" },
};

export const ECONOMIC_SERIES_IDS = Object.keys(SERIES_META);

interface FredObservation {
  date: string;
  value: string;
}

interface FredObservationsResponse {
  observations?: FredObservation[];
  error_message?: string;
}

interface CachedIndicators {
  ts: number;
  value: EconomicIndicator | null;
}

const cache = new Map<string, CachedIndicators>();
const cacheAll = new Map<string, { ts: number; value: EconomicIndicator[] }>();

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchEconomicData(
  seriesId: string,
): Promise<EconomicIndicator | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  const cached = cache.get(seriesId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  const meta = SERIES_META[seriesId] ?? {
    label: seriesId,
    unit: "pct" as const,
  };
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: "2",
  });
  const url = `${FRED_BASE}/series/observations?${params.toString()}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      cache.set(seriesId, { ts: Date.now(), value: null });
      return null;
    }
    const json = (await res.json()) as FredObservationsResponse;
    if (!json.observations || json.observations.length === 0) {
      cache.set(seriesId, { ts: Date.now(), value: null });
      return null;
    }
    const latest = json.observations[0];
    const prev = json.observations[1];
    const value = parseFloat(latest.value);
    if (!Number.isFinite(value)) {
      cache.set(seriesId, { ts: Date.now(), value: null });
      return null;
    }
    const prevValue = prev ? parseFloat(prev.value) : NaN;
    const changePct =
      Number.isFinite(prevValue) && prevValue !== 0
        ? ((value - prevValue) / Math.abs(prevValue)) * 100
        : 0;
    const indicator: EconomicIndicator = {
      seriesId,
      label: meta.label,
      value,
      unit: meta.unit,
      date: latest.date,
      changePct,
    };
    cache.set(seriesId, { ts: Date.now(), value: indicator });
    return indicator;
  } catch {
    cache.set(seriesId, { ts: Date.now(), value: null });
    return null;
  }
}

export async function fetchAllEconomicData(): Promise<EconomicIndicator[]> {
  const cached = cacheAll.get("all");
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
  const results = await Promise.allSettled(
    ECONOMIC_SERIES_IDS.map((id) => fetchEconomicData(id)),
  );
  const out = results
    .filter(
      (r): r is PromiseFulfilledResult<EconomicIndicator | null> =>
        r.status === "fulfilled" && r.value !== null,
    )
    .map((r) => r.value as EconomicIndicator);
  cacheAll.set("all", { ts: Date.now(), value: out });
  return out;
}

// Surface whether the integration is enabled (env var present). Used by the
// API route to set the `source` badge so the UI can show a clear empty state.
export function isEconomicDataEnabled(): boolean {
  return !!process.env.FRED_API_KEY;
}
