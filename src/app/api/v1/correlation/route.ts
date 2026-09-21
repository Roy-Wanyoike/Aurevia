import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia Correlation Matrix (issue #44).
//
// Computes an N×N (currently 18×18) Pearson correlation matrix across the
// tradeable universe using 30-day log returns:
//
//   r_i = ln(close_i / close_{i-1})
//
// For each pair (a, b) we compute the Pearson coefficient over the
// overlapping return windows. The diagonal (a === b) is always 1.0.
// Coefficients are rounded to 2 decimal places to keep the payload small
// and the heatmap legible.
//
// Returns:
//   - symbols: ordered universe (rows + columns share this order)
//   - matrix: flat array of { a, b, corr } — one entry per cell
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const requestId = "correlation";
  try {
    const symbols = store.assetCatalog.map((a) => a.symbol);
    const returns: Record<string, number[]> = {};
    for (const s of symbols) {
      const candles = store.getCandles(s, 30);
      const logReturns: number[] = [];
      for (let i = 1; i < candles.length; i++) {
        if (candles[i - 1].close > 0) {
          logReturns.push(Math.log(candles[i].close / candles[i - 1].close));
        }
      }
      returns[s] = logReturns;
    }
    const matrix: { a: string; b: string; corr: number }[] = [];
    for (const a of symbols) {
      for (const b of symbols) {
        const ra = returns[a], rb = returns[b];
        const n = Math.min(ra.length, rb.length);
        if (n < 2) {
          // Not enough overlapping data — emit 0 (neutral) rather than NaN
          // so the heatmap can still render a colored cell.
          matrix.push({ a, b, corr: 0 });
          continue;
        }
        const ma = ra.slice(0, n).reduce((s, v) => s + v, 0) / n;
        const mb = rb.slice(0, n).reduce((s, v) => s + v, 0) / n;
        let num = 0, da = 0, db = 0;
        for (let i = 0; i < n; i++) {
          const xa = ra[i] - ma, xb = rb[i] - mb;
          num += xa * xb; da += xa * xa; db += xb * xb;
        }
        const corr = da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
        matrix.push({ a, b, corr: Math.round(corr * 100) / 100 });
      }
    }

    logger.info("Correlation matrix computed", {
      requestId,
      universeSize: symbols.length,
      cells: matrix.length,
    });

    return NextResponse.json({ symbols, matrix });
  } catch (e: any) {
    logger.error("Correlation matrix failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    store.health.apiErrors++;
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
