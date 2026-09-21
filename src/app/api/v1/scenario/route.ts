import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia What-If Simulator (issue #51).
//
// POST /api/v1/scenario
//   body: { symbol?: string, shockPct: number (-0.5..0.5) }
//
// Walks the current open positions and applies a hypothetical shock. If a
// symbol is supplied, only that symbol takes the full shock — positions in
// the SAME sector take 50% of the shock (a simple correlated-impact model)
// so the user sees realistic cross-name exposure. If no symbol is supplied,
// every position takes the full shock directly (useful for "market crash"
// scenarios where the whole book should move together).
//
// The simulation is read-only: it never mutates the portfolio, the order
// book, or risk state. It returns the original equity, the post-shock
// equity, the aggregate P&L impact (dollar + %), and a per-position
// impact table including a `correlated` flag.
// ---------------------------------------------------------------------------

const ScenarioSchema = z.object({
  symbol: z.string().min(1).max(20).optional(),
  shockPct: z.number().min(-0.5).max(0.5), // -50% to +50%
});

interface ScenarioImpact {
  symbol: string;
  side: string;
  marketValue: number;
  shockPct: number;
  pnlImpact: number;
  correlated: boolean;
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ScenarioSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Scenario rejected: invalid request", {
        requestId,
        status: "INVALID",
        errors: parsed.error.issues?.map((i) => i.message) ?? [],
      });
      return NextResponse.json(
        { error: "symbol and shockPct required" },
        { status: 400 },
      );
    }
    const { symbol, shockPct } = parsed.data;

    const portfolio = store.getPortfolio();
    if (portfolio.positions.length === 0) {
      logger.info("Scenario skipped: no open positions", {
        requestId,
        status: "NO_POSITIONS",
      });
      return NextResponse.json(
        { error: "No open positions to simulate" },
        { status: 422 },
      );
    }

    const upperSymbol = symbol ? symbol.toUpperCase() : undefined;
    const shockedAsset = upperSymbol
      ? store.assetCatalog.find((a) => a.symbol === upperSymbol)
      : null;
    // Reject unknown symbols early — silently accepting a non-existent ticker
    // would make the "direct" bucket empty and confuse the user.
    if (upperSymbol && !shockedAsset) {
      return NextResponse.json(
        { error: `Unknown symbol: ${upperSymbol}` },
        { status: 400 },
      );
    }

    const impacts: ScenarioImpact[] = [];
    let totalPnlImpact = 0;
    for (const p of portfolio.positions) {
      // Direct impact if the position matches the shocked symbol, OR if no
      // symbol was supplied (whole-book shock — e.g. "market crash -15%").
      const isDirect = !upperSymbol || p.symbol === upperSymbol;
      const asset = store.assetCatalog.find((a) => a.symbol === p.symbol);
      const sameSector =
        !!asset &&
        !!shockedAsset &&
        !!asset.sector &&
        !!shockedAsset.sector &&
        asset.sector === shockedAsset.sector;
      // Correlated names take 50% of the shock. Same-sector correlation is a
      // crude but useful model — it captures the dominant tech↔tech, crypto↔crypto
      // clustering without requiring a covariance matrix.
      const effectiveShock = isDirect ? shockPct : sameSector ? shockPct * 0.5 : 0;
      // LONG: equity moves with price (shock > 0 → gain). SHORT: inverse.
      const pnlImpact =
        p.side === "LONG"
          ? effectiveShock * p.marketValue
          : -effectiveShock * p.marketValue;
      totalPnlImpact += pnlImpact;
      impacts.push({
        symbol: p.symbol,
        side: p.side,
        marketValue: p.marketValue,
        shockPct: effectiveShock,
        pnlImpact: Math.round(pnlImpact * 100) / 100,
        correlated: !isDirect && sameSector,
      });
    }

    const newEquity = portfolio.equity + totalPnlImpact;
    const equityImpactPct =
      portfolio.equity > 0 ? (totalPnlImpact / portfolio.equity) * 100 : 0;

    logger.info("Scenario simulated", {
      requestId,
      status: "OK",
      symbol: upperSymbol ?? "*",
      shockPct,
      positions: impacts.length,
      pnlImpact: Math.round(totalPnlImpact * 100) / 100,
      equityImpactPct: Math.round(equityImpactPct * 100) / 100,
    });

    return NextResponse.json({
      originalEquity: portfolio.equity,
      newEquity: Math.round(newEquity * 100) / 100,
      pnlImpact: Math.round(totalPnlImpact * 100) / 100,
      equityImpactPct: Math.round(equityImpactPct * 100) / 100,
      impacts,
    });
  } catch (e: any) {
    logger.error("Scenario POST failed", {
      requestId,
      status: "ERROR",
      error: e?.message ?? "unknown",
    });
    store.health.apiErrors++;
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
