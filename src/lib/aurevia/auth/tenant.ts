import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";

// ---------------------------------------------------------------------------
// Aurevia tenant isolation helper.
//
// Issue #97 — multi-tenant enforcement contract.
//
// The Aurevia runtime store (`src/lib/aurevia/store.ts`) is currently a single
// in-memory singleton shared across all requests. In dev / single-operator
// mode that's fine. Before opening the platform to multiple organizations,
// every API route that reads or mutates tenant-scoped state MUST resolve the
// caller's tenant context at the API boundary and thread it through to the
// store / Prisma layer.
//
// This module establishes that contract:
//
//   1. `requireTenant()` — call at the top of a route handler. Resolves the
//      caller's `userId` and `organizationId`. In dev mode (no auth wired up)
//      it returns a synthetic dev tenant so local development is unblocked.
//      In production it requires an authenticated NextAuth session and throws
//      a 401 Response otherwise — Next.js propagates the thrown Response as
//      the HTTP response, the same pattern Remix / Next 13+ route handlers
//      use for boundary-style control flow.
//
//   2. `withTenantFilter(filter, tenant)` — pure helper that augments a Prisma
//      `where` clause with `organizationId` when the tenant has one. In dev
//      mode (organizationId=null) the filter is returned unchanged so the
//      query behaves as before — no behavioral change until multi-tenancy is
//      fully wired.
//
// The store itself is intentionally NOT modified in this PR — it remains a
// singleton. The `requireTenant()` call at the API boundary is the contract:
// once the store grows a per-tenant facade (or once the routes move to a
// Prisma-backed implementation), the tenant value resolved here is what flows
// downstream.
// ---------------------------------------------------------------------------

// Extract tenant context from the authenticated session.
// In dev mode (no auth), returns a default tenant.
// In production, requires authenticated session with organizationId.
export async function requireTenant(): Promise<{ userId: string; organizationId: string | null }> {
  // Dev mode bypass — no auth configured
  if (process.env.NODE_ENV !== "production") {
    return { userId: "dev-user", organizationId: null };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const userId = (session.user as any).id;
  if (!userId) {
    throw new Response("Invalid session", { status: 401 });
  }

  // Issue #161 — organizationId is now populated by the NextAuth session
  // callback (see auth-options.ts), which looks up the user's primary
  // Membership on every session read. This makes withTenantFilter(...)
  // actually filter by org in production — cross-tenant isolation is no
  // longer decorative. Falls back to null when the user has no membership,
  // in which case withTenantFilter(...) skips the filter (preserves the
  // dev-mode behavior for demo content stamped organizationId: null).
  const organizationId = (session.user as any).organizationId ?? null;
  return { userId, organizationId };
}

// Filter helper for Prisma queries — adds organizationId to where clause
// when available. In dev mode, returns the filter unchanged.
export function withTenantFilter<T extends Record<string, any>>(
  filter: T,
  tenant: { organizationId: string | null }
): T {
  if (!tenant.organizationId) return filter;
  return { ...filter, organizationId: tenant.organizationId };
}
