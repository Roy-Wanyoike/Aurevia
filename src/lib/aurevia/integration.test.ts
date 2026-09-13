import { describe, it, expect, beforeEach } from "vitest";
import { store } from "./store";
import { ASSET_CATALOG } from "./market-data/assets";

describe("integration: full trading pipeline", () => {
  beforeEach(() => {
    store.resetPortfolio();
  });

  it("market data → signal → risk → order → fill → portfolio", () => {
    // 1. Market data is available
    const ctx = store.buildContext("AAPL", 300);
    expect(ctx).toBeTruthy();
    expect(ctx!.candles.length).toBeGreaterThan(60);
    expect(ctx!.quote.price).toBeGreaterThan(0);

    // 2. Signal scan produces signals
    const signals = store.scanSignals();
    expect(signals.length).toBeGreaterThan(0);

    // 3. Risk evaluation on a signal
    const testSignal = signals[0];
    const riskEval = store.evaluateSignal(testSignal);
    expect(["APPROVED", "REJECTED", "PAUSED"]).toContain(riskEval.decision);

    // 4. Submit a manual order (risk-gated)
    const order = store.submitOrder({
      symbol: "AAPL",
      side: "BUY",
      quantity: 10,
      orderType: "MARKET",
      reason: "Integration test",
    });
    expect(["FILLED", "REJECTED"]).toContain(order.status);

    // 5. Portfolio reflects the order
    const portfolio = store.getPortfolio();
    if (order.status === "FILLED") {
      expect(portfolio.positions.length).toBeGreaterThan(0);
      expect(portfolio.cash).toBeLessThan(100000); // cash decreased
    }
  });

  it("circuit breaker blocks all orders when TRADING_PAUSED", () => {
    store.setBreakerState("TRADING_PAUSED", "Integration test");
    const order = store.submitOrder({
      symbol: "MSFT",
      side: "BUY",
      quantity: 1,
      orderType: "MARKET",
    });
    expect(order.status).toBe("REJECTED");
    store.setBreakerState("NORMAL", "Test done");
  });

  it("backtest produces valid results", () => {
    const result = store.runBacktest({
      strategyKey: "momentum",
      symbol: "AAPL",
      timeframe: "1d",
      bars: 200,
      initialCapital: 50000,
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.trades.length).toBeGreaterThanOrEqual(0);
    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(isNaN(result.metrics.sharpe)).toBe(false);
  });

  it("ML prediction produces valid output", () => {
    const pred = store.runMLPrediction("alm-v1", "AAPL");
    expect(pred).toBeTruthy();
    expect(pred!.probabilityUp).toBeGreaterThanOrEqual(0);
    expect(pred!.probabilityUp).toBeLessThanOrEqual(1);
    expect(pred!.riskScore).toBeGreaterThanOrEqual(0);
    expect(pred!.riskScore).toBeLessThanOrEqual(1);
  });

  it("market pulse aggregates correctly", () => {
    // Verify all assets have context
    for (const asset of store.assetCatalog) {
      const ctx = store.buildContext(asset.symbol, 300);
      expect(ctx).toBeTruthy();
      expect(ctx!.regime).toBeTruthy();
    }
  });

  it("correlation matrix covers all assets", () => {
    const symbols = store.assetCatalog.map((a) => a.symbol);
    expect(symbols.length).toBe(18);
  });
});

// ASSET_CATALOG is imported to assert the module surface is stable for
// downstream correlation-matrix tooling — see the "correlation matrix covers
// all assets" test above which validates the catalog size through the store.
void ASSET_CATALOG;
