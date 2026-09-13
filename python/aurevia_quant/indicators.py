"""Aurevia quantitative indicators — Python implementation.

Mirrors `src/lib/aurevia/quant/indicators.ts` on the TypeScript side so a
researcher can prototype here and port the result back to production. All
functions return numpy arrays aligned to the input length, with NaN padding
for the warm-up window so consumers can index by the same timestamps as the
input price series.
"""
import numpy as np
from typing import Optional

def sma(prices: np.ndarray, period: int) -> np.ndarray:
    """Simple Moving Average."""
    if len(prices) < period:
        return np.array([])
    cumsum = np.cumsum(prices)
    result = (cumsum[period - 1:] - np.concatenate([[0], cumsum[:-period]])) / period
    return np.concatenate([np.full(period - 1, np.nan), result])

def ema(prices: np.ndarray, period: int) -> np.ndarray:
    """Exponential Moving Average."""
    if len(prices) == 0:
        return np.array([])
    # Cast to float so the NaN warm-up pad below doesn't blow up on integer
    # input arrays (np.zeros_like preserves dtype, and NaN is a float).
    prices = np.asarray(prices, dtype=float)
    k = 2 / (period + 1)
    result = np.zeros_like(prices)
    result[0] = prices[0]
    for i in range(1, len(prices)):
        result[i] = prices[i] * k + result[i-1] * (1 - k)
    result[:period-1] = np.nan
    return result

def rsi(prices: np.ndarray, period: int = 14) -> np.ndarray:
    """Relative Strength Index."""
    if len(prices) <= period:
        return np.array([])
    deltas = np.diff(prices)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)

    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])

    result = np.zeros(len(prices))
    result[period] = 100 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)

    for i in range(period + 1, len(prices)):
        avg_gain = (avg_gain * (period - 1) + gains[i-1]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i-1]) / period
        result[i] = 100 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)

    result[:period] = np.nan
    return result
