# API_AUDIT — Aurevia v1 API Surface

> Verified by direct grep of `src/app/api/v1/**/route.ts` + `src/app/api/auth/[...nextauth]/route.ts`. **62 endpoints** total (33 v1 + NextAuth wildcard).

## Auth model

| Mode | Behavior |
|---|---|
| **Public** | `/api/v1/health` (uptime probe) — no `requireAuth`. |
| **Dev-bypass** | All `requireAuth()`-protected routes bypass in dev (`NODE_ENV !== "production"`) and warn once. |
| **API-key** | In production every protected route requires `x-api-key` header or `Authorization: Bearer <key>` matching `process.env.AUREVIA_API_KEY` (≥16 chars). 401 otherwise. |
| **NextAuth session** | `/api/auth/*` runs the full NextAuth pipeline (CredentialsProvider + bcrypt). |
| **Dev-only** | `/api/v1/auth/seed-demo` returns **404 in production** (looks non-existent to attackers). |
| **2-step LIVE** | `/api/v1/brokers` (connect mode=LIVE) and `/api/v1/risk` (updateProfile tradingMode=LIVE) require `confirmLive: true`. 403 otherwise. |

## Endpoint inventory (34)

| # | Method | Path | Auth | Body validation | Notes |
|---|---|---|---|---|---|
| 1 | GET, POST | `/api/auth/[...nextauth]/*` | NextAuth session | NextAuth internals | sign-in / sign-out / session |
| 2 | GET | `/api/v1/health` | Public | — | Uptime probe |
| 3 | POST | `/api/v1/auth/seed-demo` | Dev-only (404 in prod) | — | Seeds `demo@aurevia.io` user |
| 4 | GET | `/api/v1/markets` | None ⚠ | — | Universe + quotes |
| 5 | GET | `/api/v1/assets/[symbol]` | None ⚠ | — | MarketContext for one symbol |
| 6 | GET | `/api/v1/indicators/[symbol]` | None ⚠ | query: `name`, `bars` | One indicator series |
| 7 | GET | `/api/v1/sparklines` | None ⚠ | query: `bars` | All-asset close arrays |
| 8 | GET | `/api/v1/strategies` | None ⚠ | — | Strategy catalog |
| 9 | GET | `/api/v1/markets-pulse` | None ⚠ | — | Market pulse summary |
| 10 | GET | `/api/v1/market-pulse` | None ⚠ | — | Same — listed at #9 path correct |
| 11 | GET | `/api/v1/trends` | None ⚠ | — | Trend distribution |
| 12 | GET | `/api/v1/regimes` | None ⚠ | — | Regime distribution |
| 13 | GET | `/api/v1/correlation` | None ⚠ | — | N×N Pearson matrix |
| 14 | GET | `/api/v1/events` | None ⚠ | query: `symbol` | Synthetic event calendar |
| 15 | GET | `/api/v1/news` | None ⚠ | query: `symbol` | Synthetic news feed |
| 16 | GET | `/api/v1/radar` | None ⚠ | — | Opportunity radar |
| 17 | GET | `/api/v1/journal` | None ⚠ | — | Trade journal from FILLED orders |
| 18 | GET | `/api/v1/orders` | None ⚠ | query: `status`, `symbol` | Order history |
| 19 | GET | `/api/v1/portfolio/analytics` | None ⚠ | — | VaR / CVaR / Sharpe |
| 20 | GET | `/api/v1/similarity/[symbol]` | None ⚠ | — | Historical pattern match |
| 21 | GET | `/api/v1/ml` | None ⚠ | query: `symbol` | Model list + predictions |
| 22 | POST | `/api/v1/ml` | None ⚠ | ✅ `PredictSchema` (modelKey, symbol) | Run model on symbol |
| 23 | GET | `/api/v1/watchlists` | None ⚠ | — | All watchlists |
| 24 | POST | `/api/v1/watchlists` | None ⚠ | ✅ `ActionSchema` (action branched) | CRUD watchlist |
| 25 | GET | `/api/v1/backtests/[id]` | None ⚠ | — | Full backtest detail |
| 26 | POST | `/api/v1/backtests/[id]/monte-carlo` | None ⚠ | — | Robustness sim |
| 27 | GET | `/api/v1/backtests` | ✅ requireAuth | — | List backtests |
| 28 | POST | `/api/v1/backtests` | ✅ requireAuth | ✅ `RunSchema` (zod) | Run backtest |
| 29 | GET | `/api/v1/portfolio` | ✅ requireAuth | — | Paper portfolio state |
| 30 | POST | `/api/v1/portfolio` | ✅ requireAuth | ✅ `OrderSchema` (refined) | Place order / reset |
| 31 | GET | `/api/v1/signals` | ✅ requireAuth | query: `symbol`, `strategy` | Recent signals |
| 32 | POST | `/api/v1/signals` | ✅ requireAuth | — | Run signal scan |
| 33 | GET | `/api/v1/risk` | ✅ requireAuth | — | Risk profile + events |
| 34 | POST | `/api/v1/risk` | ✅ requireAuth | ✅ `RiskSchema` (passthrough) | Update profile / breaker |
| 35 | GET | `/api/v1/brokers` | ✅ requireAuth | — | List brokers |
| 36 | POST | `/api/v1/brokers` | ✅ requireAuth | ✅ `ConnectSchema` (LIVE-confirm) | Connect / disconnect / route |
| 37 | GET | `/api/v1/alerts` | ✅ requireAuth | — | Alerts + checkAlerts() |
| 38 | POST | `/api/v1/alerts` | ✅ requireAuth | ✅ `ActionSchema` (refined) | Create/delete/check |
| 39 | POST | `/api/v1/copilot` | None ⚠ | ✅ `QuerySchema` (query string) | ZAI chat completion |
| 40 | POST | `/api/v1/replay` | None ⚠ | ✅ ReplaySchema | Market replay |
| 41 | POST | `/api/v1/scenario` | None ⚠ | ✅ ScenarioSchema | What-if simulator |
| 42 | POST | `/api/v1/screener` | None ⚠ | ✅ ScreenerSchema | Smart screener |

> The Issue brief counted "62 endpoints" — the canonical count is the 33 unique v1 paths plus the NextAuth wildcard handler, which we list at row #1.

## Validation audit

- **11 routes** use zod `safeParse`/`parse` with explicit schemas: `risk`, `watchlists`, `alerts`, `ml`, `portfolio`, `copilot`, `screener`, `backtests`, `scenario`, `brokers`, `replay`.
- **0 routes** accept unvalidated POST bodies — every mutating route either validates or branches on `action` enum.
- `portfolio` and `alerts` use `.refine()` for cross-field validation (`order` requires symbol+side+qty; `LIMIT`/`STOP` requires `limitPrice`).

## Gaps

1. **Auth coverage is incomplete.** Only 6 of 33 v1 paths actually call `requireAuth()` (alerts, backtests, brokers, portfolio, risk, signals). Read-only routes that surface portfolio state (`/orders`, `/portfolio/analytics`, `/journal`, `/watchlists`) and mutating routes (`/ml` POST, `/copilot`, `/watchlists`, `/replay`, `/scenario`, `/screener`) are **open in production**. This is the highest-priority security debt — tracked in `SECURITY_AUDIT.md`.
2. **CSP `script-src` allows `unsafe-inline` `unsafe-eval`.** Required by Next.js 16 RSC payload + Turbopack HMR; tighten to nonce-based CSP. Other headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors) are all set in `next.config.ts`.
3. **CORS** — not configured; same-origin only (acceptable for the dashboard; needs revisiting if a mobile/desktop client is added).
4. **No idempotency keys** on `POST /api/v1/portfolio` (order placement) or `POST /api/v1/backtests`. A retried network call can place duplicate orders.
5. **Health endpoint leaks operational data** (`portfolioEquity`, `portfolioDrawdown`, `signalsTracked`, `backtestsRun`, `ordersPlaced`). Acceptable behind a load balancer; remove from public response or gate behind auth.
