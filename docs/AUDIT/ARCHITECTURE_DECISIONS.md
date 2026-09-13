# ARCHITECTURE_DECISIONS — Aurevia Key Decisions

> Decision log — recorded with rationale so future contributors understand *why* a choice was made, not just *what*. Each entry carries an ADR number, status, and date-first-recorded.

## ADR-001 — Modular monolith, not microservices

**Status:** Accepted · **Recorded:** Phase 0

**Context.** Aurevia is a single-user (operator-facing) trading platform. Throughput is bounded by human reaction time, not by horizontal scale. Multi-service decomposition adds operational surface (service discovery, distributed tracing, network failure modes) without buying anything for a system that runs on one VM.

**Decision.** Keep all engines in one Next.js application: market-data, quant, strategies, risk, execution, brokers, ml, auth. Each engine lives in `src/lib/aurevia/<domain>/` and exports pure functions. Engines talk to each other through typed function calls, not HTTP.

**Consequences.**
- ✅ One deploy artifact, one log stream, one DB connection pool.
- ✅ Engine-to-engine calls are type-checked by `tsc`.
- ❌ Can't scale the backtest engine independently of the API surface.
- ❌ A fatal bug in one engine crashes the whole process.
- 🔄 Mitigation: every long-running task (backtest, signal scan) is wrapped in try/catch at the route boundary.

## ADR-002 — SQLite in dev, PostgreSQL in production

**Status:** Accepted · **Recorded:** Phase 0 (refined by `prisma/schema.prisma` header comment)

**Context.** Prisma 6.x rejects `provider = env("DATABASE_PROVIDER")` with P1012. The previous attempt (the "#85 fix") silently broke `prisma db push` for every subsequent PR including #71's schema changes.

**Decision.** Hard-code `provider = "sqlite"` in `schema.prisma` for dev. Production Postgres deployments maintain a separate `prisma/schema.postgres.prisma` and run `prisma db push --schema=prisma/schema.postgres.prisma` in their CD pipeline. (Equivalent to how Next.js uses `next.config.prod.ts` overrides.)

**Consequences.**
- ✅ `prisma db push` always works in dev.
- ✅ Production Postgres path is opt-in and explicit.
- ❌ Two schema files must stay in sync — a future PR that adds a model to dev but forgets prod will break the production deploy.
- 🔄 Mitigation: add a CI diff step that asserts `schema.prisma` and `schema.postgres.prisma` have the same model set (provider-agnostic diff).

## ADR-003 — Next.js Route Handlers, not a separate API server

**Status:** Accepted · **Recorded:** Phase 0

**Context.** The dashboard and the API are served from the same domain; same-origin means no CORS config, no separate auth cookie domain, no second deploy target.

**Decision.** Every API surface is a Next.js Route Handler under `src/app/api/v1/*`. No Express, no Fastify, no separate Bun server. The standalone `mini-services/aurevia-stream` socket.io server is the only separate process — and only because Next.js doesn't natively host long-lived WebSocket connections.

**Consequences.**
- ✅ One process, one log stream.
- ✅ Same NextAuth session for UI + API.
- ❌ Edge runtime limits — Prisma adapter doesn't work cleanly on the edge, so middleware is light (request ID + rate limit) and all `requireAuth` happens in the route handler.
- ❌ Long-running backtests block the request — currently acceptable (single-user); for multi-tenant, move to a queue + worker.

## ADR-004 — Prisma, not a hand-rolled query builder

**Status:** Accepted · **Recorded:** Phase 0

**Context.** Aurevia has 26 models with foreign-key relations, cascade policies, and per-tenant filtering needs. Hand-rolling SQL or a query builder would multiply the surface area for N+1 bugs and injection vectors.

**Decision.** Use Prisma 6.x. The schema file is the single source of truth for the data model. Generated client is type-safe end-to-end.

**Consequences.**
- ✅ Type-safe queries (`db.signal.findMany({ where: { userId } })` is checked by `tsc`).
- ✅ Schema migrations are declarative.
- ❌ Prisma 6.x has the `provider` env-var limitation (see ADR-002).
- ❌ SQLite lacks native JSON operators — `payload`, `indicators`, `positions` columns are stored as `String` and parsed with `JSON.parse`. Production Postgres should migrate these to `Json` typed columns.

## ADR-005 — In-memory runtime store with Prisma persistence deferred

**Status:** Accepted · **Recorded:** Phase 1 (issue #71 refined nullable `userId`/`organizationId` columns for forward-compat)

**Context.** Real-time paper trading needs sub-millisecond reads on every tick. Hitting Postgres on every `getQuote`/`getPortfolio` call would be 10-50× slower than in-memory.

**Decision.** `src/lib/aurevia/store.ts` holds the hot path (signals, orders, portfolio, risk profile) in memory. Prisma models exist for durable records (backtests, audit log, broker connections, event log) but writers are deferred until persistence is actually needed.

**Consequences.**
- ✅ Fast hot-path reads.
- ❌ Restart wipes the in-memory state. Backtest history, order history, alerts — all lost.
- 🔄 Mitigation: TECHNICAL_DEBT.md item #7 covers the write-through migration.

## ADR-006 — Pure-function engines + Strategy plugin contract

**Status:** Accepted · **Recorded:** Phase 0

**Context.** Backtests, signal scans, and risk evaluations must be reproducible. If engines held state or had side effects, debugging a single bad signal would require a full-system replay.

**Decision.** Every engine function is pure: `computeIndicators(candles)`, `evaluateRisk(profile, ctx)`, `runBacktest(cfg)`, `Strategy.evaluate(ctx, params)`. The runtime store wraps these and adds side effects (logging, persistence).

**Consequences.**
- ✅ 155 unit tests pass — every engine is testable without mocking.
- ✅ No look-ahead bias in backtests (engine only sees `candles[0..i]`).
- ✅ ML model plugs into the same `Signal` contract — Risk Engine doesn't know whether a Signal came from a rule or a model.

## ADR-007 — Latched circuit breaker (BE-P0-006)

**Status:** Accepted · **Recorded:** Phase 1 fix

**Context.** The previous breaker auto-recovered `TRADING_PAUSED → NORMAL` on the first empty-trigger call. That made the breaker a no-op — a single clean bar after a crash would resume trading.

**Decision.** `nextBreakerState` refuses to auto-recover from `TRADING_PAUSED`. Operator must explicitly move it to `RE_EVALUATING`, then to `NORMAL`. `RE_EVALUATING` auto-recovers; `TRADING_PAUSED` does not.

**Consequences.**
- ✅ A real crash (broker disconnect, daily loss) keeps trading paused until a human acknowledges.
- ❌ Operators must know the recovery procedure — document in operator runbook.

## ADR-008 — LIVE mode requires explicit 2-step confirmation

**Status:** Accepted · **Recorded:** Phase 1 (issues #62, #68)

**Context.** A fat-fingered `tradingMode: "LIVE"` payload could arm the engine against real money without any friction.

**Decision.** Both `/api/v1/brokers` (connect mode=LIVE) and `/api/v1/risk` (updateProfile tradingMode=LIVE) require a `confirmLive: true` flag in the request body. Any other value (false, undefined, missing) returns 403.

**Consequences.**
- ✅ LIVE trading cannot be armed by accident.
- ✅ Logged at WARN with full context (actor, attempted mode, status=FORBIDDEN).
- ❌ Adds one round-trip per LIVE arming. Acceptable — LIVE arming is a once-per-deployment operation.

## ADR-009 — Dark theme by default, shadcn/ui copy-in components

**Status:** Accepted · **Recorded:** Phase 0

**Context.** Operators staring at a trading dashboard for hours need a dark theme. Light backgrounds cause eye strain during long sessions.

**Decision.** Dark theme is the default; `next-themes` toggles via the theme provider. shadcn/ui components are copied in (not installed via CLI) under `src/components/ui/` so the full source is in the repo and customizable.

**Consequences.**
- ✅ Every component is auditable in-tree.
- ✅ Theme tokens centralized in `globals.css`.
- ❌ Updates require manual sync with upstream shadcn/ui registry.
- 🔄 Mitigation: pin `shadcn/ui` to a specific commit when copying.

## ADR-010 — Zod for runtime validation, not class-validator / joi / yup

**Status:** Accepted · **Recorded:** Phase 1

**Context.** Need runtime validation on mutating API routes. Zod has the best TypeScript integration (inferable types), is already used by `react-hook-form`'s resolver, and is the de facto standard for Next.js apps.

**Decision.** All mutating routes use `z.object({ ... }).safeParse(body)`. Refinements used for cross-field validation (`portfolio`, `alerts`, `watchlists`).

**Consequences.**
- ✅ Schema = type — no double-maintenance.
- ✅ 11 routes validated consistently.
- ❌ Zod 4.x had early bugs in 2024 — keep patched.

## ADR-011 — Zustand for UI state, TanStack Query for server state

**Status:** Accepted · **Recorded:** Phase 0

**Context.** Two distinct state categories: ephemeral UI state (which view is open, selected asset, theme) and server-cached state (signals, portfolio, backtests).

**Decision.** Zustand holds UI state in `src/lib/aurevia/ui-store.ts`. TanStack Query holds server state via hooks in `src/lib/aurevia/hooks.ts`.

**Consequences.**
- ✅ Clear separation of concerns.
- ✅ React Query's cache invalidation handles refetch/abort automatically.
- ❌ Two state systems — newcomers need to learn which to use for what.

## ADR-012 — Dockerfile multi-stage with Bun + Next.js standalone

**Status:** Accepted · **Recorded:** Issue #95

**Context.** Production image needs: small surface area, frozen lockfile, no dev dependencies, no source code in the runner stage.

**Decision.** Three-stage Dockerfile: `deps` (installs with `bun install --frozen-lockfile`), `builder` (generates Prisma client + `next build`), `runner` (copies `.next/standalone` + `node_modules` + `public`). Base image `oven/bun:1`.

**Consequences.**
- ✅ Image is ~250MB, not ~1.5GB.
- ✅ Production cannot drift from `bun.lock`.
- ❌ Standalone Next.js requires `output: "standalone"` in `next.config.ts` — verify before deploy.
