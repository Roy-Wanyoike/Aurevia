// ---------------------------------------------------------------------------
// Aurevia Prometheus metrics endpoint (Issue #108).
//
// GET /api/v1/metrics — exposes the in-process MetricsCollector as
// Prometheus exposition-format text/plain.
//
// Wire format example:
//
//   # TYPE orders_total counter
//   orders_total 42
//   # TYPE portfolio_equity gauge
//   portfolio_equity 100123.45
//   # TYPE risk_evaluation_ms histogram
//   risk_evaluation_ms_avg 12.34
//   risk_evaluation_ms_count 100
//   risk_evaluation_ms_last 9.00
//
// `force-dynamic` so Next.js doesn't try to cache the route at build time
// — the whole point of a metrics endpoint is that it reflects the current
// in-process state.
//
// On every request the route refreshes a small set of "live" gauges from
// the runtime store (portfolio equity / drawdown, signal count, breaker
// state) and increments a `metrics_requests_total` counter. This makes the
// endpoint useful out-of-the-box for smoke testing without requiring every
// other route to wire up instrumentation first.
// ---------------------------------------------------------------------------

import { metrics } from "@/lib/aurevia/monitoring/metrics";
import { store } from "@/lib/aurevia/store";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  // Increment a self-referential counter so the endpoint is never empty —
  // useful for smoke tests + proves the Prometheus exposition format renders.
  metrics.increment("metrics_requests_total");

  // Refresh a handful of live gauges derived from the store. Doing this on
  // every metrics scrape (rather than via a separate background ticker)
  // keeps the values fresh without coupling metrics collection to another
  // lifecycle hook.
  try {
    const portfolio = store.getPortfolio();
    metrics.setGauge("portfolio_equity", Math.round(portfolio.equity));
    metrics.setGauge("portfolio_drawdown", Number((portfolio.drawdown * 100).toFixed(2)));
    metrics.setGauge("portfolio_exposure", Number((portfolio.exposure * 100).toFixed(2)));
    metrics.setGauge("signals_tracked", store.signals.length);
    metrics.setGauge("orders_placed", store.orders.length);
    metrics.setGauge("backtests_run", store.backtests.length);
    metrics.setGauge("asset_universe_size", store.assetCatalog.length);
    // Circuit breaker as a 0/1 gauge so Prometheus alerting can fire on
    // breaker_active == 1 (1 == any non-NORMAL state).
    metrics.setGauge(
      "circuit_breaker_active",
      store.riskProfile.circuitBreakerState === "NORMAL" ? 0 : 1,
    );
  } catch {
    // If the store throws (e.g. mid-init), still return whatever metrics we
    // have — the counter increment above guarantees at least one line.
  }

  return new Response(metrics.toPrometheus(), {
    headers: {
      // `version=0.0.4` is the Prometheus exposition format version. The
      // Content-Type is what `prometheus` scrapers expect; without it
      // Prometheus treats the response as plain text and skips parsing.
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
