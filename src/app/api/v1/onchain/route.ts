import { NextResponse } from "next/server";
import { logger } from "@/lib/aurevia/logger";
import { fetchOnchainSnapshot, type OnchainSnapshot } from "@/lib/aurevia/intelligence/onchain";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia On-Chain Intelligence — DeFi Llama (issue #106).
//
// GET /api/v1/onchain
//   Returns:
//     - chains: current TVL per chain (sorted desc)
//     - totalTvlUsd: aggregate TVL across all chains
//     - history: total TVL history (last 90 days)
//     - protocols: top-20 protocols by TVL
//
// DeFi Llama is a free public API — no key required. When the upstream is
// unreachable the route returns 200 with empty arrays so the UI shows a clean
// empty state instead of an error.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "onchain";
  try {
    const snapshot: OnchainSnapshot = await fetchOnchainSnapshot();
    return NextResponse.json(snapshot);
  } catch (e: any) {
    logger.error("Onchain GET failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json(
      {
        chains: [],
        totalTvlUsd: 0,
        history: [],
        protocols: [],
        source: "defillama",
        updatedAt: Date.now(),
        error: e?.message ?? "unknown",
      },
      { status: 500 },
    );
  }
}
