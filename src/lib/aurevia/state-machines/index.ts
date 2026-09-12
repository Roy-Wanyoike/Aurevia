// ---------------------------------------------------------------------------
// Aurevia State Machines — consolidated re-exports.
//
// Import from here so adding a new state machine doesn't churn callers:
//   import { canTransition, assertTransition } from "@/lib/aurevia/state-machines";
// ---------------------------------------------------------------------------

export type { OrderState } from "./order-state-machine";
export {
  canTransition as canTransitionOrder,
  assertTransition as assertTransitionOrder,
  isTerminal as isOrderTerminal,
  legalNextStates as legalOrderNextStates,
} from "./order-state-machine";

export type { StrategyState } from "./strategy-state-machine";
export {
  canTransition as canTransitionStrategy,
  assertTransition as assertTransitionStrategy,
  isTerminal as isStrategyTerminal,
  legalNextStates as legalStrategyNextStates,
} from "./strategy-state-machine";

export type {
  TradingModeState,
  TradingModeSafetyGates,
} from "./trading-mode-machine";
export {
  canTransition as canTransitionTradingMode,
  assertTransition as assertTransitionTradingMode,
  isTerminal as isTradingModeTerminal,
  legalNextStates as legalTradingModeNextStates,
} from "./trading-mode-machine";

export type { RiskState } from "./risk-state-machine";
export {
  canTransition as canTransitionRisk,
  assertTransition as assertTransitionRisk,
  isTerminal as isRiskTerminal,
  legalNextStates as legalRiskNextStates,
} from "./risk-state-machine";
