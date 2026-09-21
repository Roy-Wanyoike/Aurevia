import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";
import {
  slugify,
  ensureUniqueSlug,
  ensureUniqueCategorySlug,
  resolveCurrentUserId,
  serializeArticle,
  serializeTags,
  estimateReadingMinutes,
  type SerializedArticle,
} from "@/lib/aurevia/blog/shared";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/v1/blog/seed
//
// Seeds the Research Hub with a starter set of categories and articles so
// the views have something to render on a fresh checkout. Idempotent: if
// the seed has already run (detected by checking for any existing category
// or article), the route returns the existing data without duplicating it.
//
// This is a one-shot operation — the seed route is called from the blog
// list view's empty-state "Seed demo content" button, and also runs
// automatically the first time the dashboard view is rendered with an
// empty database.
// ---------------------------------------------------------------------------

const SEED_CATEGORIES: Array<{
  name: string;
  slug: string;
  description: string;
  color: string;
}> = [
  {
    name: "Macro Outlook",
    slug: "macro-outlook",
    description: "Top-down views on rates, growth, and the policy backdrop.",
    color: "#10b981",
  },
  {
    name: "Trade Setups",
    slug: "trade-setups",
    description: "Concrete trade ideas with entry, invalidation, and target.",
    color: "#06b6d4",
  },
  {
    name: "Strategy Notes",
    slug: "strategy-notes",
    description: "Backtest post-mortems and strategy development notes.",
    color: "#f59e0b",
  },
  {
    name: "Risk & Position Sizing",
    slug: "risk-position-sizing",
    description: "How to size positions without blowing up the book.",
    color: "#ec4899",
  },
  {
    name: "Market Psychology",
    slug: "market-psychology",
    description: "Behavioral patterns and journaling for discretionary traders.",
    color: "#a855f7",
  },
];

const SEED_ARTICLES: Array<{
  title: string;
  excerpt: string;
  content: string;
  categoryName: string;
  tags: string[];
  featured: boolean;
}> = [
  {
    title: "The Fed's Higher-For-Longer Path: What Changes for Risk Assets",
    excerpt:
      "Rate cuts have been pushed out again. We unpack what a sustained 5.25-5.50% policy rate means for equity multiples, duration, and the rotation into quality.",
    categoryName: "Macro Outlook",
    tags: ["fed-policy", "rates", "equity-multiples", "duration"],
    featured: true,
    content: `# The Fed's Higher-For-Longer Path

**TL;DR** — Sticky core services inflation has pushed the first cut into late 2026. That keeps real rates restrictive for longer than the market is pricing, which matters more for equity multiples than for nominal growth.

## The setup

The dot plot has moved three times in the last two quarters, each time pushing cuts further out. The market is now converging on a single cut in Q4, but the curve is still pricing roughly 75bps of easing over the next twelve months. That's the trade — either the Fed blinks (cuts sooner) or the market gives up its cuts.

## What matters for risk assets

- **Equity multiples** compress when real rates rise. The forward P/E on the S&P 500 has held because earnings growth has offset the multiple drag. If growth slows into the cuts, both legs weaken simultaneously.
- **Duration** is the cleanest expression. The 2y is the most direct read on Fed expectations; the 10y is the read on term premium and growth. A barbell expresses the higher-for-longer thesis without taking a directional bet on growth.
- **Quality factors** outperform when real rates stay restrictive. High cash-flow yield, low leverage, stable margins — these are the names that survive a tighter-for-longer regime.

## Trade implications

- Long 2y duration into a Fed dovish pivot; size for a 25-50bp move.
- Short the low-quality / high-leverage factor basket as a hedge.
- Keep equity beta neutral — the goal is to express the rates view, not the growth view.

*This is research, not investment advice. Position sizing should respect your portfolio's risk budget.*
`,
  },
  {
    title: "NVDA: The AI Capex Cycle Is Not Done",
    excerpt:
      "Hyperscaler capex guides for next year are up, not down. We size a long NVDA setup with a clean invalidation level and a target that respects the multi-year trend.",
    categoryName: "Trade Setups",
    tags: ["nvda", "ai-capex", "momentum", "long"],
    featured: true,
    content: `# NVDA: The AI Capex Cycle Is Not Done

**TL;DR** — Hyperscaler capex guides for next year are up, not down. The setup is a long on momentum with a tight invalidation below the 50-day moving average.

## The thesis

Every single hyperscaler has either raised or reaffirmed their AI infrastructure capex guide in the last 60 days. The market has been pricing a "capex top" narrative for two quarters; the data still says otherwise. NVDA's compute revenue mix is now dominated by next-gen datacenter GPUs, which carry materially higher ASPs.

## The setup

- **Entry zone**: $128-$132 (current consolidation).
- **Invalidation**: Close below the 50-day moving average (currently $122).
- **Target**: $165 (prior cycle high, ~25% upside from entry).
- **Time horizon**: 4-8 weeks.

## What breaks the thesis

1. A hyperscaler capex cut (watch META / MSFT / GOOGL earnings).
2. A meaningful China export restriction expansion.
3. A genuine demand air-pocket signaled by lead times collapsing below 8 weeks.

## Sizing

This is a momentum setup, not a value setup. Risk no more than 1.5% of portfolio equity on the position; size the stop to the 50-day, not to a tighter intraday level.

*Research, not investment advice.*
`,
  },
  {
    title: "Mean-Reversion Strategy: Backtest Post-Mortem",
    excerpt:
      "We ran a 10-year backtest of the RSI-2 mean-reversion strategy across 18 liquid names. The win rate held, but the regime filter matters more than the entry signal.",
    categoryName: "Strategy Notes",
    tags: ["mean-reversion", "rsi-2", "backtest", "regime-filter"],
    featured: false,
    content: `# Mean-Reversion Strategy: Backtest Post-Mortem

**TL;DR** — RSI(2) < 10 longs work, but only in low-volatility regimes. Adding a simple ATR filter improves CAGR by ~30% with a smaller drawdown.

## The strategy

- Entry: RSI(2) < 10 (long only).
- Exit: RSI(2) > 70 OR after 5 bars, whichever comes first.
- Universe: 18 large-cap US equities.
- Sample: 2014-01-01 to 2024-12-31.

## The raw results

| Metric | Value |
| --- | --- |
| CAGR | 11.4% |
| Sharpe | 0.94 |
| Max DD | -18.3% |
| Win rate | 62% |
| Trades | 2,847 |

## What the post-mortem found

The unconditional win rate is real, but the strategy bleeds in high-volatility regimes. The 2018-Q4 and 2020-Q1 drawdowns both happened inside an ATR breakout. A simple filter — only take the signal when current 20-day ATR / price is below its 1-year median — lifts CAGR to 14.8%, drops max DD to -12.1%, and improves Sharpe to 1.21.

## Next steps

- Test the regime filter on the short side (RSI(2) > 90).
- Walk-forward the filter threshold instead of hard-coding the median.
- Add a position-sizing layer based on recent signal frequency.

*Backtested results are hypothetical and do not represent real trading. Past performance is not indicative of future results.*
`,
  },
  {
    title: "Position Sizing Without Blowing Up the Book",
    excerpt:
      "Kelly is theoretically optimal and practically insane. We walk through a more conservative fractional-Kelly framework with concrete sizing formulas.",
    categoryName: "Risk & Position Sizing",
    tags: ["kelly", "position-sizing", "risk-management", "fractional-kelly"],
    featured: false,
    content: `# Position Sizing Without Blowing Up the Book

**TL;DR** — Full Kelly is too volatile for discretionary trading. Fractional Kelly (typically 0.25-0.5x) captures most of the geometric growth with a fraction of the drawdown.

## Why Kelly is right and wrong

The Kelly criterion maximizes long-run geometric growth. The math is unimpeachable. The practice is brutal: full-Kelly sizing produces drawdowns of 50%+ on a regular basis, and most discretionary traders abandon the strategy long before the long-run edge pays out. The variance drag is also under-modeled — your real edge is almost certainly smaller than you think, and Kelly sizing amplifies estimation error.

## The practical framework

1. **Estimate your edge conservatively.** If you think you win 55% of the time, model 52%. The haircut is your humility tax.
2. **Apply fractional Kelly.** Most practitioners land between 0.25x and 0.5x. The math says 0.5x is "half-Kelly"; the practice says 0.25x is what survives a real drawdown.
3. **Cap per-position risk at 1.5-2% of equity.** This is the hard ceiling — fractional Kelly never exceeds it.
4. **Cap aggregate risk at 6-8% of equity.** Even with negatively-correlated positions, drawdowns cluster when correlations spike.

## The formula

For a binary outcome (win W, lose L, probability p of winning):

\`\`\`
f* = (p * W - (1 - p) * L) / (W * L)
fractional = 0.25 * f*
\`\`\`

## Trade implications

- For a 55% win rate with 1:1 payoff, full Kelly says 10% per trade. Fractional says 2.5%. The latter is what you should actually trade.
- Re-estimate your edge quarterly. If the sample shows the edge has decayed, size down before the drawdown forces it.

*This is educational content, not investment advice.*
`,
  },
  {
    title: "The Discipline of Not Trading",
    excerpt:
      "Most of the edge in discretionary trading comes from the trades you don't take. We look at how to systematize the 'no-trade' decision so it doesn't depend on willpower.",
    categoryName: "Market Psychology",
    tags: ["discipline", "no-trade", "behavioral", "journaling"],
    featured: false,
    content: `# The Discipline of Not Trading

**TL;DR** — The discretionary edge is mostly in the trades you don't take. Systematize the no-trade decision so it doesn't depend on willpower.

## The problem

Every discretionary trader knows the feeling: a setup appears, you take it, and within minutes you realize it didn't actually meet your criteria. The decision to trade was made on emotion, not analysis. The cost isn't just the loss on that trade — it's the cognitive load of carrying the bad position while you're trying to find good ones.

## Why willpower fails

Willpower is a finite resource. By the time you've been at the screens for four hours, your ability to say "no" to a marginal setup is degraded. This is not a character flaw; it's how the prefrontal cortex works. The fix is to move the decision out of the moment and into a rule.

## The system

1. **A written trade plan before the open.** List the 1-3 setups you're watching today, with the exact entry / invalidation / target. If a setup isn't on the list, you don't trade it.
2. **A pre-trade checklist.** Before every order, run through a 5-point checklist. If any item fails, the trade is skipped.
3. **A post-trade journal entry.** Every trade gets a 3-line entry: thesis, what I expected to happen, what actually happened. The patterns emerge over weeks, not days.

## Trade implications

- The journal is the highest-ROI activity in discretionary trading. It costs nothing and prevents every behavioral bias you have.
- The checklist is the second-highest. It converts willpower into a process.

*Behavioral notes, not investment advice.*
`,
  },
  {
    title: "Bitcoin On-Chain: The Long-Term Holder Bid",
    excerpt:
      "Long-term holders are accumulating again. We look at the realized-price ratio and what it implies for the next leg.",
    categoryName: "Macro Outlook",
    tags: ["btc", "on-chain", "long-term-holders", "realized-price"],
    featured: false,
    content: `# Bitcoin On-Chain: The Long-Term Holder Bid

**TL;DR** — Long-term holders (LTH) are accumulating again after a six-month distribution phase. The realized-price ratio is at a level that has historically preceded multi-quarter rallies.

## The setup

Long-term holders (coins unmoved for >155 days) started re-accumulating in Q1. The LTH supply is back near its all-time high. This is the cohort that historically buys weakness and sells strength — when they're adding, the structural bid is real.

## The metric

The realized-price ratio (market cap / realized cap) measures the gap between spot and the average cost basis of all coins. When spot is close to realized, the market is "fair value." When spot is well above realized, the market is extended. The current ratio is 1.3x — historically a level associated with the early-to-middle phase of a bull cycle.

## What breaks the thesis

1. LTH supply rolls over (distribution resumes).
2. A macro risk-off event decouples BTC from its on-chain structure.
3. Stablecoin supply contracts (the dollar-denominated bid dries up).

## Trade implications

- BTC exposure here is asymmetric — the LTH bid provides a structural floor, and the upside is the next leg of the cycle.
- Size for the macro risk — BTC still trades as a high-beta risk asset, and a sustained equity drawdown will hit it before the on-chain structure catches up.

*Research, not investment advice.*
`,
  },
];

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "blog-seed";

  // Issue #128 / BE-001 / SEC-015 — the seed route is a dev-only bootstrap
  // that injects demo categories + articles (with synthetic viewCount /
  // likeCount) into the database. Mirroring the /api/v1/auth/seed-demo
  // pattern, we hard-return 404 in production so an authenticated operator
  // (or any holder of the shared API key) cannot pollute the production
  // database with demo content. If a prod-side "restore default content"
  // admin action is genuinely desired, gate it behind an explicit admin
  // role check (BE-003) in a separate route handler.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    // Idempotency: if we already have any categories or articles, return them.
    const existingCategories = await db.category.count();
    const existingArticles = await db.article.count();
    if (existingCategories > 0 || existingArticles > 0) {
      logger.info("Blog seed skipped — data already exists", {
        requestId,
        categories: existingCategories,
        articles: existingArticles,
      });
      return NextResponse.json({
        ok: true,
        skipped: true,
        message: "Blog data already seeded",
      });
    }

    const authorId = await resolveCurrentUserId();

    // 1. Create categories.
    const categoryBySlug = new Map<string, string>();
    for (const cat of SEED_CATEGORIES) {
      const slug = await ensureUniqueCategorySlug(slugify(cat.slug));
      const created = await db.category.create({
        data: {
          name: cat.name,
          slug,
          description: cat.description,
          color: cat.color,
        },
      });
      categoryBySlug.set(cat.slug, created.id);
    }

    // 2. Create articles.
    const createdArticles: SerializedArticle[] = [];
    for (const a of SEED_ARTICLES) {
      const categorySlug = SEED_CATEGORIES.find((c) => c.name === a.categoryName)?.slug;
      const categoryId = categorySlug ? categoryBySlug.get(categorySlug) : null;
      const slug = await ensureUniqueSlug(slugify(a.title));
      const article = await db.article.create({
        data: {
          slug,
          title: a.title,
          excerpt: a.excerpt,
          content: a.content,
          status: "PUBLISHED",
          featured: a.featured,
          readingMinutes: estimateReadingMinutes(a.content),
          tags: serializeTags(a.tags),
          categoryId: categoryId ?? null,
          authorId,
          publishedAt: new Date(),
          // Issue #137 — seed content is system-owned (organizationId=null)
          // so it's visible to all orgs in dev mode. In production the seed
          // route is hard-blocked (404) above.
          organizationId: null,
          // Seed with some initial engagement so the dashboard isn't flat.
          viewCount: 40 + Math.floor(Math.random() * 300),
          likeCount: 3 + Math.floor(Math.random() * 25),
          commentCount: 0,
        },
        include: {
          author: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, slug: true, color: true } },
        },
      });
      createdArticles.push(serializeArticle(article));
    }

    // 3. Add a couple of demo comments on the first article.
    if (createdArticles[0]) {
      const firstArticle = await db.article.findUnique({
        where: { id: createdArticles[0].id },
        select: { id: true },
      });
      if (firstArticle) {
        await db.articleComment.createMany({
          data: [
            {
              articleId: firstArticle.id,
              authorName: "Alex Chen",
              content: "The barbell on duration is interesting — what's your read on the 5y specifically? I've been avoiding the belly.",
            },
            {
              articleId: firstArticle.id,
              authorName: "Maya Rodriguez",
              content: "Agreed on the quality factor. The low-leverage basket has been working since Q4 last year. Any thoughts on the carry trade unwind risk?",
            },
          ],
        });
        await db.article.update({
          where: { id: firstArticle.id },
          data: { commentCount: { increment: 2 } },
        });
      }
    }

    logger.info("Blog seed completed", {
      requestId,
      categories: SEED_CATEGORIES.length,
      articles: createdArticles.length,
    });

    return NextResponse.json({
      ok: true,
      skipped: false,
      categories: SEED_CATEGORIES.length,
      articles: createdArticles.length,
    });
  } catch (e: any) {
    logger.error("Blog seed failed", {
      requestId,
      error: e?.message ?? "unknown",
    });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
