"""Performance statistics for backtest equity curves.

Phase 1 stub. Phase 2 will implement total return, annualized return, Sharpe,
Sortino, max drawdown, win rate, profit factor, and Calmar ratio — the same
set produced by `src/lib/aurevia/backtest/engine.ts` so a Python backtest and
a TypeScript backtest report identical metrics for the same input series.
"""
from __future__ import annotations

from typing import Sequence


def total_return(equity: Sequence[float]) -> float:
    """Total return for an equity curve. Stub — Phase 2."""
    raise NotImplementedError("aurevia_quant.statistics.total_return — Phase 2")


def sharpe_ratio(returns: Sequence[float], rf: float = 0.0) -> float:
    """Annualized Sharpe ratio. Stub — Phase 2."""
    raise NotImplementedError("aurevia_quant.statistics.sharpe_ratio — Phase 2")
