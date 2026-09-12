# CURRENT_SYSTEM — Aurevia System Map

> **Living document.** Last verified against `phase2/gaps-and-hardening` branch by `git ls-files` + `rg` direct inspection. Update this whenever the directory tree, dependency list, or schema changes.

## 1. Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Runtime | Bun | `>=1.3` (engine constraint) | Primary test runner; `bun test` uses Vitest config |
| Framework | Next.js | `^16.1.1` | App Router; React Server Components enabled |
| Language | TypeScript | `^5` | `strict: true` (see `tsconfig.json`) |
| Database ORM | Prisma | `^6.11.1` | SQLite in dev (`schema.prisma`), Postgres prod via separate `schema.postgres.prisma` |
| Auth | NextAuth v4 | `^4.24.11` | CredentialsProvider (bcrypt); PrismaAdapter |
| UI | shadcn/ui | (copy-in) | Radix primitives; components.json registry |
| Styling | Tailwind CSS 4 | `^4` | PostCSS plugin; `tw-animate-css` |
| Charts | Recharts | `^2.15.4` | Used by `charts/equity-curve.tsx` |
| State | Zustand | `^5.0.6` | `ui-store.ts`, in-memory only |
| Data fetching | TanStack Query | `^5.82.0` | `query-provider.tsx` |
| Forms | react-hook-form + zod | `^7.60` / `^4.0.2` | Runtime validation on mutating API routes |
| Validation | zod | `^4.0.2` | 11 routes use `safeParse`/`parse` |
| Sockets | socket.io-client | `^4.8.3` | Connects to `mini-services/aurevia-stream` |
| Build target | standalone Next.js | — | `.next/standalone/server.js` consumed by Dockerfile |

No backend framework outside Next.js — every API surface is a Next.js Route Handler under `src/app/api/v1/*`.

## 2. Directory Structure (top level)

```
src/
  app/                       # Next.js App Router
    api/v1/                  # 34 route handlers (see §5)
    api/auth/[...nextauth]/  # NextAuth catch-all
    layout.tsx, page.tsx, error.tsx, not-found.tsx, globals.css
  components/
    ui/                      # 57 shadcn primitives
    aurevia/
      views/                 # 28 dashboard views
      charts/                # CandlestickChart, EquityCurve, Sparkline, StatTile
      sidebar.tsx, command-palette.tsx, query-provider.tsx,
      theme-provider.tsx, auth-provider.tsx, query-state.tsx
  hooks/                     # use-toast, use-mobile
  lib/
    aurevia/                 # 29 engine modules (see §4)
    db.ts                    # Prisma singleton
    utils.ts                 # cn() helper
  middleware.ts              # request ID + per-IP rate limit
prisma/schema.prisma         # 26 models (see DATABASE_AUDIT.md)
mini-services/aurevia-stream # standalone socket.io tick server
docs/                        # SCOPE-AND-STOP-CONDITIONS.md, AUDIT/
scripts/                     # issue-filing python helpers
tests/                       # build shell scripts
```

## 3. Engine Modules (`src/lib/aurevia/`)

| # | Module | Purpose | Tests |
|---|---|---|---|
| 1 | `types.ts` | Shared TypeScript contracts (Candle, Signal, Order, RiskProfile, etc.) | — |
| 2 | `store.ts` | In-memory runtime store (signals, orders, backtests, portfolio, alerts, watchlists) | — |
| 3 | `hooks.ts` | React Query hooks (`useMarkets`, `useStrategies`, `useSignals`, …) | — |
| 4 | `format.ts` | fmtPrice, fmtPct, fmtUsd, fmtCompact, gainColor, regimeColor… | 37 tests |
| 5 | `logger.ts` | Structured JSON logger (LOG_LEVEL env) | — |
| 6 | `rate-limit.ts` | Sliding-window per-IP limiter + 1% probabilistic GC | — |
| 7 | `ui-store.ts` | Zustand UI store (openAsset, setView, openBacktest) | — |
| 8 | `auth/auth-options.ts` | NextAuth config (CredentialsProvider, JWT sessions, role in token) | — |
| 9 | `auth/check.ts` | `requireAuth()` helper (dev-bypass / prod API-key) | — |
| 10 | `market-data/assets.ts` | Tradeable universe (18 assets: equities + crypto + ETF) | — |
| 11 | `market-data/feed.ts` | Deterministic GBM + regime-switching candle generator | — |
| 12 | `market-data/provider.ts` | `MarketDataProvider` interface | — |
| 13 | `market-data/providers/simulated.ts` | Always-available fallback (`isLive=false`) | — |
| 14 | `market-data/providers/polygon.ts` | Real provider (used when `POLYGON_API_KEY` set) | — |
| 15 | `market-data/gateway.ts` | Multi-provider router with health check + fallback | — |
| 16 | `quant/indicators.ts` | sma, ema, rsi, macd, bollinger, atr, adx, stochastic, vwap, obv | 33 tests |
| 17 | `quant/trend.ts` | Trend direction/strength/support/resistance/breakout | — |
| 18 | `quant/regime.ts` | 11-state regime classifier (BULL/BEAR/CRASH/…) | — |
| 19 | `strategies/base.ts` | `Strategy` plugin contract, `toSignal()`, `clamp01()` | — |
| 20 | `strategies/index.ts` | 5 strategies: momentum, trend-following, ma-crossover, mean-reversion, breakout | 15 tests |
| 21 | `risk/engine.ts` | 11-rule risk evaluator + latched circuit-breaker state machine | 29 tests |
| 22 | `backtest/engine.ts` | Walk-forward backtester (no look-ahead, commission, slippage, stops) | 38 tests |
| 23 | `execution/paper-broker.ts` | Paper broker + PortfolioManager (cash, positions, P&L) | 23 tests |
| 24 | `brokers/adapter.ts` | `BrokerAdapter` contract (connect, orders, reconcile) | — |
| 25 | `brokers/alpaca.ts` | Alpaca stub adapter (real SDK calls commented) | — |
| 26 | `brokers/ibkr.ts` | IBKR stub adapter | — |
| 27 | `brokers/router.ts` | Multi-broker routing (paper default) | — |
| 28 | `ml/models.ts` | Logistic-momentum ML model (`ALM v1.0`) + `mlPredictionToSignal` | — |
| 29 | `hooks/use-aurevia-stream.ts` | socket.io client hook | — |

Total: 29 modules (matches Issue brief). **155 unit tests** across 6 files (`risk`, `paper-broker`, `indicators`, `strategies`, `format`, `backtest`).

## 4. API Routes (`src/app/api/v1/`)

34 endpoints (auth wildcard + 33 v1 routes). See `API_AUDIT.md` for the full method × auth × validation matrix. Summary:

| Path | Method(s) | Auth |
|---|---|---|
| `/api/auth/[...nextauth]/*` | GET, POST | NextAuth (own pipeline) |
| `/api/v1/health` | GET | **Public** (uptime probe) |
| `/api/v1/auth/seed-demo` | POST | **Dev-only** (404 in prod) |
| `/api/v1/{alerts,backtests,brokers,portfolio,risk,signals}` | GET, POST | `requireAuth()` on both |
| `/api/v1/{strategies,markets,events,orders,radar,trends,regimes,correlation,journal,market-pulse,watchlists,ml,sparklines}` | GET (some + POST) | mixed — see audit |
| `/api/v1/assets/[symbol]`, `/api/v1/indicators/[symbol]`, `/api/v1/similarity/[symbol]` | GET | mixed |
| `/api/v1/backtests/[id]`, `/api/v1/backtests/[id]/monte-carlo` | GET, POST | `requireAuth()` |
| `/api/v1/copilot`, `/api/v1/replay`, `/api/v1/scenario`, `/api/v1/screener` | POST | mixed |

## 5. Dashboard Views (`src/components/aurevia/views/`)

28 views, each lazily rendered based on `useUI().view` from `ui-store.ts`:

`dashboard`, `markets`, `asset-detail`, `strategies`, `strategy-builder`, `backtests`, `signals`, `trends`, `regimes`, `risk`, `risk-cockpit`, `portfolio`, `portfolio-analytics`, `orders`, `correlation`, `screener`, `radar`, `market-pulse`, `events`, `alerts`, `journal`, `news`, `watchlists`, `brokers`, `ml`, `replay`, `scenario`/`what-if`, `copilot`, `historical-memory`, `settings`, `system`.

All views consume TanStack Query hooks from `src/lib/aurevia/hooks.ts`. Dark theme is enforced via `next-themes` + Tailwind `dark` class on `<html>`.

## 6. Database Models (`prisma/schema.prisma`)

26 Prisma models — see `DATABASE_AUDIT.md` for indexes, constraints, and gaps. Headline:

- **Auth/NextAuth (4):** User, Account, Session, VerificationToken
- **Multi-tenant (3):** Organization, Team, Membership
- **Market data (5):** Asset, MarketCandle, MarketQuote, MarketFeature, HistoricalPattern
- **Trading (5):** Strategy, Signal, Order, Backtest, RiskProfile
- **Risk/audit (4):** RiskEvent, AuditLog, EventLog, ReconciliationRun
- **Ops (5):** PortfolioSnapshot, Alert, BrokerConnection, NewsArticle, MarketEvent

## 7. Side services

- `mini-services/aurevia-stream` — standalone Bun/`socket.io` server on `:3003` that fans out simulated ticks to subscribed clients. Connected from the dashboard via `useAureviaStream()`.
- `Caddyfile` — reverse-proxy config (TLS termination, `/api/*` → Next.js, `/stream/*` → `:3003`).

## 8. Verification Gates

```bash
bun run lint              # eslint . — 0 errors
npx tsc --noEmit           # 0 errors
bun test                   # 155 pass / 0 fail across 6 files
```

All three are clean on `main` and `phase2/gaps-and-hardening` as of this audit.
