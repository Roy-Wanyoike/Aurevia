# Task 10-views — Agent: Z.ai Code

## Objective
Build the remaining 12 Aurevia dashboard view components:
markets, asset-detail, strategies, backtests, signals, trends, regimes, risk,
portfolio, orders, system, settings.

## Inputs read
- `src/lib/aurevia/hooks.ts` — all hooks + types (MarketAsset, AssetDetail, SignalRow, BacktestSummary, RunBacktestInput)
- `src/lib/aurevia/format.ts` — fmtPrice, fmtPct, fmtUsd, fmtCompact, fmtTime, fmtDateTime, fmtDuration, gainColor, gainBg, actionColor, regimeColor, breakerColor, decisionColor, trendColor
- `src/lib/aurevia/ui-store.ts` — useUI() { view, selectedSymbol, selectedBacktestId, setView, openAsset, openBacktest }
- `src/components/aurevia/charts/*` — CandlestickChart, EquityCurve, StatTile, Sparkline
- `src/components/aurevia/views/dashboard-view.tsx` — reference layout / patterns
- `src/components/ui/*` — Card, Badge, Button, Input, Select, Tabs, Table, Progress, AlertDialog, Alert, Switch, ScrollArea, Label

## Files created (all under `src/components/aurevia/views/`)
1. markets-view.tsx
2. asset-detail-view.tsx
3. strategies-view.tsx
4. backtests-view.tsx
5. signals-view.tsx
6. trends-view.tsx
7. regimes-view.tsx
8. risk-view.tsx
9. portfolio-view.tsx
10. orders-view.tsx
11. system-view.tsx
12. settings-view.tsx

## Notable implementation notes
- All views start with `"use client";`, are named-exported matching filename, and wrap content in
  `<div className="space-y-6 p-6">` with `<h2 className="text-2xl font-bold tracking-tight">` headers.
- Used `useUI().openAsset(symbol)` for navigation from markets, trends, signals, portfolio, orders, regimes.
- Used `useUI().openBacktest(id)` + `selectedBacktestId` in backtests-view.
- All action feedback via `toast.success` / `toast.error` from sonner.
- Portfolio reset uses AlertDialog confirm flow.
- Risk profile editor + settings trading-mode selector use child components (`RiskProfileForm`,
  `TradingModeSelector`) with `useState(initial)` lazy init to avoid `react-hooks/set-state-in-effect`
  lint violation. Rendered with `key={data ? "loaded" : "empty"}` so they mount once after data arrives.
- Risk events are rendered directly from `data.events` (no local mirror) for the same reason.
- System view uses a deterministic faux latency series for the sparkline.
- Orders view shows positions as FILLED-order proxies plus lifecycle reference (no dedicated hook).

## Lint result
`bun run lint` — passes clean (0 errors, 0 warnings) after the two setState-in-effect fixes.

## Dev server
Last log line: `✓ Compiled in 219ms` — all modules resolve.

## Status: COMPLETED
