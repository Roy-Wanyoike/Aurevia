#!/usr/bin/env python3
"""
File GitHub issues for the Aurevia audit findings.

Creates the labels first, then files one issue per critical/high bug
with file:line references and fix proposals.
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

TOKEN = os.environ.get("GH_TOKEN")
if not TOKEN:
    sys.exit("GH_TOKEN env var not set")
REPO = "Roy-Wanyoike/Aurevia"
API = "https://api.github.com/repos/" + REPO

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
}


def api_call(method, path, payload=None):
    url = API + path
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        print(f"  ERROR {e.code} {method} {path}: {body}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  ERROR {method} {path}: {e}", file=sys.stderr)
        return None


# Step 1: Create labels (idempotent — re-running won't error if label exists)
LABELS = [
    ("priority/P0", "b91c1c", "Critical — must fix before any production deploy"),
    ("priority/P1", "d93f0b", "High — fix before onboarding real users"),
    ("priority/P2", "fbca04", "Medium — fix in the next sprint"),
    ("priority/P3", "0e8a16", "Low — tech debt cleanup"),
    ("security", "d73a4a", "Security vulnerability or hardening"),
    ("trading-safety", "b60205", "Bug that could cause real-money loss"),
    ("auth", "1d76db", "Authentication / authorization"),
    ("backend", "5319e7", "API routes / server-side lib"),
    ("frontend", "c5def5", "UI / components / views"),
    ("infra", "bfdadc", "Build / config / deployment"),
    ("docs", "0075ca", "Documentation accuracy"),
    ("bundle-size", "a2eeef", "Bundle size / performance optimization"),
    ("data-integrity", "7057ff", "Data model / migration / multi-tenancy"),
    ("needs-confirmation", "f9d0c4", "Missing confirmation modal on destructive action"),
    ("needs-auth-gate", "fef2c2", "API route missing auth check"),
    ("tech-debt", "ededed", "Code cleanup / refactor"),
]

print("=== Creating labels ===")
for name, color, desc in LABELS:
    result = api_call("POST", "/labels", {"name": name, "color": color, "description": desc})
    if result is None:
        # Label probably already exists — try update
        api_call("PATCH", f"/labels/{urllib.parse.quote(name, safe='')}",
                 {"new_name": name, "color": color, "description": desc})
        print(f"  label {name}: updated")
    else:
        print(f"  label {name}: created")

# Step 2: File issues — one per critical bug
ISSUES = [
    # ---------------- CRITICAL (P0) ----------------
    {
        "title": "[P0/security] NEXTAUTH_SECRET falls back to publicly-known dev secret — enables JWT forgery",
        "labels": ["priority/P0", "security", "auth", "backend"],
        "body": """## Root cause

`src/lib/aurevia/auth/auth-options.ts:76`:
```ts
secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production",
```

If `NEXTAUTH_SECRET` is unset in production (e.g. on Vercel without the env var), JWTs are signed with a publicly-known secret. Anyone reading the source code can forge a JWT with any `id`, `email`, `role` they want — full auth bypass.

## Fix

Mirror the pattern used in sharkpush's `dashboard-url.ts`: throw in production when the env var is unset; fall back to the dev secret only in development.

```ts
function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET is not configured. Set it in your Vercel project settings (Settings → Environment Variables) to a random string of at least 32 characters.');
  }
  return 'dev-secret-change-in-production';
}
// ...
secret: getSecret(),
```

## Verification

- `bun run build` with `NEXTAUTH_SECRET` unset + `NODE_ENV=production` → build fails with the error message.
- `bun run build` with `NEXTAUTH_SECRET` set → build succeeds.
- Local dev (`NODE_ENV !== production`) continues to work without the env var.

## Severity rationale

**Critical** — this is a remote-code-execution-equivalent for auth. Any attacker who reads the public source can forge admin JWTs."""
    },
    {
        "title": "[P0/trading-safety] Unauthenticated POST /api/v1/risk can flip tradingMode to LIVE",
        "labels": ["priority/P0", "trading-safety", "security", "backend", "needs-auth-gate"],
        "body": """## Root cause

`src/app/api/v1/risk/route.ts:53-88`:
```ts
if (data.action === "updateProfile") {
  // No auth check
  // No capability check for trading.live
  // Accepts tradingMode: "LIVE" with no extra confirmation flag, no IP allowlist, no audit log
  Object.assign(store.riskProfile, data);
}
```

Anyone can POST `{ action: "updateProfile", tradingMode: "LIVE" }` and switch the system to LIVE trading. ARCHITECTURE.md §3.4 explicitly says "LIVE requires explicit configuration and multiple safeguards" but none exist.

Same issue with `setBreaker` (line 89-108): unauthenticated caller can move circuit breaker from `TRADING_PAUSED` → `NORMAL`, defeating the latched-recovery safeguard in `risk/engine.ts:211`.

## Fix

1. Add `getServerSession(authOptions)` check at the top of POST — return 401 if no session.
2. For `tradingMode: "LIVE"`, additionally require `user.role === 'admin'` AND a `confirmLive: true` flag in the body (defence-in-depth — UI must show a typed confirmation modal).
3. For `setBreaker` state changes, require admin role + log to audit_log.
4. Add a `RiskProfile.audit_log` table write on every change.

## Severity rationale

**Critical** — direct violation of the architecture's safety constraints. A LIVE trading switch without auth + confirmation could trigger real-money trades."""
    },
    {
        "title": "[P0/trading-safety] Unauthenticated POST /api/v1/portfolio can place orders + reset portfolio",
        "labels": ["priority/P0", "trading-safety", "security", "backend", "needs-auth-gate"],
        "body": """## Root cause

`src/app/api/v1/portfolio/route.ts:41-102`:
```ts
if (data.action === "order") {
  // No auth check — anyone can POST { action: "order", action: "BUY", symbol: "AAPL", quantity: 1000 }
  await store.submitOrder(...)
}
if (data.action === "reset") {
  // No auth check — anyone can wipe the portfolio
  store.resetPortfolio();
}
```

## Additional bugs in the same file

- `orderType: z.string().optional()` instead of enum — invalid values (e.g. "FOO") pass the refine if limitPrice is present, then cast as `"MARKET"|"LIMIT"|"STOP"` and forwarded to the broker.
- `quantity: z.number().positive()` has no upper bound — `Number.MAX_SAFE_INTEGER` passes the schema.

## Fix

1. Add `getServerSession(authOptions)` check — return 401 if no session.
2. Change `orderType` to `z.enum(["MARKET", "LIMIT", "STOP"])`.
3. Add `quantity: z.number().positive().max(10000)` (cap to a sane max).
4. For LIVE trading mode, require a typed confirmation string in the body (`confirm: "I understand this is a real order"`).

## Severity rationale

**Critical** — unauthenticated order placement is the worst-case scenario for a trading platform."""
    },
    {
        "title": "[P0/trading-safety] Broker connect with mode:LIVE has NO safeguard despite docstring claims",
        "labels": ["priority/P0", "trading-safety", "security", "backend", "needs-auth-gate"],
        "body": """## Root cause

Three coupled files all claim to enforce LIVE-mode safeguards but none do:

### `src/app/api/v1/brokers/route.ts:30-53`
- No auth check on POST.
- `mode: "LIVE"` accepted in the zod schema with no extra confirmation flag, no IP allowlist, no audit log entry.

### `src/lib/aurevia/brokers/alpaca.ts:34-40`
- `connect()` docstring (lines 14-19) explicitly claims the adapter refuses to connect in LIVE mode without a confirmation flag, but the implementation skips this check.

### `src/lib/aurevia/brokers/ibkr.ts:31-36`
- Same bug as alpaca.ts — docstring claims safeguard, implementation skips it.

## Additional bugs

- `apiKey` / `apiSecret` passed in the request body — proxies/CDNs may log the body. Should use headers or a secret manager.
- `placeOrder` in both adapters returns ACKNOWLEDGED without checking LIVE mode confirmation or enforcing idempotency via `clientOrderId`.
- Hardcoded $100k cash / $200k-$400k buying power returned from `getAccount()` — misleads the UI into thinking the broker actually returned real account state.

## Fix

1. Add auth + capability check (`trading.live`) on POST /api/v1/brokers.
2. In both broker adapters' `connect()`, throw if `config.mode === "LIVE"` AND `config.confirmLive !== true`.
3. In `placeOrder()`, throw if mode is LIVE AND no `clientOrderId` is set (idempotency).
4. Move `apiKey`/`apiSecret` to a custom header (`X-Broker-Api-Key`) and don't log it.
5. Implement real `getAccount()` calls to Alpaca/IBKR — return real broker state.

## Severity rationale

**Critical** — LIVE trading with real broker credentials is the worst-case attack surface."""
    },
    {
        "title": "[P0/trading-safety] Risk engine never receives actual order.quantity — manual orders of arbitrary size pass all 11 rules",
        "labels": ["priority/P0", "trading-safety", "backend"],
        "body": """## Root cause

Two coupled bugs:

### `src/lib/aurevia/store.ts:290-370`
`submitOrder` builds a synthetic Signal with `confidence: 1.0` and `price: getQuote(...).price` but NEVER passes the actual `order.quantity` to the risk engine. The risk engine ends up using `equity × maxPositionPct` as a notional estimate, which is always within the configured max — so any manual order, regardless of size, passes.

### `src/lib/aurevia/risk/engine.ts:117-156`
`evaluateRisk` computes `orderNotional = equity × maxPositionPct` (a conservative estimate) instead of using the real `order.quantity × order.price`. Rule 1 (max position) therefore never actually limits manual orders.

## Additional bugs in risk engine

- No rule specifically enforces LIVE-mode additional safeguards (2FA confirmation, position size reduction, cooldown).
- Rule 3 (cooldown) only blocks duplicate symbols; same-side orders on the same symbol within cooldown are allowed.
- `triggers` parameter object uses optional fields with `||` chains — undefined-safe but loose.

## Fix

1. In `store.submitOrder`, pass `order.quantity` to `evaluateRisk` via the `triggers` parameter:
   ```ts
   const risk = evaluateRisk(portfolio, signals, {
     order: {
       symbol: order.symbol,
       side: order.side,
       quantity: order.quantity,  // ← pass the real quantity
       price: order.price,
     },
   });
   ```
2. In `evaluateRisk` Rule 1, use `triggers.order.quantity × triggers.order.price` if `triggers.order` is present, else fall back to the current estimate.
3. Add a Rule 12: if `riskProfile.tradingMode === "LIVE"` AND `triggers.order.quantity × triggers.order.price > equity × 0.10`, require `triggers.confirmLive === true`.

## Severity rationale

**Critical** — the risk engine is supposed to be the last line of defence against oversized orders, and it's silently bypassed."""
    },
    {
        "title": "[P0/security] Unauthenticated /api/v1/auth/seed-demo mints users + returns plaintext credentials",
        "labels": ["priority/P0", "security", "auth", "backend"],
        "body": """## Root cause

`src/app/api/v1/auth/seed-demo/route.ts:9-50`:
```ts
// Comment says "DEV-ONLY" but no env gate, no auth
export async function POST() {
  // Creates a trader user + pro org
  // Returns plaintext { email, password } in the JSON response
}
```

Anyone can POST to `/api/v1/auth/seed-demo` and:
1. Mint a new trader user with a known password ("aurevia123").
2. Get the plaintext credentials in the response.
3. Login with those credentials.

## Fix

1. Hard-gate to non-production: `if (process.env.NODE_ENV === 'production') return 404;`
2. Even in dev, require a query param `?confirm=dev` so the endpoint isn't hit accidentally.
3. Don't return the plaintext password — return a one-time setup token instead.
4. Use a random password instead of "aurevia123" — credential-stuffing target if reused.

## Severity rationale

**Critical** — anyone who finds this endpoint (e.g. via the public source) can create admin users."""
    },
    {
        "title": "[P0/infra] package.json db:push script uses --accept-data-loss — catastrophic data loss footgun",
        "labels": ["priority/P0", "infra", "data-integrity"],
        "body": """## Root cause

`package.json:13`:
```json
"db:push": "prisma db push --accept-data-loss"
```

`--accept-data-loss` silently drops columns/data on schema drift. Making it the default in `db:push` (called by README quick-start + .zscripts/database-runtime-build.sh:24) risks catastrophic production data loss.

The Prisma docs explicitly warn: "Use this option in development environments only."

## Fix

1. Remove `--accept-data-loss` from the default `db:push` script.
2. Add a separate `db:push:force` script for explicit destructive operations.
3. Update README quick-start to use `db:push` (safe) instead of `db:push:force`.

```json
"db:push": "prisma db push",
"db:push:force": "prisma db push --accept-data-loss"
```

## Severity rationale

**Critical** — a single `bun run db:push` after a schema change could wipe production data silently."""
    },
    {
        "title": "[P0/security] No Content-Security-Policy header on a fintech app",
        "labels": ["priority/P0", "security", "infra"],
        "body": """## Root cause

`next.config.ts:14-26` — the comment on line 12 claims "basic CSP" but no CSP directive is set. The headers() function only adds X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

For a fintech app handling market data + auth tokens + broker credentials, CSP is essential to prevent XSS-based credential exfiltration.

## Fix

Add a CSP header to the headers() function:

```ts
{
  source: "/(.*)",
  headers: [
    { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss: https://api.polygon.io https://paper-api.alpaca.markets; frame-ancestors 'none';" },
    // ...existing headers
  ],
},
```

Tighten `script-src` to remove `'unsafe-inline'` and `'unsafe-eval'` once nonce-based CSP is wired up (separate issue).

## Severity rationale

**Critical** — XSS can steal session cookies + broker API keys. CSP is the standard mitigation."""
    },
    {
        "title": "[P0/backend] middleware.ts requestId never propagated to route handler — log correlation broken",
        "labels": ["priority/P0", "backend", "infra"],
        "body": """## Root cause

`src/middleware.ts:34-40`:
```ts
const res = limit.ok
  ? NextResponse.next()
  : NextResponse.json({ error: "rate limit exceeded", ... }, { status: 429 });
res.headers.set("x-request-id", requestId);  // ← set on RESPONSE only
```

The generated `requestId` is set on the RESPONSE but NEVER propagated to the REQUEST forwarded to the route handler. Routes reading `req.headers.get("x-request-id")` fall back to hardcoded strings like `"alerts"`, `"correlation"`, `"radar"` for all auto-generated IDs — log correlation is completely broken.

## Fix

Use `NextResponse.next({ request: { headers: requestHeaders } })`:

```ts
const requestHeaders = new Headers(req.headers);
requestHeaders.set("x-request-id", requestId);

const res = limit.ok
  ? NextResponse.next({ request: { headers: requestHeaders } })
  : NextResponse.json({ error: "rate limit exceeded", retryAfterMs: limit.retryAfterMs }, { status: 429 });
res.headers.set("x-request-id", requestId);
res.headers.set("x-ratelimit-remaining", String(limit.remaining));
// ...
```

Then update all route handlers to read `req.headers.get("x-request-id") ?? "unknown"` instead of hardcoded strings.

## Severity rationale

**Critical** — without request ID propagation, production incident debugging is impossible. Every log line from a single request shows up under different request IDs."""
    },
    {
        "title": "[P0/trading-safety] LIVE broker connect / LIVE trading mode / order placement all missing confirmation modals",
        "labels": ["priority/P0", "trading-safety", "frontend", "needs-confirmation"],
        "body": """## Root cause

Three coupled UI bugs, all related to LIVE trading safeguards:

### `src/components/aurevia/views/brokers-view.tsx:166-173`
LIVE broker connect has only a static warning label. One click submits real-money credentials and switches venue to LIVE. No confirmation modal, no typed confirmation string.

### `src/components/aurevia/views/risk-view.tsx:304-311` + `src/components/aurevia/views/settings-view.tsx:159-164`
LIVE trading mode switch only shows a warning Alert. No confirmation modal, no capability check (`trading.live`).

### `src/components/aurevia/views/portfolio-view.tsx:110-128, 462-467`
Order placement submits BUY/SELL with no confirmation modal. Button click places the order directly.

## Fix

For each of these three flows, add a confirmation dialog that:
1. Shows the action clearly ("You are about to switch to LIVE trading with real money. This cannot be undone.").
2. Requires the user to type a confirmation string (e.g. "LIVE") — defence in depth against misclicks.
3. Calls the API with `confirmLive: true` in the body (the API must reject without it for LIVE actions).
4. Logs to `audit_log` table on every LIVE action.

Use the existing `alert-dialog` shadcn component (`src/components/ui/alert-dialog.tsx`).

## Severity rationale

**Critical** — a misclick on these buttons could trigger real-money trades or switch the system to LIVE mode without the user understanding the consequences."""
    },
    {
        "title": "[P0/security] mini-services/aurevia-stream has wildcard CORS + no auth — anyone can read market data + signals",
        "labels": ["priority/P0", "security", "infra"],
        "body": """## Root cause

`mini-services/aurevia-stream/index.ts`:

### Line 23 — `cors: { origin: "*" }`
Wildcard CORS on a financial streaming service. Any website can connect and consume the data stream.

### Line 18 — `const PORT = 3003;` hardcoded
Ignores `STREAM_SERVICE_PORT` env var documented in `.env.example:91`.

### No authentication
Anyone can connect and receive all market data + signal alerts. No JWT/session check on the websocket handshake.

### Lines 57-62 + 95 — broken subscription model
`subscribe` event joins room `symbols:${upper.join(",")}` but ticks are emitted via `io.emit("tick")` (line 95) — broadcast to ALL clients regardless of subscription. Per-symbol subscription is broken.

### No graceful shutdown
No SIGTERM/SIGINT handler — connections dropped ungracefully on restart.

## Fix

1. Set `cors: { origin: process.env.CORS_ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"] }`.
2. Read PORT from env: `const PORT = parseInt(process.env.STREAM_SERVICE_PORT || "3003", 10);`
3. Add JWT auth on the handshake: validate the `auth.token` field with the same `NEXTAUTH_SECRET` as the main app.
4. Use `io.to(room).emit("tick", ...)` instead of `io.emit(...)` so ticks only go to subscribed clients.
5. Add SIGTERM/SIGINT handlers that close the HTTP server gracefully.

## Severity rationale

**Critical** — anyone on the internet can connect to the websocket, receive market data + signals, and (if/when the broadcast model is fixed) subscribe to arbitrary channels."""
    },
    {
        "title": "[P0/backend] All API routes missing auth checks — every /api/v1/* endpoint is public",
        "labels": ["priority/P0", "security", "auth", "backend", "needs-auth-gate"],
        "body": """## Root cause

The following API routes have NO `getServerSession(authOptions)` check — anyone can call them:

| Route | File | Severity |
|-------|------|----------|
| POST /api/v1/portfolio (order + reset) | `portfolio/route.ts:41` | **Critical** — places orders |
| POST /api/v1/risk (updateProfile + setBreaker) | `risk/route.ts:53,89` | **Critical** — flips LIVE mode |
| POST /api/v1/brokers (connect) | `brokers/route.ts:30` | **Critical** — connects to LIVE brokers |
| POST /api/v1/auth/seed-demo | `auth/seed-demo/route.ts:9` | **Critical** — mints users |
| POST /api/v1/backtests | `backtests/route.ts:43` | High — DoS vector |
| POST /api/v1/signals | `signals/route.ts:25` | High — DoS vector |
| POST /api/v1/screener | `screener/route.ts:103` | High — DoS vector |
| POST /api/v1/ml | `ml/route.ts:38` | High — DoS vector |
| GET /api/v1/orders | `orders/route.ts:7` | High — IDOR once auth exists |
| GET /api/v1/backtests/[id] | `backtests/[id]/route.ts:7` | High — IDOR |
| POST /api/v1/watchlists | `watchlists/route.ts:103` | High — multi-tenant data |
| GET /api/v1/correlation | `correlation/route.ts:25` | High — DoS (O(N²)) |
| GET /api/v1/similarity/[symbol] | `similarity/[symbol]/route.ts:69` | High — DoS |
| GET /api/v1/radar | `radar/route.ts:58` | High — DoS |

## Fix

Add a shared `requireAuth()` helper:

```ts
// src/lib/aurevia/auth/require-auth.ts
import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return null;
  }
  return session;
}
```

Then at the top of every protected route:
```ts
const session = await requireAuth();
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

## Severity rationale

**Critical** — every endpoint is currently public. Once real users are onboarded, this is a full data breach + unauthorized trading vector."""
    },
    {
        "title": "[P0/data-integrity] Prisma schema has no userId/organizationId on trade records — multi-tenancy claims are unenforced",
        "labels": ["priority/P0", "data-integrity", "backend"],
        "body": """## Root cause

`prisma/schema.prisma` — the Organization/Membership/Team models exist (multi-tenancy is claimed in ARCHITECTURE.md), but the trade models (`Order`, `Signal`, `Backtest`, `RiskEvent`, `AuditLog`, `Alert`, `RiskProfile`, `BrokerConnection`) have NO `userId` or `organizationId` field.

This means:
1. Once auth exists, any authenticated user can read/modify anyone else's records (IDOR).
2. Audit trail is non-existent — can't tell who placed an order.
3. Multi-tenancy is purely theoretical at the data layer.

## Additional schema bugs

- `Order`, `Signal`, `Backtest`, `RiskEvent`, `AuditLog` models have NO indexes on hot lookup columns (symbol, status, createdAt) — full-scan on every query.
- 20+ fields stored as `String` instead of Prisma `enum` (User.role, Order.side, Order.orderType, Order.status, RiskProfile.tradingMode, etc.) — no DB-level validation.
- `Order` has no foreign key to `User` / `Asset` — referential integrity not enforced.
- `Signal` has no foreign key to `Strategy` (only by string `strategyKey`).
- No `Watchlist` model — watchlists are in-memory only in `store.ts:91-93` (won't survive restart). The Phase 1 issue brief explicitly required this.
- `MarketCandle` and `MarketQuote` models exist but are unused — `store.ts` uses in-memory caches. Persistence is incomplete.

## Fix

1. Add `userId String` + `organizationId String` (with foreign keys) to all trade models.
2. Add `@@index([userId])` + `@@index([organizationId])` to every trade model.
3. Add `@@index([symbol])` + `@@index([status])` + `@@index([createdAt])` to Order/Signal/Backtest.
4. Convert string fields to enums (User.role, Order.side, Order.orderType, Order.status, RiskProfile.tradingMode, etc.).
5. Add the missing `Watchlist` model.
6. Generate a Prisma migration that adds these columns (with a default user/org for existing rows).

## Severity rationale

**Critical** — multi-tenancy is claimed but unenforced. Once real users are onboarded, any user can see any other user's trades."""
    },
    {
        "title": "[P0/trading-safety] store.ts is in-memory only — all trade state lost on server restart",
        "labels": ["priority/P0", "data-integrity", "backend"],
        "body": """## Root cause

`src/lib/aurevia/store.ts:63-116` — all trade state (`orders`, `signals`, `backtests`, `portfolio`, `riskProfile`, `riskEvents`, `watchlists`) is in-memory only. On Vercel serverless, every cold start wipes everything:

- Open orders vanish.
- Portfolio resets to the default $100k cash.
- Risk profile reverts to defaults.
- Backtest history is gone.
- Watchlists are wiped.

The Prisma schema defines `Order`, `Signal`, `Backtest`, `RiskEvent`, `AuditLog` models but they are NEVER written to. Persistence is incomplete.

## Additional bugs in store.ts

- `candleCache: Map<string, Candle[]>` never evicted — memory leak for varying `bars` param.
- `submitOrder` has no transactions / no mutex — concurrent POST /portfolio requests can both pass risk checks on stale state.
- `recordRiskEvent` doesn't truncate `context` size — `JSON.stringify(context)` could be huge.
- Retention limits are inconsistent (orders: 200, backtests: 50, riskEvents: 100).
- `resetPortfolio()` doesn't clear signals/orders/backtests — partial reset.

## Fix

1. Refactor `store.ts` to read/write through Prisma instead of in-memory `Map`s.
2. For perf-critical paths (real-time tick cache, ML predictions), keep a small in-memory LRU cache but back it with Prisma.
3. Add a transaction around `submitOrder`:
   ```ts
   await db.$transaction(async (tx) => {
     const portfolio = await tx.portfolioSnapshot.findFirst(...);
     const risk = evaluateRisk(portfolio, ...);
     if (!risk.ok) throw new Error(risk.reason);
     const order = await tx.order.create({ ... });
     await applyFill(order, tx);
   });
   ```
4. Standardize retention to 500 across all collections.
5. Make `resetPortfolio()` wipe signals/orders/backtests too (with a `confirm` flag).

## Severity rationale

**Critical** — losing open orders + portfolio on every cold start makes the platform unusable for real trading."""
    },
    # ---------------- HIGH (P1) — batched ----------------
    {
        "title": "[P1/backend] High-severity API bugs — missing try/catch, IDOR, DoS vectors",
        "labels": ["priority/P1", "backend", "needs-auth-gate"],
        "body": """## Summary

This issue tracks 22 high-severity backend bugs found in the audit. Each is small enough to fix in isolation but they share root causes (missing auth, missing try/catch, missing rate-limit-per-endpoint).

## Bugs (file:line — description)

1. `src/app/api/v1/trends/route.ts:7-34` — No try/catch; if `buildContext` throws, route 500s without logging.
2. `src/app/api/v1/backtests/route.ts:43` — No auth check on POST — DoS vector (expensive backtests).
3. `src/app/api/v1/backtests/route.ts:45` — `await req.json()` not wrapped in try/catch — invalid JSON throws 500.
4. `src/app/api/v1/backtests/[id]/route.ts:7` — No auth check; IDOR once auth exists.
5. `src/app/api/v1/screener/route.ts:103` — No auth check; iterates entire universe — DoS.
6. `src/app/api/v1/ml/route.ts:38` — No auth check on POST; expensive ML predictions.
7. `src/app/api/v1/correlation/route.ts:25` — No auth check; O(N²) Pearson matrix.
8. `src/app/api/v1/signals/route.ts:25` — POST runs `scanSignals` across whole universe — DoS.
9. `src/app/api/v1/signals/route.ts:8-22` — GET has no try/catch; any exception crashes 500 silently.
10. `src/app/api/v1/similarity/[symbol]/route.ts:69` — No auth; expensive O(N) scan.
11. `src/app/api/v1/radar/route.ts:58` — No auth; iterates entire universe.
12. `src/app/api/v1/watchlists/route.ts:103` — No auth on POST; no tenant scoping.
13. `src/app/api/v1/orders/route.ts:7` — No auth; IDOR once auth exists.
14. `src/lib/aurevia/auth/auth-options.ts:35` — CredentialsProvider has no rate-limiting on login attempts — brute-forceable.
15. `src/lib/aurevia/auth/auth-options.ts:53,64` — `as any` casts on auth critical path.
16. `src/lib/aurevia/auth/auth-options.ts:25-27` — `pages.signIn: "/auth/signin"` references a page that does not exist.
17. `src/lib/aurevia/market-data/providers/polygon.ts:91-95` — No response body validation.
18. `src/lib/aurevia/market-data/providers/polygon.ts:52-53` — Candle/quote caches never evicted — memory leak.
19. `src/lib/aurevia/market-data/providers/polygon.ts:86,113` — API key in URL query param — logged by proxies.
20. `src/lib/aurevia/market-data/gateway.ts:53-60` — Provider fallback swallows errors silently — masks real outages.
21. `src/lib/aurevia/backtest/engine.ts:87` — `candles[60]` accessed without bounds check — crashes when length === 60.
22. `src/lib/aurevia/backtest/engine.ts:278` — `Math.random()` for backtest IDs — not collision-safe under concurrent runs.

## Suggested fix order

1. Add `requireAuth()` to all 13 unauthenticated routes (blocked by issue #[P0/backend] All API routes missing auth checks).
2. Add per-endpoint rate limits (backtests: 5/min, ml: 10/min, screener: 5/min, correlation: 10/min).
3. Wrap every `await req.json()` in try/catch.
4. Fix the `candles[60]` bounds bug in backtest engine.
5. Switch backtest IDs to `crypto.randomUUID()`.
6. Implement real response validation in polygon.ts using zod.
7. Move Polygon API key from query param to Authorization header.
8. Add cache eviction (LRU, max 1000 entries) to polygon.ts caches.
9. Log provider fallback events in gateway.ts.
10. Add a brute-force lockout (5 failed attempts → 15-min cooldown) to CredentialsProvider.
11. Create the missing `/auth/signin` page."""
    },
    {
        "title": "[P1/frontend] High-severity UI bugs — missing error states, dead code, broken navigation",
        "labels": ["priority/P1", "frontend"],
        "body": """## Summary

This issue tracks 11 high-severity frontend bugs found in the audit.

## Bugs

1. `src/app/page.tsx:78-105` — No auth gate on home; `/auth/signin` route doesn't exist.
2. `src/app/page.tsx:41-54` — Back button broken: `pushState` loops on every `popstate`.
3. `src/app/page.tsx:1-29` — All 22 views statically imported; no `next/dynamic`, no Suspense → huge initial bundle.
4. `src/components/aurevia/views/markets-view.tsx:174-187` — Loading skeleton rendered AFTER empty `<TableBody>` — empty table appears before skeleton.
5. `src/components/aurevia/views/markets-view.tsx:22` — No `isError` handling; failed query silently renders empty state.
6. `src/components/aurevia/views/asset-detail-view.tsx:50-78` — Infinite skeleton on error — `if (isLoading || !data)` returns skeleton with no `isError` branch.
7. `src/components/aurevia/views/strategies-view.tsx:26-100` — No `isError` handling; failed query shows misleading "No strategies registered" empty state.
8. `src/components/aurevia/views/market-pulse-view.tsx:115-132` — Same infinite-skeleton-on-error pattern.
9. `src/components/aurevia/views/market-pulse-view.tsx:7-13` — `recharts` imported directly at module scope — bundle size concern.
10. `src/components/aurevia/views/brokers-view.tsx:30-53, 88-109` — API secrets persist in state after connect; no disconnect action exposed.
11. `src/components/aurevia/views/ml-view.tsx:15-19` — Duplicate `fetchJson` helper; no error handling.
12. `src/components/aurevia/views/screener-view.tsx:119` — Hydration mismatch from `localStorage` in `useState` initializer.
13. `src/hooks/use-toast.ts` — Dead code; project uses `sonner` (see `layout.tsx:4`).
14. `src/lib/aurevia/hooks/use-aurevia-stream.ts:51-58` — `path: "/"` for socket.io is unusual + no `connect_error` handler.

## Suggested fix order

1. Add auth gate to `page.tsx` + create `/auth/signin` route.
2. Refactor URL sync to only `pushState` on user-initiated view changes.
3. Lazy-load all 22 views via `next/dynamic` with Suspense boundaries.
4. Add `isError` handling to all `useQuery` calls (markets, asset-detail, strategies, market-pulse, ml, alerts, watchlists).
5. Move `recharts` import to per-chart dynamic imports.
6. Clear API secrets in `brokers-view.tsx` after successful connect; add disconnect action.
7. Delete `src/hooks/use-toast.ts` + `src/components/ui/toaster.tsx` + `src/components/ui/toast.tsx` (dead code).
8. Fix hydration in `screener-view.tsx` — move `readSavedScreens()` into a `useEffect`."""
    },
    {
        "title": "[P1/infra] Bundle size optimization — lazy-load heavy deps, move prisma/sharp to devDeps, remove dead deps",
        "labels": ["priority/P1", "bundle-size", "infra"],
        "body": """## Summary

The initial JS bundle includes ~2.5MB of dependencies that should be lazy-loaded or moved to devDependencies.

## Concrete optimizations

### Lazy-load (move from static import to `next/dynamic`)
- `@mdxeditor/editor` (~1.2MB) — only used in settings/brand-voice view.
- `react-syntax-highlighter` (~600KB + refractor grammars) — only used in code-display components.
- `react-markdown` (~200KB) — only used in markdown render paths.
- `framer-motion` (~100KB) — replace with CSS transitions where possible, else lazy-load.
- `recharts` (~400KB) — split per chart; use `next/dynamic` for each chart component.

### Move to devDependencies
- `prisma` (~50MB) — Prisma CLI is a build-time/codegen tool; only `@prisma/client` is runtime.
- `sharp` — Next.js 16 bundles sharp on Vercel; redundant for Vercel deploys. Keep only if self-hosting.

### Remove entirely
- `tailwindcss-animate` — duplicates `tw-animate-css` (already in devDeps). Tailwind v4 uses the latter.
- `uuid` — Node 19+ has `crypto.randomUUID()`.
- `next-intl` — no `messages/` directory or locale config; unused.
- `z-ai-web-dev-sdk` — internal dev SDK; questionable for production.
- `@reactuses/core` — verify usage; possibly unused.

### Other config fixes
- `package.json:2` — `"name": "nextjs_tailwind_shadcn_ts"` should be `"aurevia"`.
- `package.json` — add `"license": "MIT"` to match LICENSE file.
- `package.json` — add `"engines": { "node": ">=20", "bun": ">=1.3" }`.
- `tsconfig.json:13` — `"noImplicitAny": false` undermines `"strict": true`; set to `true`.
- `tsconfig.json:3` — `"target": "ES2017"` should be `"ES2022"`.
- `eslint.config.mjs:11-45` — every meaningful rule is disabled; CI lint is decorative. Re-enable `@typescript-eslint/no-explicit-any`, `no-unused-vars`, `no-console`, `react-hooks/exhaustive-deps`.

## Expected impact

- Initial JS bundle: ~3MB → ~800KB (estimated 70% reduction).
- Build time: faster (fewer deps to bundle).
- Memory: lower per-serverless-instance (fewer modules loaded).

## Verification

Run `bun run build` before + after, compare `.next/static/chunks` sizes."""
    },
    {
        "title": "[P1/docs] ARCHITECTURE.md, README.md, CONTRIBUTING.md all stale — 4 of 7 'Known Limitations' are wrong",
        "labels": ["priority/P1", "docs"],
        "body": """## Summary

The docs are dangerously out of sync with the code. Onboarding users reading these docs will be misled.

## Bugs by file

### `ARCHITECTURE.md`
- Line 98: "No authentication. Single-user demo. NextAuth is available but not wired." — STALE. `src/lib/aurevia/auth/auth-options.ts` has full NextAuth wiring (PrismaAdapter, CredentialsProvider, JWT sessions, bcrypt).
- Line 99: "No ML models. The quant engine is rule-based." — STALE. `src/lib/aurevia/ml/models.ts` implements ALM (logistic) + ARF (random forest) ML models.
- Line 97: "No live WebSocket streaming. Data refreshes via polling." — STALE. `mini-services/aurevia-stream/` + `src/lib/aurevia/hooks/use-aurevia-stream.ts` exist.
- Line 100: "No CI/CD pipeline. This is a dev environment." — STALE. `.github/workflows/ci.yml` exists and runs lint + typecheck + test + build.
- Line 66: Section 4 (Database) lists only 9 models — actual schema has 20+ models (Account, Session, VerificationToken, Organization, Team, Membership, MarketCandle, MarketQuote, MarketFeature, HistoricalPattern, NewsArticle, MarketEvent, PortfolioSnapshot, EventLog, Alert, BrokerConnection, ReconciliationRun all missing).
- Lines 70-84: Section 5 (API Surface) lists only 12 routes — actual app has 20+ routes.

### `README.md`
- Line 141: References `[ISSUES.md](ISSUES.md)` which does NOT exist. Dead link.
- Lines 13-14: Badges are static shields.io URLs that always render "passing". Should be dynamic: `https://github.com/Roy-Wanyoike/Aurevia/actions/workflows/ci.yml/badge.svg`.
- Lines 162-172: Roadmap shows Phase 1 "🔄 In progress" and Phase 2 "📋 Planned" — both are committed per worklog.
- Line 195: "all rights reserved to Roy Wanyoike" — MIT license doesn't use this phrasing.
- Line 76: Quick start uses `bun run db:push` without warning about `--accept-data-loss`.

### `CONTRIBUTING.md`
- Lines 92-97: "Strict typing — no `any`" — but `tsconfig.json:13` has `noImplicitAny: false` and `eslint.config.mjs:12` disables `@typescript-eslint/no-explicit-any`.
- Line 154: "Run `bun run db:push` when modifying schema" — doesn't warn about `--accept-data-loss`.
- Line 166: "The Prisma schema is portable to PostgreSQL — just change `DATABASE_URL`" — FALSE. `provider = "sqlite"` is hardcoded in `schema.prisma:10`; must edit the schema.

## Fix

1. Rewrite `ARCHITECTURE.md` "Known Limitations" section to match reality.
2. Update the database model list to include all 20+ models.
3. Update the API route list to include all 20+ routes.
4. Update README badges to dynamic GitHub Actions URLs.
5. Remove the dead `[ISSUES.md]` link.
6. Sync the roadmap with the actual worklog state.
7. Add a warning box in CONTRIBUTING about `db:push --accept-data-loss`.
8. Fix the Prisma portability claim: "to use PostgreSQL, change `provider = "sqlite"` to `provider = "postgresql"` in `prisma/schema.prisma`, then update `DATABASE_URL`."
9. Either re-enable strict typing in tsconfig/eslint, or remove the "Strict typing" claim from CONTRIBUTING."""
    },
    {
        "title": "[P1/frontend] Missing error boundaries + broken loading states across views",
        "labels": ["priority/P1", "frontend"],
        "body": """## Summary

7 views have the same infinite-skeleton-on-error pattern: `if (isLoading || !data) return <Skeleton/>` with no `isError` check. When the API fails, the user sees a skeleton forever.

## Bugs

1. `src/components/aurevia/views/asset-detail-view.tsx:50-78`
2. `src/components/aurevia/views/market-pulse-view.tsx:115-132`
3. `src/components/aurevia/views/markets-view.tsx:22` (no isError handling at all)
4. `src/components/aurevia/views/strategies-view.tsx:26-100` (shows misleading empty state on error)
5. `src/components/aurevia/views/ml-view.tsx:15-19` (no error handling)
6. `src/components/aurevia/views/alerts-view.tsx:132-146` (delete alert fires immediately, no confirmation)
7. `src/components/aurevia/views/watchlists-view.tsx:72` (no isError handling)
8. `src/components/aurevia/views/orders-view.tsx:165-182` (double empty state — QueryState renders its own AND a second one below)

## Fix

Use the existing `QueryState` component (which has proper `isError` + `onRetry` handling) consistently:

```tsx
if (isLoading) return <QueryState.Skeleton/>;
if (isError) return <QueryState.Error error={error} onRetry={refetch}/>;
if (!data || data.length === 0) return <QueryState.Empty title="No data" description="..."/>;
```

Add a top-level React error boundary in `src/app/layout.tsx` so any unhandled render error shows a friendly fallback instead of a white screen."""
    },
    {
        "title": "[P1/security] Broker adapters return fake account state — UI misled about real broker balances",
        "labels": ["priority/P1", "trading-safety", "backend"],
        "body": """## Summary

`src/lib/aurevia/brokers/alpaca.ts:61-77` and `src/lib/aurevia/brokers/ibkr.ts:57-73` both return hardcoded `$100k cash / $200k-$400k buying power` from `getAccount()` instead of querying the real broker.

## Impact

The UI displays these fake numbers as if they were real broker state. A user could:
1. See a $200k buying power figure, place a $50k order thinking they have the margin, then have the broker reject it (or worse, fill it and trigger a margin call).
2. Be misled about their actual cash position.

## Fix

1. Implement real `getAccount()` calls to Alpaca's `/v2/account` endpoint and IBKR's `/portfolio/accounts` endpoint.
2. Return the real `cash`, `buying_power`, `portfolio_value` fields.
3. If the broker call fails, return a clear error state — don't fall back to fake numbers.
4. Add a `lastSyncedAt` timestamp to the UI so users know how fresh the data is.

## Severity rationale

**High** — false account state leads to bad trading decisions with real money."""
    },
    {
        "title": "[P1/backend] In-memory rate limiter leaks memory + doesn't differentiate per-endpoint",
        "labels": ["priority/P1", "backend", "infra"],
        "body": """## Summary

`src/lib/aurevia/rate-limit.ts:11` — in-memory `hits` Map grows unboundedly; old IPs never evicted unless they hit again. Memory leak under unique-IP attack.

Also: single global limit (60/min) doesn't differentiate per-endpoint — expensive endpoints (backtests, ml, screener) get the same budget as cheap ones.

## Fix

1. Add LRU eviction: cap `hits` Map to 10,000 entries; evict oldest on insert.
2. Add per-endpoint limits:
   - `backtests`: 5/min
   - `ml`: 10/min
   - `screener`: 5/min
   - `correlation`: 10/min
   - `radar`: 10/min
   - `similarity`: 10/min
   - default: 60/min
3. Support per-user rate-limit keys (once auth exists).
4. Move rate-limit state to Redis (when `REDIS_URL` is set) so it works across multiple Next.js instances."""
    },
    {
        "title": "[P1/infra] Caddyfile has no TLS + uses non-standard port 81",
        "labels": ["priority/P1", "infra"],
        "body": """## Summary

`Caddyfile`:
- Line 1: listens on `:81` (non-standard port for reverse proxy). Dev-only config.
- No TLS/HTTPS config — production should use 80/443 with TLS.

## Fix

Update Caddyfile for production:

```caddyfile
aurevia.example.com {
    reverse_proxy localhost:3000

    handle /socket.io/* {
        reverse_proxy localhost:3003
    }

    # TLS is automatic via Caddy's Let's Encrypt integration
    # No explicit TLS config needed — Caddy handles it.
}
```

For local dev, keep the current `:81` config but add a comment that it's dev-only."""
    },
    {
        "title": "[P1/infra] tsconfig + eslint disable strict rules — CI lint is decorative",
        "labels": ["priority/P1", "infra", "tech-debt"],
        "body": """## Summary

`tsconfig.json:13` has `"noImplicitAny": false` (undermines `"strict": true` on line 11).
`eslint.config.mjs:11-45` disables every meaningful rule: `@typescript-eslint/no-explicit-any`, `no-unused-vars`, `no-console`, `no-debugger`, `prefer-const`, `no-unreachable`, `react-hooks/exhaustive-deps`.

CI's `bun run lint` passes on essentially any code. CONTRIBUTING.md's "lint must be clean" gate is decorative.

## Fix

1. `tsconfig.json:13`: set `"noImplicitAny": true`.
2. `tsconfig.json:3`: change `"target": "ES2017"` to `"ES2022"`.
3. `eslint.config.mjs`: re-enable all the disabled rules with `'warn'` severity (not `'error'` — to avoid breaking existing CI).
4. Fix the resulting lint warnings in a follow-up PR.
5. Once lint is clean, escalate rules from `'warn'` to `'error'`."""
    },
    {
        "title": "[P1/frontend] Hydration mismatch in screener-view from localStorage in useState initializer",
        "labels": ["priority/P1", "frontend"],
        "body": """## Root cause

`src/components/aurevia/views/screener-view.tsx:119`:
```ts
const [savedScreens, setSavedScreens] = useState(() => readSavedScreens());
```

`readSavedScreens()` reads `localStorage` in the `useState` initializer. The server returns `[]` (no localStorage on server) while the client returns saved screens → hydration mismatch warning in the console, and React may fall back to client-side rendering for the entire tree.

## Fix

Move the read into a `useEffect` after mount:

```ts
const [savedScreens, setSavedScreens] = useState<SavedScreen[]>([]);
useEffect(() => {
  setSavedScreens(readSavedScreens());
}, []);
```

Or use the `useIsMounted` hook pattern:
```ts
const isMounted = useIsMounted();
const savedScreens = isMounted ? readSavedScreens() : [];
```"""
    },
    {
        "title": "[P1/backend] Logs every Prisma query to stdout — production noise + potential PII leak",
        "labels": ["priority/P1", "backend", "infra"],
        "body": """## Root cause

`src/lib/db.ts:10`:
```ts
new PrismaClient({ log: ['query'] })
```

Logs every SQL query to stdout. In production this is:
1. Massive log volume (every API request generates 5-20 query logs).
2. Potential PII leak (user emails, org IDs in WHERE clauses).
3. Costly for log aggregation services (Datadog, CloudWatch).

## Fix

```ts
new PrismaClient({
  log: process.env.NODE_ENV === 'production'
    ? ['error', 'warn']
    : ['query', 'error', 'warn'],
})
```"""
    },
    {
        "title": "[P1/infra] .env.example documents 12+ env vars that are never referenced in code",
        "labels": ["priority/P1", "docs", "infra"],
        "body": """## Summary

`.env.example` documents 12+ env vars that are NOT referenced anywhere in `src/`. Misleading docs — users set them expecting behavior to change, but nothing reads them.

## Unused env vars

- `ALPHA_VANTAGE_API_KEY`
- `FINNHUB_API_KEY`
- `TIINGO_API_KEY`
- `TWELVE_DATA_API_KEY`
- `OANDA_API_KEY` / `OANDA_ACCOUNT_ID` / `OANDA_BASE_URL`
- `COINBASE_API_KEY` / `COINBASE_API_SECRET`
- `IBKR_API_KEY` / `IBKR_API_SECRET` / `IBKR_ACCOUNT_ID` (only `IBKR_BASE_URL` is used)
- `OPENAI_API_KEY`
- `CORS_ALLOWED_ORIGINS`
- `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` / `NEXT_PUBLIC_SENTRY_DSN`
- `REDIS_URL`
- `CSP_REPORT_ONLY`
- `DATABASE_CONNECTION_LIMIT` / `DATABASE_POOL_TIMEOUT`

## Fix

Either:
1. Wire them up (file separate issues for each).
2. Remove them from `.env.example` and add a comment: "Removed — not currently used. Will be added when X is implemented."

Also: `.env.example:15` references `RISK-MANAGEMENT.md` which does not exist."""
    },
    {
        "title": "[P1/infra] Prisma provider hardcoded to sqlite — CONTRIBUTING.md falsely claims portability",
        "labels": ["priority/P1", "infra", "data-integrity", "docs"],
        "body": """## Root cause

`prisma/schema.prisma:10`:
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

`provider` is hardcoded. CONTRIBUTING.md:166 falsely claims "just change `DATABASE_URL`" to switch to PostgreSQL — but the provider must be edited in the schema.

Production may silently deploy to SQLite if the env var points to a SQLite file path.

## Fix

1. Read provider from env var:
   ```prisma
   datasource db {
     provider = env("DATABASE_PROVIDER")
     url      = env("DATABASE_URL")
   }
   ```
2. Add `DATABASE_PROVIDER="sqlite"` (dev) / `"postgresql"` (prod) to `.env.example`.
3. Fix CONTRIBUTING.md:166 to say "to use PostgreSQL, change `DATABASE_PROVIDER` to `postgresql` in your `.env` and update `DATABASE_URL`."
4. Add a CI check that fails if `DATABASE_PROVIDER` is `sqlite` in a production build."""
    },
]

# Step 3: File issues (idempotent — check title first)
print(f"\\n=== Filing {len(ISSUES)} issues ===")
for i, issue in enumerate(ISSUES, 1):
    # Check if an issue with this title already exists
    title_query = urllib.parse.quote(f'in:title repo:{REPO} {issue["title"][:80]}')
    search_url = f"https://api.github.com/search/issues?q={title_query}"
    req = urllib.request.Request(search_url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as resp:
            existing = json.loads(resp.read().decode())
            if existing.get("total_count", 0) > 0:
                print(f"  [{i}/{len(ISSUES)}] already exists: {issue['title'][:70]}...")
                continue
    except Exception:
        pass

    result = api_call("POST", "/issues", {
        "title": issue["title"],
        "body": issue["body"],
        "labels": issue["labels"],
    })
    if result:
        print(f"  [{i}/{len(ISSUES)}] #{result['number']}: {issue['title'][:70]}...")
    else:
        print(f"  [{i}/{len(ISSUES)}] FAILED: {issue['title'][:70]}...")

    time.sleep(0.5)  # be nice to the API

print("\\n=== Done ===")
