// ---------------------------------------------------------------------------
// Aurevia Metrics Collector (Issue #108).
//
// Tiny in-process metrics registry: counters, gauges, and (rolling-window)
// histograms. Surfaces everything as Prometheus exposition format via
// `toPrometheus()` for consumption by the /api/v1/metrics route.
//
// Why not use `prom-client`?
//   - Zero new dependencies; the surface area we need is small enough to
//     implement by hand. If/when we need histograms with proper bucket
//     boundaries, quantiles, or remote write, swapping in `prom-client`
//     is a one-day migration that touches only this file.
//
// Concurrency:
//   - Counters / gauges / histograms are mutated synchronously in-process
//     (Node is single-threaded) so no locking is required.
//   - The histogram window is capped at 100 observations; older entries
//     are shifted off the front so the array doesn't grow unbounded.
//
// Naming:
//   - Names should follow the Prometheus convention: `<domain>_<unit>_<verb>`
//     e.g. `orders_total`, `portfolio_equity`, `risk_evaluation_ms`.
//     The `# TYPE` lines emitted by `toPrometheus()` are required by the
//     Prometheus exposition format spec.
// ---------------------------------------------------------------------------

type MetricsSnapshot = {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, { avg: number; count: number; last: number }>;
};

class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private readonly HISTOGRAM_WINDOW = 100;

  /** Increment a named counter. Default increment is 1. */
  increment(name: string, by: number = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  /** Set a named gauge to a snapshot value (e.g. portfolio equity). */
  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  /**
   * Observe a value for a named histogram (e.g. request latency in ms).
   * The window is bounded to HISTOGRAM_WINDOW observations; the oldest
   * entry is shifted out when the cap is reached.
   */
  observe(name: string, value: number): void {
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    const bucket = this.histograms.get(name)!;
    bucket.push(value);
    if (bucket.length > this.HISTOGRAM_WINDOW) bucket.shift();
  }

  /** Reset all metrics. Intended for tests. */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /** Snapshot for assertions in tests. */
  snapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    for (const [k, v] of this.counters) counters[k] = v;
    const gauges: Record<string, number> = {};
    for (const [k, v] of this.gauges) gauges[k] = v;
    const histograms: MetricsSnapshot["histograms"] = {};
    for (const [k, bucket] of this.histograms) {
      if (bucket.length === 0) {
        histograms[k] = { avg: 0, count: 0, last: 0 };
      } else {
        const sum = bucket.reduce((a, b) => a + b, 0);
        histograms[k] = {
          avg: sum / bucket.length,
          count: bucket.length,
          last: bucket[bucket.length - 1],
        };
      }
    }
    return { counters, gauges, histograms };
  }

  /**
   * Render the metrics in Prometheus exposition format (text/plain).
   * Counters → `# TYPE <name> counter\n<name> <value>`
   * Gauges   → `# TYPE <name> gauge\n<name> <value>`
   * Histograms (rolling avg) → `# TYPE <name> histogram\n<name>_avg <value>`
   *
   * NOTE: this is a simplified exposition — Prometheus' real histogram
   * type expects buckets (`_bucket{le="..."}`) and a sum/count pair. The
   * simplified `_avg` line is sufficient for a dev dashboard; the proper
   * bucketing can be added when we wire up `prom-client`.
   */
  toPrometheus(): string {
    const lines: string[] = [];

    // Stable ordering by name so diffs are readable.
    const counterNames = [...this.counters.keys()].sort();
    for (const name of counterNames) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${this.counters.get(name)}`);
    }

    const gaugeNames = [...this.gauges.keys()].sort();
    for (const name of gaugeNames) {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${this.gauges.get(name)}`);
    }

    const histogramNames = [...this.histograms.keys()].sort();
    for (const name of histogramNames) {
      const values = this.histograms.get(name)!;
      if (values.length === 0) continue;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      lines.push(`# TYPE ${name} histogram`);
      lines.push(`${name}_avg ${avg.toFixed(2)}`);
      lines.push(`${name}_count ${values.length}`);
      lines.push(`${name}_last ${values[values.length - 1]}`);
    }

    // Trailing newline so curl output is clean.
    return lines.length > 0 ? `${lines.join("\n")}\n` : "";
  }
}

export const metrics = new MetricsCollector();
