// Aurevia — research reproducibility metadata helpers.
//
// Issue #113 — every backtest must record four reproducibility fields so a
// later researcher can replay the run bit-for-bit:
//
//   - codeVersion : short git SHA at the time of the run
//   - parameters  : JSON of the full RunSchema payload (strategyKey, symbol,
//                   timeframe, bars, initialCapital, commissionBps, …)
//   - randomSeed  : seed used by any RNG in the engine (forward-compatible —
//                   the current engine is deterministic, but ML / Monte-Carlo
//                   paths will consume this)
//   - environment : development | test | production (NODE_ENV)
//
// These are persisted on the Backtest row (see prisma/schema.prisma) and
// attached to the in-memory BacktestResult by the POST /api/v1/backtests
// handler. The Python side mirrors this contract via
// python/aurevia_research/experiments.py:capture_metadata() so a Python
// backtest and a TS API backtest produce identical fields.

import { execSync } from "child_process";

/**
 * Return the short git SHA at the current HEAD, or `"unknown"` if git is
 * unavailable (e.g. inside a stripped-down container).
 */
export function getCodeVersion(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

export interface ExperimentMetadata {
  codeVersion: string;
  parameters: string;
  randomSeed: number;
  environment: string;
}

/**
 * Capture the four reproducibility fields for a backtest run.
 *
 * `params` is the validated RunSchema payload (z.parsed().data). If
 * `params.seed` is set, it is reused; otherwise a fresh 32-bit seed is
 * generated and recorded so the run can be replayed.
 */
export function captureExperimentMetadata(
  params: Record<string, any>,
): ExperimentMetadata {
  return {
    codeVersion: getCodeVersion(),
    parameters: JSON.stringify(params),
    randomSeed: params.seed ?? Math.floor(Math.random() * 1e9),
    environment: process.env.NODE_ENV || "development",
  };
}
