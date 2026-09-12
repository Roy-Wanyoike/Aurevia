// Simple in-memory rate limiter (sliding-window-per-IP).
//
// No Redis required for single-instance deployments. If we ever scale
// horizontally, swap this for a Redis-backed token bucket — the call surface
// (`rateLimit(ip) → { ok, remaining, retryAfterMs }`) does not need to change.
//
// Limits are configurable via the `RATE_LIMIT_PER_MINUTE` env var (default 60).

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
  return {
    ok: true,
    remaining: Math.max(0, MAX_REQUESTS - recent.length),
    retryAfterMs: 0,
  };
}

// Test/diagnostics hook — clears the in-memory map. Not exposed via HTTP.
export function _resetRateLimiterForTests(): void {
  hits.clear();
}
