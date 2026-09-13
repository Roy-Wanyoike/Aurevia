import { describe, it, expect } from "vitest";
import { PaperBroker, PortfolioManager, type Fill } from "./paper-broker";
import type { OrderRecord, Quote, Position } from "../types";

// ---------------------------------------------------------------------------
// PaperBroker + PortfolioManager unit tests.
//
// Covers fills (BUY/SELL/SHORT/flips), commission math, slippage direction,
// mark-to-market, exposure / drawdown / peakEquity, and broker reconciliation.
// ---------------------------------------------------------------------------

function quote(price: number, spread = 0.02): Quote {
  return {
    symbol: "AAPL",
    price,
    bid: price - spread / 2,
    ask: price + spread / 2,
    spread,
    volume24h: 1_000_000,
    changePct: 0,
    timestamp: Date.now(),
  };
}

function order(side: "BUY" | "SELL", qty: number, symbol = "AAPL"): OrderRecord {
  return {
    id: `ord-${Math.random()}`,
    symbol,
    side,
    quantity: qty,
    orderType: "MARKET",
    status: "CREATED",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("PaperBroker.fillMarketOrder", () => {
  it("BUY fill: filledPrice > quote.price (slippage makes us pay more)", () => {
    const broker = new PaperBroker({ slippageBps: 10, partialFillProb: 0 });
    const fill = broker.fillMarketOrder(order("BUY", 100), quote(100));
    expect(fill).not.toBeNull();
    expect(fill!.filledPrice).toBeGreaterThan(100); // ask + slippage
  });

  it("SELL fill: filledPrice < quote.price (slippage makes us receive less)", () => {
    const broker = new PaperBroker({ slippageBps: 10, partialFillProb: 0 });
    const fill = broker.fillMarketOrder(order("SELL", 100), quote(100));
    expect(fill).not.toBeNull();
    expect(fill!.filledPrice).toBeLessThan(100); // bid - slippage
  });

  it("returns null when quote.price <= 0", () => {
    const broker = new PaperBroker();
    const fill = broker.fillMarketOrder(order("BUY", 100), { ...quote(100), price: 0 });
    expect(fill).toBeNull();
  });

  it("commission = price * qty * commissionBps / 10000", () => {
    const broker = new PaperBroker({ commissionBps: 5, slippageBps: 0, partialFillProb: 0 });
    const fill = broker.fillMarketOrder(order("BUY", 100), quote(100));
    expect(fill).not.toBeNull();
    // filledPrice = ask = 100.01 (with spread 0.02). commission ≈ 100.01 * 100 * 5 / 10000 = 5.0005
    expect(fill!.commission).toBeCloseTo(fill!.filledPrice * 100 * 5 / 10000, 4);
  });

  it("full fill when partialFillProb = 0", () => {
    const broker = new PaperBroker({ partialFillProb: 0 });
    const fill = broker.fillMarketOrder(order("BUY", 100), quote(100));
    expect(fill!.filledQty).toBe(100);
  });

  it("always returns a fill object with required fields", () => {
    const broker = new PaperBroker({ partialFillProb: 0 });
    const fill = broker.fillMarketOrder(order("BUY", 50), quote(100));
    expect(fill).not.toBeNull();
    expect(fill!.orderId).toBeDefined();
    expect(fill!.symbol).toBe("AAPL");
    expect(fill!.side).toBe("BUY");
    expect(fill!.timestamp).toBeGreaterThan(0);
  });
});

describe("PortfolioManager — BUY", () => {
  it("BUY decreases cash and creates a LONG position", () => {
    const pm = new PortfolioManager(100_000);
    const fill: Fill = {
      orderId: "o1",
      symbol: "AAPL",
      side: "BUY",
      filledPrice: 100,
      filledQty: 50,
      commission: 5,
      timestamp: Date.now(),
    };
    pm.applyFill(fill);
    expect(pm.cash).toBeCloseTo(100_000 - 100 * 50 - 5, 2);
    const pos = pm.positions.get("AAPL");
    expect(pos).toBeDefined();
    expect(pos!.side).toBe("LONG");
    expect(pos!.quantity).toBe(50);
    expect(pos!.avgEntryPrice).toBe(100);
  });

  it("commission is deducted from cash and tracked in feesPaid", () => {
    const pm = new PortfolioManager(10_000);
    pm.applyFill({
      orderId: "o", symbol: "AAPL", side: "BUY",
      filledPrice: 100, filledQty: 10, commission: 7, timestamp: 0,
    });
    expect(pm.feesPaid).toBe(7);
    expect(pm.cash).toBe(10_000 - 1000 - 7);
  });
});

describe("PortfolioManager — SELL closes long", () => {
  it("SELL on existing LONG increases cash and realizes P&L", () => {
    const pm = new PortfolioManager(100_000);
    pm.applyFill({ orderId: "b", symbol: "AAPL", side: "BUY", filledPrice: 100, filledQty: 50, commission: 0, timestamp: 0 });
    pm.applyFill({ orderId: "s", symbol: "AAPL", side: "SELL", filledPrice: 110, filledQty: 50, commission: 0, timestamp: 0 });
    expect(pm.cash).toBeCloseTo(100_000 - 100 * 50 + 110 * 50, 2);
    expect(pm.realizedPnl).toBeCloseTo((110 - 100) * 50, 2);
    expect(pm.positions.has("AAPL")).toBe(false);
  });
});

describe("PortfolioManager — SHORT", () => {
  it("SHORT increases cash and creates a SHORT position", () => {
    const pm = new PortfolioManager(100_000);
    pm.applyFill({
      orderId: "s1", symbol: "AAPL", side: "SELL",
      filledPrice: 100, filledQty: 50, commission: 0, timestamp: 0,
    });
    expect(pm.cash).toBe(100_000 + 100 * 50);
    const pos = pm.positions.get("AAPL");
    expect(pos).toBeDefined();
    expect(pos!.side).toBe("SHORT");
    expect(pos!.quantity).toBe(50);
  });

  it("equity = cash - shortMarketValue (NOT +)", () => {
    const pm = new PortfolioManager(100_000);
    pm.applyFill({
      orderId: "s1", symbol: "AAPL", side: "SELL",
      filledPrice: 100, filledQty: 50, commission: 0, timestamp: 0,
    });
    // mark to market at the entry price (no change yet)
    const q = new Map([["AAPL", quote(100)]]);
    pm.markToMarket(q);
    const st = pm.state();
    // equity = cash - shortMarketValue = 105000 - 5000 = 100000
    expect(st.equity).toBe(100_000);
    expect(st.marketValue).toBe(-5_000);
    expect(st.exposure).toBeCloseTo(5_000 / 100_000, 4);
  });

  it("short position loses money when price rises (equity decreases)", () => {
    const pm = new PortfolioManager(100_000);
    pm.applyFill({
      orderId: "s1", symbol: "AAPL", side: "SELL",
      filledPrice: 100, filledQty: 50, commission: 0, timestamp: 0,
    });
    const q = new Map([["AAPL", quote(110)]]);
    pm.markToMarket(q);
    const st = pm.state();
    // cash = 105000, shortMV = 110*50 = 5500, equity = 105000 - 5500 = 99500
    expect(st.equity).toBeCloseTo(99_500, 0);
    const pos = pm.positions.get("AAPL")!;
    expect(pos.unrealizedPnl).toBeLessThan(0);
  });
});

describe("PortfolioManager — position flip LONG → SHORT", () => {
  it("Selling more than long qty flips to SHORT and cash adjusts for leftover", () => {
    const pm = new PortfolioManager(100_000);
    // Open LONG 50 @ 100
    pm.applyFill({ orderId: "b", symbol: "AAPL", side: "BUY", filledPrice: 100, filledQty: 50, commission: 0, timestamp: 0 });
    // Sell 80 @ 100 → closes 50 long, opens SHORT 30
    pm.applyFill({ orderId: "s", symbol: "AAPL", side: "SELL", filledPrice: 100, filledQty: 80, commission: 0, timestamp: 0 });
    const pos = pm.positions.get("AAPL");
    expect(pos).toBeDefined();
    expect(pos!.side).toBe("SHORT");
    expect(pos!.quantity).toBe(30);
    // cash: 100k - 5000 (buy) + 8000 (sell 80 @ 100) = 103000
    expect(pm.cash).toBe(100_000 - 100 * 50 + 100 * 80);
  });

  it("flipping to LONG also adjusts cash for leftover", () => {
    const pm = new PortfolioManager(100_000);
    pm.applyFill({ orderId: "s", symbol: "AAPL", side: "SELL", filledPrice: 100, filledQty: 50, commission: 0, timestamp: 0 });
    pm.applyFill({ orderId: "b", symbol: "AAPL", side: "BUY", filledPrice: 100, filledQty: 80, commission: 0, timestamp: 0 });
    const pos = pm.positions.get("AAPL");
    expect(pos!.side).toBe("LONG");
    expect(pos!.quantity).toBe(30);
    // cash: 100k + 5000 (sell 50) - 8000 (buy 80) = 97000
    expect(pm.cash).toBe(100_000 + 100 * 50 - 100 * 80);
  });
});

describe("PortfolioManager — mark to market", () => {
  it("unrealized P&L updates with price for LONG", () => {
    const pm = new PortfolioManager(100_000);
    pm.applyFill({ orderId: "b", symbol: "AAPL", side: "BUY", filledPrice: 100, filledQty: 50, commission: 0, timestamp: 0 });
    pm.markToMarket(new Map([["AAPL", quote(120)]]));
    const pos = pm.positions.get("AAPL")!;
    expect(pos.unrealizedPnl).toBeCloseTo((120 - 100) * 50, 2);
    expect(pos.unrealizedPnlPct).toBeCloseTo(((120 - 100) / 100) * 100, 2);
  });

  it("markToMarket with no quote leaves position unchanged", () => {
    const pm = new PortfolioManager(100_000);
    pm.applyFill({ orderId: "b", symbol: "AAPL", side: "BUY", filledPrice: 100, filledQty: 50, commission: 0, timestamp: 0 });
    pm.markToMarket(new Map()); // empty quotes map
    const pos = pm.positions.get("AAPL")!;
    expect(pos.marketPrice).toBe(100);
  });
});

describe("PortfolioManager — exposure / drawdown / peakEquity", () => {
  it("exposure = grossExposure / equity", () => {
    const pm = new PortfolioManager(100_000);
    pm.applyFill({ orderId: "b", symbol: "AAPL", side: "BUY", filledPrice: 100, filledQty: 50, commission: 0, timestamp: 0 });
    const st = pm.state();
    // equity = 100k - 5000 + 5000 (long MV) = 100k; gross = 5000; exposure = 5%
    expect(st.exposure).toBeCloseTo(0.05, 4);
  });

  it("peakEquity tracks the maximum equity seen", () => {
    const pm = new PortfolioManager(100_000);
    // Buy at 100, mark up to 110 (equity 105k), mark down to 95 (equity 97.5k)
    pm.applyFill({ orderId: "b", symbol: "AAPL", side: "BUY", filledPrice: 100, filledQty: 500, commission: 0, timestamp: 0 });
    pm.markToMarket(new Map([["AAPL", quote(110)]]));
    pm.state(); // updates peakEquity
    pm.markToMarket(new Map([["AAPL", quote(95)]]));
    const st = pm.state();
    expect(st.peakEquity).toBeGreaterThanOrEqual(105_000);
  });

  it("drawdown is 0 when equity is at peak", () => {
    const pm = new PortfolioManager(100_000);
    expect(pm.state().drawdown).toBe(0);
  });

  it("drawdown is positive when equity drops below peak", () => {
    const pm = new PortfolioManager(100_000);
    pm.applyFill({ orderId: "b", symbol: "AAPL", side: "BUY", filledPrice: 100, filledQty: 500, commission: 0, timestamp: 0 });
    pm.markToMarket(new Map([["AAPL", quote(120)]]));
    pm.state();
    pm.markToMarket(new Map([["AAPL", quote(90)]]));
    const st = pm.state();
    expect(st.drawdown).toBeGreaterThan(0);
  });
});

describe("PaperBroker.reconcile", () => {
  it("matching positions → ok=true, empty diffs", () => {
    const broker = new PaperBroker();
    const internal: Position[] = [
      { symbol: "AAPL", side: "LONG", quantity: 100, avgEntryPrice: 100, marketPrice: 100, marketValue: 10000, unrealizedPnl: 0, unrealizedPnlPct: 0, realizedPnl: 0 },
    ];
    const external: Position[] = [
      { symbol: "AAPL", side: "LONG", quantity: 100, avgEntryPrice: 100, marketPrice: 100, marketValue: 10000, unrealizedPnl: 0, unrealizedPnlPct: 0, realizedPnl: 0 },
    ];
    const r = broker.reconcile(internal, external);
    expect(r.ok).toBe(true);
    expect(r.diffs).toHaveLength(0);
  });

  it("missing position in external → diffs populated", () => {
    const broker = new PaperBroker();
    const internal: Position[] = [
      { symbol: "AAPL", side: "LONG", quantity: 100, avgEntryPrice: 100, marketPrice: 100, marketValue: 10000, unrealizedPnl: 0, unrealizedPnlPct: 0, realizedPnl: 0 },
    ];
    const external: Position[] = [];
    const r = broker.reconcile(internal, external);
    expect(r.ok).toBe(false);
    expect(r.diffs.length).toBeGreaterThan(0);
    expect(r.diffs[0]).toContain("AAPL");
  });

  it("quantity mismatch → diffs populated", () => {
    const broker = new PaperBroker();
    const internal: Position[] = [
      { symbol: "AAPL", side: "LONG", quantity: 100, avgEntryPrice: 100, marketPrice: 100, marketValue: 10000, unrealizedPnl: 0, unrealizedPnlPct: 0, realizedPnl: 0 },
    ];
    const external: Position[] = [
      { symbol: "AAPL", side: "LONG", quantity: 50, avgEntryPrice: 100, marketPrice: 100, marketValue: 5000, unrealizedPnl: 0, unrealizedPnlPct: 0, realizedPnl: 0 },
    ];
    const r = broker.reconcile(internal, external);
    expect(r.ok).toBe(false);
    expect(r.diffs.length).toBeGreaterThan(0);
  });
});
