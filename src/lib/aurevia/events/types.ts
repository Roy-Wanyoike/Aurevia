// ---------------------------------------------------------------------------
// Aurevia Event Type Constants.
//
// Single source of truth for every event the platform emits to the
// `EventLog` Prisma table (see `emitter.ts`). Adding a new event type is a
// one-line change here — the TypeScript type, the string literal, and the
// Prisma payload `eventType` column all flow from this constant.
//
// Naming convention: <DOMAIN>_<PAST_TENSE_VERB>
//   - MARKET_PRICE_UPDATED (not MARKET_UPDATE_PRICE)
//   - ORDER_FILLED        (not ORDER_FILL)
//   - TRADING_PAUSED      (not PAUSE_TRADING)
//
// Every event must map to:
//   - a producer in src/lib/aurevia/*
//   - a documented column shape in docs/AUDIT/SECURITY_AUDIT.md
// ---------------------------------------------------------------------------

export const EVENT_TYPES = {
  // --- Market data ---
  MARKET_PRICE_UPDATED: "MARKET_PRICE_UPDATED",
  MARKET_DATA_STALE: "MARKET_DATA_STALE",

  // --- Signal generation ---
  SIGNAL_CREATED: "SIGNAL_CREATED",

  // --- Risk engine ---
  RISK_CHECK_PASSED: "RISK_CHECK_PASSED",
  RISK_CHECK_FAILED: "RISK_CHECK_FAILED",
  CIRCUIT_BREAKER_TRIGGERED: "CIRCUIT_BREAKER_TRIGGERED",
  TRADING_PAUSED: "TRADING_PAUSED",
  TRADING_RESUMED: "TRADING_RESUMED",

  // --- Order lifecycle (mirrors OrderState from #92) ---
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_SUBMITTED: "ORDER_SUBMITTED",
  ORDER_ACKNOWLEDGED: "ORDER_ACKNOWLEDGED",
  ORDER_PARTIALLY_FILLED: "ORDER_PARTIALLY_FILLED",
  ORDER_FILLED: "ORDER_FILLED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  ORDER_REJECTED: "ORDER_REJECTED",

  // --- Positions ---
  POSITION_OPENED: "POSITION_OPENED",
  POSITION_CLOSED: "POSITION_CLOSED",

  // --- Broker lifecycle ---
  BROKER_CONNECTED: "BROKER_CONNECTED",
  BROKER_DISCONNECTED: "BROKER_DISCONNECTED",
  RECONCILIATION_FAILED: "RECONCILIATION_FAILED",

  // --- Alerts ---
  ALERT_TRIGGERED: "ALERT_TRIGGERED",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/**
 * Canonical Aurevia event shape.
 *
 * Every producer MUST populate:
 *   - `eventType`     — one of the constants above
 *   - `timestamp`     — epoch ms (NOT a Date — JSON-safe, sortable as a number)
 *   - `schemaVersion` — bump when the payload shape changes (audit-grade)
 *   - `payload`        — domain-specific JSON
 *
 * Optional fields:
 *   - `correlationId` — links events in the same request / trade lifecycle
 *   - `causationId`   — links an event to its cause (e.g. ORDER_FILLED caused
 *                        by SIGNAL_CREATED with this ID)
 *   - `actorId`       — user or system component that triggered the event
 *   - `tenantId`      — organization ID (multi-tenant filtering)
 */
export interface AureviaEvent {
  eventType: EventType;
  timestamp: number;
  correlationId?: string;
  causationId?: string;
  actorId?: string;
  tenantId?: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
}

/**
 * Current event schema version. Bump when the payload shape changes for any
 * event type — old consumers should be able to skip events whose
 * `schemaVersion` they don't recognize.
 */
export const EVENT_SCHEMA_VERSION = 1;
