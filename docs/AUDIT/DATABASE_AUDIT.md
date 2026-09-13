# DATABASE_AUDIT — Aurevia Prisma Schema Audit

> Verified against `prisma/schema.prisma` line-by-line. Provider hard-coded to `sqlite` for dev (see file comment block — `env()` in `provider` field is rejected by Prisma 6.x, P1012). Production Postgres should use a separate `schema.postgres.prisma` per CD pipeline.

## Model count

**26 models** (matches Issue brief). Grouped by domain:

| # | Model | Domain | Purpose |
|---|---|---|---|
| 1 | `User` | Auth | Email + bcrypt password + role (`trader`/`admin`/`viewer`) |
| 2 | `Account` | NextAuth | OAuth provider linkage (required by NextAuth adapter) |
| 3 | `Session` | NextAuth | JWT session store (although we use JWT strategy, model retained for adapter compat) |
| 4 | `VerificationToken` | NextAuth | Magic-link / passwordless tokens |
| 5 | `Organization` | Multi-tenant | Top-level tenant; `plan` ∈ `free|pro|enterprise` |
| 6 | `Team` | Multi-tenant | Sub-org grouping |
| 7 | `Membership` | Multi-tenant | User↔Org role (`owner|admin|member|viewer`) |
| 8 | `Asset` | Catalog | Tradeable universe (symbol unique, assetType, sector) |
| 9 | `Strategy` | Trading | Strategy catalog (key unique, params JSON) |
| 10 | `Signal` | Trading | Strategy-emitted signals (PENDING/APPROVED/REJECTED/EXPIRED) |
| 11 | `Backtest` | Trading | Run metadata + metrics + equityCurve JSON |
| 12 | `Order` | Trading | Paper-broker orders (9-state lifecycle, see #92) |
| 13 | `RiskProfile` | Risk | Per-tenant risk caps + circuit breaker state + tradingMode |
| 14 | `RiskEvent` | Risk | Breaker triggers, limit breaches |
| 15 | `AuditLog` | Audit | Actor/action/entity trail (NOT used by current code path) |
| 16 | `EventLog` | Audit | Immutable event sourcing (added by Phase-0 schema) |
| 17 | `MarketCandle` | Market data | OHLCV persisted (no writer in code yet) |
| 18 | `MarketQuote` | Market data | Latest quotes (no writer in code yet) |
| 19 | `MarketFeature` | Market data | Indicator snapshots per symbol/TF/time |
| 20 | `HistoricalPattern` | Memory | Historical state snapshots for similarity matching |
| 21 | `NewsArticle` | News | Headline + sentiment + symbols JSON |
| 22 | `MarketEvent` | News | Scheduled earnings/dividends/economic events |
| 23 | `PortfolioSnapshot` | Ops | Periodic equity/positions snapshot |
| 24 | `Alert` | Ops | Price/RSI/changePct alerts (in-memory CRUD in store.ts) |
| 25 | `BrokerConnection` | Ops | Broker credentials ref (never the key itself) |
| 26 | `ReconciliationRun` | Ops | Internal vs external state diff log |

## Index audit

| Model | Indexes | Notes |
|---|---|---|
| `Signal` | `[userId]`, `[organizationId]`, `[symbol, timestamp]` | Hot query: per-symbol recent signals |
| `Backtest` | `[userId]`, `[organizationId]`, `[symbol, createdAt]` | Hot query: user backtest history |
| `Order` | `[userId]`, `[organizationId]`, `[symbol, status]`, `[createdAt]` | Hot query: open orders by symbol |
| `RiskProfile` | `[userId]`, `[organizationId]` | Per-tenant profile lookup |
| `MarketCandle` | `@@unique([symbol, timeframe, time])` + `[symbol, timeframe, time]` + `[time]` | Time-series compound; in Postgres would be a TimescaleDB hypertable |
| `MarketQuote` | `[timestamp]` (symbol is `@unique`) | Latest quote lookup by symbol |
| `MarketFeature` | `@@unique([symbol, timeframe, time])` + `[symbol, time]` + `[regime]` | Regime-based scan |
| `HistoricalPattern` | `[symbol, date]` | Similarity search window |
| `NewsArticle` | `[publishedAt]`, `[source]` | Recent news feed |
| `MarketEvent` | `[scheduledAt]`, `[symbol]`, `[type]` | Calendar view |
| `PortfolioSnapshot` | `[timestamp]`, `[userId, timestamp]`, `[organizationId, timestamp]` | Equity curve |
| `EventLog` | `[eventType, timestamp]`, `[correlationId]` | Audit trace lookup |
| `Alert` | `[active, type]`, `[userId]`, `[organizationId]` | Active alert scan |
| `BrokerConnection` | `@@unique([brokerId, accountId])` | Connection dedup |
| `ReconciliationRun` | `[status, createdAt]` | Pending run lookup |
| `User`, `Account`, `Session`, `VerificationToken`, `Organization`, `Team`, `Membership`, `Asset`, `Strategy`, `RiskEvent`, `AuditLog` | (PK + unique constraints only) | Low-volume tables; no extra indexes needed |

## Constraints

- **Unique:** `User.email`, `Asset.symbol`, `Strategy.key`, `RiskProfile.name`, `MarketQuote.symbol`, `Organization.slug`, `Team.[organizationId, name]`, `Membership.[userId, organizationId]`, `Account.[provider, providerAccountId]`, `VerificationToken.[identifier, token]`, `MarketCandle.[symbol, timeframe, time]`, `MarketFeature.[symbol, timeframe, time]`, `BrokerConnection.[brokerId, accountId]`, `NewsArticle.url`.
- **Cascade deletes:** `Account`, `Session`, `Membership` cascade from `User`/`Organization`; `Team.memberships` SetNull.
- **FK constraints:** every relation has explicit `onDelete` policy.

## Gaps

1. **No write path for several Phase-0 models.** `MarketCandle`, `MarketQuote`, `MarketFeature`, `HistoricalPattern`, `PortfolioSnapshot`, `EventLog` (pre-#93), `AuditLog`, `ReconciliationRun` are defined but **no engine module writes to them**. The runtime store (`store.ts`) is in-memory only — snapshots are lost on every restart.
2. **No tenant row-level security.** `userId` + `organizationId` columns exist on Signal/Backtest/Order/RiskProfile/PortfolioSnapshot/Alert (per Issue #71) but **queries don't filter by them yet**. This is the largest functional gap.
3. **No `Asset` writer.** Catalog is seeded from `market-data/assets.ts` (TypeScript constant) — the `Asset` Prisma model exists but is unused.
4. **`AuditLog` model is dead.** No engine module writes audit records. The `EventLog` model (added in Phase-0) supersedes it but no migration plan has been written to retire `AuditLog`.
5. **SQLite dev limitations.** No native JSON operators, no `JSONB` for `payload`/`indicators`/`positions` columns — they are stored as `String`. Postgres prod migration would benefit from migrating these to `Json` typed columns.
6. **No `bcrypt_hash` history.** `User.hashedPassword` is a single field; no rotation/prior-password tracking.
7. **No soft-delete pattern.** All deletes are hard (`onDelete: Cascade`). For audit-grade trading systems this is risky — a fat-finger DELETE on `Order` rows is unrecoverable.

## Migration policy

`prisma db push` is used in dev (no migration history). Production should switch to `prisma migrate deploy` against `schema.postgres.prisma` once the schema stabilizes. Until then, **never run `db:push:force` against production**.
