import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { STRATEGIES } from "@/lib/aurevia/strategies";

export const dynamic = "force-dynamic";

// GET /api/v1/strategies — list installed strategy plugins.
export async function GET() {
  try {
    return NextResponse.json({
      strategies: STRATEGIES.map((s) => ({
        key: s.key,
        name: s.name,
        description: s.description,
        category: s.category,
        version: s.version,
        defaultParams: s.defaultParams,
      })),
      total: STRATEGIES.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
