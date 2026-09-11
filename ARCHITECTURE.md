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
| Market Data | `lib/aurevia/market-data/` | Deterministic candle generation (GBM + regime switching), quote building, asset catalog | None (pure) |
| Quant | `lib/aurevia/quant/` | SMA, EMA, RSI, MACD, Bollinger, ATR, ADX, Stochastic, VWAP, OBV, ROC; trend + regime detection | None (pure) |
| Strategy | `lib/aurevia/strategies/` | Plugin contract `evaluate(ctx) → Signal \| null`. 5 built-in strategies. | None (pure — never orders) |
| Backtest | `lib/aurevia/backtest/` | Bar-by-bar simulation with slippage, commission, stops, partial fills, full metrics | None (own local state) |
| Risk | `lib/aurevia/risk/` | 11-rule gate + circuit breaker state machine. Only path to APPROVE an order | Mutates breaker state |
| Execution | `lib/aurevia/execution/` | Paper broker (fill matching, reconciliation) + Portfolio manager (positions, equity, P&L) | Mutates portfolio |
| Store | `lib/aurevia/store.ts` | Singleton runtime: caches, signal log, backtest history, portfolio, risk profile | In-memory state |
| API | `app/api/v1/` | REST endpoints exposing each engine | HTTP I/O |
| UI | `components/aurevia/` | Single-page dashboard with 13 views | Client-only |

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

- **Simulated market data only.** No live broker credentials; the paper broker simulates fills. Real broker adapters (IBKR, Alpaca, OANDA, Coinbase) would slot in behind the `PaperBroker` interface.
- **No live WebSocket streaming.** Data refreshes via polling (TanStack Query refetchInterval).
- **No authentication.** Single-user demo. NextAuth is available but not wired.
- **No ML models.** The quant engine is rule-based. ML would plug into the same `MarketContext → Signal` contract.
- **No CI/CD pipeline.** This is a dev environment.

## 8. Definition of Done (current state)

- [x] Architecture: modular, documented, typed contracts
- [x] Market data: deterministic, normalized, regime-aware
- [x] Quant engine: 14 indicators + trend + regime
- [x] Strategies: 5 plugins, modular, no order side-effects
- [x] Backtesting: realistic costs, full metrics, no look-ahead
- [x] Risk: 11-rule gate + circuit breaker state machine
- [x] Execution: paper broker + portfolio reconciliation
- [x] Portfolio: mark-to-market, P&L, exposure, drawdown
- [x] Observability: health endpoint + system view
- [x] UI: 13 views, dark theme, responsive
- [ ] Real broker integration (future)
- [ ] ML predictions (future)
- [ ] Auth + multi-tenant (future)
- [ ] Live trading mode (future, requires safeguards)
