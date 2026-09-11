# Aurevia — Worklog

## Task 10-views (in progress)
Agent: Z.ai Code
Goal: Create the remaining 12 Aurevia view components under `src/components/aurevia/views/`.

## Task 10-views — Z.ai Code — COMPLETED

### Summary
Created all 12 Aurevia dashboard view components under `/home/z/my-project/src/components/aurevia/views/`.
Each view uses the existing hooks (`useMarkets`, `useAsset`, `useStrategies`, `useSignals`, `useScanSignals`,
`useBacktests`, `useBacktestDetail`, `useRunBacktest`, `usePortfolio`, `useResetPortfolio`, `usePlaceOrder`,
`useRisk`, `useUpdateRisk`, `useSetBreaker`, `useHealth`, `useTrends`, `useRegimes`), the format helpers
(`fmtPrice`, `fmtPct`, `fmtUsd`, `fmtCompact`, `fmtTime`, `fmtDateTime`, `fmtDuration`, `gainColor`, `gainBg`,
`actionColor`, `regimeColor`, `breakerColor`, `decisionColor`, `trendColor`), the UI store (`useUI().openAsset`,
`setView`, `openBacktest`), the chart components (`CandlestickChart`, `EquityCurve`, `StatTile`, `Sparkline`),
and the full shadcn/ui component set. All feedback uses `toast` from sonner. No existing files were modified.

### Files created
1. `markets-view.tsx` — Filterable universe screener.
2. `asset-detail-view.tsx` — Single-asset page: candlestick + indicators + trend + regime.
3. `strategies-view.tsx` — Grid of strategy cards.
4. `backtests-view.tsx` — Run form + EquityCurve + metrics + trades + history.
5. `signals-view.tsx` — Filter bar + scan + live feed table.
6. `trends-view.tsx` — Trend distribution + sortable table.
7. `regimes-view.tsx` — Distribution chart + per-regime cards.
8. `risk-view.tsx` — Circuit breaker + profile editor + event log.
9. `portfolio-view.tsx` — Stat tiles + positions + order ticket + reset.
10. `orders-view.tsx` — Lifecycle reference + active orders.
11. `system-view.tsx` — Status banner + subsystems checklist.
12. `settings-view.tsx` — Theme + trading mode + about + architecture flow.

### Lint
`bun run lint` passes clean.

### Dev server
Final log entry: `✓ Compiled in 219ms` — all view modules resolve.

---

## Task 1-9 + 11-12 — Principal Orchestrator (Z.ai) — COMPLETED

### Architecture built
- **Prisma schema** (`prisma/schema.prisma`): User, Asset, Strategy, Signal, Backtest, Order, RiskProfile, RiskEvent, AuditLog. SQLite. `bun run db:push` applied.
- **Types** (`src/lib/aurevia/types.ts`): full typed contract across all engines.
- **Market data** (`src/lib/aurevia/market-data/`): 18-asset catalog (equities/ETFs/crypto/FX), deterministic GBM + regime-switching candle generator (mulberry32 seeded), quote builder.
- **Quant engine** (`src/lib/aurevia/quant/`): SMA, EMA, RSI, MACD, Bollinger, ATR, ADX, Stochastic, VWAP, OBV, ROC — all pure, no look-ahead. Trend detection (direction/strength/duration/momentum/vol/drawdown/support/resistance/breakout/breakdown). Regime detection (11 regimes).
- **Strategies** (`src/lib/aurevia/strategies/`): plugin contract + 5 built-ins (momentum, trend-following, ma-crossover, mean-reversion, breakout). Strategies emit Signals only — never order.
- **Backtest engine** (`src/lib/aurevia/backtest/engine.ts`): bar-by-bar, realistic slippage/commission/partial fills/stops/targets, benchmark comparison, full metrics (Sharpe/Sortino/Calmar/maxDD/winRate/profitFactor/exposure).
- **Risk engine** (`src/lib/aurevia/risk/engine.ts`): 11-rule gate (position/portfolio/leverage/daily+weekly loss/drawdown/spread/vol/liquidity/cooldown/duplicate) + circuit breaker state machine (NORMAL→CAUTION→TRADING_PAUSED→RE_EVALUATING).
- **Execution** (`src/lib/aurevia/execution/paper-broker.ts`): PaperBroker (fill matching, reconciliation) + PortfolioManager (positions, mark-to-market, P&L, exposure, drawdown).
- **Store** (`src/lib/aurevia/store.ts`): singleton runtime tying engines together. Caches candle data, signals, backtests, orders, risk events, portfolio.

### API routes (`src/app/api/v1/`)
11 routes: markets, assets/[symbol], indicators/[symbol], strategies, signals, backtests, backtests/[id], portfolio, risk, health, trends, regimes.

### Frontend
- Dark-first emerald-accent theme (globals.css), theme provider, layout.
- Sidebar (13 nav items in 3 groups) + topbar (PAPER MODE badge).
- 13 views: dashboard, markets, asset detail, strategies, backtests, signals, trends, regimes, risk, portfolio, orders, system health, settings.
- Reusable charts: CandlestickChart (recharts ComposedChart), EquityCurve, StatTile, Sparkline.
- TanStack Query for server state, Zustand for UI state.
- Query invalidation wired for scan/backtest/order/reset mutations.

### Verification (Agent Browser)
- Dashboard renders with live market data, top movers, system status, live signals, regime distribution.
- Markets view: filterable sortable table of 18 assets.
- Asset Analysis: candlestick chart + 12 indicator tiles + trend card + regime card for AAPL.
- Backtests: ran momentum/AAPL backtest → produced equity curve + 20 trades with P&L.
- Risk Engine: circuit breaker controls + profile editor + event log.
- Portfolio: positions table + order ticket + reset.
- System Health: status banner + 8 stat tiles + 8-subsystem checklist.
- Signals: scan produced MSFT BUY signals (trend-following + ma-crossover, risk APPROVED) appearing immediately.
- Settings: trading mode selector + architecture flow diagram.
- No console errors, no runtime errors. Lint clean.

### Documentation
- `ARCHITECTURE.md` — system design, engine boundaries, safety properties, API surface, tech stack, known limitations, definition of done.

### Screenshots (in `/home/z/my-project/download/`)
aurevia-dashboard-final.png, aurevia-markets.png, aurevia-asset-analysis.png, aurevia-strategies.png, aurevia-backtests.png (implicit), aurevia-signals-populated.png, aurevia-trends.png, aurevia-regimes.png (implicit), aurevia-risk-engine.png, aurevia-portfolio.png (implicit), aurevia-system-health.png, aurevia-settings.png.
