import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// POST /api/v1/backtests/[id]/monte-carlo
//
// Robustness analysis for a saved backtest:
//
//   - Monte Carlo: resamples the trade sequence 100 times (without
//     replacement, shuffled order), reconstructs the equity curve for each
//     simulation, and reports the p10 / p50 / p90 final equities + the
//     survival rate (% of sims that ended above initial capital) + the
//     worst- and best-case final equities.
//
//   - Walk-Forward: splits the trades into 4 chronological windows, computes
//     the annualized Sharpe and total return for each window. Stability is
//     1 minus the spread of window Sharpes normalized by their max magnitude.
//
//   - Robustness Score (0..100): 40% survival rate + 30% walk-forward
//     stability + 30% original Sharpe (capped at 2).
//
// Read-only — never mutates the backtest or any other state. (Issue #57.)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const requestId = `monte-carlo:${id}`;
  try {
    const bt = store.backtests.find((b) => b.id === id);
    if (!bt) {
      logger.warn("Monte Carlo: backtest not found", {
        requestId,
        status: "NOT_FOUND",
      });
      return NextResponse.json(
        { error: "Backtest not found" },
        { status: 404 },
      );
    }

    const trades = bt.trades;
    if (trades.length === 0) {
      logger.info("Monte Carlo: no trades to simulate", {
        requestId,
        status: "NO_TRADES",
      });
      return NextResponse.json(
        { error: "No trades to simulate" },
        { status: 422 },
      );
    }

    // --- Monte Carlo: 100 shuffled-path simulations -------------------------
    const simulations: number[][] = [];
    const NUM_SIMS = 100;
    for (let s = 0; s < NUM_SIMS; s++) {
      // Shuffle without replacement — each sim uses every trade exactly once.
      const shuffled = [...trades].sort(() => Math.random() - 0.5);
      let equity = bt.initialCapital;
      const curve = [equity];
      for (const t of shuffled) {
        equity += t.pnl;
        curve.push(equity);
      }
      simulations.push(curve);
    }

    // Percentile bands on the final-equity distribution.
    const finalEquities = simulations
      .map((s) => s[s.length - 1])
      .sort((a, b) => a - b);
    const p10 = finalEquities[Math.floor(0.1 * NUM_SIMS)];
    const p50 = finalEquities[Math.floor(0.5 * NUM_SIMS)];
    const p90 = finalEquities[Math.floor(0.9 * NUM_SIMS)];
    const survivalRate =
      finalEquities.filter((e) => e > bt.initialCapital).length / NUM_SIMS;
    const worstCase = finalEquities[0];
    const bestCase = finalEquities[finalEquities.length - 1];

    // --- Walk-Forward: 4 chronological windows --------------------------------
    const windowSize = Math.floor(trades.length / 4);
    const windows: {
      start: number;
      end: number;
      sharpe: number;
      returnPct: number;
    }[] = [];
    for (let w = 0; w < 4; w++) {
      const slice = trades.slice(w * windowSize, (w + 1) * windowSize);
      if (slice.length === 0) continue;
      const returns = slice.map((t) => t.pnlPct / 100);
      const mean =
        returns.reduce((s, v) => s + v, 0) / returns.length;
      const variance =
        returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
      const sd = Math.sqrt(variance);
      const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(252) : 0;
      const returnPct =
        (slice.reduce((s, t) => s + t.pnl, 0) / bt.initialCapital) * 100;
      windows.push({
        start: w * windowSize,
        end: (w + 1) * windowSize,
        sharpe: Math.round(sharpe * 100) / 100,
        returnPct: Math.round(returnPct * 100) / 100,
      });
    }

    // --- Robustness score: blend of MC survival + WF stability + Sharpe ----
    const wfStability =
      windows.length > 0
        ? 1 -
          (Math.max(...windows.map((w) => w.sharpe)) -
            Math.min(...windows.map((w) => w.sharpe))) /
            Math.max(
              0.1,
              Math.max(...windows.map((w) => Math.abs(w.sharpe))),
            )
        : 0;
    const robustness = Math.round(
      (survivalRate * 0.4 +
        wfStability * 0.3 +
        Math.min(1, Math.max(0, bt.metrics.sharpe / 2)) * 0.3) *
        100,
    );

    logger.info("Monte Carlo computed", {
      requestId,
      status: "OK",
      trades: trades.length,
      survivalRate: Math.round(survivalRate * 100),
      robustness,
      windows: windows.length,
    });

    return NextResponse.json({
      monteCarlo: {
        simulations: simulations.length,
        p10,
        p50,
        p90,
        survivalRate: Math.round(survivalRate * 100),
        worstCase,
        bestCase,
      },
      walkForward: windows,
      robustness: {
        score: robustness,
        originalSharpe: bt.metrics.sharpe,
        survivalRate: Math.round(survivalRate * 100),
        walkForwardStability: Math.round(wfStability * 100),
      },
    });
  } catch (e: any) {
    logger.error("Monte Carlo failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    return NextResponse.json(
      { error: "internal_error", requestId },
      { status: 500 },
    );
  }
}
