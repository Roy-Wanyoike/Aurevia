import numpy as np
import pytest
from aurevia_quant.indicators import sma, ema, rsi

def test_sma_basic():
    result = sma(np.array([1,2,3,4,5]), 3)
    assert not np.isnan(result[2])
    assert result[2] == 2.0
    assert result[3] == 3.0
    assert result[4] == 4.0

def test_sma_too_short():
    assert len(sma(np.array([1,2]), 5)) == 0

def test_ema_constant():
    result = ema(np.array([42,42,42,42,42]), 3)
    assert abs(result[4] - 42) < 0.001

def test_rsi_all_up():
    result = rsi(np.array([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]), 14)
    assert result[14] == 100.0

def test_rsi_all_down():
    result = rsi(np.array([15,14,13,12,11,10,9,8,7,6,5,4,3,2,1]), 14)
    assert result[14] == 0.0
