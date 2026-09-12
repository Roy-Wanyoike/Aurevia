# FEATURE_INVENTORY — Aurevia Feature Status

> Verified by direct file inspection. Statuses:
> - **IMPLEMENTED** — code is present and exercised in tests or routes.
> - **VERIFIED** — IMPLEMENTED + covered by automated tests.
> - **DEFERRED** — designed in schema/interface but no working code path.

## Market Data

| Feature | Status | Location | Notes |
|---|---|---|---|
| Deterministic simulated feed (GBM + regime-switch) | VERIFIED | `market-data/feed.ts` | 18-asset universe, Mulberry32 PRNG |
| Multi-provider gateway w/ fallback | IMPLEMENTED | `market-data/gateway.ts` | Polygon → Simulated chain |
| Polygon provider (real REST) | IMPLEMENTED | `market-data/providers/polygon.ts` | Activated by `POLYGON_API_KEY` |
| Alpaca / Finnhub providers | DEFERRED | `gateway.ts` (commented) | Commented `// new AlpacaProvider()` |
| OHLCV candle cache | IMPLEMENTED | `store.ts` `candleCache` | In-memory only; lost on restart |
| Live tick stream | IMPLEMENTED | `mini-services/aurevia-stream` + `hooks/use-aurevia-stream.ts` | socket.io on `:3003` |
| MarketCandle / MarketQuote persistence | DEFERRED | `prisma/schema.prisma` | Models exist; no writer pipeline |

## Quant / Indicators

| Feature | Status | Location | Tests |
|---|---|---|---|
| sma, ema, rsi, macd, bollinger, atr, adx, stochastic, vwap, obv, roc | VERIFIED | `quant/indicators.ts` | 33 |
| Trend detection (direction, strength, breakout/breakdown, support/resistance) | IMPLEMENTED | `quant/trend.ts` | — |
| Regime classifier (11 states incl. CRASH) | IMPLEMENTED | `quant/regime.ts` | — |

## Strategies

| Feature | Status | Location | Tests |
|---|---|---|---|
| Strategy plugin contract | IMPLEMENTED | `strategies/base.ts` | — |
| momentum | VERIFIED | `strategies/index.ts` | 15 (combined) |
| trend-following | VERIFIED | `strategies/index.ts` | 15 |
| ma-crossover (EMA12/26) | VERIFIED | `strategies/index.ts` | 15 |
| mean-reversion (Bollinger) | VERIFIED | `strategies/index.ts` | 15 |
| breakout | VERIFIED | `strategies/index.ts` | 15 |
| Strategy state machine (DRAFT → PRODUCTION → DEGRADED) | DEFERRED | — | Not yet implemented (see #92) |

## ML

| Feature | Status | Location | Notes |
|---|---|---|---|
| Logistic Momentum Model (ALM v1.0) | IMPLEMENTED | `ml/models.ts` | Hand-tuned coefficients |
| ML → Signal adapter (`mlPredictionToSignal`) | IMPLEMENTED | `ml/models.ts` | — |
| Trained XGBoost / LightGBM | DEFERRED | — | Coefficients in code; no model registry |
| Drift monitoring | DEFERRED | — | — |

## Risk Engine

| Feature | Status | Location | Tests |
|---|---|---|---|
| 11-rule evaluator (position, exposure, leverage, loss, drawdown, spread, vol, liquidity, cooldown, mode, breaker) | VERIFIED | `risk/engine.ts` | 29 |
| Post-fill hypothetical check (#27) | VERIFIED | `risk/engine.ts` rules 9–11 | Covered |
| Latched circuit-breaker state machine (BE-P0-006) | VERIFIED | `risk/engine.ts` `nextBreakerState` | Covered |
| Risk profile CRUD via `/api/v1/risk` | IMPLEMENTED | `app/api/v1/risk/route.ts` | zod-validated |
| `confirmLive` 2-step LIVE arming (#62/#68) | IMPLEMENTED | `app/api/v1/risk/route.ts` | 403 without confirm |

## Backtest

| Feature | Status | Location | Tests |
|---|---|---|---|
| Walk-forward engine (no look-ahead) | VERIFIED | `backtest/engine.ts` | 38 |
| Commission + slippage + partial fills | VERIFIED | `backtest/engine.ts` | Covered |
| Stop-loss / take-profit | VERIFIED | `backtest/engine.ts` | Covered |
| Long + short | VERIFIED | `backtest/engine.ts` | Covered |
| Monte Carlo endpoint | IMPLEMENTED | `app/api/v1/backtests/[id]/monte-carlo/route.ts` | zod-validated |

## Execution / Brokers

| Feature | Status | Location | Notes |
|---|---|---|---|
| PaperBroker + PortfolioManager | VERIFIED | `execution/paper-broker.ts` | 23 tests; flip-aware cash ledger (BE-P0-004) |
| BrokerAdapter contract | IMPLEMENTED | `brokers/adapter.ts` | connect/orders/reconcile |
| BrokerRouter | IMPLEMENTED | `brokers/router.ts` | Paper-first routing |
| Alpaca adapter (live SDK) | DEFERRED | `brokers/alpaca.ts` | Stubbed — `simulateLatency()` instead of HTTP |
| IBKR adapter (TWS/IB Gateway) | DEFERRED | `brokers/ibkr.ts` | Stubbed |
| Reconciliation runs (Prisma model) | DEFERRED | `prisma/schema.prisma` `ReconciliationRun` | No writer |

## Auth / Tenancy

| Feature | Status | Location | Notes |
|---|---|---|---|
| NextAuth CredentialsProvider (bcrypt) | IMPLEMENTED | `auth/auth-options.ts` | JWT sessions, 30-day maxAge |
| API-key `requireAuth` (prod) + dev-bypass | IMPLEMENTED | `auth/check.ts` | One warning per process |
| Demo seed endpoint | IMPLEMENTED | `app/api/v1/auth/seed-demo/route.ts` | 404 in prod |
| Multi-tenant Organizations/Teams/Memberships | DEFERRED | `prisma/schema.prisma` | Models exist; no row-level filtering in queries |
| MFA / TOTP | DEFERRED | — | — |
| SSO (Google/GitHub/SAML) | DEFERRED | `auth-options.ts` (commented) | Stubs only |

## Observability

| Feature | Status | Location | Notes |
|---|---|---|---|
| Structured JSON logger | IMPLEMENTED | `logger.ts` | LOG_LEVEL env |
| Request ID propagation (#67) | IMPLEMENTED | `middleware.ts` | `x-request-id` inbound + response |
| Per-IP rate limit + GC (#79) | IMPLEMENTED | `rate-limit.ts` + `middleware.ts` | 60/min default; 1% sweep |
| EventLog model | IMPLEMENTED | `prisma/schema.prisma` | Schema + types defined (#93 adds emitter) |
| Typed event emitter | IMPLEMENTED | `events/types.ts`, `events/emitter.ts` | Added by #93 |
| CSP headers | DEFERRED | — | Not set in `next.config.ts` |
| OpenTelemetry traces | DEFERRED | — | — |

## Dashboard Views

28 views, all **IMPLEMENTED** (not unit-tested — exercised manually via UI):
dashboard, markets, asset-detail, strategies, strategy-builder, backtests, signals, trends, regimes, risk, risk-cockpit, portfolio, portfolio-analytics, orders, correlation, screener, radar, market-pulse, events, alerts, journal, news, watchlists, brokers, ml, replay, what-if/scenario, copilot, historical-memory, settings, system.

## Hardening gates still open

See `TECHNICAL_DEBT.md` and `RISK_REGISTER.md` for the deferred items that block a production LIVE rollout.
