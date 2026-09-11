import type {
  OrderRecord,
  Position,
  PortfolioState,
  Quote,
  Candle,
} from "../types";

// ---------------------------------------------------------------------------
// Paper broker + execution engine + portfolio manager.
//
// This simulates a broker so the platform can run end-to-end paper trading
// without external credentials. It models spread, slippage, commission,
// partial fills on low-volume bars, and order state transitions.
//
// The portfolio manager tracks cash, positions, equity, realized/unrealized
// P&L, exposure, leverage, and drawdown — and can reconcile against an
// external broker state (used by the circuit breaker to pause on mismatch).
// ---------------------------------------------------------------------------

export interface Fill {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  filledPrice: number;
  filledQty: number;
  commission: number;
  timestamp: number;
}

export class PaperBroker {
  private commissionBps: number;
  private slippageBps: number;
  private partialFillProb: number;

  constructor(opts?: { commissionBps?: number; slippageBps?: number; partialFillProb?: number }) {
    this.commissionBps = opts?.commissionBps ?? 5;
    this.slippageBps = opts?.slippageBps ?? 8;
    this.partialFillProb = opts?.partialFillProb ?? 0.05;
  }

  // Match a market order against the current quote. Returns the fill (or null
  // if rejected). May produce a partial fill if the rng triggers it.
  fillMarketOrder(order: OrderRecord, quote: Quote): Fill | null {
    if (quote.price <= 0) return null;
    const slip = (quote.price * this.slippageBps) / 10000;
    const price = order.side === "BUY" ? quote.ask + slip : quote.bid - slip;
    let qty = order.quantity;
    // Rare partial fill — backtester handles the rest by splitting into two
    // fills; here we just simulate a one-shot partial for realism.
    if (Math.random() < this.partialFillProb) {
      qty = Math.max(1, Math.round(order.quantity * (0.5 + Math.random() * 0.4)));
    }
    const commission = (price * qty * this.commissionBps) / 10000;
    return {
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      filledPrice: price,
      filledQty: qty,
      commission,
      timestamp: Date.now(),
    };
  }

  // Reconcile internal portfolio state against an external broker snapshot.
  // Returns true if they agree, false if there is a mismatch (which the
  // circuit breaker uses to pause trading).
  reconcile(internal: Position[], external: Position[]): { ok: boolean; diffs: string[] } {
    const diffs: string[] = [];
    const internalMap = new Map(internal.map((p) => [p.symbol, p]));
    const externalMap = new Map(external.map((p) => [p.symbol, p]));
    for (const sym of new Set([...internalMap.keys(), ...externalMap.keys()])) {
      const a = internalMap.get(sym);
      const b = externalMap.get(sym);
      if (!a || !b) {
        diffs.push(`${sym}: present in ${a ? "internal" : "external"} only`);
        continue;
      }
      if (Math.abs(a.quantity - b.quantity) / Math.max(1, a.quantity) > 0.001) {
        diffs.push(`${sym}: qty mismatch internal=${a.quantity} external=${b.quantity}`);
      }
    }
    return { ok: diffs.length === 0, diffs };
  }
}

// Portfolio manager. Maintains cash + positions, applies fills, marks to
// market, and computes equity / exposure / leverage / drawdown.
export class PortfolioManager {
  cash: number;
  positions: Map<string, Position> = new Map();
  realizedPnl: number = 0;
  feesPaid: number = 0;
  peakEquity: number;

  constructor(initialCash: number) {
    this.cash = initialCash;
    this.peakEquity = initialCash;
  }

  applyFill(fill: Fill): void {
    this.feesPaid += fill.commission;
    this.cash -= fill.commission;
    const existing = this.positions.get(fill.symbol);
    const signedQty = fill.side === "BUY" ? fill.filledQty : -fill.filledQty;
    if (!existing) {
      const side = signedQty > 0 ? "LONG" : "SHORT";
      this.positions.set(fill.symbol, {
        symbol: fill.symbol,
        side,
        quantity: Math.abs(signedQty),
        avgEntryPrice: fill.filledPrice,
        marketPrice: fill.filledPrice,
        marketValue: fill.filledPrice * Math.abs(signedQty),
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        realizedPnl: 0,
      });
      if (fill.side === "BUY") this.cash -= fill.filledPrice * fill.filledQty;
      else this.cash += fill.filledPrice * fill.filledQty;
      return;
    }
    // Adding to / reducing / flipping an existing position.
    const newSigned =
      (existing.side === "LONG" ? existing.quantity : -existing.quantity) + signedQty;
    if ((existing.side === "LONG" && signedQty > 0) || (existing.side === "SHORT" && signedQty < 0)) {
      // Adding to position — update average entry.
      const totalCost = existing.avgEntryPrice * existing.quantity + fill.filledPrice * fill.filledQty;
      const totalQty = existing.quantity + fill.filledQty;
      existing.avgEntryPrice = totalCost / totalQty;
      existing.quantity = totalQty;
      if (fill.side === "BUY") this.cash -= fill.filledPrice * fill.filledQty;
      else this.cash += fill.filledPrice * fill.filledQty;
    } else {
      // Reducing or closing.
      const closeQty = Math.min(existing.quantity, fill.filledQty);
      const pnl =
        existing.side === "LONG"
          ? (fill.filledPrice - existing.avgEntryPrice) * closeQty
          : (existing.avgEntryPrice - fill.filledPrice) * closeQty;
      this.realizedPnl += pnl;
      existing.realizedPnl += pnl;
      existing.quantity -= closeQty;
      if (fill.side === "BUY") this.cash -= fill.filledPrice * closeQty;
      else this.cash += fill.filledPrice * closeQty;
      if (existing.quantity < 1e-9) {
        this.positions.delete(fill.symbol);
      } else if (fill.filledQty > closeQty) {
        // Flipped direction.
        const leftover = fill.filledQty - closeQty;
        const newSide = fill.side === "BUY" ? "LONG" : "SHORT";
        this.positions.set(fill.symbol, {
          symbol: fill.symbol,
          side: newSide,
          quantity: leftover,
          avgEntryPrice: fill.filledPrice,
          marketPrice: fill.filledPrice,
          marketValue: fill.filledPrice * leftover,
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
          realizedPnl: existing.realizedPnl,
        });
      }
    }
  }

  markToMarket(quotes: Map<string, Quote>): void {
    for (const pos of this.positions.values()) {
      const q = quotes.get(pos.symbol);
      if (!q) continue;
      pos.marketPrice = q.price;
      pos.marketValue = q.price * pos.quantity;
      const dir = pos.side === "LONG" ? 1 : -1;
      pos.unrealizedPnl = (q.price - pos.avgEntryPrice) * pos.quantity * dir;
      pos.unrealizedPnlPct =
        pos.avgEntryPrice > 0 ? ((q.price - pos.avgEntryPrice) / pos.avgEntryPrice) * dir * 100 : 0;
    }
  }

  state(): PortfolioState {
    const positions = Array.from(this.positions.values());
    const marketValue = positions.reduce((a, b) => a + b.marketValue, 0);
    const unrealizedPnl = positions.reduce((a, b) => a + b.unrealizedPnl, 0);
    const equity = this.cash + marketValue;
    if (equity > this.peakEquity) this.peakEquity = equity;
    const drawdown = this.peakEquity > 0 ? (this.peakEquity - equity) / this.peakEquity : 0;
    const grossExposure = positions.reduce((a, b) => a + b.marketValue, 0);
    const exposure = equity > 0 ? grossExposure / equity : 0;
    const leverage = exposure; // no margin in paper; = gross/equity
    return {
      cash: round2(this.cash),
      equity: round2(equity),
      marketValue: round2(marketValue),
      unrealizedPnl: round2(unrealizedPnl),
      realizedPnl: round2(this.realizedPnl),
      feesPaid: round2(this.feesPaid),
      exposure: round2(exposure),
      leverage: round2(leverage),
      drawdown: round2(drawdown),
      peakEquity: round2(this.peakEquity),
      positions,
      updatedAt: Date.now(),
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
