import { NextResponse } from "next/server";
import { logger } from "@/lib/aurevia/logger";
import {
  fetchAllEconomicData,
  isEconomicDataEnabled,
  type EconomicIndicator,
} from "@/lib/aurevia/intelligence/economic";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia Macro Intelligence — FRED economic indicators (issue #105).
//
// GET /api/v1/economic
//   Returns the latest observation for GDP, CPI, Unemployment, Fed Funds,
//   10Y Treasury and 2Y Treasury from the St. Louis Fed's free FRED API.
//
// Disabled gracefully when FRED_API_KEY is absent: returns 200 with an empty
// `indicators` array and `source: "disabled"` so the UI can render a clear
// empty state instead of an error.
// ---------------------------------------------------------------------------

export interface EconomicResponse {
  indicators: EconomicIndicator[];
  total: number;
  source: "fred" | "disabled";
  updatedAt: number;
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "economic";
  try {
    if (!isEconomicDataEnabled()) {
      logger.info("Economic data disabled (FRED_API_KEY not set)", { requestId });
      const body: EconomicResponse = {
        indicators: [],
        total: 0,
        source: "disabled",
        updatedAt: Date.now(),
      };
      return NextResponse.json(body);
    }
    const indicators = await fetchAllEconomicData();
    const body: EconomicResponse = {
      indicators,
      total: indicators.length,
      source: "fred",
      updatedAt: Date.now(),
    };
    return NextResponse.json(body);
  } catch (e: any) {
    logger.error("Economic GET failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json(
      { error: e?.message ?? "unknown", indicators: [], total: 0, source: "disabled", updatedAt: Date.now() },
      { status: 500 },
    );
  }
}
