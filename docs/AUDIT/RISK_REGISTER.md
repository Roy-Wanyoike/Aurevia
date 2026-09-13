# RISK_REGISTER — Aurevia Operational Risks

> Risk log — ranked by **Severity × Likelihood**. Each entry carries an ID, owner, current mitigation, and residual risk after mitigation.

## Risk Matrix

| ID | Risk | Severity | Likelihood | Mitigation | Residual |
|---|---|---|---|---|---|
| R-01 | LIVE trading blocked by stub broker adapters | Critical | Certain | Adapters stubbed; LIVE physically impossible | Low (cannot occur today) → **High** once real adapters land |
| R-02 | No real broker (paper-only) | Critical | Certain | `PaperBroker` is the only registered adapter | High |
| R-03 | Simulated market data only (no Polygon/Alpaca key) | High | Likely | `SimulatedProvider` always available; clearly labeled `isLive=false` | High |
| R-04 | No MFA / single-factor auth | High | Likely | bcrypt hashing; NextAuth JWT; rate limit | High |
| R-05 | No tenant row-level filtering | High | Likely | `userId` + `organizationId` columns exist (#71) but unused | High |
| R-06 | `requireAuth()` on only 6/33 routes | High | Likely | Public + requireAuth on critical paths | High |
| R-07 | No role enforcement on mutating routes | High | Likely | Role propagated to session but not checked | High |
| R-08 | CSP allows `unsafe-inline` script-src | Medium | Likely | Strict CSP set in `next.config.ts`; `script-src` still permissive for Next.js 16 RSC | Medium |
| R-09 | No client-order idempotency | Medium | Possible | BrokerAdapter contract accepts `clientOrderId` | Medium |
| R-10 | In-memory store loses state on restart | High | Likely | None today | High |
| R-11 | No reconciliation between internal state and broker | Medium | Possible | `PaperBroker.reconcile` interface defined; real adapters stubbed | Medium |
| R-12 | No drift monitoring on ML model | Medium | Possible | Coefficients hand-tuned; predictions presented as probabilities | Medium |
| R-13 | Health endpoint leaks portfolio equity | Medium | Likely | Behind TLS; no auth gate | Medium |
| R-14 | No distributed rate-limit backend | Medium | Possible | In-memory limiter with GC; single-instance only | Medium |
| R-15 | No CI security audit (`bun audit`) | Medium | Likely | None | Medium |
| R-16 | `AuditLog` model is dead code | Low | Certain | `EventLog` is the active model (#93) | Low |
| R-17 | SQLite dev lacks JSON operators | Low | Certain | JSON stored as String; parsed manually | Low |
| R-18 | No SSO / SAML / OAuth | Medium | Likely | Stubs commented in `auth-options.ts` | Medium |
| R-19 | Copilot markdown output not sanitized | Medium | Possible | `react-markdown` renders, no `rehype-sanitize` | Medium |
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
- **Current state:** Schema has `userId`/`organizationId` columns; no query filters by them.
- **Why it's a risk:** Once multi-tenant customers are onboarded, Org A can read Org B's data. **Single largest security risk for SaaS expansion.**
- **Mitigation path:** Resolve `organizationId` from session in middleware; thread into every `db.*.findMany` call; unit test asserting cross-tenant reads return empty.

### R-06 — `requireAuth()` coverage incomplete
- **Owner:** Engineering
- **Current state:** 6 of 33 v1 routes call `requireAuth()`. 27 routes (including mutating ones like `/ml` POST, `/copilot` POST, `/watchlists` POST) are open.
- **Mitigation path:** Add `requireAuth()` as the first line of every route handler except `/health` and `/auth/seed-demo`. Add ESLint rule that flags `route.ts` files without `requireAuth` import.

### R-07 — No role enforcement on mutating routes
- **Owner:** Engineering
- **Current state:** `requireAuth()` returns `ok: boolean`; does not inspect role.
- **Mitigation path:** Add `requireRole(req, role)` helper; gate `/portfolio` POST, `/risk` POST, `/brokers` POST by minimum role `trader`; LIVE arming requires `admin`.

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
- **Current state:** `/api/v1/health` is public and returns `portfolioEquity`, `portfolioDrawdown`, `signalsTracked`, `backtestsRun`, `ordersPlaced`.
- **Mitigation path:** Strip operational fields from public response; move to `/api/v1/health/full` behind `requireAuth()`.

### R-14 — No distributed rate-limit backend
- **Owner:** Engineering / SRE
- **Current state:** In-memory `Map` in `rate-limit.ts`. Per-instance, not per-cluster.
- **Mitigation path:** Swap to Redis token bucket when scaling past one instance. Call surface unchanged.

### R-15 — No CI security audit
- **Owner:** Engineering / Security
- **Current state:** No `bun audit` or SAST in CI.
- **Mitigation path:** Add `bun audit --audit-level=high` + `bunx depcheck` to CI on every PR.

### R-16 — `AuditLog` dead code
- **Owner:** Engineering
- **Current state:** `AuditLog` Prisma model exists; no writer. `EventLog` (Phase-0) supersedes it; `emitEvent` (#93) writes there.
- **Mitigation path:** Remove `AuditLog` in next migration; update `DATABASE_AUDIT.md`.

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
- **Current state:** `react-markdown` renders the ZAI chat response. No `rehype-sanitize` plugin.
- **Mitigation path:** Add `rehype-sanitize` to the markdown pipeline; tighten CSP to nonce-based (see R-08).

### R-20 — Prisma prod schema drift
- **Owner:** Engineering / SRE
- **Current state:** `prisma/schema.prisma` is SQLite-only. Production Postgres uses a separate `schema.postgres.prisma` (per ADR-002). Manual sync required.
- **Mitigation path:** Add a CI diff step that asserts both schemas have the same model set; fail the build on divergence.
