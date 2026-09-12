import { describe, it, expect } from "vitest";
import {
  evaluateRisk,
  nextBreakerState,
  DEFAULT_RISK_PROFILE,
  type RiskContext,
} from "./engine";
import type {
  RiskProfile,
  PortfolioState,
  Quote,
  Signal,
  CircuitBreakerState,
} from "../types";

// ---------------------------------------------------------------------------
// Risk engine unit tests. Each of the 11 rules verified independently, plus
// the circuit-breaker gate, trading-mode gate, APPROVED happy path, the
// CAUTION downgrade, and the breaker state-machine transitions.
// ---------------------------------------------------------------------------

function baselineSignal(): Signal {
  return {
    id: "sig-1",
    strategyKey: "momentum",
    symbol: "AAPL",
    action: "BUY",
    confidence: 0.7,
    price: 100,
    reasons: [],
    timestamp: Date.now(),
  };
}

function baselineQuote(): Quote {
  return {
    symbol: "AAPL",
    price: 100,
    bid: 99.95,
    ask: 100.05,
    spread: 0.1,
    volume24h: 100_000,
    changePct: 0.5,
    timestamp: Date.now(),
  };
}

function baselinePortfolio(): PortfolioState {
  // Healthy portfolio: $10k cash, no positions, no drawdown, low exposure.
  return {
    cash: 100_000,
    equity: 100_000,
    marketValue: 0,
    unrealizedPnl: 0,
    realizedPnl: 0,
    feesPaid: 0,
    exposure: 0,
    leverage: 0,
    drawdown: 0,
    peakEquity: 100_000,
    positions: [],
    updatedAt: Date.now(),
  };
}

function baselineContext(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    portfolio: baselinePortfolio(),
    quote: baselineQuote(),
    signal: baselineSignal(),
    dayStartEquity: 100_000,
    weekStartEquity: 100_000,
    lastTradeTime: 0,
    recentSymbols: [],
    ...overrides,
  };
}

function profile(overrides: Partial<RiskProfile> = {}): RiskProfile {
  return { ...DEFAULT_RISK_PROFILE, ...overrides };
}

describe("risk engine — happy path", () => {
  it("APPROVED when all rules pass", () => {
    const ev = evaluateRisk(profile(), baselineContext());
    expect(ev.decision).toBe("APPROVED");
    expect(ev.reasons.length).toBeGreaterThan(0);
    expect(ev.circuitBreakerState).toBe("NORMAL");
  });
});

describe("rule 1 — trading mode gate", () => {
  it("ANALYSIS_ONLY blocks all orders", () => {
    const ev = evaluateRisk(
      profile({ tradingMode: "ANALYSIS_ONLY" }),
      baselineContext()
    );
    expect(ev.decision).toBe("REJECTED");
    expect(ev.reasons[0]).toContain("ANALYSIS_ONLY");
  });
});

describe("rule 2 — circuit breaker gate", () => {
  it("TRADING_PAUSED blocks all orders", () => {
    const ev = evaluateRisk(
      profile({ circuitBreakerState: "TRADING_PAUSED" }),
      baselineContext()
    );
    expect(ev.decision).toBe("REJECTED");
    expect(ev.reasons[0]).toContain("TRADING_PAUSED");
  });

  it("RE_EVALUATING blocks all orders", () => {
    const ev = evaluateRisk(
      profile({ circuitBreakerState: "RE_EVALUATING" }),
      baselineContext()
    );
    expect(ev.decision).toBe("REJECTED");
    expect(ev.reasons[0]).toContain("RE_EVALUATING");
  });
});

describe("rule 3 — cooldown / duplicate symbol", () => {
  it("duplicate symbol within cooldown window → REJECTED", () => {
    const ev = evaluateRisk(
      profile({ cooldownMinutes: 30 }),
      baselineContext({
        lastTradeTime: Date.now() - 60_000, // 1 min ago
        recentSymbols: ["AAPL"],
      })
    );
    expect(ev.decision).toBe("REJECTED");
    expect(ev.reasons.some((r) => r.includes("Duplicate-order"))).toBe(true);
  });

  it("different symbol within cooldown window → APPROVED", () => {
    const ev = evaluateRisk(
      profile({ cooldownMinutes: 30 }),
      baselineContext({
        lastTradeTime: Date.now() - 60_000,
        recentSymbols: ["MSFT"], // not the signal symbol
      })
    );
    expect(ev.decision).toBe("APPROVED");
  });

  it("expired cooldown → APPROVED even on duplicate symbol", () => {
    const ev = evaluateRisk(
      profile({ cooldownMinutes: 1 }),
      baselineContext({
        lastTradeTime: Date.now() - 120_000, // 2 min ago, past 1 min cooldown
        recentSymbols: ["AAPL"],
      })
    );
    expect(ev.decision).toBe("APPROVED");
  });
});

describe("rule 4 — spread check", () => {
  it("spread > maxSpread → REJECTED", () => {
    const ev = evaluateRisk(
      profile({ maxSpread: 0.005 }),
      baselineContext({
        quote: { ...baselineQuote(), price: 100, spread: 1 }, // 1% spread
      })
    );
    expect(ev.decision).toBe("REJECTED");
    expect(ev.reasons.some((r) => r.toLowerCase().includes("spread"))).toBe(true);
  });

  it("tight spread → APPROVED", () => {
    const ev = evaluateRisk(
      profile({ maxSpread: 0.005 }),
      baselineContext({
        quote: { ...baselineQuote(), price: 100, spread: 0.1 },
      })
    );
    expect(ev.decision).toBe("APPROVED");
  });
});

describe("rule 5 — liquidity check", () => {
  it("volume24h < minLiquidity → REJECTED", () => {
    const ev = evaluateRisk(
      profile({ minLiquidity: 50_000 }),
      baselineContext({
        quote: { ...baselineQuote(), volume24h: 10_000 },
      })
    );
    expect(ev.decision).toBe("REJECTED");
    expect(ev.reasons.some((r) => r.toLowerCase().includes("volume"))).toBe(true);
  });

  it("sufficient liquidity → APPROVED", () => {
    const ev = evaluateRisk(
      profile({ minLiquidity: 50_000 }),
      baselineContext({ quote: { ...baselineQuote(), volume24h: 100_000 } })
    );
    expect(ev.decision).toBe("APPROVED");
  });
});

describe("rule 6 — daily loss limit", () => {
  it("daily loss > maxDailyLossPct → REJECTED", () => {
    // Equity 95k, dayStart 100k → -5% loss, exceeds default 3%
    const ev = evaluateRisk(
      profile({ maxDailyLossPct: 0.03 }),
      baselineContext({
        portfolio: { ...baselinePortfolio(), equity: 95_000 },
        dayStartEquity: 100_000,
      })
    );
    expect(ev.decision).toBe("REJECTED");
    expect(ev.reasons.some((r) => r.toLowerCase().includes("daily"))).toBe(true);
  });
});

describe("rule 7 — weekly loss limit", () => {
  it("weekly loss > maxWeeklyLossPct → REJECTED", () => {
    const ev = evaluateRisk(
      profile({ maxWeeklyLossPct: 0.06 }),
      baselineContext({
        portfolio: { ...baselinePortfolio(), equity: 90_000 },
        weekStartEquity: 100_000,
      })
    );
    expect(ev.decision).toBe("REJECTED");
    expect(ev.reasons.some((r) => r.toLowerCase().includes("weekly"))).toBe(true);
  });
});

describe("rule 8 — drawdown", () => {
  it("drawdown > maxDrawdownPct → REJECTED", () => {
    const ev = evaluateRisk(
      profile({ maxDrawdownPct: 0.1 }),
      baselineContext({
        portfolio: { ...baselinePortfolio(), drawdown: 0.2 },
      })
    );
    expect(ev.decision).toBe("REJECTED");
    expect(ev.reasons.some((r) => r.toLowerCase().includes("drawdown"))).toBe(true);
  });
});

describe("rule 9 — post-fill portfolio exposure", () => {
  it("post-fill exposure > maxPortfolioPct → REJECTED", () => {
    // Existing long position already at 100% of equity; a BUY would push it
    // to >100%, exceeding the cap of 100%.
    const pf = baselinePortfolio();
    pf.positions = [
      {
        symbol: "MSFT",
        side: "LONG",
        quantity: 100,
        avgEntryPrice: 100,
        marketPrice: 100,
        marketValue: 10_000,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        realizedPnl: 0,
      },
    ];
    pf.exposure = 0.1; // existing 10% (1k vs 10k)
    const ev = evaluateRisk(
      profile({ maxPortfolioPct: 0.1, maxPositionPct: 0.25, maxLeverage: 5 }),
      baselineContext({ portfolio: pf })
    );
    expect(ev.decision).toBe("REJECTED");
    expect(ev.reasons.some((r) => r.toLowerCase().includes("exposure"))).toBe(true);
  });
});

describe("rule 10 — post-fill position concentration", () => {
  it("post-fill single-symbol concentration > maxPositionPct → REJECTED", () => {
    // Existing AAPL position at 20% of equity; a BUY would push it past the
    // 25% cap to ~45%.
    const pf = baselinePortfolio();
    pf.positions = [
      {
        symbol: "AAPL",
        side: "LONG",
        quantity: 100,
        avgEntryPrice: 100,
        marketPrice: 100,
        marketValue: 20_000,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        realizedPnl: 0,
      },
    ];
    const ev = evaluateRisk(
      profile({ maxPositionPct: 0.25, maxPortfolioPct: 1.0, maxLeverage: 5 }),
      baselineContext({ portfolio: pf })
    );
    expect(ev.decision).toBe("REJECTED");
    expect(ev.reasons.some((r) => r.toLowerCase().includes("position"))).toBe(true);
  });
});

describe("rule 11 — leverage cap", () => {
  it("post-fill leverage > maxLeverage → REJECTED", () => {
    // maxLeverage = 0.5; even one BUY at maxPositionPct=0.25 will produce
    // exposure = 25% which is < 50% — but with maxPortfolioPct very low,
    // rule 9 catches first. So we test leverage specifically by setting
    // maxLeverage lower than maxPositionPct.
    const ev = evaluateRisk(
      profile({ maxLeverage: 0.1, maxPortfolioPct: 1.0, maxPositionPct: 0.25 }),
      baselineContext()
    );
    expect(ev.decision).toBe("REJECTED");
    expect(ev.reasons.some((r) => r.toLowerCase().includes("leverage"))).toBe(true);
  });
});

describe("CAUTION downgrade", () => {
  it("APPROVED becomes PAUSED when circuitBreakerState is CAUTION", () => {
    const ev = evaluateRisk(
      profile({ circuitBreakerState: "CAUTION" }),
      baselineContext()
    );
    expect(ev.decision).toBe("PAUSED");
    expect(ev.reasons.some((r) => r.includes("CAUTION"))).toBe(true);
  });
});

describe("nextBreakerState transitions", () => {
  it("NORMAL + moderate trigger → CAUTION", () => {
    const r = nextBreakerState("NORMAL", { volSpike: true });
    expect(r.next).toBe("CAUTION");
  });

  it("CAUTION + no trigger → NORMAL", () => {
    const r = nextBreakerState("CAUTION", {});
    expect(r.next).toBe("NORMAL");
  });

  it("TRADING_PAUSED latches on empty triggers (no auto-recovery)", () => {
    const r = nextBreakerState("TRADING_PAUSED", {});
    expect(r.next).toBe("TRADING_PAUSED");
  });

  it("RE_EVALUATING + no trigger → NORMAL (auto-recover)", () => {
    const r = nextBreakerState("RE_EVALUATING", {});
    expect(r.next).toBe("NORMAL");
  });

  it("severe trigger (crashDetected) → TRADING_PAUSED", () => {
    const r = nextBreakerState("NORMAL", { crashDetected: true });
    expect(r.next).toBe("TRADING_PAUSED");
  });

  it("severe trigger (dailyLossHit) → TRADING_PAUSED even from CAUTION", () => {
    const r = nextBreakerState("CAUTION", { dailyLossHit: true });
    expect(r.next).toBe("TRADING_PAUSED");
  });

  it("maxDrawdownHit triggers TRADING_PAUSED", () => {
    const r = nextBreakerState("NORMAL", { maxDrawdownHit: true });
    expect(r.next).toBe("TRADING_PAUSED");
  });

  it("brokerDisconnect triggers TRADING_PAUSED", () => {
    const r = nextBreakerState("NORMAL", { brokerDisconnect: true });
    expect(r.next).toBe("TRADING_PAUSED");
  });

  it("liquidityCollapse triggers TRADING_PAUSED", () => {
    const r = nextBreakerState("NORMAL", { liquidityCollapse: true });
    expect(r.next).toBe("TRADING_PAUSED");
  });

  it("NORMAL + no triggers → NORMAL", () => {
    const r = nextBreakerState("NORMAL", {});
    expect(r.next).toBe("NORMAL");
  });

  it("returns a human-readable reason on every transition", () => {
    const states: CircuitBreakerState[] = ["NORMAL", "CAUTION", "TRADING_PAUSED", "RE_EVALUATING"];
    for (const s of states) {
      const r = nextBreakerState(s, { volSpike: s === "NORMAL" });
      expect(typeof r.reason).toBe("string");
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});
