import { NextResponse } from "next/server";
import { logger } from "@/lib/aurevia/logger";
import {
  fetchAllEconomicData,
  isEconomicDataEnabled,
  type EconomicIndicator,
} from "@/lib/aurevia/intelligence/economic";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia Macro Intelligence — alias endpoint (issue #181).
//
// GET /api/v1/macro
//   Returns the latest observation for GDP, CPI, Unemployment, Fed Funds,
//   10Y Treasury and 2Y Treasury from the St. Louis Fed's free FRED API.
//
// This route is a thin alias for `/api/v1/economic` — both surface the same
// FRED-backed macro series so external consumers (curl, SDKs, dashboards
// that hard-code `/api/v1/macro`) get a stable, documented path. The view
// (`macro-view.tsx`) still fetches via `useEconomic()`; the alias exists so
// the API surface matches the documented route name in ISSUES.md (FR-014).
//
// Disabled gracefully when FRED_API_KEY is absent: returns 200 with an empty
// `indicators` array and `source: "disabled"` so the UI can render a clear
// empty state instead of an error.
// ---------------------------------------------------------------------------

export interface MacroResponse {
  indicators: EconomicIndicator[];
  total: number;
  source: "fred" | "disabled";
  updatedAt: number;
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "macro";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    if (!isEconomicDataEnabled()) {
      logger.info("Macro data disabled (FRED_API_KEY not set)", { requestId });
      const body: MacroResponse = {
        indicators: [],
        total: 0,
        source: "disabled",
        updatedAt: Date.now(),
      };
      return NextResponse.json(body);
    }
    const indicators = await fetchAllEconomicData();
    const body: MacroResponse = {
      indicators,
      total: indicators.length,
      source: "fred",
      updatedAt: Date.now(),
    };
    return NextResponse.json(body);
  } catch (e: any) {
    logger.error("Macro GET failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json(
      { error: "internal_error", requestId },
      { status: 500 },
    );
  }
}
