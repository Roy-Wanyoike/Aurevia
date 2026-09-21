import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/aurevia/store";
import { ML_MODELS } from "@/lib/aurevia/ml/models";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

// GET /api/v1/ml — list ML models + recent predictions
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");
    const predictions = store.getMLPredictions(symbol ?? undefined);
    return NextResponse.json({
      models: ML_MODELS.map((m) => ({
        key: m.key,
        name: m.name,
        version: m.version,
        horizon: m.horizon,
        trainedAt: m.trainedAt,
      })),
      predictions: symbol
        ? predictions.filter((p) => p.symbol === symbol.toUpperCase())
        : predictions.slice(0, 50),
      total: predictions.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}

const PredictSchema = z.object({
  modelKey: z.enum(["alm-v1", "arf-v1"]),
  symbol: z.string().min(1),
});

// POST /api/v1/ml — run a specific model on a specific symbol
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = PredictSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten()?.formErrors?.[0] ?? "modelKey and symbol required" },
        { status: 400 }
      );
    }
    const pred = store.runMLPrediction(parsed.data.modelKey, parsed.data.symbol.toUpperCase());
    if (!pred) {
      return NextResponse.json({ error: "Could not generate prediction" }, { status: 422 });
    }
    return NextResponse.json({ prediction: pred });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
