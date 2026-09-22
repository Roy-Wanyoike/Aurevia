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

**Status:** ✅ FIXED — PR #179 (closes #161). `requireTenant()` resolves the caller's `organizationId` from the NextAuth session and threads it into every v1 API route; `withTenantFilter()` is applied to every `db.*.findMany` call path. The blog module's `Article`, `ArticleComment`, `ArticleLike`, `ArticleView` rows carry `organizationId`; tenant-isolation integration tests assert cross-tenant reads return empty.

**Historical impact:** Multi-tenant schema existed but the runtime was effectively single-tenant. A user from Org A could read Org B's backtests / orders / signals.

## 4. `requireAuth()` coverage is partial

**Where:** only 6 of 33 v1 routes call `requireAuth()`.

**Status:** ✅ FIXED — PR #175 (closes #156 / FINAL-001), verified in PR #178. `requireAuth()` is the first line of 60 of 62 v1 route handlers. The two intentional exemptions are `/api/v1/health` (liveness probe) and `/api/v1/auth/seed-demo` (dev-only seeding). `/api/v1/auth/register` is also exempt — public self-service registration, gated only by edge rate-limiting.

**Historical impact:** 27 routes were open in production if `AUREVIA_API_KEY` was set but no per-route auth helper was called.

## 5. No row-level role enforcement

**Where:** `requireAuth()` returns only `ok: boolean`.

**Status:** ✅ FIXED — PR #146 (closes #130 / BE-003 / SEC-001). `requireRole(req, minimum)` helper in `src/lib/aurevia/auth/check.ts` gates mutating blog routes (`POST /api/v1/blog/articles`, `PATCH/DELETE [slug]`, `POST /api/v1/blog/categories`, `POST /api/v1/blog/ai-assist`) by minimum role `trader+`; PATCH/DELETE also enforce author-or-admin ownership. In dev mode role enforcement is bypassed (returns `admin`); in production the role is read from the NextAuth session JWT.

**Follow-up:** extend `requireRole()` to v1 trading routes (`/portfolio` POST, `/risk` POST, `/brokers` POST); LIVE arming requires `admin`.

**Historical impact:** `viewer` role could POST `/portfolio` (place orders), POST `/risk` (mutate profile), POST `/brokers` (connect LIVE broker).

## 6. CSP `unsafe-inline` / `unsafe-eval` in script-src

**Where:** `next.config.ts` `headers()` — the CSP `script-src` allows `'unsafe-inline' 'unsafe-eval'`.

**Impact:** Next.js 16 RSC payload + Turbopack HMR require inline scripts; this is the documented workaround. The trade-off is reduced XSS protection until nonce-based CSP is wired up. The `frame-ancestors 'none'` + `X-Frame-Options: DENY` defenses are still active.

**Remediation:** Migrate to nonce-based CSP — Next.js 16 supports per-request nonces via the `nonce` option on `headers()`. Requires moving inline scripts to nonced `<script>` tags.

## 7. In-memory store loses state on restart

**Where:** `src/lib/aurevia/store.ts` — the `AureviaStore` singleton holds signals, orders, backtests, portfolio, alerts, watchlists, risk profile, risk events.

**Impact:** Restart wipes all of the above. Backtest history, order history, alert rules — gone.

**Remediation:** Persist to the existing Prisma models (`Signal`, `Order`, `Backtest`, `Alert`, `PortfolioSnapshot`, `RiskEvent`, `RiskProfile`). Add a write-through path: every `store.*` mutation also writes a Prisma row. Read path: lazy-load from Prisma on cache miss.

## 8. `AuditLog` model is dead code

**Where:** `prisma/schema.prisma` — `AuditLog` model.

**Status:** ✅ FIXED — PR #112 (closes #110/#111/#112, merge commit `1c4aa53`). `auditLog()` writer at `src/lib/aurevia/audit/logger.ts` records every sensitive mutation: `ORDER_PLACED` (after `submitOrder()`), `RISK_PROFILE_UPDATED` (with before/after diff per changed field), `CIRCUIT_BREAKER_CHANGED` (from/to/reason for both manual + engine transitions). The writer NEVER throws — failures are logged and swallowed so the trading pipeline can't be blocked by the audit sink. `GET /api/v1/admin/audit-logs` is paginated, filterable, and immutable. 6 unit tests cover shape + failure isolation.

**Historical impact:** Confusion — two audit models (`AuditLog` and `EventLog`) existed. `EventLog` was the active one (used by #93's `emitEvent`); `AuditLog` had no writer.

## 9. No client order idempotency

**Where:** `POST /api/v1/portfolio` (order placement) — no `clientOrderId` generated.

**Impact:** A retried network request can place duplicate orders. The `BrokerAdapter.placeOrder` contract accepts `clientOrderId` for idempotency, but the API surface doesn't generate one.

**Remediation:** Generate `clientOrderId = crypto.randomUUID()` in the route handler; pass through to the broker. On retry, the broker deduplicates.

## 10. Health endpoint leaks operational data

**Where:** `src/app/api/v1/health/route.ts` is public and returns `portfolioEquity`, `portfolioDrawdown`, `signalsTracked`, `backtestsRun`, `ordersPlaced`.

**Status:** ✅ FIXED — Issue #183 / R-13. The public `/api/v1/health` payload is now restricted to `status`, `uptimeHours`, `tradingMode`, `circuitBreakerState`, `dataSource`, `dataIsLive`, `version`. The full operational snapshot (portfolio equity/drawdown, signal/backtest/order counters, broker connectivity, latency, API errors, universe size) is gated behind `requireAuth()` at `/api/v1/admin/system` (which already existed and returns the same data plus process-level metrics). The dashboard's System Status card and the System view fetch the admin/system snapshot via the shared `useSystemStats()` hook so logged-in users keep seeing those fields.

**Historical impact:** An attacker could probe system activity (and indirectly infer account size) without authentication.

## 11. No sanitization on Copilot markdown output

**Where:** `src/app/api/v1/copilot/route.ts` + the copilot view rendering.

**Status:** ✅ FIXED — PR #176 (closes #158 / #159 / #160). `rehype-sanitize` is wired into the Copilot markdown pipeline (`react-markdown` + `rehype-sanitize`), stripping unsafe HTML before render. The default schema allows only safe inline formatting; links are forced to `rel="noopener noreferrer"` and open in a new tab. Companion fixes in the same PR: per-key rate limits on the AI endpoints (#159) and password-reset log redaction (#160).

**Historical impact:** The ZAI chat model's response was rendered as markdown via `react-markdown` without sanitization. The CSP `default-src 'self'` blocks external resource loads, and `script-src 'unsafe-inline'` was the remaining XSS vector if the model emitted a raw `<script>` tag.

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
