"""Portfolio accounting primitives.

Phase 1 stub. Phase 2 will mirror `src/lib/aurevia/execution/paper-broker.ts`
— apply fills, mark-to-market, track cash / equity / exposure / drawdown, and
expose a `PortfolioState` dataclass with the same field names as the
TypeScript `PortfolioState` interface so JSON serialized from either side
deserializes cleanly on the other.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PortfolioState:
    """Stub — Phase 2 fills this in to mirror the TS interface."""
    cash: float = 0.0
    equity: float = 0.0
    market_value: float = 0.0
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    fees_paid: float = 0.0
    exposure: float = 0.0
    leverage: float = 1.0
    drawdown: float = 0.0
    peak_equity: float = 0.0
