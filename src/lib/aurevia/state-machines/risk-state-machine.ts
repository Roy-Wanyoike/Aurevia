// ---------------------------------------------------------------------------
// Aurevia Risk (Circuit Breaker) State Machine.
//
// Mirrors the latching logic in `src/lib/aurevia/risk/engine.ts`
// `nextBreakerState()`. Extracted here as a pure state machine so callers
// can validate transitions without re-running the trigger evaluation —
// and so the test suite can assert the transition table directly.
//
// CRITICAL: TRADING_PAUSED is latched. It does NOT auto-recover on empty
// triggers. A human operator must explicitly move it to RE_EVALUATING,
// then to NORMAL. This is BE-P0-006 — see risk/engine.ts header.
// ---------------------------------------------------------------------------

import type { CircuitBreakerState } from "../types";

export type RiskState = CircuitBreakerState; // NORMAL | CAUTION | TRADING_PAUSED | RE_EVALUATING

/**
 * Legal transitions for the circuit breaker.
 *
 * The transitions here model the *operator-controlled* recovery path, not
 * the trigger-driven escalation (which is what `nextBreakerState` does).
 * The two functions compose:
 *
 *   - `nextBreakerState(current, triggers)` — reactive: given live triggers,
 *      what's the next state? Used by the runtime scan loop.
 *   - `canTransition(from, to)` — proactive: is this jump legal AT ALL?
 *      Used by `setBreakerState` mutations to reject impossible moves
 *      (e.g. TRADING_PAUSED → NORMAL without going through RE_EVALUATING).
 *
 * The latching rule (BE-P0-006) is encoded here: TRADING_PAUSED cannot
 * go directly to NORMAL — it must go through RE_EVALUATING first.
 */
const LEGAL_TRANSITIONS: Record<RiskState, RiskState[]> = {
  NORMAL: ["CAUTION", "TRADING_PAUSED"],
  CAUTION: ["NORMAL", "TRADING_PAUSED"],
  // Latched — must explicitly move to RE_EVALUATING before recovery.
  TRADING_PAUSED: ["RE_EVALUATING"],
  // Operator has acknowledged; system is re-evaluating triggers before
  // resuming. Can return to NORMAL (auto-recover) or escalate back to
  // TRADING_PAUSED if triggers persist.
  RE_EVALUATING: ["NORMAL", "TRADING_PAUSED"],
};

export function canTransition(from: RiskState, to: RiskState): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: RiskState, to: RiskState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal risk state transition: ${from} → ${to}`);
  }
}

export function isTerminal(state: RiskState): boolean {
  return LEGAL_TRANSITIONS[state].length === 0;
}

export function legalNextStates(state: RiskState): RiskState[] {
  return [...LEGAL_TRANSITIONS[state]];
}
