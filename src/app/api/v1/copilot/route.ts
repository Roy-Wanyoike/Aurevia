import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  query: z.string().min(1),
});

// POST /api/v1/copilot
//
// AI Research Copilot — the operator asks a natural-language question about
// their portfolio or the markets. The server bundles the live portfolio +
// health + top-movers + recent-signals context, calls the ZAI chat
// completions API with a system prompt that forbids fabrication, and
// returns the answer + the context bundle that was sent. (Issue #55.)
//
// The SDK runs server-side only — never in the browser.
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "copilot";
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = QuerySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 },
      );
    }
    const { query } = parsed.data;

    // Gather context from the live store.
    const portfolio = store.getPortfolio();
    const health = store.health;
    const topMovers = [...store.assetCatalog]
      .map((a) => {
        const q = store.getQuote(a.symbol);
        return { symbol: a.symbol, price: q.price, changePct: q.changePct };
      })
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 5);
    const recentSignals = store.signals.slice(0, 5).map((s) => ({
      symbol: s.symbol,
      action: s.action,
      strategy: s.strategyKey,
      confidence: s.confidence,
    }));

    const context = `Portfolio: equity ${portfolio.equity.toFixed(2)}, cash ${portfolio.cash.toFixed(2)}, positions ${portfolio.positions.length}, exposure ${(portfolio.exposure * 100).toFixed(0)}%, drawdown ${(portfolio.drawdown * 100).toFixed(2)}%.
Top movers: ${JSON.stringify(topMovers)}.
Recent signals: ${JSON.stringify(recentSignals)}.
System: mode ${health.brokerConnected ? "connected" : "disconnected"}, ${store.riskProfile.circuitBreakerState}.`;

    logger.info("Copilot query received", {
      requestId,
      status: "OK",
      queryLen: query.length,
      portfolioEquity: portfolio.equity,
      positions: portfolio.positions.length,
    });

    const zai = await ZAI.create();
    const response = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are Aurevia's research copilot. Answer questions about the portfolio and markets using the provided context. Be concise, evidence-based, and never fabricate data. If data is missing, say so. Context: " +
            context,
        },
        { role: "user", content: query },
      ],
    });
    const answer =
      response?.choices?.[0]?.message?.content ?? "No response generated.";

    logger.info("Copilot answered", {
      requestId,
      status: "OK",
      answerLen: answer.length,
    });

    return NextResponse.json({ answer, context, query });
  } catch (e: any) {
    logger.error("Copilot failed", {
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
