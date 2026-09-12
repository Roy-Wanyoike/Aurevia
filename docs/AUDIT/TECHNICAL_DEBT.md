# TECHNICAL_DEBT — Aurevia Known Debt

> Living register of debt explicitly acknowledged in code comments or surfaced by this audit. Each item carries an owner-stage tag (dev / prod-blocking / hardening) and a remediation sketch.

## 1. Simulated market data is the only feed in dev

**Where:** `src/lib/aurevia/market-data/providers/simulated.ts` (always-true `isConfigured()`), `market-data/feed.ts` (deterministic GBM + regime-switch).

**Impact:** Every backtest, signal scan, and quote in dev derives from a Mulberry32-seeded pseudo-random walk. Numbers look plausible; they are not real market data. The Polygon provider exists but is only activated when `POLYGON_API_KEY` is set.

**Remediation:** Wire Polygon API key in staging; add Alpaca / Finnhub providers (currently commented in `gateway.ts`); add a `providerHealthCheck` background job that flips to `simulated` + sets a `MARKET_DATA_STALE` event when the live provider fails.

## 2. Broker adapters are stubs

**Where:** `src/lib/aurevia/brokers/alpaca.ts`, `brokers/ibkr.ts`.

**Impact:** Both adapters call `simulateLatency()` instead of real HTTP / WebSocket calls. The `BrokerAdapter` contract is fully implemented (it's a clean interface), but no LIVE broker can actually execute an order. This is the single physical blocker for LIVE trading.

**Remediation:** Replace `simulateLatency()` with the official Alpaca SDK (`@alpcale/alpaca-trade-api` or fetch against `https://paper-api.alpaca.markets`). Keep the contract identical. Add integration tests behind a `BROKER_INTEGRATION=true` flag.

## 3. No tenant enforcement in queries

**Where:** every `db.*` query path; `src/app/api/v1/*` does not filter by `organizationId`.

**Impact:** Multi-tenant schema exists but the runtime is effectively single-tenant. A user from Org A can read Org B's backtests / orders / signals.

**Remediation:** Resolve `organizationId` from the session in middleware (or in `requireAuth`), thread it into every `db.signal.findMany`, `db.order.findMany`, `db.backtest.findMany` call. Add a unit test that asserts cross-tenant reads return empty.

## 4. `requireAuth()` coverage is partial

**Where:** only 6 of 33 v1 routes call `requireAuth()`.

**Impact:** 27 routes are open in production if `AUREVIA_API_KEY` is set but no per-route auth helper is called.

**Remediation:** Add `requireAuth()` as the first line of every route handler except `/health` and `/auth/seed-demo`. Add an ESLint rule (or a unit test) that asserts every `route.ts` file under `src/app/api/v1/` imports `requireAuth` or has an exemption comment.

## 5. No row-level role enforcement

**Where:** `requireAuth()` returns only `ok: boolean`.

**Impact:** `viewer` role can POST `/portfolio` (place orders), POST `/risk` (mutate profile), POST `/brokers` (connect LIVE broker).

**Remediation:** Add `requireRole(req, "admin" | "trader")` helper; gate every mutating route by minimum role.

## 6. No HTTP security headers

**Where:** `next.config.ts` has no `headers()` function.

**Impact:** No CSP, no HSTS, no `X-Frame-Options`, no `X-Content-Type-Options`. XSS risk if any user-supplied HTML is rendered (the Copilot markdown rendering is the closest vector).

**Remediation:** Add a `headers()` export in `next.config.ts` with the standard strict header set. Verify the Copilot response path uses `react-markdown` with `rehype-sanitize`.

## 7. In-memory store loses state on restart

**Where:** `src/lib/aurevia/store.ts` — the `AureviaStore` singleton holds signals, orders, backtests, portfolio, alerts, watchlists, risk profile, risk events.

**Impact:** Restart wipes all of the above. Backtest history, order history, alert rules — gone.

**Remediation:** Persist to the existing Prisma models (`Signal`, `Order`, `Backtest`, `Alert`, `PortfolioSnapshot`, `RiskEvent`, `RiskProfile`). Add a write-through path: every `store.*` mutation also writes a Prisma row. Read path: lazy-load from Prisma on cache miss.

## 8. `AuditLog` model is dead code

**Where:** `prisma/schema.prisma` — `AuditLog` model.

**Impact:** Confusion — two audit models (`AuditLog` and `EventLog`) exist. `EventLog` is the active one (used by #93's `emitEvent`); `AuditLog` has no writer.

**Remediation:** Remove `AuditLog` in the next schema migration; document the migration in `docs/AUDIT/DATABASE_AUDIT.md`.

## 9. No client order idempotency

**Where:** `POST /api/v1/portfolio` (order placement) — no `clientOrderId` generated.

**Impact:** A retried network request can place duplicate orders. The `BrokerAdapter.placeOrder` contract accepts `clientOrderId` for idempotency, but the API surface doesn't generate one.

**Remediation:** Generate `clientOrderId = crypto.randomUUID()` in the route handler; pass through to the broker. On retry, the broker deduplicates.

## 10. Health endpoint leaks operational data

**Where:** `src/app/api/v1/health/route.ts` is public and returns `portfolioEquity`, `portfolioDrawdown`, `signalsTracked`, `backtestsRun`, `ordersPlaced`.

**Impact:** An attacker can probe system activity (and indirectly infer account size) without authentication.

**Remediation:** Strip portfolio/equity fields from the public response; keep only `status`, `uptimeHours`, `tradingMode`, `circuitBreakerState`, `dataSource`, `dataIsLive`, `version`. Move the full snapshot behind a `/api/v1/health/full` route protected by `requireAuth()`.

## 11. No CSP / sanitization on Copilot markdown output

**Where:** `src/app/api/v1/copilot/route.ts` + the copilot view rendering.

**Impact:** The ZAI chat model's response is rendered as markdown. If a user can prompt-inject the model into emitting raw HTML, an XSS vector exists.

**Remediation:** Add `rehype-sanitize` to the `react-markdown` pipeline in `copilot-view.tsx`. Add a CSP header (`default-src 'self'; script-src 'self'`).

## 12. No distributed rate-limit backend

**Where:** `src/lib/aurevia/rate-limit.ts` is in-memory.

**Impact:** Behind a load balancer with >1 Next.js instance, the per-IP counter is per-instance — effective rate limit is multiplied by instance count.

**Remediation:** Swap the in-memory `Map` for a Redis token bucket when scaling past a single instance. The call surface (`rateLimit(ip) → { ok, remaining, retryAfterMs }`) doesn't change.

## 13. No MFA / SSO

**Where:** `auth-options.ts`.

**Impact:** Single-factor credential auth only. Account takeover via password reuse is plausible.

**Remediation:** Add `OTPSignIn` provider for TOTP MFA. Add Google/GitHub OAuth providers (stubs already in code).

## 14. No CI security scanning

**Where:** no `audit`, `depcheck`, or SAST in CI.

**Impact:** Vulnerable dependencies can slip in via PR.

**Remediation:** Add `bun audit --audit-level=high` + `bunx depcheck` to CI on every PR.

## 15. State machine logic is implicit

**Where:** `risk/engine.ts` `nextBreakerState` (latched breaker) is the only formal state machine. Order, Strategy, and Trading-Mode state machines are encoded as string literals with no transition validation.

**Impact:** An illegal transition (e.g. `FILLED → SUBMITTED`) cannot be caught at runtime; it silently corrupts the order lifecycle.

**Remediation:** Issue #92 adds formal state machines for Order, Strategy, Trading-Mode, and Risk. Wire `assertTransition()` into `store.submitOrder` and `store.setBreakerState` in a follow-up PR.
