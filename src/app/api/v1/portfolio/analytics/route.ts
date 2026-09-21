import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/portfolio/analytics
//
// Portfolio risk analytics derived from the live paper portfolio:
//   - 30-day Value-at-Risk (95% and 99%) and Conditional VaR (CVaR 95%)
//     computed from the historical distribution of daily portfolio returns,
//     blended across positions by their current market-value weights.
//   - Beta vs SPY benchmark, computed from covariance of portfolio returns
//     with SPY's daily returns over the same window.
//   - Sector exposure breakdown (gross market value per sector).
//   - Position concentration (Herfindahl index + max single-position weight).
//
// Read-only — never mutates portfolio / risk / order state. Returns 422 when
// there are no open positions to compute returns from. (Issue #52.)
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const requestId = "portfolio-analytics";
  try {
    const portfolio = store.getPortfolio();
    const positions = portfolio.positions;
    if (positions.length === 0) {
      logger.info("Portfolio analytics skipped: no open positions", {
        requestId,
        status: "NO_POSITIONS",
      });
      return NextResponse.json(
        { error: "No open positions" },
        { status: 422 },
      );
    }

    // Compute per-position 30-day daily returns. For SHORT positions, a price
    // decline is a gain — so we negate the return series to keep the
    // portfolio aggregate coherent with the position direction.
    const positionReturns: Record<string, number[]> = {};
    for (const p of positions) {
      const candles = store.getCandles(p.symbol, 30);
      const returns: number[] = [];
      for (let i = 1; i < candles.length; i++) {
        if (candles[i - 1].close > 0) {
          const r = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
          returns.push(p.side === "LONG" ? r : -r);
        }
      }
      positionReturns[p.symbol] = returns;
    }

    // Total gross market value is the weight denominator.
    const totalMV = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0);

    // Align all position return series to the shortest common length so the
    // weighted-sum daily return is well-defined at every index.
    const nDays =
      Math.min(...Object.values(positionReturns).map((r) => r.length)) || 0;
    const portfolioReturns: number[] = [];
    for (let i = 0; i < nDays; i++) {
      let dr = 0;
      for (const p of positions) {
        const w = totalMV > 0 ? Math.abs(p.marketValue) / totalMV : 0;
        dr += w * (positionReturns[p.symbol]?.[i] ?? 0);
      }
      portfolioReturns.push(dr);
    }

    // Historical VaR: pick the (alpha * N)-th worst return. CVaR is the
    // mean of the tail beyond the VaR threshold.
    const sorted = [...portfolioReturns].sort((a, b) => a - b);
    const var95 = sorted[Math.floor(0.05 * sorted.length)] ?? 0;
    const var99 = sorted[Math.floor(0.01 * sorted.length)] ?? 0;
    const tailReturns = sorted.slice(
      0,
      Math.max(1, Math.floor(0.05 * sorted.length)),
    );
    const cvar95 =
      tailReturns.reduce((s, v) => s + v, 0) / Math.max(1, tailReturns.length);

    // Beta vs SPY benchmark over the same window.
    const spyCandles = store.getCandles("SPY", 30);
    const spyReturns: number[] = [];
    for (let i = 1; i < spyCandles.length; i++) {
      if (spyCandles[i - 1].close > 0) {
        spyReturns.push(
          (spyCandles[i].close - spyCandles[i - 1].close) /
            spyCandles[i - 1].close,
        );
      }
    }
    let beta = 0;
    if (spyReturns.length >= nDays && nDays > 0) {
      const spySlice = spyReturns.slice(0, nDays);
      const meanP = portfolioReturns.reduce((s, v) => s + v, 0) / nDays;
      const meanS = spySlice.reduce((s, v) => s + v, 0) / nDays;
      let cov = 0;
      let varS = 0;
      for (let i = 0; i < nDays; i++) {
        cov += (portfolioReturns[i] - meanP) * (spySlice[i] - meanS);
        varS += Math.pow(spySlice[i] - meanS, 2);
      }
      beta = varS > 0 ? cov / varS : 0;
    }

    // Sector exposure breakdown — gross market value per sector.
    const sectorExp: Record<string, number> = {};
    for (const p of positions) {
      const asset = store.assetCatalog.find((a) => a.symbol === p.symbol);
      const sector = asset?.sector ?? "Other";
      sectorExp[sector] = (sectorExp[sector] ?? 0) + Math.abs(p.marketValue);
    }
    const sectors = Object.entries(sectorExp).map(([sector, mv]) => ({
      sector,
      exposurePct: totalMV > 0 ? (mv / totalMV) * 100 : 0,
      marketValue: mv,
    }));

    // Herfindahl concentration index + max single-position weight.
    const concentration = positions.reduce((s, p) => {
      const w = totalMV > 0 ? Math.abs(p.marketValue) / totalMV : 0;
      return s + w * w;
    }, 0);
    const maxConcentration = Math.max(
      ...positions.map((p) =>
        totalMV > 0 ? Math.abs(p.marketValue) / totalMV : 0,
      ),
    );

    logger.info("Portfolio analytics computed", {
      requestId,
      status: "OK",
      positions: positions.length,
      nDays,
      beta,
      concentration,
      maxConcentration,
    });

    return NextResponse.json({
      var95: {
        returnPct: var95 * 100,
        dollar: Math.abs(var95 * portfolio.equity),
      },
      var99: {
        returnPct: var99 * 100,
        dollar: Math.abs(var99 * portfolio.equity),
      },
      cvar95: {
        returnPct: cvar95 * 100,
        dollar: Math.abs(cvar95 * portfolio.equity),
      },
      beta: Math.round(beta * 100) / 100,
      sectors,
      concentration: Math.round(concentration * 100) / 100,
      maxConcentration,
      totalMarketValue: totalMV,
      sampleDays: nDays,
    });
  } catch (e: any) {
    logger.error("Portfolio analytics failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    return NextResponse.json(
      { error: e?.message ?? "unknown" },
      { status: 500 },
    );
  }
}
