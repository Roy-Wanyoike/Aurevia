import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia — Audit log admin endpoint (Issue #112).
//
// GET /api/v1/admin/audit-logs
//   Paginated, filterable listing of audit-log records. Audit logs are
//   IMMUTABLE — there is no POST / PUT / DELETE. A compliance officer can
//   reconstruct who did what, when, and to what entity; they cannot rewrite
//   that history.
//
// Query params:
//   ?actor=system                  — filter by actor (exact match)
//   ?action=ORDER_PLACED           — filter by action (exact match)
//   ?entity=order                  — filter by entity (exact match)
//   ?limit=50                      — page size (1..200, default 50)
//   ?cursor=<id>                   — pagination cursor (the `id` of the last
//                                    record on the previous page; uses Prisma
//                                    cursor-based pagination for stable
//                                    ordering on a growing table)
//   ?order=asc|desc                — newest-first by default (desc)
//
// The endpoint requires auth via `requireAuth()` — same as every other v1
// route. A future RBAC pass will additionally require an `auditor` role.
// ---------------------------------------------------------------------------

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const actor = url.searchParams.get("actor");
    const action = url.searchParams.get("action");
    const entity = url.searchParams.get("entity");
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";
    const limitRaw = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)))
      : DEFAULT_LIMIT;

    // Build the Prisma `where` clause only with the filters that were
    // actually supplied. An empty `where: {}` returns the whole table.
    const where: Record<string, string> = {};
    if (actor) where.actor = actor;
    if (action) where.action = action;
    if (entity) where.entity = entity;

    const rows = await db.auditLog.findMany({
      where,
      orderBy: { timestamp: order },
      take: limit + 1, // fetch one extra to detect a next page
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    logger.debug("Audit logs listed", {
      requestId,
      filters: { actor, action, entity },
      limit,
      order,
      returned: items.length,
      hasMore,
    });

    return NextResponse.json({
      items,
      total: items.length,
      hasMore,
      nextCursor,
      // Echo the applied filters so the client can render the active
      // filter state without re-parsing the URL.
      filters: { actor: actor ?? null, action: action ?? null, entity: entity ?? null },
      order,
    });
  } catch (e: any) {
    logger.error("Audit logs GET failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json(
      { error: "internal_error", requestId },
      { status: 500 },
    );
  }
}
