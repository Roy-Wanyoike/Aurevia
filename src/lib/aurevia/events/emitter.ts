import { db } from "@/lib/db";
import { logger } from "../logger";
import type { AureviaEvent } from "./types";

// ---------------------------------------------------------------------------
// Aurevia Event Emitter.
//
// Persists every event to the `EventLog` Prisma table (see schema.prisma).
// The emitter is INTENTIONALLY failure-tolerant: a write failure is logged
// but never rethrown. The trading pipeline MUST NOT be broken by event-
// logging — losing one event row is preferable to losing one order.
//
// Producers should call `emitEvent()` with the full AureviaEvent shape:
//
//   await emitEvent({
//     eventType: EVENT_TYPES.ORDER_FILLED,
//     timestamp: Date.now(),
//     correlationId: orderId,
//     causationId: signalId,
//     actorId: "paper-broker",
//     tenantId: orgId,
//     schemaVersion: EVENT_SCHEMA_VERSION,
//     payload: { symbol, side, qty, price },
//   });
//
// The `payload` field is JSON.stringified because the dev provider (SQLite)
// stores JSON as a String column. The Postgres prod schema (per ADR-002)
// should switch to a `Json` typed column.
// ---------------------------------------------------------------------------

export async function emitEvent(event: AureviaEvent): Promise<void> {
  try {
    await db.eventLog.create({
      data: {
        eventType: event.eventType,
        correlationId: event.correlationId ?? null,
        causationId: event.causationId ?? null,
        actorId: event.actorId ?? null,
        tenantId: event.tenantId ?? null,
        schemaVersion: event.schemaVersion,
        payload: JSON.stringify(event.payload),
      },
    });
  } catch (e: any) {
    // NEVER let event logging break the trading pipeline — log and continue.
    // The structured logger picks up `requestId` from the surrounding async
    // context if present (the middleware sets it on the request headers); if
    // not, we fall back to the correlationId on the event itself.
    logger.error("Event emit failed", {
      eventType: event.eventType,
      correlationId: event.correlationId,
      actorId: event.actorId,
      tenantId: event.tenantId,
      error: e?.message ?? String(e),
    });
  }
}

/**
 * Emit multiple events in a single Prisma transaction.
 *
 * Useful when a single action produces a fan-out of events (e.g. an order
 * fill produces `ORDER_FILLED` + `POSITION_OPENED` + `RISK_CHECK_PASSED`).
 * If any one write fails, the transaction rolls back and the caller's
 * pipeline continues — but we log loudly so the operator knows events were
 * lost.
 */
export async function emitEvents(events: AureviaEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    await db.$transaction(
      events.map((event) =>
        db.eventLog.create({
          data: {
            eventType: event.eventType,
            correlationId: event.correlationId ?? null,
            causationId: event.causationId ?? null,
            actorId: event.actorId ?? null,
            tenantId: event.tenantId ?? null,
            schemaVersion: event.schemaVersion,
            payload: JSON.stringify(event.payload),
          },
        }),
      ),
    );
  } catch (e: any) {
    logger.error("Batch event emit failed", {
      count: events.length,
      firstEventType: events[0]?.eventType,
      error: e?.message ?? String(e),
    });
  }
}
