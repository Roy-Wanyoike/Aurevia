import { describe, it, expect, beforeEach } from "vitest";
import { metrics } from "./metrics";

// ---------------------------------------------------------------------------
// Metrics collector unit tests (Issue #108).
//
// The MetricsCollector is a tiny in-process registry with three families
// (counter / gauge / histogram). Tests cover the basic mutation contract,
// the rolling histogram window, and the Prometheus exposition format.
// ---------------------------------------------------------------------------

describe("MetricsCollector — counters", () => {
  beforeEach(() => metrics.reset());

  it("increment() defaults to +1", () => {
    metrics.increment("orders_total");
    metrics.increment("orders_total");
    expect(metrics.snapshot().counters["orders_total"]).toBe(2);
  });

  it("increment(name, n) adds n", () => {
    metrics.increment("signals_total", 5);
    metrics.increment("signals_total", 3);
    expect(metrics.snapshot().counters["signals_total"]).toBe(8);
  });

  it("increment on a previously-untouched name starts from 0", () => {
    metrics.increment("backtests_total", 10);
    expect(metrics.snapshot().counters["backtests_total"]).toBe(10);
  });
});

describe("MetricsCollector — gauges", () => {
  beforeEach(() => metrics.reset());

  it("setGauge() overwrites the previous value", () => {
    metrics.setGauge("portfolio_equity", 100_000);
    expect(metrics.snapshot().gauges["portfolio_equity"]).toBe(100_000);
    metrics.setGauge("portfolio_equity", 99_500);
    expect(metrics.snapshot().gauges["portfolio_equity"]).toBe(99_500);
  });
});

describe("MetricsCollector — histograms", () => {
  beforeEach(() => metrics.reset());

  it("observe() records values and computes avg/count/last", () => {
    metrics.observe("latency_ms", 10);
    metrics.observe("latency_ms", 20);
    metrics.observe("latency_ms", 30);
    const h = metrics.snapshot().histograms["latency_ms"];
    expect(h.count).toBe(3);
    expect(h.avg).toBeCloseTo(20, 5);
    expect(h.last).toBe(30);
  });

  it("histogram window caps at 100 observations", () => {
    for (let i = 0; i < 150; i++) metrics.observe("window_ms", i);
    const h = metrics.snapshot().histograms["window_ms"];
    expect(h.count).toBe(100);
    // The last 100 values are 50..149, so avg = (50+149)/2 = 99.5
    expect(h.avg).toBeCloseTo(99.5, 1);
    expect(h.last).toBe(149);
  });

  it("observe() on a fresh name does not throw", () => {
    expect(() => metrics.observe("fresh_ms", 42)).not.toThrow();
    expect(metrics.snapshot().histograms["fresh_ms"].count).toBe(1);
  });
});

describe("MetricsCollector — toPrometheus", () => {
  beforeEach(() => metrics.reset());

  it("emits empty string when no metrics are registered", () => {
    expect(metrics.toPrometheus()).toBe("");
  });

  it("emits counter lines with # TYPE declarations", () => {
    metrics.increment("orders_total", 42);
    const out = metrics.toPrometheus();
    expect(out).toContain("# TYPE orders_total counter");
    expect(out).toContain("orders_total 42");
  });

  it("emits gauge lines with # TYPE declarations", () => {
    metrics.setGauge("portfolio_equity", 100123.45);
    const out = metrics.toPrometheus();
    expect(out).toContain("# TYPE portfolio_equity gauge");
    expect(out).toContain("portfolio_equity 100123.45");
  });

  it("emits histogram lines with avg/count/last", () => {
    metrics.observe("latency_ms", 10);
    metrics.observe("latency_ms", 20);
    const out = metrics.toPrometheus();
    expect(out).toContain("# TYPE latency_ms histogram");
    expect(out).toContain("latency_ms_avg 15.00");
    expect(out).toContain("latency_ms_count 2");
    expect(out).toContain("latency_ms_last 20");
  });

  it("emits metrics in alphabetical order by name", () => {
    metrics.setGauge("zebra", 1);
    metrics.setGauge("alpha", 2);
    metrics.setGauge("mid", 3);
    const out = metrics.toPrometheus();
    const alphaIdx = out.indexOf("alpha");
    const midIdx = out.indexOf("mid");
    const zebraIdx = out.indexOf("zebra");
    expect(alphaIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(zebraIdx);
  });

  it("ends with a trailing newline", () => {
    metrics.increment("orders_total", 1);
    const out = metrics.toPrometheus();
    expect(out.endsWith("\n")).toBe(true);
  });
});

describe("MetricsCollector — reset", () => {
  it("clears all counters, gauges, and histograms", () => {
    metrics.increment("c", 1);
    metrics.setGauge("g", 1);
    metrics.observe("h", 1);
    metrics.reset();
    const snap = metrics.snapshot();
    expect(Object.keys(snap.counters)).toHaveLength(0);
    expect(Object.keys(snap.gauges)).toHaveLength(0);
    expect(Object.keys(snap.histograms)).toHaveLength(0);
  });
});
