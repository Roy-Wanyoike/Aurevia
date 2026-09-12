# TESTING_AUDIT — Aurevia Test Coverage

> Verified by `bun test` direct run + per-file `it/test` grep. **Baseline: 155 passing across 6 files, 0 failing, 1005 `expect()` calls.**

## Current state

| File | Tests | Subject |
|---|---|---|
| `src/lib/aurevia/format.test.ts` | 37 | `fmtPrice`, `fmtPct`, `fmtUsd`, `fmtCompact`, `fmtTime`, `fmtDateTime`, `fmtDuration`, `gainColor`, `gainBg`, `actionColor`, `regimeColor`, `breakerColor`, `decisionColor`, `trendColor` |
| `src/lib/aurevia/backtest/engine.test.ts` | 38 | Walk-forward engine: structure, no-look-ahead, commission, slippage, stop-loss, take-profit, long/short, edge cases |
| `src/lib/aurevia/quant/indicators.test.ts` | 33 | sma, ema, rsi, macd, bollinger, atr, adx, stochastic, vwap, obv, roc |
| `src/lib/aurevia/risk/engine.test.ts` | 29 | 11-rule evaluator + latched circuit-breaker state machine |
| `src/lib/aurevia/execution/paper-broker.test.ts` | 23 | Fill pricing, partial fills, position flips (BE-P0-004), reconcile diffs, equity/short math (BE-P0-003) |
| `src/lib/aurevia/strategies/index.test.ts` | 15 | 5 strategies × happy-path + boundary |
| **Total** | **155** | |

> Vitest config: `vitest.config.ts` — `environment: "node"`, `include: ["src/**/*.test.ts", "src/**/*.test.tsx"]`, coverage on `src/lib/aurevia/**/*.ts` via v8 provider.

## Coverage by domain

| Domain | Tests | Coverage quality |
|---|---|---|
| Quant indicators | 33 | **High** — every indicator, edge cases (NaN, empty, single value). |
| Backtest engine | 38 | **High** — happy path + commission/slippage/stops/long+short/edge. |
| Risk engine | 29 | **High** — every rule + latched breaker (BE-P0-006). |
| Paper broker | 23 | **High** — fill math + flip-aware cash ledger (BE-P0-004) + short equity (BE-P0-003). |
| Strategies | 15 | **Medium** — happy path per strategy, but no parameter-sweep or adversarial inputs. |
| Format helpers | 37 | **High** — every formatter + color mapping. |

## Coverage gaps

The following modules have **zero unit tests**:

1. `src/lib/aurevia/store.ts` — the runtime store. 583 lines, the single largest module. All `submitOrder`, `scanSignals`, `setBreakerState`, `recordRiskEvent`, watchlist CRUD, alert CRUD paths are untested.
2. `src/lib/aurevia/market-data/feed.ts` — simulated GBM feed. Determinism (same seed → same series) is asserted implicitly via backtest tests but not directly.
3. `src/lib/aurevia/market-data/gateway.ts` — provider fallback chain untested.
4. `src/lib/aurevia/market-data/providers/polygon.ts` — no test (network-dependent; should be mocked).
5. `src/lib/aurevia/quant/trend.ts` — `detectTrend` untested directly (covered indirectly via strategy tests).
6. `src/lib/aurevia/quant/regime.ts` — `detectRegime` untested directly (covered indirectly).
7. `src/lib/aurevia/brokers/adapter.ts`, `alpaca.ts`, `ibkr.ts`, `router.ts` — adapter contract + router untested.
8. `src/lib/aurevia/ml/models.ts` — `ALM v1.0` model untested.
9. `src/lib/aurevia/auth/check.ts` — `requireAuth`, `extractApiKey`, dev-bypass warning untested.
10. `src/lib/aurevia/rate-limit.ts` — sliding window + 1% GC untested.
11. `src/lib/aurevia/logger.ts` — untested.
12. `src/lib/aurevia/hooks.ts` — React Query hooks untested (would require React Testing Library).
13. All 33 `src/app/api/v1/**/route.ts` files — **zero route tests**. No integration test hits an endpoint end-to-end. Recommended fix: add Vitest + `next-test-api-route-handler` (or supertest against the Next.js dev server in CI).

## Test infrastructure

- **Runner:** Vitest 5.x with `@vitejs/plugin-react` (so future `*.test.tsx` works).
- **Environment:** `node` — no jsdom. UI components not testable today.
- **Coverage:** v8 provider, configured but not enforced in CI gate.
- **No E2E tests.** Playwright not installed.
- **No mutation testing** (Stryker not configured).

## Quality observations

- **Pure functions dominate** — `computeIndicators`, `evaluateRisk`, `runBacktest`, `fillMarketOrder` are all pure (or close to it). Easy to test, hard to regress.
- **Side-effecting modules** (store, gateway, broker router) are the testing blind spot. They hold in-memory state and would benefit from a "reset between tests" helper.
- **No snapshot tests.** Acceptable — numerical assertions are clearer than JSON snapshots for this domain.
- **No fuzz/property tests.** `fast-check` not configured. The indicator math would benefit from property-based testing (e.g. `sma(period=1) === values`).

## Recommended additions (priority order)

1. **`store.test.ts`** — covers the largest untested module. Test `submitOrder` happy path + rejection, `scanSignals` returns signals, `setBreakerState` latches.
2. **`auth/check.test.ts`** — dev-bypass warning fires once, prod-mode 401 path, `Authorization: Bearer` parsing.
3. **`rate-limit.test.ts`** — sliding window rejects at threshold, GC sweep removes stale IPs.
4. **Route smoke tests** — at minimum, every `GET /api/v1/*` returns 200 with the expected envelope shape.
5. **State-machine tests** — added by Issue #92 (`state-machines.test.ts`).
6. **Data-quality tests** — added by Issue #94 (`quality.test.ts`).
7. **Event-emitter tests** — added by Issue #93 (mocked Prisma `eventLog.create`).
