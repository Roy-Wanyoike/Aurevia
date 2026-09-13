"""Vectorized + event-loop backtest engine.

Phase 1 stub. Phase 2 will mirror `src/lib/aurevia/backtest/engine.ts` —
take a strategy, a candle series, and a parameter dict, and produce a
`BacktestResult` with the same field names as the TypeScript interface
(equity curve, trades, metrics, status). The engine will reuse
`aurevia_quant.indicators` and `aurevia_quant.statistics` so a backtest run
from either language produces identical numbers for the same inputs.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class BacktestResult:
    """Stub — Phase 2 fills this in to mirror the TS BacktestResult."""
    id: str = ""
    strategy_key: str = ""
    symbol: str = ""
    final_equity: float = 0.0
    status: str = "COMPLETED"


def run_backtest(config: Dict[str, Any]) -> BacktestResult:
    """Run a backtest. Stub — Phase 2."""
    raise NotImplementedError("aurevia_backtesting.engine.run_backtest — Phase 2")
