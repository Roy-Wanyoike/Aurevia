// Simple in-memory rate limiter (sliding-window-per-IP).
//
// No Redis required for single-instance deployments. If we ever scale
// horizontally, swap this for a Redis-backed token bucket — the call surface
// (`rateLimit(ip) → { ok, remaining, retryAfterMs }`) does not need to change.
//
// Limits are configurable via the `RATE_LIMIT_PER_MINUTE` env var (default 60).
//
// Issue #79 — memory leak. The previous implementation stored every IP that
// ever hit the API forever; under a distributed attack or even normal churn
// (NAT pools, rotating mobile IPs) the Map grew unbounded. We now:
//   1. Filter stale timestamps on every check (already done — this keeps
//      per-IP arrays small, but the keys themselves lingered).
//   2. Periodically (1% of calls) sweep the entire map and delete IPs whose
//      recent history is empty. 1% is a cheap probabilistic GC — at 60
//      req/min it fires roughly once per minute, which is plenty.

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 60);
const hits = new Map<string, number[]>(); // IP → timestamps

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function rateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const history = hits.get(ip) ?? [];
  // Always filter stale entries on the active IP — keeps per-IP memory tight.
  const recent = history.filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    const oldest = recent[0];
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(1, WINDOW_MS - (now - oldest)),
    };
  }
  recent.push(now);
  hits.set(ip, recent);

  // Issue #79 — probabilistic global GC. Runs ~1% of the time so amortized
  // cost is one full sweep per 100 requests. Each sweep walks every entry
  // in the map (typically O(hundreds) for a single-instance deployment)
  // and deletes IPs with no fresh hits. Without this, the map grew forever.
  if (Math.random() < 0.01) {
    for (const [key, ts] of hits.entries()) {
      const fresh = ts.filter((t) => now - t < WINDOW_MS);
      if (fresh.length === 0) hits.delete(key);
      else if (fresh.length !== ts.length) hits.set(key, fresh);
    }
  }

  return {
    ok: true,
    remaining: Math.max(0, MAX_REQUESTS - recent.length),
    retryAfterMs: 0,
  };
}

// Test/diagnostics hook — clears the in-memory map. Not exposed via HTTP.
export function _resetRateLimiterForTests(): void {
  hits.clear();
  perKeyBuckets.clear();
}

// ---------------------------------------------------------------------------
// Per-key rate limiter (Issue #141 / SEC-005).
//
// The global `rateLimit(ip)` is for the middleware's broad 60/min-per-IP
// gate. Some routes need stricter per-route limits — e.g. blog engagement
// endpoints (view, like, comment) are public-facing and need tighter caps
// to prevent abuse (view-count inflation, like-flooding, comment spam).
//
// `rateLimitKey(key, max, windowMs)` tracks hits under a separate namespace
// so it doesn't interfere with the global limiter. The key is typically
// `${routeName}:${ip}:${articleSlug}` — this lets us cap "10 likes per
// article per IP per minute" without affecting the global 60/min budget.
//
// Same in-memory + sliding-window + probabilistic GC pattern as the
// global limiter. Single-instance only — swap for Redis token bucket
// when scaling horizontally (R-14).
// ---------------------------------------------------------------------------

interface KeyBucket {
  hits: number[];
}
const perKeyBuckets = new Map<string, KeyBucket>();

export interface PerKeyRateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
}

export function rateLimitKey(
  key: string,
  max: number,
  windowMs: number = 60_000,
): PerKeyRateLimitResult {
  const now = Date.now();
  const bucket = perKeyBuckets.get(key);
  const history = bucket?.hits ?? [];
  const recent = history.filter((t) => now - t < windowMs);

  if (recent.length >= max) {
    const oldest = recent[0];
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(1, windowMs - (now - oldest)),
      limit: max,
    };
  }
  recent.push(now);
  perKeyBuckets.set(key, { hits: recent });

  // Probabilistic GC — same 1% sweep as the global limiter.
  if (Math.random() < 0.01) {
    for (const [k, b] of perKeyBuckets.entries()) {
      const fresh = b.hits.filter((t) => now - t < windowMs);
      if (fresh.length === 0) perKeyBuckets.delete(k);
      else if (fresh.length !== b.hits.length) perKeyBuckets.set(k, { hits: fresh });
    }
  }

  return {
    ok: true,
    remaining: Math.max(0, max - recent.length),
    retryAfterMs: 0,
    limit: max,
  };
}

/**
 * Extract a stable client IP from a request. Prefers the first hop of
 * `x-forwarded-for` (set by Caddy / load balancer), then `x-real-ip`,
 * then NextRequest's `ip` property, then "unknown" as a fallback.
 *
 * Issue #141 / SEC-005 — for per-route rate limits we need a stable key.
 * The middleware already trusts `x-forwarded-for` for the global limiter,
 * so we use the same extraction here for consistency.
 */
export function extractClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
