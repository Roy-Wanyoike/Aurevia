import { describe, it, expect, beforeEach } from "vitest";
import {
  rateLimitKey,
  extractClientIp,
  _resetRateLimiterForTests,
} from "./rate-limit";

// ---------------------------------------------------------------------------
// Per-key rate limiter unit tests (Issue #141 / SEC-005).
//
// The per-key limiter is independent from the global `rateLimit(ip)` — it
// runs in a separate namespace so a flood of blog engagement requests
// doesn't exhaust the global 60/min budget.
//
// Tests cover: under-limit, at-limit, over-limit, window reset, key
// isolation, IP extraction edge cases.
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetRateLimiterForTests();
});

describe("rateLimitKey", () => {
  it("allows requests under the limit", () => {
    const r1 = rateLimitKey("test-key", 5);
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(4);
    expect(r1.limit).toBe(5);

    const r2 = rateLimitKey("test-key", 5);
    expect(r2.ok).toBe(true);
    expect(r2.remaining).toBe(3);
  });

  it("blocks the (max+1)th request", () => {
    for (let i = 0; i < 5; i++) {
      const r = rateLimitKey("blocked-key", 5);
      expect(r.ok).toBe(true);
    }
    // 6th request should be blocked
    const blocked = rateLimitKey("blocked-key", 5);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.limit).toBe(5);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("isolates different keys (independent buckets)", () => {
    // Exhaust key A
    for (let i = 0; i < 3; i++) {
      rateLimitKey("key-a", 3);
    }
    const blockedA = rateLimitKey("key-a", 3);
    expect(blockedA.ok).toBe(false);

    // Key B should still have all 3 requests available
    const b1 = rateLimitKey("key-b", 3);
    expect(b1.ok).toBe(true);
    expect(b1.remaining).toBe(2);
  });

  it("isolates by IP within the same route", () => {
    const key1 = `blog:like:article-x:1.2.3.4`;
    const key2 = `blog:like:article-x:5.6.7.8`;

    // Exhaust IP 1's budget
    for (let i = 0; i < 10; i++) {
      rateLimitKey(key1, 10);
    }
    expect(rateLimitKey(key1, 10).ok).toBe(false);

    // IP 2 should still be able to like
    expect(rateLimitKey(key2, 10).ok).toBe(true);
  });

  it("isolates by article slug within the same route + IP", () => {
    const key1 = `blog:like:article-a:1.2.3.4`;
    const key2 = `blog:like:article-b:1.2.3.4`;

    // Exhaust article A's budget for IP 1
    for (let i = 0; i < 10; i++) {
      rateLimitKey(key1, 10);
    }
    expect(rateLimitKey(key1, 10).ok).toBe(false);

    // Same IP, different article — should still work
    expect(rateLimitKey(key2, 10).ok).toBe(true);
  });

  it("respects custom windowMs", () => {
    // 100ms window
    for (let i = 0; i < 3; i++) {
      rateLimitKey("short-window", 3, 100);
    }
    expect(rateLimitKey("short-window", 3, 100).ok).toBe(false);

    // Wait 150ms — window should reset
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const r = rateLimitKey("short-window", 3, 100);
        expect(r.ok).toBe(true);
        resolve();
      }, 150);
    });
  });

  it("returns the limit in the result for client-facing headers", () => {
    const r = rateLimitKey("header-test", 30);
    expect(r.limit).toBe(30);
  });

  it("handles max=1 (single-shot limit)", () => {
    const r1 = rateLimitKey("single-shot", 1);
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(0);

    const r2 = rateLimitKey("single-shot", 1);
    expect(r2.ok).toBe(false);
    expect(r2.retryAfterMs).toBeGreaterThan(0);
  });
});

describe("extractClientIp", () => {
  it("extracts the first hop of x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" },
    });
    expect(extractClientIp(req)).toBe("1.2.3.4");
  });

  it("trims whitespace around the IP", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" },
    });
    expect(extractClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(extractClientIp(req)).toBe("1.2.3.4");
  });

  it("prefers x-forwarded-for over x-real-ip when both are present", () => {
    const req = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "1.1.1.1",
        "x-real-ip": "2.2.2.2",
      },
    });
    expect(extractClientIp(req)).toBe("1.1.1.1");
  });

  it("returns 'unknown' when no IP headers are present", () => {
    const req = new Request("https://example.com");
    expect(extractClientIp(req)).toBe("unknown");
  });

  it("returns 'unknown' for empty x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "" },
    });
    expect(extractClientIp(req)).toBe("unknown");
  });
});
