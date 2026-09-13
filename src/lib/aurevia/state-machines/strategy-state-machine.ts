// ---------------------------------------------------------------------------
// Aurevia Strategy State Machine.
//
// Strategies progress through a research and validation pipeline before
// reaching production. Each state represents a gate:
//
//   DRAFT          — authored, not yet evaluated
//   RESEARCH       — being analyzed (backtests, parameter sweeps)
//   BACKTESTED     — at least one backtest run completed
//   VALIDATED      — risk engine approved the strategy's worst-case profile
//   PAPER          — trading live in the paper broker
//   SANDBOX        — trading live in a real broker's paper/sandbox environment
//   APPROVED       — operator has signed off for production deployment
//   PRODUCTION     — live, real money, real broker
//   DEGRADED       — production but with reduced allocation (anomaly detected)
//   PAUSED         — operator intervention required; no new orders
//
// Transitions are strictly forward except for DEGRADED ⇄ PAUSED which allow
// a production strategy to be temporarily pulled back without going through
// the full pipeline again.
//
// Notes:
//   - From PAUSED, the strategy can resume to PRODUCTION (operator un-pauses)
//     or step down to DEGRADED (operator keeps it alive at reduced size).
//   - DRAFT → RESEARCH is the only entry point; you cannot skip to PRODUCTION.
//   - A REJECTED strategy is not in this machine — rejection is a separate
//     state owned by the validation pipeline, not the lifecycle.
// ---------------------------------------------------------------------------

export type StrategyState =
  | "DRAFT"
  | "RESEARCH"
  | "BACKTESTED"
  | "VALIDATED"
  | "PAPER"
  | "SANDBOX"
  | "APPROVED"
  | "PRODUCTION"
  | "DEGRADED"
  | "PAUSED";

const LEGAL_TRANSITIONS: Record<StrategyState, StrategyState[]> = {
  DRAFT: ["RESEARCH"],
  RESEARCH: ["BACKTESTED", "DRAFT"],
  BACKTESTED: ["VALIDATED", "RESEARCH"],
  VALIDATED: ["PAPER", "BACKTESTED"],
  PAPER: ["SANDBOX", "VALIDATED"],
  SANDBOX: ["APPROVED", "PAPER"],
  APPROVED: ["PRODUCTION", "SANDBOX"],
  PRODUCTION: ["DEGRADED", "PAUSED"],
  // A degraded strategy can be promoted back to PRODUCTION once the anomaly
  // resolves, or fully paused for investigation.
  DEGRADED: ["PRODUCTION", "PAUSED"],
  // Pausing is reversible: operator can resume to PRODUCTION (root cause
  // fixed), demote to DEGRADED (still alive at reduced size), or roll all
  // the way back to RESEARCH (open investigation).
  PAUSED: ["PRODUCTION", "DEGRADED", "RESEARCH"],
};

export function canTransition(from: StrategyState, to: StrategyState): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: StrategyState, to: StrategyState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal strategy state transition: ${from} → ${to}`);
  }
}

export function isTerminal(state: StrategyState): boolean {
  return LEGAL_TRANSITIONS[state].length === 0;
}

export function legalNextStates(state: StrategyState): StrategyState[] {
  return [...LEGAL_TRANSITIONS[state]];
}
