"""Experiment tracking + reproducibility metadata.

Mirrors `src/lib/aurevia/research/metadata.ts` on the TypeScript side so a
backtest run from Python and a backtest run from the Next.js API produce the
same four reproducibility fields: codeVersion, parameters, randomSeed,
environment. Persisted alongside the Backtest row in the Prisma store so a
later researcher can replay the run bit-for-bit.
"""
from __future__ import annotations

import json
import os
import random
import subprocess
from typing import Any, Dict


def get_code_version() -> str:
    """Return the short git SHA at the current HEAD, or 'unknown'."""
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
    except Exception:
        return "unknown"


def capture_metadata(params: Dict[str, Any]) -> Dict[str, Any]:
    """Capture the four reproducibility fields for a backtest run.

    `params` is the full parameter dict (strategy key, symbol, timeframe,
    bars, initial capital, commission bps, etc.). If `params["seed"]` is
    set, it is reused; otherwise a fresh 32-bit seed is generated and
    recorded so the run can be replayed.
    """
    seed = params.get("seed")
    if seed is None:
        seed = random.randint(0, 10**9 - 1)
    return {
        "codeVersion": get_code_version(),
        "parameters": json.dumps(params, default=str, sort_keys=True),
        "randomSeed": int(seed),
        "environment": os.environ.get("NODE_ENV", "development"),
    }
