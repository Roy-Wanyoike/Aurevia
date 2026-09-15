import { NextResponse } from "next/server";
import { logger } from "../logger";

// ---------------------------------------------------------------------------
// Aurevia API auth helper.
//
// Issues #70 / #61 / #60 — the v1 API routes had NO auth checks. Anyone who
// could reach the deployment could read portfolio state, mutate the risk
// profile, drive the paper broker, and connect real broker adapters.
//
// Full NextAuth session enforcement in middleware is invasive (every route
// would need a session lookup, the `/api/v1/auth/*` and `/api/v1/health`
// routes need to be exempted, and edge runtime doesn't yet support the
// Prisma adapter cleanly). Instead we expose a simple `requireAuth()` helper
// that route handlers can call at the top of their function. The contract:
//
//   1. In dev (NODE_ENV !== "production") — always passes. Logs a warning
//      the FIRST time a request is seen without credentials so the dev
//      doesn't forget to wire real auth up before deploy.
//   2. In production — requires either an `x-api-key` header OR an
//      `Authorization: Bearer <key>` header, and the value MUST equal
//      process.env.AUREVIA_API_KEY. Returns 401 on mismatch / missing.
//
// Routes that already enforce NextAuth sessions (e.g. /api/auth/*) don't
// need this. Routes that are public by design (e.g. /api/v1/health) don't
// need this. Every other /api/v1/* route SHOULD call `requireAuth(req)` as
// its first line.
//
// Issue #72 — every 401/403 emitted here includes the propagated
// `x-request-id` header so clients can correlate the denial to the original
// request in their own logs.
// ---------------------------------------------------------------------------

let warnedUnauthenticatedDev = false;

export interface AuthResult {
  ok: boolean;
  /** Reason for failure (only set when `ok` is false). */
  reason?: string;
  /** The principal that authenticated — either "api-key" or "dev-bypass". */
  principal?: string;
}

/**
 * Extract the supplied API key from a request, if any.
 *
 * Accepts either:
 *   - `x-api-key: <key>`           (custom header, common in internal APIs)
 *   - `Authorization: Bearer <key>` (standard OAuth2 form)
 */
function extractApiKey(req: Request): string | null {
  const direct = req.headers.get("x-api-key");
  if (direct && direct.trim().length > 0) return direct.trim();

  const authz = req.headers.get("authorization");
  if (authz) {
    const match = /^Bearer\s+(.+)$/i.exec(authz);
    if (match && match[1].trim().length > 0) return match[1].trim();
  }
  return null;
}

/**
 * Check whether the request is authenticated.
 *
 * Returns an `AuthResult` — does NOT throw. Callers decide what to do with
 * a failed result (most will return the provided `unauthorized` response).
 */
export function checkAuth(req: Request): AuthResult {
  const isProd = process.env.NODE_ENV === "production";

  // --- Dev mode: bypass auth but warn loudly on the first unauthenticated
  // request so the developer remembers to wire auth up before deploying.
  // Subsequent dev requests don't spam the log — one warning per process.
  if (!isProd) {
    const supplied = extractApiKey(req);
    if (!supplied && !warnedUnauthenticatedDev) {
      warnedUnauthenticatedDev = true;
      logger.warn(
        "Aurevia API auth bypassed in dev mode — set AUREVIA_API_KEY + NODE_ENV=production to enforce",
        {
          requestId: req.headers.get("x-request-id") ?? "unknown",
          path: new URL(req.url).pathname,
          mode: "dev-bypass",
        },
      );
    }
    return { ok: true, principal: "dev-bypass" };
  }

  // --- Production: require a configured API key + a matching header.
  const expected = process.env.AUREVIA_API_KEY;
  if (!expected || expected.length < 16) {
    // No key configured at all — fail closed. Misconfiguration is an outage,
    // not a security hole.
    logger.error(
      "AUREVIA_API_KEY not configured in production — all API requests will be rejected",
      {
        requestId: req.headers.get("x-request-id") ?? "unknown",
        path: new URL(req.url).pathname,
      },
    );
    return { ok: false, reason: "Server auth misconfiguration" };
  }

  const supplied = extractApiKey(req);
  if (!supplied) {
    return { ok: false, reason: "Missing API key (x-api-key or Authorization: Bearer required)" };
  }
  if (supplied !== expected) {
    logger.warn("API auth failed: invalid API key", {
      requestId: req.headers.get("x-request-id") ?? "unknown",
      path: new URL(req.url).pathname,
    });
    return { ok: false, reason: "Invalid API key" };
  }
  return { ok: true, principal: "api-key" };
}

/**
 * Returns a 401 NextResponse for failed auth, echoing the request-id header
 * for client-side correlation.
 */
export function unauthorized(req: Request, reason: string): NextResponse {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const res = NextResponse.json(
    { error: "unauthorized", reason, requestId },
    { status: 401 },
  );
  res.headers.set("x-request-id", requestId);
  res.headers.set("www-authenticate", 'Bearer realm="aurevia", error="invalid_token"');
  return res;
}

/**
 * Convenience wrapper — call as the first line of a route handler.
 *
 *   const auth = requireAuth(req);
 *   if (!auth.ok) return auth.response!;
 *
 * Returns `{ ok: true, principal }` on success, or `{ ok: false, response }`
 * on failure with a ready-to-return 401 response.
 */
export function requireAuth(req: Request):
  | { ok: true; principal: string }
  | { ok: false; response: NextResponse } {
  const result = checkAuth(req);
  if (result.ok) {
    return { ok: true, principal: result.principal ?? "unknown" };
  }
  return { ok: false, response: unauthorized(req, result.reason ?? "unauthorized") };
}

// ---------------------------------------------------------------------------
// Role-based authorization (issue #130 / BE-003 / SEC-001).
//
// `requireAuth()` only verifies that the caller holds the shared API key
// (or is in dev mode). It does NOT inspect the caller's role, so a
// `viewer`-role principal can mutate any resource that requires `trader+`
// or `admin`. The `requireRole()` helper layers role enforcement on top:
//
//   const auth = requireAuth(req);
//   if (!auth.ok) return auth.response;
//   const role = await requireRole(req, "trader");    // "trader" | "admin" | "viewer"
//   if (!role.ok) return role.response;                // 403
//
// In dev mode, role enforcement is bypassed (returns "admin" so all dev
// flows work). In production, the role is read from the NextAuth session
// (the JWT token carries `role` per `auth-options.ts:45-50`).
//
// Until the per-user session model replaces the shared API key, this
// helper is the primary gate against unauthorized mutations.
// ---------------------------------------------------------------------------

export type UserRole = "viewer" | "trader" | "admin";

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  trader: 1,
  admin: 2,
};

export interface RoleResult {
  ok: boolean;
  role?: UserRole;
  userId?: string | null;
  response?: NextResponse;
}

/**
 * Resolve the caller's role. Call AFTER `requireAuth(req)`.
 *
 * Returns `{ ok: true, role, userId }` on success, or
 * `{ ok: false, response }` with a 403 on insufficient role.
 *
 * In dev mode, returns `role: "admin"` (bypasses role check) so all dev
 * flows work. In production, resolves from the NextAuth session.
 */
export async function requireRole(
  req: Request,
  minimum: UserRole,
): Promise<RoleResult> {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    // Dev bypass — admins can do everything in dev.
    return { ok: true, role: "admin", userId: null };
  }

  // Production: resolve role from the NextAuth session.
  try {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("./auth-options");
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "unauthorized", requestId: req.headers.get("x-request-id") ?? "unknown" },
          { status: 401 },
        ),
      };
    }
    const role = ((session.user as any).role as UserRole) ?? "viewer";
    const userId = (session.user as any).id as string | undefined;
    if (ROLE_RANK[role] < ROLE_RANK[minimum]) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "forbidden",
            reason: `role '${role}' insufficient (requires '${minimum}')`,
            requestId: req.headers.get("x-request-id") ?? "unknown",
          },
          { status: 403 },
        ),
      };
    }
    return { ok: true, role, userId: userId ?? null };
  } catch (e: any) {
    logger.error("requireRole session resolution failed", {
      requestId: req.headers.get("x-request-id") ?? "unknown",
      error: e?.message ?? "unknown",
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: "internal_error" },
        { status: 500 },
      ),
    };
  }
}

/**
 * Returns a 403 NextResponse for forbidden operations.
 */
export function forbidden(req: Request, reason: string): NextResponse {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const res = NextResponse.json(
    { error: "forbidden", reason, requestId },
    { status: 403 },
  );
  res.headers.set("x-request-id", requestId);
  return res;
}
