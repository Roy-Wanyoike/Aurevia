// ---------------------------------------------------------------------------
// Aurevia — Audit log writer (Issue #112).
//
// Every sensitive mutation in the API MUST funnel through `auditLog()`. The
// signature accepts the audit fields directly (`actor`, `action`, `entity`,
// `entityId`) plus optional structured fields (`before`, `after`, `reason`,
// `requestId`) which get serialized into the single `detail` column the
// Prisma AuditLog model exposes.
//
// Why a single `detail` column and not separate `before`/`after`/`reason`
// columns? SQLite in dev / a denormalized audit table in prod is the
// existing contract (see prisma/schema.prisma). Adding columns would force
// a migration on every deployment. The `detail` JSON-string is queryable
// via `LIKE` for now and can be promoted to a JSON column later without
// changing any caller — the function's parameters stay the same.
//
// CRITICAL: this function MUST NEVER throw. Audit logging is a safety
// control, not a critical-path operation — if it fails (DB down, schema
// drift, malformed detail), we log to stderr and continue. The trading
// pipeline cannot be allowed to fail because the audit sink is unavailable.
// (Compliance trade-off: a missed audit record is recoverable via the
// EventLog table; a missed order is not.)
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";

export interface AuditLogParams {
  actor: string;
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
  before?: string;
  after?: string;
  reason?: string;
  requestId?: string;
}

/**
 * Write a single audit record. Resolves to `void` — callers do NOT need to
 * await it (the audit failure path is silent by design), but awaiting gives
 * ordering guarantees that matter for the integration tests.
 *
 * On failure, logs to stderr and returns normally — never throws.
 */
export async function auditLog(params: AuditLogParams): Promise<void> {
  try {
    // If the caller supplied an explicit `detail` string, use it verbatim
    // (they may have already serialized a richer object). Otherwise build
    // a structured detail payload from the before/after/reason/requestId
    // fields so the record is still self-describing.
    const detail =
      params.detail ??
      JSON.stringify({
        before: params.before,
        after: params.after,
        reason: params.reason,
        requestId: params.requestId,
      });

    await db.auditLog.create({
      data: {
        actor: params.actor,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        detail,
      },
    });
  } catch (e) {
    // Never let audit logging break the trading pipeline. Log loudly so ops
    // sees the missed record, but swallow the exception.
    console.error("[aurevia] audit log failed:", e);
  }
}
