import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/aurevia/rate-limit";
import { logger } from "@/lib/aurevia/logger";

// Aurevia edge middleware.
//
// Responsibilities:
//   1. Generate / propagate a request ID. The inbound `x-request-id` header
//      is preserved if present; otherwise a fresh UUID v4 is generated. The
//      ID is forwarded to the route handler via the same header so API code
//      can include it in structured logs.
//   2. Enforce a per-IP rate limit on API routes (default 60 req/min,
//      configurable via RATE_LIMIT_PER_MINUTE). Exceeded requests get HTTP 429
//      with a `Retry-After` header.
//   3. Page-level auth guard. In production, every non-public page request is
//      checked for a NextAuth session cookie; unauthenticated users are
//      redirected to /auth/signin?callbackUrl=<original>. In dev mode the
//      guard is bypassed so the loopback developer isn't blocked out of the
//      dashboard before any session exists. An explicit opt-out is also
//      available via NEXT_PUBLIC_BYPASS_AUTH=true.
//
// Issue #67: previously the generated requestId was set on the response only
// and never propagated to the route handler — log correlation was broken.
// Issue #117: the page-level auth check now gates all authenticated routes.

// Paths that are always reachable without a session. Add new public paths
// here — keep this list short, the default should be "needs a session".
const PUBLIC_PATHS = [
  "/auth",
  "/api",
  "/_next",
  "/favicon.ico",
  "/branding",
  "/robots.txt",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

// Bypass the auth guard entirely — useful for previews, e2e runs, or local dev
// where no session exists yet. The runtime check reads `process.env` at
// request time (middleware runs in the edge runtime where env is injected
// into the process) — not at module load, so toggling the env var deploys a
// new function version that picks it up.
function shouldBypassAuth(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.NEXT_PUBLIC_BYPASS_AUTH === "true") return true;
  return false;
}

export function middleware(req: NextRequest) {
  // Step 1: request ID.
  const inboundRequestId = req.headers.get("x-request-id");
  const requestId = inboundRequestId ?? crypto.randomUUID();

  // Propagate the request ID to the route handler by mutating the request
  // headers via NextResponse.next({ request: { headers } }). This is the
  // only way the route handler can read the auto-generated ID.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const pathname = req.nextUrl.pathname;

  // Step 2: page-level auth guard. Runs BEFORE rate-limiting so a redirect
  // short-circuits any rate-limit accounting. Only applies to non-public
  // paths and only in production (or when bypass is explicitly disabled).
  if (!isPublicPath(pathname) && !shouldBypassAuth()) {
    const sessionToken =
      req.cookies.get("next-auth.session-token")?.value ||
      req.cookies.get("__Secure-next-auth.session-token")?.value;

    if (!sessionToken) {
      const signInUrl = new URL("/auth/signin", req.url);
      signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
      logger.info("Auth redirect → /auth/signin", {
        requestId,
        path: pathname,
        status: "REDIRECT",
      });
      const redirect = NextResponse.redirect(signInUrl);
      redirect.headers.set("x-request-id", requestId);
      return redirect;
    }
  }

  // Step 3: rate limit by IP. Only applies to API routes — page requests
  // don't need rate limiting (the auth check above is their gate). Behind
  // Caddy/load balancer the client IP is in `x-forwarded-for` (first hop).
  // Fall back to the NextRequest `ip` and then to a synthetic "unknown" key.
  const isApiRoute = pathname === "/api" || pathname.startsWith("/api/");
  if (isApiRoute) {
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
        path: pathname,
      });
    }
    return res;
  }

  // Page request that passed the auth check (or was bypassed) — pass through.
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  // Run on everything except Next.js internals (`_next/static`, `_next/image`
  // are still matched because they're under `/_next` — but the runtime check
  // for `isPublicPath` skips them, so the cost is one cookie read per static
  // asset request, which is negligible).
  //
  // We deliberately include `/api/:path*` here too so the request-ID
  // propagation + rate limit applies to API requests. The auth guard above
  // only fires for non-public paths, so API routes aren't double-gated.
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image  (image optimization files)
     *
     * Note: we DO match /_next/* otherwise because /_next/data can carry
     * route handlers. The isPublicPath check inside the middleware
     * short-circuits the auth guard for static assets.
     */
    "/((?!_next/static|_next/image).*)",
  ],
};
