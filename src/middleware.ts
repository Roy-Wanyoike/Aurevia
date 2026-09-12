import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/aurevia/rate-limit";
import { logger } from "@/lib/aurevia/logger";

// Aurevia edge middleware — runs on every `/api/*` request.
//
// Responsibilities:
//   1. Generate / propagate a request ID. The inbound `x-request-id` header
//      is preserved if present; otherwise a fresh UUID v4 is generated. The
//      ID is forwarded to the route handler via the same header so API code
//      can include it in structured logs.
//   2. Enforce a per-IP rate limit (default 60 req/min, configurable via
//      RATE_LIMIT_PER_MINUTE). Exceeded requests get HTTP 429 with a
//      `Retry-After` header.
//
// Issue #67: previously the generated requestId was set on the response only
// and never propagated to the route handler — log correlation was broken.

export function middleware(req: NextRequest) {
  // Step 1: request ID.
  const inboundRequestId = req.headers.get("x-request-id");
  const requestId = inboundRequestId ?? crypto.randomUUID();

  // Propagate the request ID to the route handler by mutating the request
  // headers via NextResponse.next({ request: { headers } }). This is the
  // only way the route handler can read the auto-generated ID.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  // Step 2: rate limit by IP. Behind Caddy/load balancer the client IP is in
  // `x-forwarded-for` (first hop). Fall back to the NextRequest `ip` and then
  // to a synthetic "unknown" key.
  const xff = req.headers.get("x-forwarded-for");
  const ip =
    (xff && xff.split(",")[0]?.trim()) ||
    req.headers.get("x-real-ip") ||
    (req as any).ip ||
    "unknown";

  const limit = rateLimit(ip);

  // Always echo the request ID back so clients can correlate.
  const res = limit.ok
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : NextResponse.json(
        { error: "rate limit exceeded", retryAfterMs: limit.retryAfterMs },
        { status: 429 },
      );
  res.headers.set("x-request-id", requestId);
  res.headers.set("x-ratelimit-remaining", String(limit.remaining));
  if (!limit.ok) {
    // Retry-After is in seconds per RFC 7231.
    res.headers.set("retry-after", String(Math.ceil(limit.retryAfterMs / 1000)));
    logger.warn("Rate limit exceeded", {
      requestId,
      ip,
      path: req.nextUrl.pathname,
    });
  }
  return res;
}

export const config = {
  // Only run on API routes — page requests don't need a request ID or rate limit.
  matcher: "/api/:path*",
};
