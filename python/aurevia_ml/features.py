"""Feature engineering for ML pipelines.

Phase 1 stub. Phase 2 will mirror `src/lib/aurevia/ml/models.ts` — build
per-bar feature vectors (returns, volatility, RSI, MACD, trend strength,
regime label) suitable for the XGBoost / scikit-learn models declared in
`pyproject.toml`. The feature schema will be a frozen dataclass so the
TypeScript side can read the same column names from a serialized parquet.
"""
from __future__ import annotations

from typing import Sequence


def build_features(prices: Sequence[float]) -> list[dict]:
    """Build a per-bar feature dict list from a price series. Stub — Phase 2."""
    raise NotImplementedError("aurevia_ml.features.build_features — Phase 2")
