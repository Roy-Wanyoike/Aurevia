# SECURITY_AUDIT — Aurevia Security Posture

> Verified by direct inspection of `src/middleware.ts`, `src/lib/aurevia/auth/*`, `src/lib/aurevia/rate-limit.ts`, and every `route.ts` file. Status legend: ✅ enforced · ⚠ partial / dev-only · ❌ missing.

## 1. Authentication

| Surface | Status | Notes |
|---|---|---|
| NextAuth CredentialsProvider (bcrypt) | ✅ | `auth/auth-options.ts`. `bcrypt.compare` only — never `bcrypt.hash` at request time. |
| JWT sessions (30-day maxAge) | ✅ | Secret sourced via `getNextAuthSecret()` — throws in prod if unset (no silent dev fallback). |
| API-key gate on `/api/v1/*` | ⚠ | Only 6 of 33 v1 routes call `requireAuth()`: `alerts`, `backtests`, `brokers`, `portfolio`, `risk`, `signals`. **27 routes are unauthenticated** in production. |
| Dev-bypass with one-time warning | ✅ | `auth/check.ts` — `warnedUnauthenticatedDev` flag prevents log spam; principal set to `"dev-bypass"`. |
| Demo seed endpoint (`/api/v1/auth/seed-demo`) | ✅ | Returns **404 in production** (looks non-existent to attackers). Check runs before any DB work. |
| MFA / TOTP | ❌ | Not implemented. NextAuth `signin` page is single-factor. |
| SSO (Google/GitHub/SAML) | ❌ | Stubs commented in `auth-options.ts`. |
| Session expiry / revocation | ⚠ | JWT strategy — server-side revocation list not implemented. Logout invalidates the client cookie only. |

## 2. Authorization (RBAC)

| Capability | Status | Notes |
|---|---|---|
| Role enum on `User` (`trader`, `admin`, `viewer`) | ✅ | Schema field exists; propagated to JWT via `jwt` callback. |
| Role propagated to client session | ✅ | `session` callback sets `session.user.role`. |
| Role enforcement on mutating routes | ❌ | `requireAuth()` returns boolean `ok` only — does NOT inspect role. `viewer` role can POST orders in production. **Critical gap.** |
| Fine-grained capabilities (`trading.live`, `risk.update`) | ❌ | Commented contract in `auth-options.ts` ("Fine-grained capabilities (not just roles) gate dangerous actions — `trading.live` is extremely privileged"). Not implemented. |
| LIVE-mode 2-step confirmation | ✅ | Both `/api/v1/brokers` (connect mode=LIVE) and `/api/v1/risk` (updateProfile tradingMode=LIVE) require `confirmLive: true`. 403 otherwise. Logged at WARN. |

## 3. Tenant isolation

| Surface | Status | Notes |
|---|---|---|
| Multi-tenant schema (Organization, Team, Membership) | ✅ | `prisma/schema.prisma` — 3 models with cascade-delete policies. |
| `userId` + `organizationId` columns on durable tables | ✅ | Signal, Backtest, Order, RiskProfile, PortfolioSnapshot, Alert — all nullable (#71 forward-compat). |
| Row-level tenant filtering in queries | ❌ | **No query filters by `organizationId` anywhere in `src/lib/aurevia/` or `src/app/api/v1/`.** A logged-in user from Org A can read Org B's backtests. Single largest security gap. |
| Tenant context in request pipeline | ❌ | No `req.organizationId` resolver; middleware doesn't extract tenant from session. |

## 4. Rate limiting

| Surface | Status | Notes |
|---|---|---|
| Per-IP sliding window (60 req/min default) | ✅ | `middleware.ts` → `rate-limit.ts`. 429 + `Retry-After` header. |
| Configurable via env | ✅ | `RATE_LIMIT_PER_MINUTE`. |
| Memory leak fix (#79) | ✅ | 1% probabilistic global GC sweep. |
| Distributed rate limit (Redis) | ❌ | In-memory only — won't survive multi-instance deployments. |
| Per-route or per-user limits | ❌ | Single global tier. Authenticated users and anonymous share the same 60/min bucket. |

## 5. Request ID propagation

| Surface | Status | Notes |
|---|---|---|
| Inbound `x-request-id` preserved | ✅ | `middleware.ts` |
| Auto-generated UUID v4 when absent | ✅ | `crypto.randomUUID()` in edge runtime |
| Propagated to route handler via mutated request headers | ✅ | `NextResponse.next({ request: { headers } })` (#67 fix) |
| Echoed on response (`x-request-id`) | ✅ | All 429 responses include it; `unauthorized()` helper also echoes it. |
| Embedded in structured log entries | ✅ | Every logger call in mutating routes includes `requestId`. |

## 6. HTTP security headers

| Header | Status | Notes |
|---|---|---|
| `Content-Security-Policy` | ❌ | Not set. |
| `Strict-Transport-Security` | ❌ | Delegated to Caddyfile in production (acceptable). |
| `X-Frame-Options` / `frame-ancestors` | ❌ | Dashboard could be iframed. |
| `X-Content-Type-Options: nosniff` | ❌ | — |
| `Referrer-Policy` | ❌ | — |
| `Permissions-Policy` | ❌ | — |

`next.config.ts` does not define a `headers()` function. Add one before production.

## 7. Secrets handling

| Surface | Status | Notes |
|---|---|---|
| `NEXTAUTH_SECRET` enforcement | ✅ | Throws in production if unset (#59 fix). |
| `AUREVIA_API_KEY` minimum length | ✅ | `>=16` chars or fail-closed. |
| `BrokerConnection.apiKeyRef` (not the key itself) | ✅ | Schema comment: "reference to secret in secret manager (never the key itself)". |
| Broker credentials never logged | ✅ | `auth/check.ts` logs principal, not credential; brokers route logs `kind`/`mode` only. |
| `apiKey` in POST body for broker connect | ⚠ | Currently accepted as plaintext in request body. Acceptable only over TLS; should be moved to a secret manager write path in production. |
| Secret scanner / pre-commit | ❌ | Not configured. |

## 8. Input validation

| Surface | Status | Notes |
|---|---|---|
| zod schema on every mutating route | ✅ | 11 routes use `safeParse`/`parse` |
| Refinement rules (cross-field) | ✅ | `portfolio`, `alerts`, `watchlists` use `.refine()` |
| Query string validation | ⚠ | Routes parse `URLSearchParams` manually — no schema; mild risk of unexpected types reaching engines. |
| Response envelope (no internal stack trace) | ✅ | Mutating routes catch and return `{ error: e.message }`. **But** `e.message` in production can leak SQL/Prisma errors — wrap in a generic message for 5xx responses. |

## 9. Trading safety

| Surface | Status | Notes |
|---|---|---|
| LIVE trading blocked by default | ✅ | `tradingMode = "PAPER"` in `DEFAULT_RISK_PROFILE`; LIVE requires `confirmLive: true` AND a connected broker in LIVE mode. |
| Circuit-breaker latching (BE-P0-006) | ✅ | `nextBreakerState` refuses to auto-recover from `TRADING_PAUSED`; explicit operator action required to move to `RE_EVALUATING`. |
| Post-fill risk escalation | ✅ | `store.submitOrder` runs drawdown/loss checks after each fill and latches breaker if exceeded. |
| Reconciliation mismatch → pause | ✅ | `PaperBroker.reconcile` returns `diffs`; engine pauses on mismatch (interface defined; real broker adapters still stubbed). |
| Order idempotency (`clientOrderId`) | ⚠ | `BrokerAdapter.placeOrder` contract accepts `clientOrderId` for idempotency, but `POST /api/v1/portfolio` doesn't generate one — duplicate retried requests can place duplicate orders. |
| Broker adapter SDKs | ❌ | `AlpacaAdapter` and `IBKRAdapter` are stubs (`simulateLatency()` instead of HTTP). LIVE trading physically impossible today. |
| Withdrawal permissions | ✅ | Contract: "Trading-only credentials (withdrawal permission DISABLED)". Enforced at adapter interface comment level — real adapter must verify at connect time. |

## 10. Audit trail

| Surface | Status | Notes |
|---|---|---|
| Structured JSON logs with `requestId` | ✅ | `logger.ts` |
| `EventLog` Prisma model | ✅ | Phase-0 schema; `eventType`, `correlationId`, `causationId`, `actorId`, `tenantId`, `schemaVersion`, `payload`. |
| Typed event emitter (`emitEvent`) | ✅ | Added by Issue #93 — `events/emitter.ts`. Never throws (logs and continues) so the trading pipeline is unaffected by event-log failures. |
| `AuditLog` model | ❌ | Defined but no writer. Superseded by `EventLog` — should be retired (see DATABASE_AUDIT.md gap #4). |
| `RiskEvent` model | ✅ | `store.recordRiskEvent()` writes to in-memory store; persisted to Prisma `RiskEvent` model only by `/api/v1/risk` mutation. |

## 11. Build/deploy safety

| Surface | Status | Notes |
|---|---|---|
| `NODE_ENV=production` stripping dev paths | ✅ | `seed-demo` returns 404. |
| Prisma client generated postinstall | ✅ | `postinstall: prisma generate`. |
| Type-check + lint on CI | ✅ | `tsc --noEmit` and `eslint .` both clean. |
| Source maps in production | ⚠ | Default Next.js behavior — verify `productionBrowserSourceMaps: false` before launch. |
| Dockerfile multi-stage build | ✅ | Added by Issue #95 — `oven/bun:1` base, standalone output. |

## Prioritized remediation

1. **Add `requireAuth()` to every route that returns tenant data** (`/orders`, `/portfolio/analytics`, `/journal`, `/watchlists`, `/ml`, `/copilot`, `/replay`, `/scenario`, `/screener`, `/backtests/[id]`, `/backtests/[id]/monte-carlo`). 27 routes need wrapping.
2. **Add role enforcement** to `requireAuth` (return `role: "viewer"` → block POST `/portfolio`, `/risk`, `/brokers`).
3. **Add tenant filtering** to every Prisma query in the durable record paths.
4. **Add `headers()` in `next.config.ts`** for CSP/HSTS/X-Frame-Options/nosniff.
5. **Add `clientOrderId`** generation on `POST /api/v1/portfolio` order placement.
6. **Sanitize 5xx error responses** to return a generic message, not `e.message`.
