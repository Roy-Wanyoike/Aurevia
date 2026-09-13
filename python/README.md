# Aurevia — Python Quant Workspace

This is the Python side of the Aurevia quantitative research platform. It lives
alongside the Next.js + TypeScript application under `python/` so researchers
can run experiments, backtests, and feature engineering without dragging the
TypeScript toolchain along.

## Layout

```
python/
├── pyproject.toml          # PEP 621 project metadata + pytest config
├── README.md               # this file
├── aurevia_quant/          # core numerical primitives (indicators, statistics, portfolio)
├── aurevia_research/       # experiment tracking + reproducibility helpers
├── aurevia_ml/             # feature engineering + model pipelines
├── aurevia_backtesting/    # vectorized + event-loop backtest engine
└── tests/                  # pytest suite
```

The Python packages mirror the TypeScript modules under
`src/lib/aurevia/quant/`, `src/lib/aurevia/ml/`, and
`src/lib/aurevia/backtest/` so a researcher can prototype in Python and port
the result back to TypeScript for production deployment in the Next.js API.

## Quick start

```bash
cd python

# Create an isolated environment (3.11+).
python3.11 -m venv .venv
source .venv/bin/activate

# Install runtime + dev dependencies.
pip install -e ".[dev]"

# Run the test suite.
pytest
```

The default `pytest.ini_options` block in `pyproject.toml` pins `testpaths =
["tests"]`, so plain `pytest` from the `python/` directory runs the full
suite.

## Reproducibility contract

Issue #113 (research reproducibility metadata) requires every backtest to
record its `codeVersion` (git SHA), full `parameters` (JSON), `randomSeed`,
and `environment`. The Python side mirrors that contract via
`aurevia_research.experiments.capture_metadata()`, which returns the same
four fields and is intended to be persisted alongside the backtest row in the
Aurevia SQLite/Postgres store.

## Scope (Phase 1)

Phase 1 ships the foundation: project layout, a numpy-first indicator module
(`sma`, `ema`, `rsi`), and a passing pytest suite. `aurevia_quant.statistics`,
`aurevia_quant.portfolio`, `aurevia_research.experiments`,
`aurevia_ml.features`, and `aurevia_backtesting.engine` are stubbed with
module-level docstrings so the import graph is stable and Phase 2 can fill
them in without breaking the public surface.
