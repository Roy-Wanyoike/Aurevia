import type { Candle } from "../types";

// ---------------------------------------------------------------------------
// Aurevia Data Quality Scoring.
//
// Every market-data provider (simulated, polygon, alpaca, ...) gets its
// output scored before the engine trusts it. The score is a 0-100
// composite of three sub-scores:
//
//   - freshness    (40%) — how recent is the last candle?
//   - completeness (30%) — are there gaps in the time series?
//   - accuracy     (30%) — are there implausible outliers?
//
// The composite `score` is what the UI badge displays. Sub-scores are
// surfaced so the operator can see WHICH axis is degraded.
//
// Threshold defaults:
//   - freshness: 100 if <5min old, 0 if >60min old (linear in between)
//   - completeness: 100 minus (gap_count / total_candles * 100)
//   - accuracy: 100 minus (outlier_count / total_candles * 100)
//               where an outlier is a bar whose close moved >20% vs prior close
//
// These thresholds are conservative. Tuning them per-asset-class (crypto
// bars are noisier than large-cap equities) is a follow-up task.
// ---------------------------------------------------------------------------

export interface DataQuality {
  /** 0-100, 100 = just updated. Weighted 40% of composite. */
  freshness: number;
  /** 0-100, 100 = no gaps. Weighted 30% of composite. */
  completeness: number;
  /** 0-100, 100 = no outliers. Weighted 30% of composite. */
  accuracy: number;
  /** 0-100 composite. */
  score: number;
  /** Source provider id (e.g. "simulated", "polygon"). */
  source: string;
  /** Epoch ms of the last candle. */
  lastUpdate: number;
  /** Count of detected time gaps in the series. */
  gaps: number;
  /** Count of detected outlier candles. */
  outliers: number;
}

// Tunable thresholds — exported so tests + callers can override.
export const FRESHNESS_WINDOW_MS_100 = 5 * 60_000; // 5 min → freshness 100
export const FRESHNESS_WINDOW_MS_0 = 60 * 60_000; // 60 min → freshness 0
export const OUTLIER_CHANGE_PCT = 0.2; // >20% bar-to-bar move = outlier

/**
 * Compute a DataQuality score for a candle series.
 *
 * Empty / null input returns a zeroed-out score (the engine treats a 0
 * score as "data unusable, fall back to the next provider" — see
 * `market-data/gateway.ts`).
 */
export function computeDataQuality(
  candles: Candle[] | null | undefined,
  source: string = "simulated",
): DataQuality {
  if (!candles || candles.length === 0) {
    return {
      freshness: 0,
      completeness: 0,
      accuracy: 0,
      score: 0,
      source,
      lastUpdate: 0,
      gaps: 0,
      outliers: 0,
    };
  }

  const last = candles[candles.length - 1];
  const now = Date.now();
  const ageMs = now - last.time;

  // --- Freshness ---
  // Linear ramp: 100 at FRESHNESS_WINDOW_MS_100, 0 at FRESHNESS_WINDOW_MS_0.
  // Age below the 5-min threshold clamps to 100; age above 60-min clamps to 0.
  let freshness: number;
  if (ageMs <= FRESHNESS_WINDOW_MS_100) {
    freshness = 100;
  } else if (ageMs >= FRESHNESS_WINDOW_MS_0) {
    freshness = 0;
  } else {
    const span = FRESHNESS_WINDOW_MS_0 - FRESHNESS_WINDOW_MS_100;
    freshness = 100 * (1 - (ageMs - FRESHNESS_WINDOW_MS_100) / span);
  }
  freshness = clamp0to100(freshness);

  // --- Completeness ---
  // Walk adjacent pairs and count "gaps". A gap is when the inter-bar
  // interval is >2× the expected interval of the prior pair. The expected
  // interval is derived from the median of inter-bar deltas so a single
  // anomalous bar doesn't poison the threshold.
  let gaps = 0;
  if (candles.length >= 3) {
    // Derive expected interval from the first three bars (robust enough
    // for a single series; for multi-source data the gateway already
    // homogenizes the timeframe).
    const intervals: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      intervals.push(candles[i].time - candles[i - 1].time);
    }
    const expectedInterval = median(intervals);
    for (let i = 1; i < candles.length; i++) {
      const actualGap = candles[i].time - candles[i - 1].time;
      if (expectedInterval > 0 && actualGap > expectedInterval * 2) {
        gaps++;
      }
    }
  }
  const completeness = clamp0to100(100 - (gaps / candles.length) * 100);

  // --- Accuracy ---
  // Outlier = a bar whose close moved > OUTLIER_CHANGE_PCT vs the prior
  // close. Counts as one outlier per offending bar. The first bar is
  // skipped (no prior reference).
  let outliers = 0;
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    if (prev > 0) {
      const change = Math.abs((candles[i].close - prev) / prev);
      if (change > OUTLIER_CHANGE_PCT) outliers++;
    }
  }
  const accuracy = clamp0to100(100 - (outliers / candles.length) * 100);

  // --- Composite (weighted) ---
  const score = Math.round(freshness * 0.4 + completeness * 0.3 + accuracy * 0.3);

  return {
    freshness: Math.round(freshness),
    completeness: Math.round(completeness),
    accuracy: Math.round(accuracy),
    score,
    source,
    lastUpdate: last.time,
    gaps,
    outliers,
  };
}

function clamp0to100(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
