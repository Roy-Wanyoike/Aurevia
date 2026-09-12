import { describe, it, expect } from "vitest";
import {
  canTransition as canOrder,
  assertTransition as assertOrder,
  isTerminal as isOrderTerminal,
  legalNextStates as legalOrderNext,
  type OrderState,
} from "./order-state-machine";
import {
  canTransition as canStrategy,
  assertTransition as assertStrategy,
  isTerminal as isStrategyTerminal,
  legalNextStates as legalStrategyNext,
  type StrategyState,
} from "./strategy-state-machine";
import {
  canTransition as canTradingMode,
  assertTransition as assertTradingMode,
  isTerminal as isTradingModeTerminal,
  legalNextStates as legalTradingModeNext,
  type TradingModeState,
} from "./trading-mode-machine";
import {
  canTransition as canRisk,
  assertTransition as assertRisk,
  isTerminal as isRiskTerminal,
  legalNextStates as legalRiskNext,
} from "./risk-state-machine";

// ---------------------------------------------------------------------------
// Order state machine
// ---------------------------------------------------------------------------

describe("Order state machine", () => {
  describe("legal transitions", () => {
    it("CREATED → SUBMITTED", () => {
      expect(canOrder("CREATED", "SUBMITTED")).toBe(true);
    });
    it("CREATED → REJECTED", () => {
      expect(canOrder("CREATED", "REJECTED")).toBe(true);
    });
    it("CREATED → CANCELLED", () => {
      expect(canOrder("CREATED", "CANCELLED")).toBe(true);
    });
    it("SUBMITTED → ACKNOWLEDGED", () => {
      expect(canOrder("SUBMITTED", "ACKNOWLEDGED")).toBe(true);
    });
    it("SUBMITTED → REJECTED", () => {
      expect(canOrder("SUBMITTED", "REJECTED")).toBe(true);
    });
    it("SUBMITTED → CANCEL_REQUESTED", () => {
      expect(canOrder("SUBMITTED", "CANCEL_REQUESTED")).toBe(true);
    });
    it("SUBMITTED → UNKNOWN", () => {
      expect(canOrder("SUBMITTED", "UNKNOWN")).toBe(true);
    });
    it("ACKNOWLEDGED → PARTIALLY_FILLED", () => {
      expect(canOrder("ACKNOWLEDGED", "PARTIALLY_FILLED")).toBe(true);
    });
    it("ACKNOWLEDGED → FILLED", () => {
      expect(canOrder("ACKNOWLEDGED", "FILLED")).toBe(true);
    });
    it("PARTIALLY_FILLED → PARTIALLY_FILLED (additional fill)", () => {
      expect(canOrder("PARTIALLY_FILLED", "PARTIALLY_FILLED")).toBe(true);
    });
    it("PARTIALLY_FILLED → FILLED", () => {
      expect(canOrder("PARTIALLY_FILLED", "FILLED")).toBe(true);
    });
    it("PARTIALLY_FILLED → CANCEL_REQUESTED", () => {
      expect(canOrder("PARTIALLY_FILLED", "CANCEL_REQUESTED")).toBe(true);
    });
    it("CANCEL_REQUESTED → CANCELLED", () => {
      expect(canOrder("CANCEL_REQUESTED", "CANCELLED")).toBe(true);
    });
    it("UNKNOWN → SUBMITTED (reconcile then retry)", () => {
      expect(canOrder("UNKNOWN", "SUBMITTED")).toBe(true);
    });
    it("UNKNOWN → CANCELLED (reconcile then kill)", () => {
      expect(canOrder("UNKNOWN", "CANCELLED")).toBe(true);
    });
  });

  describe("illegal transitions", () => {
    it("CREATED → FILLED (cannot skip submission)", () => {
      expect(canOrder("CREATED", "FILLED")).toBe(false);
    });
    it("FILLED → SUBMITTED (terminal state)", () => {
      expect(canOrder("FILLED", "SUBMITTED")).toBe(false);
    });
    it("FILLED → CANCELLED (filled orders cannot be cancelled)", () => {
      expect(canOrder("FILLED", "CANCELLED")).toBe(false);
    });
    it("CANCELLED → SUBMITTED (terminal state)", () => {
      expect(canOrder("CANCELLED", "SUBMITTED")).toBe(false);
    });
    it("REJECTED → SUBMITTED (terminal state)", () => {
      expect(canOrder("REJECTED", "SUBMITTED")).toBe(false);
    });
    it("CREATED → ACKNOWLEDGED (must submit first)", () => {
      expect(canOrder("CREATED", "ACKNOWLEDGED")).toBe(false);
    });
    it("PARTIALLY_FILLED → REJECTED (cannot reject mid-fill)", () => {
      expect(canOrder("PARTIALLY_FILLED", "REJECTED")).toBe(false);
    });
    it("CANCEL_REQUESTED → FILLED (cancel pending; no new fills)", () => {
      expect(canOrder("CANCEL_REQUESTED", "FILLED")).toBe(false);
    });
    it("SUBMITTED → CANCELLED (must request cancel, not hard-cancel)", () => {
      expect(canOrder("SUBMITTED", "CANCELLED")).toBe(false);
    });
  });

  describe("assertTransition", () => {
    it("does not throw on legal transition", () => {
      expect(() => assertOrder("CREATED", "SUBMITTED")).not.toThrow();
    });
    it("throws on illegal transition", () => {
      expect(() => assertOrder("FILLED", "SUBMITTED" as OrderState)).toThrow(
        /Illegal order state transition/,
      );
    });
  });

  describe("isTerminal", () => {
    it("FILLED is terminal", () => {
      expect(isOrderTerminal("FILLED")).toBe(true);
    });
    it("CANCELLED is terminal", () => {
      expect(isOrderTerminal("CANCELLED")).toBe(true);
    });
    it("REJECTED is terminal", () => {
      expect(isOrderTerminal("REJECTED")).toBe(true);
    });
    it("CREATED is not terminal", () => {
      expect(isOrderTerminal("CREATED")).toBe(false);
    });
    it("SUBMITTED is not terminal", () => {
      expect(isOrderTerminal("SUBMITTED")).toBe(false);
    });
  });

  describe("legalNextStates", () => {
    it("returns the transition table for CREATED", () => {
      expect(legalOrderNext("CREATED")).toEqual([
        "SUBMITTED",
        "REJECTED",
        "CANCELLED",
      ]);
    });
    it("returns empty for terminal state FILLED", () => {
      expect(legalOrderNext("FILLED")).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Strategy state machine
// ---------------------------------------------------------------------------

describe("Strategy state machine", () => {
  describe("legal forward transitions", () => {
    it("DRAFT → RESEARCH", () => {
      expect(canStrategy("DRAFT", "RESEARCH")).toBe(true);
    });
    it("RESEARCH → BACKTESTED", () => {
      expect(canStrategy("RESEARCH", "BACKTESTED")).toBe(true);
    });
    it("BACKTESTED → VALIDATED", () => {
      expect(canStrategy("BACKTESTED", "VALIDATED")).toBe(true);
    });
    it("VALIDATED → PAPER", () => {
      expect(canStrategy("VALIDATED", "PAPER")).toBe(true);
    });
    it("PAPER → SANDBOX", () => {
      expect(canStrategy("PAPER", "SANDBOX")).toBe(true);
    });
    it("SANDBOX → APPROVED", () => {
      expect(canStrategy("SANDBOX", "APPROVED")).toBe(true);
    });
    it("APPROVED → PRODUCTION", () => {
      expect(canStrategy("APPROVED", "PRODUCTION")).toBe(true);
    });
    it("PRODUCTION → DEGRADED", () => {
      expect(canStrategy("PRODUCTION", "DEGRADED")).toBe(true);
    });
    it("PRODUCTION → PAUSED", () => {
      expect(canStrategy("PRODUCTION", "PAUSED")).toBe(true);
    });
    it("DEGRADED → PRODUCTION (recover)", () => {
      expect(canStrategy("DEGRADED", "PRODUCTION")).toBe(true);
    });
    it("DEGRADED → PAUSED (escalate)", () => {
      expect(canStrategy("DEGRADED", "PAUSED")).toBe(true);
    });
    it("PAUSED → PRODUCTION (operator resume)", () => {
      expect(canStrategy("PAUSED", "PRODUCTION")).toBe(true);
    });
    it("PAUSED → DEGRADED (resume at reduced size)", () => {
      expect(canStrategy("PAUSED", "DEGRADED")).toBe(true);
    });
    it("PAUSED → RESEARCH (open investigation)", () => {
      expect(canStrategy("PAUSED", "RESEARCH")).toBe(true);
    });
  });

  describe("rollback transitions (allowed in specific cases)", () => {
    it("RESEARCH → DRAFT", () => {
      expect(canStrategy("RESEARCH", "DRAFT")).toBe(true);
    });
    it("BACKTESTED → RESEARCH", () => {
      expect(canStrategy("BACKTESTED", "RESEARCH")).toBe(true);
    });
  });

  describe("illegal transitions", () => {
    it("DRAFT → PRODUCTION (cannot skip pipeline)", () => {
      expect(canStrategy("DRAFT", "PRODUCTION")).toBe(false);
    });
    it("DRAFT → PAPER (must go through research)", () => {
      expect(canStrategy("DRAFT", "PAPER")).toBe(false);
    });
    it("PRODUCTION → DRAFT (cannot roll all the way back)", () => {
      expect(canStrategy("PRODUCTION", "DRAFT")).toBe(false);
    });
    it("PAPER → PRODUCTION (must go through sandbox + approval)", () => {
      expect(canStrategy("PAPER", "PRODUCTION")).toBe(false);
    });
    it("APPROVED → PAPER (cannot roll back past sandbox)", () => {
      expect(canStrategy("APPROVED", "PAPER")).toBe(false);
    });
  });

  describe("assertTransition", () => {
    it("does not throw on legal", () => {
      expect(() => assertStrategy("DRAFT", "RESEARCH")).not.toThrow();
    });
    it("throws on illegal", () => {
      expect(() => assertStrategy("DRAFT", "PRODUCTION" as StrategyState)).toThrow(
        /Illegal strategy state transition/,
      );
    });
  });

  describe("isTerminal", () => {
    it("no strategy state is terminal (always recoverable)", () => {
      const allStates: StrategyState[] = [
        "DRAFT",
        "RESEARCH",
        "BACKTESTED",
        "VALIDATED",
        "PAPER",
        "SANDBOX",
        "APPROVED",
        "PRODUCTION",
        "DEGRADED",
        "PAUSED",
      ];
      for (const s of allStates) {
        expect(isStrategyTerminal(s)).toBe(false);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Trading-mode state machine (with safety gates)
// ---------------------------------------------------------------------------

describe("Trading-mode state machine", () => {
  const allGatesTrue = {
    breakerNormal: true,
    autonomousArmed: true,
    brokerLiveConnected: true,
    reconciliationFresh: true,
  };

  describe("legal transitions (downgrade path always allowed)", () => {
    it("MANUAL → ASSISTED", () => {
      expect(canTradingMode("MANUAL", "ASSISTED")).toBe(true);
    });
    it("MANUAL → PAPER", () => {
      expect(canTradingMode("MANUAL", "PAPER")).toBe(true);
    });
    it("ASSISTED → MANUAL (step down)", () => {
      expect(canTradingMode("ASSISTED", "MANUAL")).toBe(true);
    });
    it("PAPER → SANDBOX", () => {
      expect(canTradingMode("PAPER", "SANDBOX")).toBe(true);
    });
    it("SANDBOX → CONTROLLED_LIVE", () => {
      expect(canTradingMode("SANDBOX", "CONTROLLED_LIVE")).toBe(true);
    });
    it("CONTROLLED_LIVE → SANDBOX (step down)", () => {
      expect(canTradingMode("CONTROLLED_LIVE", "SANDBOX")).toBe(true);
    });
    it("CONTROLLED_LIVE → PAPER (kill switch)", () => {
      expect(canTradingMode("CONTROLLED_LIVE", "PAPER")).toBe(true);
    });
    it("AUTONOMOUS → CONTROLLED_LIVE (kill switch, no gates required)", () => {
      expect(canTradingMode("AUTONOMOUS", "CONTROLLED_LIVE", {})).toBe(true);
    });
  });

  describe("AUTONOMOUS promotion requires all gates", () => {
    it("CONTROLLED_LIVE → AUTONOMOUS with all gates true", () => {
      expect(
        canTradingMode("CONTROLLED_LIVE", "AUTONOMOUS", allGatesTrue),
      ).toBe(true);
    });
    it("CONTROLLED_LIVE → AUTONOMOUS fails with no gates", () => {
      expect(canTradingMode("CONTROLLED_LIVE", "AUTONOMOUS")).toBe(false);
    });
    it("CONTROLLED_LIVE → AUTONOMOUS fails when breaker not normal", () => {
      expect(
        canTradingMode("CONTROLLED_LIVE", "AUTONOMOUS", {
          ...allGatesTrue,
          breakerNormal: false,
        }),
      ).toBe(false);
    });
    it("CONTROLLED_LIVE → AUTONOMOUS fails when autonomousArmed false", () => {
      expect(
        canTradingMode("CONTROLLED_LIVE", "AUTONOMOUS", {
          ...allGatesTrue,
          autonomousArmed: false,
        }),
      ).toBe(false);
    });
    it("CONTROLLED_LIVE → AUTONOMOUS fails when broker not live connected", () => {
      expect(
        canTradingMode("CONTROLLED_LIVE", "AUTONOMOUS", {
          ...allGatesTrue,
          brokerLiveConnected: false,
        }),
      ).toBe(false);
    });
    it("CONTROLLED_LIVE → AUTONOMOUS fails when reconciliation stale", () => {
      expect(
        canTradingMode("CONTROLLED_LIVE", "AUTONOMOUS", {
          ...allGatesTrue,
          reconciliationFresh: false,
        }),
      ).toBe(false);
    });
  });

  describe("illegal transitions", () => {
    it("MANUAL → CONTROLLED_LIVE (cannot skip paper/sandbox)", () => {
      expect(canTradingMode("MANUAL", "CONTROLLED_LIVE")).toBe(false);
    });
    it("PAPER → CONTROLLED_LIVE (must go through sandbox)", () => {
      expect(canTradingMode("PAPER", "CONTROLLED_LIVE")).toBe(false);
    });
    it("SANDBOX → AUTONOMOUS (must go through CONTROLLED_LIVE)", () => {
      expect(
        canTradingMode("SANDBOX", "AUTONOMOUS", allGatesTrue),
      ).toBe(false);
    });
    it("MANUAL → AUTONOMOUS (cannot skip everything)", () => {
      expect(
        canTradingMode("MANUAL", "AUTONOMOUS", allGatesTrue),
      ).toBe(false);
    });
    it("AUTONOMOUS → MANUAL (must step through CONTROLLED_LIVE)", () => {
      expect(canTradingMode("AUTONOMOUS", "MANUAL")).toBe(false);
    });
    it("AUTONOMOUS → PAPER (must step through CONTROLLED_LIVE)", () => {
      expect(canTradingMode("AUTONOMOUS", "PAPER")).toBe(false);
    });
  });

  describe("assertTransition", () => {
    it("does not throw on legal downgrade", () => {
      expect(() =>
        assertTradingMode("AUTONOMOUS", "CONTROLLED_LIVE"),
      ).not.toThrow();
    });
    it("throws on illegal promotion with helpful message", () => {
      expect(() =>
        assertTradingMode("CONTROLLED_LIVE", "AUTONOMOUS"),
      ).toThrow(/AUTONOMOUS promotion requires/);
    });
  });

  describe("isTerminal", () => {
    it("AUTONOMOUS is not terminal (kill switch exists)", () => {
      expect(isTradingModeTerminal("AUTONOMOUS")).toBe(false);
    });
    it("MANUAL is not terminal", () => {
      expect(isTradingModeTerminal("MANUAL")).toBe(false);
    });
  });

  describe("legalNextStates", () => {
    it("CONTROLLED_LIVE can go to SANDBOX, AUTONOMOUS, or PAPER", () => {
      expect(legalTradingModeNext("CONTROLLED_LIVE")).toEqual([
        "SANDBOX",
        "AUTONOMOUS",
        "PAPER",
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// Risk (circuit breaker) state machine
// ---------------------------------------------------------------------------

describe("Risk state machine (circuit breaker)", () => {
  describe("legal transitions", () => {
    it("NORMAL → CAUTION", () => {
      expect(canRisk("NORMAL", "CAUTION")).toBe(true);
    });
    it("NORMAL → TRADING_PAUSED (severe trigger)", () => {
      expect(canRisk("NORMAL", "TRADING_PAUSED")).toBe(true);
    });
    it("CAUTION → NORMAL (recover)", () => {
      expect(canRisk("CAUTION", "NORMAL")).toBe(true);
    });
    it("CAUTION → TRADING_PAUSED (escalate)", () => {
      expect(canRisk("CAUTION", "TRADING_PAUSED")).toBe(true);
    });
    it("TRADING_PAUSED → RE_EVALUATING (operator acknowledges)", () => {
      expect(canRisk("TRADING_PAUSED", "RE_EVALUATING")).toBe(true);
    });
    it("RE_EVALUATING → NORMAL (auto-recover)", () => {
      expect(canRisk("RE_EVALUATING", "NORMAL")).toBe(true);
    });
    it("RE_EVALUATING → TRADING_PAUSED (triggers persist)", () => {
      expect(canRisk("RE_EVALUATING", "TRADING_PAUSED")).toBe(true);
    });
  });

  describe("illegal transitions (latching enforcement BE-P0-006)", () => {
    it("TRADING_PAUSED → NORMAL is forbidden (must go through RE_EVALUATING)", () => {
      expect(canRisk("TRADING_PAUSED", "NORMAL")).toBe(false);
    });
    it("NORMAL → RE_EVALUATING is forbidden (cannot skip incident)", () => {
      expect(canRisk("NORMAL", "RE_EVALUATING")).toBe(false);
    });
    it("RE_EVALUATING → CAUTION is forbidden (must resolve to NORMAL or pause)", () => {
      expect(canRisk("RE_EVALUATING", "CAUTION")).toBe(false);
    });
    it("CAUTION → RE_EVALUATING is forbidden", () => {
      expect(canRisk("CAUTION", "RE_EVALUATING")).toBe(false);
    });
  });

  describe("assertTransition", () => {
    it("does not throw on legal", () => {
      expect(() => assertRisk("TRADING_PAUSED", "RE_EVALUATING")).not.toThrow();
    });
    it("throws on illegal latching violation", () => {
      expect(() => assertRisk("TRADING_PAUSED", "NORMAL")).toThrow(
        /Illegal risk state transition/,
      );
    });
  });

  describe("isTerminal", () => {
    it("NORMAL is not terminal", () => {
      expect(isRiskTerminal("NORMAL")).toBe(false);
    });
    it("TRADING_PAUSED is not terminal (recoverable)", () => {
      expect(isRiskTerminal("TRADING_PAUSED")).toBe(false);
    });
  });

  describe("legalNextStates", () => {
    it("TRADING_PAUSED only allows RE_EVALUATING (latched)", () => {
      expect(legalRiskNext("TRADING_PAUSED")).toEqual(["RE_EVALUATING"]);
    });
    it("NORMAL allows CAUTION or TRADING_PAUSED", () => {
      expect(legalRiskNext("NORMAL")).toEqual(["CAUTION", "TRADING_PAUSED"]);
    });
  });
});
