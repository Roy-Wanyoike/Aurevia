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
// ---------------------------------------------------------------------------

import { metrics } from "@/lib/aurevia/monitoring/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
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
