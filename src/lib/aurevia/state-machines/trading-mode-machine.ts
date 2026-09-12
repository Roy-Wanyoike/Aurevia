// ---------------------------------------------------------------------------
// Aurevia Trading Mode State Machine.
//
// The trading mode is the platform's highest-privilege safety setting. It
// controls what the execution engine is permitted to do:
//
//   MANUAL          — operator places every order by hand
//   ASSISTED        — strategies emit signals; operator approves each one
//   PAPER           — strategies auto-trade against the paper broker
//   SANDBOX         — strategies auto-trade against a real broker's sandbox
//   CONTROLLED_LIVE — strategies auto-trade against a real broker, real money,
//                      but every order is rate-limited + audible
//   AUTONOMOUS      — strategies auto-trade real money without per-order
//                      human review. Highest privilege.
//
// Legal transitions are strict — AUTONOMOUS can ONLY be reached from
// CONTROLLED_LIVE, and only if all safety gates are met:
//   - circuit breaker is NORMAL
//   - trading mode gating flag is set (operator config)
//   - broker is connected in LIVE mode
//   - reconciliation has succeeded within the last 5 minutes
//
// The `safetyGates` parameter on `canTransition()` lets callers thread live
// state into the gate check. If any gate is false, AUTONOMOUS promotion
// returns false (and `assertTransition` throws).
// ---------------------------------------------------------------------------

export type TradingModeState =
  | "MANUAL"
  | "ASSISTED"
  | "PAPER"
  | "SANDBOX"
  | "CONTROLLED_LIVE"
  | "AUTONOMOUS";

export interface TradingModeSafetyGates {
  /** Circuit breaker is in NORMAL state (no latched incident). */
  breakerNormal: boolean;
  /** Operator has set the platform config flag enabling autonomous trading. */
  autonomousArmed: boolean;
  /** A broker is connected in LIVE mode. */
  brokerLiveConnected: boolean;
  /** Last reconciliation run succeeded within the last 5 minutes. */
  reconciliationFresh: boolean;
}

const LEGAL_TRANSITIONS: Record<TradingModeState, TradingModeState[]> = {
  MANUAL: ["ASSISTED", "PAPER"],
  ASSISTED: ["MANUAL", "PAPER"],
  PAPER: ["MANUAL", "ASSISTED", "SANDBOX"],
  SANDBOX: ["PAPER", "CONTROLLED_LIVE"],
  CONTROLLED_LIVE: ["SANDBOX", "AUTONOMOUS", "PAPER"],
  // AUTONOMOUS is terminal in the sense that you cannot go further up —
  // but you can always step back down to CONTROLLED_LIVE (kill-switch).
  AUTONOMOUS: ["CONTROLLED_LIVE"],
};

/**
 * Check whether a transition is legal, given the platform's safety state.
 *
 * For non-AUTONOMOUS transitions, safety gates are not consulted — they only
 * gate promotion INTO autonomous mode. Any mode can step DOWN at any time
 * (kill switch).
 */
export function canTransition(
  from: TradingModeState,
  to: TradingModeState,
  safetyGates?: Partial<TradingModeSafetyGates>,
): boolean {
  if (!LEGAL_TRANSITIONS[from]?.includes(to)) return false;
  // Stepping down from AUTONOMOUS → CONTROLLED_LIVE is the kill-switch and
  // must always succeed regardless of safety gates.
  if (from === "AUTONOMOUS" && to === "CONTROLLED_LIVE") return true;
  // Promotion INTO AUTONOMOUS requires ALL safety gates to be true.
  if (to === "AUTONOMOUS") {
    const g = safetyGates ?? {};
    return (
      g.breakerNormal === true &&
      g.autonomousArmed === true &&
      g.brokerLiveConnected === true &&
      g.reconciliationFresh === true
    );
  }
  return true;
}

export function assertTransition(
  from: TradingModeState,
  to: TradingModeState,
  safetyGates?: Partial<TradingModeSafetyGates>,
): void {
  if (!canTransition(from, to, safetyGates)) {
    const gateHint =
      to === "AUTONOMOUS"
        ? " — AUTONOMOUS promotion requires breakerNormal, autonomousArmed, brokerLiveConnected, and reconciliationFresh"
        : "";
    throw new Error(
      `Illegal trading mode transition: ${from} → ${to}${gateHint}`,
    );
  }
}

export function isTerminal(state: TradingModeState): boolean {
  return LEGAL_TRANSITIONS[state].length === 0;
}

export function legalNextStates(state: TradingModeState): TradingModeState[] {
  return [...LEGAL_TRANSITIONS[state]];
}
