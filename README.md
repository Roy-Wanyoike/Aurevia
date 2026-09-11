# Aurevia — Market Intelligence Infrastructure

> Market data → Quant analytics → Strategy signals → Risk gate → Controlled paper trading execution.

Aurevia is a modular monolith trading platform built on Next.js 16, TypeScript, Prisma, and shadcn/ui. It demonstrates the full trading pipeline — market intelligence, technical analysis, regime detection, strategy backtesting, risk management, and controlled paper trading — with strict engine boundaries and no look-ahead bias.

## Architecture

```
Market Data Gateway (deterministic simulated feed)
   │
   ▼
Quant Engine (14 indicators + trend + regime)
   │
   ▼
Strategy Engine (5 plugins — momentum, trend, MA crossover, mean-reversion, breakout)
   │  ← strategies NEVER submit orders, they only emit Signals
   ▼
Risk Engine (11-rule gate + circuit breaker state machine)
   │  ← sole path to APPROVE an order
   ▼
Execution Engine → Paper Broker (slippage, commission, partial fills)
   │
   ▼
Portfolio Manager (mark-to-market, P&L, exposure, drawdown, reconciliation)
   │
   ▼
Observability (health, risk events, audit log)
```

## Safety Properties

1. **Default trading mode = PAPER** — never LIVE without explicit configuration
2. **No look-ahead bias** — every indicator at bar `i` uses only `candles[0..i]`
3. **Strategies cannot submit orders** — they emit Signals; the Risk Engine decides
4. **Risk Engine is the sole gate** — 11 hard rules + circuit breaker state machine
5. **Deterministic market data** — seeded PRNG means reproducible backtests
6. **No fabricated financial data** — all prices are simulated and labeled as such

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui (dark-first emerald accent)
- **Database**: Prisma ORM + SQLite (durable records: signals, backtests, orders, risk)
- **Server state**: TanStack Query
- **Client state**: Zustand
- **Charts**: Recharts (candlestick, equity curves, sparklines)

## Quick Start

```bash
# Install dependencies
bun install

# Set up the database
cp .env.example .env
bun run db:push

# Start the dev server
bun run dev
```

Open http://localhost:3000 — the dashboard renders with 18 simulated assets, 5 strategies, full backtesting, paper trading, and risk controls.

## Project Layout

```
src/
├── app/
│   ├── api/v1/              # 11 REST endpoints
│   ├── page.tsx             # Single-page dashboard
│   ├── layout.tsx
│   └── globals.css
├── components/aurevia/
│   ├── views/               # 13 dashboard views
│   ├── charts/              # CandlestickChart, EquityCurve, Sparkline, StatTile
│   ├── sidebar.tsx
│   └── query-provider.tsx
└── lib/aurevia/
    ├── types.ts              # Shared engineering contract
    ├── store.ts              # Singleton runtime
    ├── format.ts             # UI formatting helpers
    ├── ui-store.ts           # Zustand UI state
    ├── market-data/          # Assets + deterministic feed
    ├── quant/                # Indicators + trend + regime
    ├── strategies/           # 5 plugin strategies
    ├── backtest/             # Realistic backtesting engine
    ├── risk/                 # Risk gate + circuit breaker
    └── execution/            # Paper broker + portfolio manager
prisma/
└── schema.prisma             # 9 models
```

## API Surface

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/v1/markets` | Asset universe + live quotes |
| GET | `/api/v1/assets/[symbol]` | Candles + indicators + trend + regime |
| GET | `/api/v1/indicators/[symbol]` | Indicator series for overlays |
| GET | `/api/v1/strategies` | Installed strategy plugins |
| GET/POST | `/api/v1/signals` | List / scan universe |
| GET/POST | `/api/v1/backtests` | List / run backtest |
| GET | `/api/v1/backtests/[id]` | Full backtest detail |
| GET/POST | `/api/v1/portfolio` | State / reset / place order |
| GET/POST | `/api/v1/risk` | Profile + events / mutate |
| GET | `/api/v1/health` | Observability snapshot |
| GET | `/api/v1/trends` | Trend distribution across universe |
| GET | `/api/v1/regimes` | Regime distribution across universe |

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system design, engine boundaries, safety properties
- [`worklog.md`](./worklog.md) — implementation log

## Known Limitations (honest)

- **Simulated market data only** — no live broker credentials; paper broker simulates fills
- **Polling refresh** — no WebSocket streaming yet
- **No authentication** — single-user demo (NextAuth available but not wired)
- **No ML models** — quant engine is rule-based; ML would plug into the same `MarketContext → Signal` contract
- **No CI/CD pipeline** — dev environment

## Roadmap

See the GitHub issues for the full feature roadmap. Aurevia's long-term vision is documented across 6 phases:

1. **Intelligence** — market data, indicators, regimes, historical memory, screener, signals, alerts
2. **Quant** — strategy framework, backtesting, market replay, walk-forward, Monte Carlo, robustness
3. **Portfolio** — portfolio intelligence, risk cockpit, stress testing, what-if simulator, trading journal
4. **Execution** — paper trading, broker adapters, execution engine, reconciliation, circuit breakers, DR
5. **AI** — research copilot, AI signal explanations, ML predictions, model registry, drift detection
6. **Commercial** — multi-tenant SaaS, billing, API/SDK, strategy marketplace, developer platform

## License

Proprietary. All rights reserved.

## Disclaimer

Aurevia is research and engineering infrastructure, NOT financial advice. Trading involves substantial risk of loss. Past performance — including backtested performance — does not guarantee future results. Historical analogs are evidence, not predictions.
