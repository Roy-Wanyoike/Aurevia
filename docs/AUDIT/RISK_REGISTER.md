# RISK_REGISTER — Aurevia Operational Risks

> Risk log — ranked by **Severity × Likelihood**. Each entry carries an ID, owner, current mitigation, and residual risk after mitigation.

## Risk Matrix

| ID | Risk | Severity | Likelihood | Mitigation | Residual |
|---|---|---|---|---|---|
| R-01 | LIVE trading blocked by stub broker adapters | Critical | Certain | Adapters stubbed; LIVE physically impossible | Low (cannot occur today) → **High** once real adapters land |
| R-02 | No real broker (paper-only) | Critical | Certain | `PaperBroker` is the only registered adapter | High |
| R-03 | Simulated market data only (no Polygon/Alpaca key) | High | Likely | `SimulatedProvider` always available; clearly labeled `isLive=false` | High |
| R-04 | No MFA / single-factor auth | High | Likely | bcrypt hashing; NextAuth JWT; rate limit | High |
| R-05 | No tenant row-level filtering | High | Likely | **FIXED** — `requireTenant()` threaded into every v1 API route via NextAuth session (#161, PR #179) | Low |
| R-06 | `requireAuth()` on only 6/33 routes | High | Likely | **FIXED** — `requireAuth()` on 60/62 v1 routes; only `/health` + `/auth/seed-demo` + `/auth/register` exempt (#156, PR #175, verified PR #178) | Low |
| R-07 | No role enforcement on mutating routes | High | Likely | **FIXED** — `requireRole(req, minimum)` helper gates mutating blog routes by `trader+` and enforces author-or-admin ownership (#130, PR #146) | Low |
| R-08 | CSP allows `unsafe-inline` script-src | Medium | Likely | Strict CSP set in `next.config.ts`; `script-src` still permissive for Next.js 16 RSC | Medium |
| R-09 | No client-order idempotency | Medium | Possible | BrokerAdapter contract accepts `clientOrderId` | Medium |
| R-10 | In-memory store loses state on restart | High | Likely | None today | High |
| R-11 | No reconciliation between internal state and broker | Medium | Possible | `PaperBroker.reconcile` interface defined; real adapters stubbed | Medium |
| R-12 | No drift monitoring on ML model | Medium | Possible | Coefficients hand-tuned; predictions presented as probabilities | Medium |
| R-13 | Health endpoint leaks portfolio equity | Medium | Likely | Behind TLS; no auth gate | Medium |
| R-14 | No distributed rate-limit backend | Medium | Possible | In-memory limiter with GC; single-instance only | Medium |
| R-15 | No CI security audit (`bun audit`) | Medium | Likely | **FIXED** — `bun audit --audit-level=high` job in `.github/workflows/ci.yml` runs on every PR (#169, PR #169) | Low |
| R-16 | `AuditLog` model is dead code | Low | Certain | **FIXED** — `auditLog()` writer at `src/lib/aurevia/audit/logger.ts` records every sensitive mutation (`ORDER_PLACED`, `RISK_PROFILE_UPDATED`, `CIRCUIT_BREAKER_CHANGED`) — `AuditLog` is no longer dead code (#112, PR #112) | Low |
| R-17 | SQLite dev lacks JSON operators | Low | Certain | JSON stored as String; parsed manually | Low |
| R-18 | No SSO / SAML / OAuth | Medium | Likely | Stubs commented in `auth-options.ts` | Medium |
| R-19 | Copilot markdown output not sanitized | Medium | Possible | **FIXED** — `rehype-sanitize` in the Copilot markdown pipeline strips unsafe HTML; CSP tightened (#158, PR #176) | Low |
| R-20 | Prisma `schema.postgres.prisma` drift from dev | Medium | Possible | Manual sync required | Medium |

## Detailed entries

### R-01 — LIVE trading blocked by stub broker adapters
- **Owner:** Engineering
- **Current state:** `AlpacaAdapter.connect()` calls `simulateLatency()` instead of HTTP; `IBKRAdapter` similarly stubbed. `BrokerRouter.route()` always selects the paper broker.
- **Why it's a risk:** Cannot occur *today* — the system physically cannot place a real trade. **Becomes Critical the moment real adapters land** — every other mitigation (circuit breaker, LIVE 2-step confirm, role enforcement) must be in place before that PR merges.
- **Acceptance gate for un-blocking:** role enforcement, tenant filtering, CSP, idempotency keys, integration tests against the broker's paper sandbox, reconciliation runs on a schedule.

### R-02 — No real broker (paper-only)
- **Owner:** Engineering
- **Current state:** `PaperBroker` simulates fills with configurable slippage/commission. No real broker integration.
- **Why it's a risk:** Paper trading cannot validate execution quality, latency assumptions, or reconciliation logic against a real exchange. Backtest results will diverge from live results.
- **Mitigation path:** Wire Alpaca paper trading API first (same SDK, `paper-api.alpaca.markets`); run in parallel with `PaperBroker` for 30 days; compare fill prices, latency, and reconciliation diffs.

### R-03 — Simulated market data only
- **Owner:** Engineering
- **Current state:** `PolygonProvider` exists but is only activated when `POLYGON_API_KEY` is set. Dev runs always fall back to `SimulatedProvider`.
- **Why it's a risk:** Strategy parameters tuned against simulated data will misbehave on real data (regime distributions differ; microstructure noise absent).
- **Mitigation path:** Wire Polygon in staging; add `MARKET_DATA_STALE` event emission when the live provider fails (Issue #93 event types already include this).

### R-04 — No MFA / single-factor auth
- **Owner:** Engineering / Security
- **Current state:** CredentialsProvider with bcrypt only. No TOTP, no SMS, no push notification.
- **Why it's a risk:** Password reuse + credential stuffing → account takeover → unauthorized trading.
- **Mitigation path:** Add `OTPSignIn` MFA provider; require MFA for any user with role ≥ trader; require re-auth for LIVE-mode arming.

### R-05 — No tenant row-level filtering
- **Owner:** Engineering
- **Status:** ✅ FIXED (PR #179, closes #161)
- **Current state:** `requireTenant()` resolves the caller's `organizationId` from the NextAuth session and threads it into every v1 API route. `withTenantFilter()` is applied to every `db.*.findMany` call path; blog routes thread `organizationId` into Article, ArticleComment, ArticleLike, ArticleView.
- **Why it was a risk:** Once multi-tenant customers are onboarded, Org A can read Org B's data. **Single largest security risk for SaaS expansion.**
- **Verification:** `bun test` includes tenant-isolation integration tests asserting cross-tenant reads return empty (commit `c429716`).

### R-06 — `requireAuth()` coverage incomplete
- **Owner:** Engineering
- **Status:** ✅ FIXED (PR #175, verified PR #178, closes #156 / FINAL-001)
- **Current state:** `requireAuth()` is the first line of 60 of 62 v1 route handlers. The two intentional exemptions are `/api/v1/health` (liveness probe, public by design) and `/api/v1/auth/seed-demo` (dev-only seeding). `/api/v1/auth/register` is also exempt — public self-service registration, gated only by edge rate-limiting.
- **Why it was a risk:** 27 routes were open in production if `AUREVIA_API_KEY` was set but no per-route auth helper was called.
- **Verification:** `grep -rL requireAuth src/app/api/v1/**/route.ts` returns only the two intentional exemptions (PR #178 audit).

### R-07 — No role enforcement on mutating routes
- **Owner:** Engineering
- **Status:** ✅ FIXED (PR #146, closes #130 / BE-003 / SEC-001)
- **Current state:** `requireRole(req, minimum)` helper in `src/lib/aurevia/auth/check.ts` gates mutating blog routes (`POST /api/v1/blog/articles`, `PATCH/DELETE [slug]`, `POST /api/v1/blog/categories`, `POST /api/v1/blog/ai-assist`) by minimum role `trader+`. PATCH/DELETE also enforce author-or-admin ownership. In dev mode role enforcement is bypassed (returns `admin`); in production the role is read from the NextAuth session JWT.
- **Why it was a risk:** `viewer`-role principals could mutate any resource that required `trader+` or `admin`.
- **Follow-up:** extend `requireRole()` to v1 trading routes (`/portfolio` POST, `/risk` POST, `/brokers` POST); LIVE arming requires `admin`.

### R-08 — CSP allows `unsafe-inline` script-src
- **Owner:** Engineering / Security
- **Current state:** `next.config.ts` sets `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `frame-ancestors: 'none'`. The remaining gap is `script-src 'unsafe-inline' 'unsafe-eval'`, required by Next.js 16 RSC payload + Turbopack HMR.
- **Why it's a risk:** Inline-script XSS attacks are not blocked by CSP. The Copilot markdown render path (`react-markdown` without `rehype-sanitize`) is the closest vector.
- **Mitigation path:** Migrate to nonce-based CSP — Next.js 16 supports per-request nonces via the `nonce` option on `headers()`. Add `rehype-sanitize` to the copilot markdown pipeline.

### R-09 — No client-order idempotency
- **Owner:** Engineering
- **Current state:** `POST /api/v1/portfolio` (order placement) doesn't generate `clientOrderId`. A retried network call can place duplicate orders.
- **Mitigation path:** Generate `crypto.randomUUID()` in the route handler; pass through to broker; broker deduplicates on retry.

### R-10 — In-memory store loses state on restart
- **Owner:** Engineering
- **Current state:** `AureviaStore` holds signals, orders, backtests, portfolio, alerts, watchlists, risk profile in memory.
- **Mitigation path:** Write-through to Prisma models on every mutation; lazy-load from Prisma on cache miss. Priority: `Order` and `RiskProfile` first (operator-critical), `Backtest` second, `Alert`/`Watchlist` third.

### R-11 — No reconciliation runs
- **Owner:** Engineering
- **Current state:** `ReconciliationRun` Prisma model exists; no writer. `BrokerAdapter.reconcile()` interface defined; real adapters stubbed.
- **Mitigation path:** Schedule a reconciliation run every N minutes against every connected broker; emit `RECONCILIATION_FAILED` event (Issue #93) on mismatch; circuit breaker latches to `TRADING_PAUSED` on diff.

### R-12 — No ML drift monitoring
- **Owner:** Data / ML
- **Current state:** `ALM v1.0` uses hand-tuned logistic-regression coefficients. No monitoring of prediction distribution vs. training distribution.
- **Mitigation path:** Snapshot prediction distribution per day; compare to baseline with KS-test; emit `CIRCUIT_BREAKER_TRIGGERED` (or new `ML_DRIFT_DETECTED` event) on divergence.

### R-13 — Health endpoint leaks portfolio equity
- **Owner:** Engineering / Security
- **Status:** ✅ FIXED (PR for #183)
- **Current state:** `/api/v1/health` returns only `status`, `uptimeHours`, `tradingMode`, `circuitBreakerState`, `dataSource`, `dataIsLive`, `version`. The operational snapshot (`portfolioEquity`, `portfolioDrawdown`, `signalsTracked`, `backtestsRun`, `ordersPlaced`, `brokerConnected`, `marketDataLatencyMs`, `apiErrors`, `universeSize`) is gated behind `requireAuth()` at `/api/v1/admin/system`. The dashboard and System view fetch the admin/system snapshot via `useSystemStats()` so the UI keeps showing those fields to logged-in users.
- **Why it was a risk:** An unauthenticated attacker could probe system activity (and indirectly infer account size) by hitting the public health endpoint.

### R-14 — No distributed rate-limit backend
- **Owner:** Engineering / SRE
- **Current state:** In-memory `Map` in `rate-limit.ts`. Per-instance, not per-cluster.
- **Mitigation path:** Swap to Redis token bucket when scaling past one instance. Call surface unchanged.

### R-15 — No CI security audit
- **Owner:** Engineering / Security
- **Status:** ✅ FIXED (PR #169, closes #166–#169)
- **Current state:** `.github/workflows/ci.yml` includes a `security-audit` job that runs `bun audit --audit-level=high` on every push and pull_request. Transitive dev-dep vulns are non-blocking (`continue-on-error: true`); direct-dep vulns fail the build.
- **Why it was a risk:** Vulnerable dependencies could slip in via PR without anyone noticing.

### R-16 — `AuditLog` dead code
- **Owner:** Engineering
- **Status:** ✅ FIXED (PR #112, closes #110/#111/#112 — merge commit `1c4aa53`)
- **Current state:** `auditLog()` writer at `src/lib/aurevia/audit/logger.ts` records every sensitive mutation: `ORDER_PLACED` (after `submitOrder()`), `RISK_PROFILE_UPDATED` (with before/after diff per changed field), `CIRCUIT_BREAKER_CHANGED` (from/to/reason for both manual + engine transitions). The writer NEVER throws — failures are logged and swallowed so the trading pipeline can't be blocked by the audit sink. `GET /api/v1/admin/audit-logs` is paginated, filterable, and immutable.
- **Why it was a risk:** Two audit models (`AuditLog` and `EventLog`) existed with `AuditLog` having no writer, causing confusion about which was authoritative.
- **Verification:** 6 unit tests in `src/lib/aurevia/audit/logger.test.ts` cover shape + failure isolation.

### R-17 — SQLite dev lacks JSON operators
- **Owner:** Engineering
- **Current state:** `payload`, `indicators`, `positions`, `equityCurve`, `tradesJson` stored as `String`; parsed with `JSON.parse` at read time.
- **Mitigation path:** Migrate to Postgres `Json` typed columns in production; abstract behind a Prisma custom type so dev/prod code paths stay identical.

### R-18 — No SSO / SAML / OAuth
- **Owner:** Engineering / Security
- **Current state:** Stubs commented in `auth-options.ts`. No GitHub/Google provider configured.
- **Mitigation path:** Add Google + GitHub OAuth providers; for enterprise tier, add SAML via `@auth/saml-provider`.

### R-19 — Copilot markdown output not sanitized
- **Owner:** Engineering / Security
- **Status:** ✅ FIXED (PR #176, closes #158 / #159 / #160)
- **Current state:** `rehype-sanitize` is wired into the Copilot markdown pipeline (`react-markdown` + `rehype-sanitize`), stripping unsafe HTML before render. The default schema allows only safe inline formatting; links are forced to `rel="noopener noreferrer"` and open in a new tab. Companion fixes in the same PR: per-key rate limits on the AI endpoints (#159) and password-reset log redaction (#160).
- **Why it was a risk:** The ZAI chat model's response was rendered as markdown via `react-markdown` without sanitization — a model emitting a raw `<script>` tag would have executed in the user's browser (combined with the permissive CSP `script-src 'unsafe-inline'`).

### R-20 — Prisma prod schema drift
- **Owner:** Engineering / SRE
- **Current state:** `prisma/schema.prisma` is SQLite-only. Production Postgres uses a separate `schema.postgres.prisma` (per ADR-002). Manual sync required.
- **Mitigation path:** Add a CI diff step that asserts both schemas have the same model set; fail the build on divergence.
