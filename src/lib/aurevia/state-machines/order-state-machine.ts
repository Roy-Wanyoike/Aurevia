// ---------------------------------------------------------------------------
// Aurevia Order State Machine.
//
// Encodes the legal lifecycle of an order. Every state transition in the
// trading pipeline MUST pass through `assertTransition()` — illegal jumps
// (e.g. FILLED → SUBMITTED) throw, surfacing bugs early instead of silently
// corrupting the order book.
//
// The states here mirror `OrderRecord["status"]` in `src/lib/aurevia/types.ts`
// and the `status` column on the `Order` Prisma model. When that source-of-
// truth changes, this file MUST be updated.
// ---------------------------------------------------------------------------

export type OrderState =
  | "CREATED"
  | "SUBMITTED"
  | "ACKNOWLEDGED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "REJECTED"
  | "UNKNOWN";

const LEGAL_TRANSITIONS: Record<OrderState, OrderState[]> = {
  CREATED: ["SUBMITTED", "REJECTED", "CANCELLED"],
  SUBMITTED: ["ACKNOWLEDGED", "REJECTED", "CANCEL_REQUESTED", "UNKNOWN"],
  ACKNOWLEDGED: [
    "PARTIALLY_FILLED",
    "FILLED",
    "REJECTED",
    "CANCEL_REQUESTED",
    "UNKNOWN",
  ],
  // Partial fills can continue filling (additional partial) or complete.
  // Cancellation is allowed mid-fill — the unfilled remainder is cancelled.
  PARTIALLY_FILLED: ["PARTIALLY_FILLED", "FILLED", "CANCEL_REQUESTED"],
  // Terminal states — no further transitions.
  FILLED: [],
  CANCEL_REQUESTED: ["CANCELLED"],
  CANCELLED: [],
  REJECTED: [],
  // UNKNOWN is the reconciliation-pending state. The order lives at the
  // broker but we lost track of its state. We must reconcile before retry:
  // either re-submit (if broker confirms it was never placed) or cancel.
  UNKNOWN: ["SUBMITTED", "CANCELLED"],
};

export function canTransition(from: OrderState, to: OrderState): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: OrderState, to: OrderState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal order state transition: ${from} → ${to}`);
  }
}

export function isTerminal(state: OrderState): boolean {
  return LEGAL_TRANSITIONS[state].length === 0;
}

export function legalNextStates(state: OrderState): OrderState[] {
  return [...LEGAL_TRANSITIONS[state]];
}
