# Contributing to Aurevia

Thank you for your interest in contributing to Aurevia! This document covers the development workflow, code standards, and safety requirements.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) v1.1+ (package manager + runtime)
- [Node.js](https://nodejs.org/) v20+ (for Next.js)
- [Git](https://git-scm.com/)

### Initial Setup

```bash
git clone https://github.com/Roy-Wanyoike/Aurevia.git
cd Aurevia
bun install
cp .env.example .env
bun run db:push
```

### Running the Dev Environment

```bash
# Terminal 1: Next.js dev server
bun run dev

# Terminal 2: WebSocket streaming service (for live ticker)
cd mini-services/aurevia-stream && bun run dev
```

Open http://localhost:3000

### Verification Commands

```bash
bun run lint          # ESLint — must be clean
npx tsc --noEmit      # TypeScript — must be 0 errors
bun test              # 155 unit tests — must all pass
```

## Branch Naming

- `fix/<short-description>` — bug fixes (e.g., `fix/circuit-breaker-latch`)
- `feat/<short-description>` — new features (e.g., `feat/polygon-provider`)
- `phase<N>/<short-description>` — phase work (e.g., `phase0/ci-testing`)
- `docs/<short-description>` — documentation only

## Pull Request Process

1. **Create an issue first** — every PR must reference an issue number
2. **Create a branch** from `main` using the naming convention above
3. **Implement + test** — ensure lint, tsc, and tests all pass
4. **Open a PR** using the template (`.github/PULL_REQUEST_TEMPLATE.md`)
5. **Reference the issue** — use `Closes #N` in the PR description
6. **CI must pass** — GitHub Actions runs lint, typecheck, tests, build
7. **Review** — at least one approval required for non-trivial changes
8. **Merge** — squash-merge to keep history clean

### PR Template

```markdown
## Description
Brief description of what this PR changes.

## Related Issue
Closes #(issue number)

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Security fix
- [ ] Documentation
- [ ] Refactor

## Testing
- [ ] `bun run lint` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `bun test` passes
- [ ] Manually tested in browser

## Checklist
- [ ] No hardcoded secrets
- [ ] No hardcoded data (fetched from APIs)
- [ ] Code follows existing style
- [ ] Self-reviewed
```

## Code Standards

### TypeScript

- **Strict typing** — no `any` unless absolutely necessary (add a comment explaining why)
- **Interfaces over types** for object shapes
- **Zod schemas** for all API request/response validation
- **`import type`** for type-only imports

### React / Next.js

- **App Router** — all new routes use `src/app/` directory
- **Server Components by default** — `'use client'` only when needed (state, effects, browser APIs)
- **shadcn/ui** — prefer existing components over custom implementations
- **TanStack Query** for server state, **Zustand** for client state

### Financial Code (Critical)

- **No look-ahead bias** — every indicator at bar `i` uses only `candles[0..i]`
- **Strategies never submit orders** — they emit Signals; the Risk Engine decides
- **Default mode = PAPER** — never change the default to LIVE
- **No fabricated data** — if data is unavailable, show an empty state, not fake numbers
- **Decimal precision** — use `number` for now, but be aware of floating-point issues. Future: consider decimal.js for monetary calculations
- **Determinism** — same inputs must always produce same outputs (seeded PRNG for simulated data)

### API Routes

- **Zod validation** on every POST body
- **try/catch** around every handler
- **Structured JSON errors** — `{ error: string, details?: any }` with proper status codes
- **`force-dynamic`** on routes that read live data
- **Request IDs** — logged via the middleware

### Testing

- **Every financial calculation** must have a unit test with known expected values
- **Every risk rule** must have a test for APPROVED and REJECTED cases
- **Every API route** should have at least one integration test
- Run `bun test` before every commit

### Styling

- **Tailwind CSS 4** — use utility classes, not custom CSS
- **shadcn/ui theme** — use CSS variables (`bg-background`, `text-foreground`), not hardcoded colors
- **Emerald is sacred** — `text-emerald-400` is reserved for gains/approvals only
- **Red is final** — `text-red-400` is reserved for losses/rejections only
- **Tabular numbers** — all prices, P&L, metrics use `tabular` class
- **Dark-first** — the theme is intentionally dark; light mode is a future consideration

## Safety Requirements

### Never Do These

1. **Never commit secrets** — `.env`, API keys, passwords, tokens. The `.gitignore` covers `.env*` (except `.env.example`)
2. **Never enable LIVE trading by default** — `TRADING_MODE` must be `PAPER` in `.env.example`
3. **Never bypass the risk engine** — `submitOrder` must always call `evaluateRisk` first
4. **Never fabricate market data** — if no real data is available, use the simulated feed (clearly labeled)
5. **Never remove existing tests** — fix them if they break, don't delete them
6. **Never introduce microservices without justification** — prefer modular monolith

### Always Do These

1. **Add tests** for new financial calculations
2. **Update `.env.example`** when adding new environment variables
3. **Run `bun run db:push`** when modifying `prisma/schema.prisma`
4. **Document safety properties** in code comments when adding risk rules
5. **Link the issue** in your PR with `Closes #N`

## Architecture Decisions

### Why a Modular Monolith?

Aurevia is a modular monolith — strong domain boundaries (market-data, quant, strategies, risk, execution, portfolio) without the operational complexity of microservices. Modules communicate via typed contracts, not network calls. When a module genuinely needs to scale independently (e.g., market-data ingestion), it can extract to a service without rewriting the domain logic.

### Why SQLite for Dev?

SQLite is zero-config and perfect for local development. The Prisma schema is portable to PostgreSQL for production — just change `DATABASE_URL`. The expanded schema (MarketCandle, MarketQuote, etc.) uses indexes that work on both.

### Why Next.js API Routes?

Co-locating API routes with the frontend simplifies deployment and development. The API routes are thin — they delegate to the engine modules in `src/lib/aurevia/`. When the platform needs to scale, the engine modules can extract to a separate service without changing the API contract.

## Getting Help

- **[Issues](https://github.com/Roy-Wanyoike/Aurevia/issues)** — bugs, feature requests
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — system design
- **[docs/AUDIT/](docs/AUDIT/)** — engineering audit reports (architecture, security, database, testing, risk register)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
