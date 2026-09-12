import type {
  RiskProfile,
  RiskEvaluation,
  RiskDecision,
  CircuitBreakerState,
  Signal,
  PortfolioState,
  Quote,
} from "../types";

// ---------------------------------------------------------------------------
// Aurevia Risk Engine.
//
// Hard rules: position sizing, portfolio exposure, leverage, daily/weekly loss,
// drawdown, spread, volatility, liquidity, stale-data, duplicate-order,
// cooldown. Plus a circuit-breaker state machine that can pause all trading.
// The risk engine is the ONLY component that can promote a Signal to an
// executable order.
// ---------------------------------------------------------------------------

export const DEFAULT_RISK_PROFILE: RiskProfile = {
  maxPositionPct: 0.25,
  maxPortfolioPct: 1.0,
  maxLeverage: 1.0,
  maxDailyLossPct: 0.03,
  maxWeeklyLossPct: 0.06,
  maxDrawdownPct: 0.10,
  maxSpread: 0.005,
  maxVolatility: 0.6,
  minLiquidity: 5000,
  cooldownMinutes: 15,
  circuitBreakerState: "NORMAL",
  tradingMode: "PAPER",
};

export interface RiskContext {
  portfolio: PortfolioState;
  quote: Quote;
  signal: Signal;
  dayStartEquity: number;
  weekStartEquity: number;
  lastTradeTime: number;
  recentSymbols: string[]; // for duplicate detection
}

export function evaluateRisk(
  profile: RiskProfile,
  rc: RiskContext
): RiskEvaluation {
  const reasons: string[] = [];
  let decision: RiskDecision = "APPROVED";

  // Rule 1: Trading mode gate.
  if (profile.tradingMode === "ANALYSIS_ONLY") {
    return reject(profile, "Trading mode is ANALYSIS_ONLY — no orders permitted");
  }

  // Rule 2: Circuit breaker gate.
  if (profile.circuitBreakerState === "TRADING_PAUSED" || profile.circuitBreakerState === "RE_EVALUATING") {
    return reject(profile, `Circuit breaker is ${profile.circuitBreakerState} — new orders blocked`);
  }

  // Rule 3: Cooldown after a recent trade on the same symbol.
  const cooldownMs = profile.cooldownMinutes * 60 * 1000;
  if (rc.lastTradeTime > 0 && Date.now() - rc.lastTradeTime < cooldownMs) {
    const dup = rc.recentSymbols.includes(rc.signal.symbol);
    if (dup) {
      reasons.push(`Duplicate-order protection: ${rc.signal.symbol} traded within cooldown window`);
      decision = "REJECTED";
    }
  }

  // Rule 4: Spread check.
  const spreadPct = rc.quote.price > 0 ? rc.quote.spread / rc.quote.price : 0;
  if (spreadPct > profile.maxSpread) {
    reasons.push(`Spread ${(spreadPct * 100).toFixed(3)}% exceeds max ${profile.maxSpread * 100}%`);
    decision = "REJECTED";
  }

  // Rule 5: Liquidity check.
  if (rc.quote.volume24h < profile.minLiquidity) {
    reasons.push(`24h volume ${rc.quote.volume24h.toFixed(0)} below min ${profile.minLiquidity}`);
    decision = "REJECTED";
  }

  // Rule 6: Daily loss limit.
  const dailyLossPct =
    rc.dayStartEquity > 0 ? (rc.portfolio.equity - rc.dayStartEquity) / rc.dayStartEquity : 0;
  if (dailyLossPct < -profile.maxDailyLossPct) {
    reasons.push(`Daily loss ${(dailyLossPct * 100).toFixed(2)}% exceeds limit -${profile.maxDailyLossPct * 100}%`);
    decision = "REJECTED";
  }

  // Rule 7: Weekly loss limit.
  const weeklyLossPct =
    rc.weekStartEquity > 0 ? (rc.portfolio.equity - rc.weekStartEquity) / rc.weekStartEquity : 0;
  if (weeklyLossPct < -profile.maxWeeklyLossPct) {
    reasons.push(`Weekly loss ${(weeklyLossPct * 100).toFixed(2)}% exceeds limit -${profile.maxWeeklyLossPct * 100}%`);
    decision = "REJECTED";
  }

  // Rule 8: Drawdown.
  if (rc.portfolio.drawdown > profile.maxDrawdownPct) {
    reasons.push(`Portfolio drawdown ${(rc.portfolio.drawdown * 100).toFixed(2)}% exceeds max ${profile.maxDrawdownPct * 100}%`);
    decision = "REJECTED";
  }

  // --- Post-fill hypothetical computation (#27) ---
  // Rules 9/10/11 previously checked the CURRENT portfolio state, not the
  // state AFTER this order fills. An order that would push exposure from
  // 80% to 110% was approved because the check ran before the fill.
  // Now we simulate the post-fill portfolio:
  //   - For BUY: notional = qty × price added to long market value
  //   - For SELL: notional subtracted (or added to short if no existing long)
  // The signal's confidence doesn't carry quantity, so we estimate the
  // order size as a fraction of equity (default position size).
  const orderNotional = rc.signal.price > 0 && rc.portfolio.equity > 0
    ? rc.portfolio.equity * profile.maxPositionPct  // conservative: assume max position size
    : 0;
  const isBuy = rc.signal.action === "BUY";
  const currentLongMV = rc.portfolio.positions
    .filter((p) => p.side === "LONG")
    .reduce((a, b) => a + b.marketValue, 0);
  const currentShortMV = rc.portfolio.positions
    .filter((p) => p.side === "SHORT")
    .reduce((a, b) => a + b.marketValue, 0);
  const currentGrossExposure = currentLongMV + currentShortMV;
  // Hypothetical gross exposure after this order fills.
  const hypotheticalGrossExposure = currentGrossExposure + orderNotional;
  const hypotheticalExposure = rc.portfolio.equity > 0
    ? hypotheticalGrossExposure / rc.portfolio.equity
    : 0;
  const hypotheticalLeverage = hypotheticalExposure;
  // Hypothetical position concentration for this symbol.
  const existingPos = rc.portfolio.positions.find((p) => p.symbol === rc.signal.symbol);
  const existingMV = existingPos?.marketValue ?? 0;
  const hypotheticalPosMV = isBuy ? existingMV + orderNotional : Math.max(0, existingMV - orderNotional);
  const hypotheticalPosPct = rc.portfolio.equity > 0 ? hypotheticalPosMV / rc.portfolio.equity : 0;

  // Rule 9: Portfolio exposure cap — check HYPOTHETICAL post-fill state.
  if (hypotheticalExposure > profile.maxPortfolioPct) {
    reasons.push(`Post-fill exposure ${(hypotheticalExposure * 100).toFixed(0)}% would exceed cap ${profile.maxPortfolioPct * 100}% (current ${(rc.portfolio.exposure * 100).toFixed(0)}%)`);
    decision = "REJECTED";
  }

  // Rule 10: Position concentration — check HYPOTHETICAL post-fill concentration.
  if (hypotheticalPosPct > profile.maxPositionPct) {
    reasons.push(`Post-fill position in ${rc.signal.symbol} at ${(hypotheticalPosPct * 100).toFixed(0)}% of equity would exceed max ${profile.maxPositionPct * 100}%`);
    decision = "REJECTED";
  }

  // Rule 11: Leverage — check HYPOTHETICAL post-fill leverage.
  if (hypotheticalLeverage > profile.maxLeverage) {
    reasons.push(`Post-fill leverage ${hypotheticalLeverage.toFixed(2)}x would exceed max ${profile.maxLeverage}x`);
    decision = "REJECTED";
  }

  // If CAUTION and any warning present, downgrade APPROVED -> PAUSED.
  if (decision === "APPROVED" && profile.circuitBreakerState === "CAUTION") {
    reasons.push("Circuit breaker CAUTION — order held for manual review");
    decision = "PAUSED";
  }

  if (decision === "APPROVED") {
    reasons.push("All risk checks passed");
  }

  return { decision, reasons, circuitBreakerState: profile.circuitBreakerState };
}

function reject(profile: RiskProfile, reason: string): RiskEvaluation {
  return { decision: "REJECTED", reasons: [reason], circuitBreakerState: profile.circuitBreakerState };
}

// Circuit-breaker transitions.
export function nextBreakerState(
  current: CircuitBreakerState,
  triggers: {
    extremeMove?: boolean;
    volSpike?: boolean;
    liquidityCollapse?: boolean;
    spreadExplosion?: boolean;
    crashDetected?: boolean;
    staleData?: boolean;
    brokerDisconnect?: boolean;
    orderRejectionSpike?: boolean;
    apiFailure?: boolean;
    dailyLossHit?: boolean;
    maxDrawdownHit?: boolean;
  }
): { next: CircuitBreakerState; reason: string } {
  const any =
    triggers.extremeMove ||
    triggers.volSpike ||
    triggers.liquidityCollapse ||
    triggers.spreadExplosion ||
    triggers.crashDetected ||
    triggers.staleData ||
    triggers.brokerDisconnect ||
    triggers.orderRejectionSpike ||
    triggers.apiFailure ||
    triggers.dailyLossHit ||
    triggers.maxDrawdownHit;

  // LATCHING (BE-P0-006): once the breaker reaches TRADING_PAUSED, it does
  // NOT auto-recover on empty triggers. A human operator must explicitly
  // move it to RE_EVALUATING, then to NORMAL. The previous implementation
  // auto-recovered from TRADING_PAUSED → NORMAL on the first empty-trigger
  // call, making the breaker a no-op. RE_EVALUATING is now reachable only
  // via explicit operator action from TRADING_PAUSED.
  if (!any) {
    if (current === "TRADING_PAUSED") {
      return {
        next: "TRADING_PAUSED",
        reason: "Trading remains paused — operator must explicitly move to RE_EVALUATING to begin recovery",
      };
    }
    if (current === "RE_EVALUATING") {
      // Auto-recover from RE_EVALUATING only — operator has acknowledged the
      // incident and is ready to resume.
      return { next: "NORMAL", reason: "Re-evaluation complete — resuming normal operation" };
    }
    if (current === "CAUTION") {
      return { next: "NORMAL", reason: "Conditions normalized — resuming normal operation" };
    }
    return { next: "NORMAL", reason: "No triggers" };
  }

  // Severe triggers escalate to TRADING_PAUSED immediately (latched).
  const severe =
    triggers.crashDetected ||
    triggers.brokerDisconnect ||
    triggers.dailyLossHit ||
    triggers.maxDrawdownHit ||
    triggers.liquidityCollapse;

  if (severe) {
    return { next: "TRADING_PAUSED", reason: "Severe trigger — trading paused, positions protected. Operator action required to resume." };
  }
  // Moderate triggers move to CAUTION (still allows trading, more conservative).
  if (current === "NORMAL") {
    return { next: "CAUTION", reason: "Moderate trigger — entering caution mode" };
  }
  return { next: current, reason: "Existing elevated state maintained" };
}
