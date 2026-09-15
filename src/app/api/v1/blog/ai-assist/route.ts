import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";
import {
  serializeTags,
  parseTags,
  estimateReadingMinutes,
} from "@/lib/aurevia/blog/shared";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/v1/blog/ai-assist
//
// AI-assisted authoring for Research Hub articles. The body selects an
// `action` and provides the article text; the LLM returns either generated
// text or structured metadata depending on the action:
//
//   summarize   → { summary } (1-2 sentence excerpt used as the article's
//                 auto-excerpt in the dashboard and list view)
//   suggestTags → { tags: string[] } (3-7 kebab-case tags)
//   sentiment   → { sentiment: "bullish" | "bearish" | "neutral", confidence }
//   improve     → { improved } (a polished rewrite of the draft — preserves
//                 the author's intent, just tightens prose + fixes obvious
//                 grammar issues)
//   generate    → { content } (generate a starter draft from a topic prompt)
//
// All actions also persist their result on the article (when an `articleId`
// is provided) so the next list render doesn't re-call the LLM. The SDK
// runs server-side only — never in the browser.
// ---------------------------------------------------------------------------

const AiAssistSchema = z.object({
  action: z.enum(["summarize", "suggestTags", "sentiment", "improve", "generate"]),
  content: z.string().max(50_000).optional(),
  topic: z.string().max(500).optional(),
  articleId: z.string().optional(),
});

const SYSTEM_PROMPT =
  "You are Aurevia's research editor. The user is a market analyst writing research articles about financial markets, trading strategies, and macroeconomics. " +
  "Be precise, evidence-based, and never fabricate data or cite nonexistent sources. " +
  "Match the user's language — if the article is in English, respond in English; if Chinese, respond in Chinese; etc.";

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "blog-ai-assist";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = AiAssistSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { action } = parsed.data;
    const content = (parsed.data.content ?? "").trim();
    const topic = (parsed.data.topic ?? "").trim();

    if (action !== "generate" && content.length === 0) {
      return NextResponse.json(
        { error: "content is required for this action" },
        { status: 400 },
      );
    }
    if (action === "generate" && topic.length === 0) {
      return NextResponse.json(
        { error: "topic is required for the generate action" },
        { status: 400 },
      );
    }

    const zai = await ZAI.create();
    let userPrompt = "";
    let parseResult: any = null;

    if (action === "summarize") {
      userPrompt =
        `Summarize the following research article in 1-2 sentences (max ~280 characters). ` +
        `Focus on the central thesis and the most consequential supporting evidence. ` +
        `Return ONLY the summary text, no preamble.\n\nArticle:\n${content}`;
    } else if (action === "suggestTags") {
      userPrompt =
        `Suggest 3-7 short kebab-case tags for the following research article. ` +
        `Tags should be specific enough to be useful as filters (e.g. "fed-policy", "ai-momentum", "volatility regimes") ` +
        `but not so specific they only apply to this one article. ` +
        `Return ONLY a JSON array of strings, no prose. Example: ["fed-policy","rates","macro-outlook"]\n\nArticle:\n${content}`;
    } else if (action === "sentiment") {
      userPrompt =
        `Classify the market sentiment of the following research article as exactly one of: ` +
        `"bullish", "bearish", or "neutral". Consider the author's stance on the assets or themes they discuss, ` +
        `not just the words used. Return ONLY a JSON object: {"sentiment":"bullish|bearish|neutral","confidence":0.0-1.0,"reason":"one short sentence"}\n\nArticle:\n${content}`;
    } else if (action === "improve") {
      userPrompt =
        `Polish the following research draft. Preserve the author's voice, intent, and structure. ` +
        `Tighten prose, fix obvious grammar / spelling issues, improve paragraph transitions, and remove redundancy. ` +
        `Do NOT add new claims or citations the author didn't make. Return ONLY the improved article in markdown.\n\nDraft:\n${content}`;
    } else {
      // generate
      userPrompt =
        `Write a research article draft on the following topic for the Aurevia trading platform. ` +
        `Use markdown. Structure with a clear headline, a 1-2 sentence TL;DR, 3-4 body sections with H2 headers, ` +
        `and a closing "Trade Implications" section. Be concrete and grounded — do NOT fabricate specific prices, ` +
        `dates, or quote sources. Aim for ~500-700 words. Return ONLY the markdown.\n\nTopic:\n${topic}`;
    }

    const response = await zai.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const raw =
      response?.choices?.[0]?.message?.content ?? "";

    if (!raw) {
      return NextResponse.json(
        { error: "ai_empty_response" },
        { status: 502 },
      );
    }

    const trimmed = raw.trim();

    if (action === "summarize") {
      parseResult = { summary: trimmed.slice(0, 500) };
    } else if (action === "suggestTags") {
      // Try to parse a JSON array from the response; if it fails, fall back
      // to extracting bracketed strings.
      let tags: string[] = [];
      try {
        const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsedTags = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsedTags)) {
            tags = parsedTags
              .filter((t) => typeof t === "string")
              .map((t) => t.toLowerCase().replace(/\s+/g, "-"))
              .slice(0, 8);
          }
        }
      } catch {
        // ignore parse errors
      }
      parseResult = { tags };
    } else if (action === "sentiment") {
      let sentiment = "neutral";
      let confidence = 0.5;
      let reason = "";
      try {
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedSentiment = JSON.parse(jsonMatch[0]);
          sentiment = ["bullish", "bearish", "neutral"].includes(
            String(parsedSentiment.sentiment).toLowerCase(),
          )
            ? String(parsedSentiment.sentiment).toLowerCase()
            : "neutral";
          confidence =
            typeof parsedSentiment.confidence === "number"
              ? Math.min(1, Math.max(0, parsedSentiment.confidence))
              : 0.5;
          reason = String(parsedSentiment.reason ?? "").slice(0, 280);
        }
      } catch {
        // ignore parse errors
      }
      parseResult = { sentiment, confidence, reason };
    } else if (action === "improve") {
      parseResult = { improved: trimmed };
    } else {
      parseResult = { content: trimmed };
    }

    // Persist the result on the article when an articleId is provided.
    if (parsed.data.articleId) {
      const article = await db.article.findUnique({
        where: { id: parsed.data.articleId },
        select: { id: true, tags: true, content: true },
      });
      if (article) {
        if (action === "summarize") {
          await db.article.update({
            where: { id: article.id },
            data: { aiSummary: parseResult.summary },
          });
        } else if (action === "suggestTags") {
          await db.article.update({
            where: { id: article.id },
            data: {
              aiTags: serializeTags(parseResult.tags),
            },
          });
        } else if (action === "sentiment") {
          await db.article.update({
            where: { id: article.id },
            data: { aiSentiment: parseResult.sentiment },
          });
        }
        // For `improve` and `generate`, the caller decides whether to write
        // the result back to the article — we don't auto-overwrite their
        // draft without explicit user confirmation.
      }
    }

    logger.info("Blog AI assist completed", {
      requestId,
      action,
      articleId: parsed.data.articleId ?? "none",
      resultBytes: JSON.stringify(parseResult).length,
    });

    return NextResponse.json({ action, result: parseResult });
  } catch (e: any) {
    logger.error("Blog AI assist failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json(
      { error: e?.message ?? "unknown" },
      { status: 500 },
    );
  }
}

// Silence unused-import warnings for helpers that this module exports but
// doesn't use directly. (`parseTags` and `estimateReadingMinutes` are used
// elsewhere in the blog routes — keeping them in the imports here keeps
// the barrel consistent.)
export { parseTags, estimateReadingMinutes };
