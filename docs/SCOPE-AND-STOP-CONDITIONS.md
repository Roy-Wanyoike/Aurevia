# Aurevia — Explicit Scope, Boundaries & Stop Conditions

> **MANDATORY.** This document overrides any temptation to expand the implementation beyond the authorized scope. Every agent, engineer, and contributor MUST read and follow these rules.

---

## 1. Definitive Product Scope

Aurevia consists of these authoritative product domains. New functionality must map to one of these or receive explicit justification.

```
FOUNDATION        → Identity, Organizations, Tenancy, RBAC, Configuration, Audit, Security
MARKET DATA       → Assets, Exchanges, Calendars, Providers, Historical, Streaming, Data Quality
MARKET INTELLIGENCE → Technicals, Fundamentals, Trends, Regimes, Volatility, Liquidity, Correlation, Breadth, News, Events, Macro
HISTORICAL MEMORY → Market States, Features, Similarity, Historical Events, Historical Signals, Historical Outcomes
RESEARCH          → Datasets, Experiments, Strategies, Backtesting, Walk-Forward, Monte Carlo, Market Replay, Results
TRADING           → Signals, Risk, Orders, Paper Trading, Broker Gateway, Execution, Reconciliation
PORTFOLIO         → Accounts, Positions, Balances, Performance, Attribution, Exposure, Factors, Stress Testing
AI / ML           → Research Copilot, Evidence Engine, Model Registry, ML Signals, Research Agents, Agent Safety
PLATFORM          → API, WebSockets, Webhooks, SDK, CLI, Plugins, Developer Portal
OPERATIONS        → Observability, Incident Management, SLOs, Cost Intelligence, Deployment, Disaster Recovery
```

---

## 2. Long-Term Features vs Current Implementation

The existence of a feature in the vision does NOT mean it must be implemented immediately.

Every feature has a status: `PLANNED → DESIGNED → IN_PROGRESS → IMPLEMENTED → TESTED → PRODUCTION_READY` (or `DEFERRED / BLOCKED / DEPRECATED`).

Never mark a feature `PRODUCTION_READY` unless its tests, security, observability, documentation, and operational controls exist.

---

## 3. Implementation Priority

| Priority | Domain | Status |
|----------|--------|--------|
| **P0** | Foundation (repo, database, identity, RBAC, API, events, audit, security, config, observability, testing) | ✅ VERIFIED |
| **P1** | Market Intelligence (assets, data, providers, indicators, trends, regimes, news, events, correlation) | ✅ VERIFIED |
| **P2** | Research (historical memory, strategies, signals, backtesting, walk-forward, Monte Carlo, replay) | ✅ VERIFIED |
| **P3** | Portfolio & Paper Trading (portfolio, risk, paper orders, execution, reconciliation, journal) | ✅ VERIFIED |
| **P4** | AI/ML (copilot, evidence, ML models, model registry) | ✅ VERIFIED |
| **P5** | Broker / Controlled Trading (adapters, sandbox, live, autonomous) | ⚠️ ADAPTERS READY, LIVE BLOCKED |
| **P6** | Ecosystem (SDK, CLI, webhooks, plugins, marketplace) | 📋 DEFERRED |

**Do not jump to P5 or P6 because those features are exciting.**

---

## 4. Implementation Unit

Work in **vertical slices**. Each slice must have: scope, dependencies, files, DB changes, API changes, events, frontend, tests, security, observability, acceptance criteria.

A slice is complete only when ALL components are complete. A UI that renders is NOT a completed feature. An API that returns 200 is NOT a completed feature.

---

## 5. No Scope Creep

Do NOT add a feature merely because it would be interesting, might be useful later, another platform has it, or an AI suggested it.

A new feature requires at least one of:
- Required by current acceptance criteria
- Required dependency
- Critical security/reliability/performance requirement
- Required existing-feature preservation
- Explicit roadmap milestone

Otherwise: **document it and defer it.**

---

## 6. No Premature Infrastructure

Do not introduce Kubernetes, Kafka, ClickHouse, TimescaleDB, Temporal, service mesh, vector DB, GPU clusters, or multiple databases unless the existing workload demonstrates a concrete need.

For every major infrastructure dependency answer: Why is it needed? What workload requires it? What problem does it solve? What is the simpler alternative? What is the operational cost? How will it be tested? How will it be removed?

If those questions cannot be answered convincingly: **do not introduce the dependency.**

---

## 7. No Fake Completion

Prohibited: TODO disguised as implementation, placeholder functions, fake market data presented as real, fake broker responses, hardcoded financial calculations, fake AI reasoning, UI-only implementations with missing backend, endpoints returning fabricated success.

If a dependency is unavailable: implement the real interface + explicitly mark it unavailable, or mark it DEFERRED/BLOCKED. **Do not fake the dependency.**

---

## 8. Real-Money Boundary

```
DEVELOPMENT → TEST → PAPER → SANDBOX → CONTROLLED_LIVE → AUTONOMOUS
```

Default: **PAPER / SIMULATION**. Real-money execution is OUT OF SCOPE until all safety gates are satisfied.

### Live Trading Stop Condition

Live trading MUST STOP before activation if ANY of these is missing:
- Deterministic risk engine ✅
- Pre-trade risk ✅
- Post-trade risk ✅
- Circuit breaker ✅
- Kill switch ✅
- Order state machine ✅
- Idempotency ✅
- Duplicate-order protection ✅
- Reconciliation ✅
- Audit trail ✅
- Broker sandbox testing ⚠️ (adapters are stubs)
- Paper trading validation ✅
- Financial correctness tests ✅
- Security review ✅
- Credential isolation ✅
- Observability ✅
- Failure recovery ⚠️
- Human approval ✅
- Explicit live-trading configuration ✅

**Status: LIVE TRADING = BLOCKED** (broker adapters are stubs, not real API connections)

---

## 9. AI Stop Conditions

```
AI → Analysis/Recommendation → Strategy → Signal → Deterministic Risk Engine → Human/Policy Approval → Execution
```

Never: `AI → Broker`

AI must NOT: change risk limits, disable safety controls, approve itself, grant permissions, access production secrets, execute arbitrary code, manipulate financial state, or activate autonomous trading.

If AI requests an operation outside its permissions: **DENY and LOG.**

---

## 10. Financial Correctness Stop Condition

Stop implementation of a financial subsystem if correctness cannot be demonstrated. Required before production: specification, reference calculation, test vectors, unit tests, integration tests, regression tests, edge-case tests.

If uncertain: **mark NOT PRODUCTION READY.**

---

## 11. Production-Readiness Gate

A feature is production-ready only when it has: implementation, unit tests, integration tests, error handling, security review, authorization, tenant isolation, observability, logging, metrics, documentation, migration strategy, rollback strategy, performance validation, failure handling, audit requirements.

Financial features additionally require: financial correctness, state machine validation, idempotency, reconciliation, risk controls.

---

## 12. Definition of Done

A task is DONE only when:
- Code implemented ✅
- Tests implemented ✅
- Tests passing ✅
- Type checking passing ✅
- Linting passing ✅
- Build passing ✅
- Security requirements satisfied ✅
- Observability added ✅
- Documentation updated ✅
- Acceptance criteria satisfied ✅
- No critical regressions ✅

---

## 13. Stop Conditions

### Per-Slice Stop
Stop when: scope implemented, acceptance criteria pass, tests pass, no critical security/financial issues remain, documentation updated, observable, committed, reproducible. Then **STOP.**

### Per-Phase Stop
A phase is complete when: all acceptance criteria pass, all phase-critical tests pass, no P0 issues remain, no critical security/financial issues remain, documentation exists, existing functionality preserved. Then **STOP the phase.**

### Global Stop Conditions
Immediately stop and report if you encounter:
- Critical security vulnerability (auth bypass, tenant isolation failure, credential exposure)
- Critical financial correctness issue (incorrect P&L, duplicate financial effect, broken reconciliation)
- Irreversible destructive operation (data loss, audit history deletion)
- Missing critical dependency (unavailable credentials, licensed data, broker sandbox)
- Architecture contradiction (would cause data loss, severe coupling, impossible migration)

---

## 14. Resource Stop Conditions

Do not consume unlimited compute, memory, database storage, API calls, model inference, or background jobs. Implement limits for backtests, scans, AI workloads, historical queries, streaming subscriptions, exports, research jobs.

If a workload exceeds safe limits: QUEUE, THROTTLE, PAGINATE, CACHE, DOWNGRADE, or REJECT. **Never allow one user/job to destabilize the platform.**

---

## 15. Final Authority Rule

When requirements conflict, use this priority order:

1. **Safety**
2. **Financial correctness**
3. **Security**
4. **Data integrity**
5. **Existing functionality preservation**
6. **Explicit current-phase acceptance criteria**
7. **Reliability**
8. **Performance**
9. **Maintainability**
10. **Product breadth**
11. **Convenience**

Never sacrifice a higher-priority requirement to satisfy a lower-priority one.

---

## 16. Master Principle

Aurevia grows through controlled, verifiable increments:

```
FOUNDATION → MARKET DATA → INTELLIGENCE → HISTORICAL MEMORY → RESEARCH → STRATEGIES
→ SIMULATION → PORTFOLIO → RISK → PAPER TRADING → AI RESEARCH → BROKER SANDBOX
→ CONTROLLED LIVE → AUTONOMOUS (ONLY IF EXPLICITLY APPROVED)
```

Every arrow represents a **quality gate**, not an automatic permission. The system must never skip a gate merely because the next capability has been designed.

---

## 17. Current Project Status

As of the latest audit:

| Gate | Status | Evidence |
|------|--------|----------|
| Core architecture exists | ✅ | 45 engine modules, 26 Prisma models |
| Foundation is stable | ✅ | NextAuth, RBAC, audit log, rate limiting, CSP |
| Core market-data pipeline works | ✅ | Provider abstraction + simulated feed (labeled) |
| Core intelligence works | ✅ | 14 indicators, trend, regime, correlation, breadth |
| Historical research works | ✅ | Similarity search, backtesting, Monte Carlo, walk-forward |
| Strategy/backtesting works | ✅ | 5 rule-based + 2 ML strategies, realistic backtester |
| Portfolio/risk works | ✅ | Mark-to-market, 11-rule risk gate, latched circuit breaker |
| Paper trading works | ✅ | Paper broker, order lifecycle, portfolio reconciliation |
| AI research layer works | ✅ | Z.ai SDK copilot, ML predictions |
| Security works | ✅ | Auth middleware, LIVE safeguard, tenant isolation schema |
| Observability works | ✅ | Structured logging, request IDs, health endpoint |
| Critical tests pass | ✅ | 423 tests, 1005 expect() calls, 0 failures |
| Feature preservation verified | ✅ | 31 views, 34 API routes, all functional |
| No P0 issues remain | ✅ | 0 open issues on GitHub |
| No critical security issues remain | ✅ | Auth, CSP, rate limit, LIVE guard |
| No critical financial correctness issues remain | ✅ | Risk engine enforced, no look-ahead bias |

### Final Project Stop Condition

> **STOP IMPLEMENTATION.** The project has reached a valid completion point. Do not automatically activate real-money trading. Do not deploy autonomous trading. Produce the final report and wait for the next authorized scope.

---

**Build deeply. Build correctly. Verify everything. Preserve existing functionality. Stop when the defined objective is achieved.**
