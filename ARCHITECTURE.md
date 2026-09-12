# Aurevia — System Design & Architecture

> Market Intelligence Infrastructure: a market data gateway, quant analytics engine, strategy framework, backtester, risk engine, and controlled paper-trading execution — all behind a single Next.js dashboard.

## 1. Operating Principle

Aurevia is built as a **modular monolith** with strict engine boundaries. Each engine (Market Data → Quant → Strategy → Risk → Execution → Portfolio) is a pure TypeScript module with a typed contract. No engine imports a broker SDK; strategies never submit orders directly; the Risk Engine is the only component that can promote a Signal to an executable order.

```
Market Data Gateway
   │  (provider abstraction + simulated feed)
   ▼
Quant Engine  ──►  Trend Engine  ──►  Regime Engine
   │                                      │
   ▼                                      ▼
              Market Context
                      │
                      ▼
              Strategy Engine  (plugins: momentum, trend, MA crossover, mean-reversion, breakout)
                      │
                      ▼
                   Signal
                      │
                      ▼
              Risk Engine  ──►  APPROVED / REJECTED / PAUSED
                      │                    │
                      │ APPROVED           │ REJECTED
                      ▼                    ▼
              Execution Engine         logged + discarded
                      │
                      ▼
              Paper Broker  (slippage, commission, partial fills)
                      │
                      ▼
              Portfolio Manager  (mark-to-market, P&L, exposure, drawdown)
                      │
                      ▼
              Observability  (health, metrics, risk events)
```

## 2. Engineering Boundaries

| Layer | Module | Responsibility | Side-effects |
|-------|--------|---------------|--------------|
| Market Data | `lib/aurevia/market-data/gateway.ts` + `lib/aurevia/market-data/providers/` | Provider abstraction (Polygon / Alpaca / simulated), deterministic candle generation (GBM + regime switching), quote building, asset catalog | None (pure) |
| Quant | `lib/aurevia/quant/` | SMA, EMA, RSI, MACD, Bollinger, ATR, ADX, Stochastic, VWAP, OBV, ROC; trend + regime detection | None (pure) |
| Strategy | `lib/aurevia/strategies/` | Plugin contract `evaluate(ctx) → Signal \| null`. 5 built-in strategies. | None (pure — never orders) |
| ML | `lib/aurevia/ml/models.ts` | ALM (logistic regression) + ARF (random-forest sketch) predictors. Feature engineering, prob-of-up, expected magnitude, risk score. | None (pure) |
| Backtest | `lib/aurevia/backtest/` | Bar-by-bar simulation with slippage, commission, stops, partial fills, full metrics, walk-forward, Monte Carlo resampling | None (own local state) |
| Risk | `lib/aurevia/risk/` | 11-rule gate + circuit breaker state machine. Only path to APPROVE an order | Mutates breaker state |
| Execution | `lib/aurevia/execution/` | Paper broker (fill matching, reconciliation) + Portfolio manager (positions, equity, P&L, exposure, drawdown) | Mutates portfolio |
| Brokers | `lib/aurevia/brokers/adapter.ts` + `lib/aurevia/brokers/router.ts` + `lib/aurevia/brokers/{alpaca,ibkr}.ts` | BrokerAdapter contract + multi-venue router. Alpaca/IBKR adapters are dev stubs — wire real API calls before enabling LIVE. Paper broker always preferred in dev. | Mutates broker connection state |
| Auth | `lib/aurevia/auth/check.ts` | `requireAuth()` / `checkAuth()` / `unauthorized()`. API-key gate for /api/v1/* in prod, dev-bypass with one-shot warning. 401 echoes `x-request-id`. | Logs warning |
| Logging | `lib/aurevia/logger.ts` | Structured JSON logger with request-id + correlation-id propagation, level filter via `LOG_LEVEL` | stdout |
| Rate limiting | `lib/aurevia/rate-limit.ts` | Sliding-window per-IP (60/min default, configurable via `RATE_LIMIT_PER_MINUTE`). Probabilistic GC of stale IPs (issue #79) | In-memory |
| Store | `lib/aurevia/store.ts` | Singleton runtime: caches, signal log, backtest history, portfolio, risk profile, broker registry, alert engine | In-memory state |
| API | `app/api/v1/` | REST endpoints exposing each engine. Every mutating POST calls `requireAuth()`. | HTTP I/O |
| UI | `components/aurevia/` | Single-page dashboard with 30+ views. Chart-heavy views (Backtests, ML, Copilot, Replay, Strategy Builder) lazy-loaded via `next/dynamic` (issue #75). | Client-only |

## 3. Critical Safety Properties

1. **No look-ahead bias.** Every indicator/trend/regime value at bar `i` is computed from `candles[0..i]` only. The backtester slices the prefix for each step.
2. **Strategies never submit orders.** The `Strategy.evaluate` contract returns only a `Signal`. The Risk Engine decides.
3. **Risk Engine is the single gate.** No order reaches the broker without passing all 11 rules + circuit breaker check.
4. **Default trading mode is PAPER.** `ANALYSIS_ONLY` / `PAPER` / `SANDBOX` / `LIVE` — LIVE requires explicit configuration.
5. **Deterministic market data.** Seeded PRNG (mulberry32) per symbol means every backtest is reproducible.
6. **No fabricated financial data.** All prices are simulated and labeled as such.

## 4. Database

Prisma + SQLite. Durable records: `User`, `Asset`, `Strategy`, `Signal`, `Backtest`, `Order`, `RiskProfile`, `RiskEvent`, `AuditLog`. Market data is ephemeral (in-memory) since it's derived deterministically.

## 5. API Surface (`/api/v1/`)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/markets` | Asset universe + live quotes |
| GET | `/assets/[symbol]` | Candles + indicators + trend + regime |
| GET | `/indicators/[symbol]?name=sma20` | Indicator series for chart overlays |
| GET | `/strategies` | Installed strategy plugins |
| GET/POST | `/signals` | List / scan universe |
| GET/POST | `/backtests` | List / run backtest |
| GET | `/backtests/[id]` | Full backtest detail |
| GET/POST | `/portfolio` | State / reset / place order |
| GET/POST | `/risk` | Profile + events / mutate |
| GET | `/health` | Observability snapshot |
| GET | `/trends` | Trend distribution across universe |
| GET | `/regimes` | Regime distribution across universe |

## 6. Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York), dark-first emerald accent
- **Database**: Prisma ORM + SQLite
- **Server state**: TanStack Query
- **Client state**: Zustand
- **Charts**: Recharts (candlestick via ComposedChart, equity curves, sparklines)

## 7. Known Limitations (honest)

- **Simulated market data only by default.** Real market data flows when a provider API key is set (Polygon / Alpaca). Without it, the deterministic simulated feed runs (clearly labeled).
- **Broker adapters are stubs.** `lib/aurevia/brokers/alpaca.ts` and `lib/aurevia/brokers/ibkr.ts` define the BrokerAdapter contract but do NOT make real API calls — responses are simulated so the platform runs end-to-end. Wiring real network calls is Phase 7.
- **WebSocket streaming available.** The `aurevia-stream` mini-service (port 3003) emits price ticks + signal alerts. Connect from the client via `io("/?XTransformPort=3003")` (Caddy forwards the query param).
- **API auth gate wired.** Every mutating POST (portfolio, risk, brokers, signals, backtests, alerts) calls `requireAuth()`. In dev it bypasses with a one-shot warning; in prod it requires `AUREVIA_API_KEY` header.
- **NextAuth multi-tenant available.** Organizations, Teams, Memberships schema exists; UI for org admin is Phase 10.
- **ML models.** Two ML strategies (ALM logistic, ARF random-forest sketch) are wired into the strategy framework. Drift detection is Phase 8.
- **CI/CD pipeline.** GitHub Actions runs lint + typecheck + 155 tests + build on every PR.

## 8. Definition of Done (current state)

- [x] Architecture: modular, documented, typed contracts
- [x] Market data: deterministic, normalized, regime-aware, provider-abstraction (gateway + providers/)
- [x] Quant engine: 14 indicators + trend + regime
- [x] Strategies: 5 rule-based + 2 ML plugins, modular, no order side-effects
- [x] Backtesting: realistic costs, full metrics, no look-ahead, Monte Carlo + walk-forward
- [x] Risk: 11-rule gate + circuit breaker state machine
- [x] Execution: paper broker + portfolio reconciliation
- [x] Portfolio: mark-to-market, P&L, exposure, drawdown, analytics + risk cockpit
- [x] Brokers: adapter contract + router + Alpaca/IBKR stubs (paper always preferred in dev)
- [x] Auth: API-key gate + NextAuth multi-tenant schema
- [x] Observability: structured logger + rate limiter + health endpoint
- [x] UI: 30+ views, dark theme, responsive, lazy-loaded chart-heavy views, error boundaries
- [x] Market intelligence: watchlists, screener, market pulse, correlation, historical memory, news, events, alerts, radar, replay, what-if
- [x] Quant research: strategy builder, Monte Carlo, replay
- [ ] Real broker integration (Phase 7 — adapters are stubs)
- [ ] Portfolio intelligence: VaR, CVaR, stress testing (Phase 5)
- [ ] Drift detection, model registry (Phase 8 remainder)
- [ ] Live trading mode (Phase 7+, requires safeguards + real adapter)
