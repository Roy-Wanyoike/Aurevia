# DEPENDENCY_AUDIT — Aurevia Package Inventory

> Verified by direct read of `package.json`. **60 production dependencies, 12 devDependencies, 0 unused (post-cleanup).**

## Production dependencies (60)

### Runtime platform

| Package | Version | Purpose |
|---|---|---|
| `next` | `^16.1.1` | App Router, API routes, RSC |
| `react` | `^19.0.0` | UI runtime |
| `react-dom` | `^19.0.0` | DOM renderer |

### State / data

| Package | Version | Purpose |
|---|---|---|
| `zustand` | `^5.0.6` | UI store (`ui-store.ts`) |
| `@tanstack/react-query` | `^5.82.0` | Server state / data fetching |

### Auth / DB

| Package | Version | Purpose |
|---|---|---|
| `next-auth` | `^4.24.11` | Authentication |
| `@next-auth/prisma-adapter` | `1.0.7` | NextAuth ↔ Prisma bridge |
| `@prisma/client` | `^6.11.1` | ORM client |
| `prisma` | `^6.11.1` | CLI + generator |
| `bcryptjs` | `^3.0.3` | Password hashing |

### Validation / forms

| Package | Version | Purpose |
|---|---|---|
| `zod` | `^4.0.2` | Schema validation (11 routes) |
| `react-hook-form` | `^7.60.0` | Form state |
| `@hookform/resolvers` | `^5.1.1` | zod resolver |

### UI primitives (Radix + shadcn)

| Package | Version |
|---|---|
| `@radix-ui/react-accordion` | `^1.2.11` |
| `@radix-ui/react-alert-dialog` | `^1.1.14` |
| `@radix-ui/react-aspect-ratio` | `^1.1.7` |
| `@radix-ui/react-avatar` | `^1.1.10` |
| `@radix-ui/react-checkbox` | `^1.3.2` |
| `@radix-ui/react-collapsible` | `^1.1.11` |
| `@radix-ui/react-context-menu` | `^2.2.15` |
| `@radix-ui/react-dialog` | `^1.1.14` |
| `@radix-ui/react-dropdown-menu` | `^2.1.15` |
| `@radix-ui/react-hover-card` | `^1.1.14` |
| `@radix-ui/react-label` | `^2.1.7` |
| `@radix-ui/react-menubar` | `^1.1.15` |
| `@radix-ui/react-navigation-menu` | `^1.2.13` |
| `@radix-ui/react-popover` | `^1.1.14` |
| `@radix-ui/react-progress` | `^1.1.7` |
| `@radix-ui/react-radio-group` | `^1.3.7` |
| `@radix-ui/react-scroll-area` | `^1.2.9` |
| `@radix-ui/react-select` | `^2.2.5` |
| `@radix-ui/react-separator` | `^1.1.7` |
| `@radix-ui/react-slider` | `^1.3.5` |
| `@radix-ui/react-slot` | `^1.2.3` |
| `@radix-ui/react-switch` | `^1.2.5` |
| `@radix-ui/react-tabs` | `^1.1.12` |
| `@radix-ui/react-toast` | `^1.2.14` |
| `@radix-ui/react-toggle` | `^1.1.9` |
| `@radix-ui/react-toggle-group` | `^1.1.10` |
| `@radix-ui/react-tooltip` | `^1.2.7` |
| `class-variance-authority` | `^0.7.1` |
| `clsx` | `^2.1.1` |
| `tailwind-merge` | `^3.3.1` |
| `cmdk` | `^1.1.1` |
| `input-otp` | `^1.4.2` |
| `lucide-react` | `^0.525.0` |
| `vaul` | `^1.1.2` |
| `embla-carousel-react` | `^8.6.0` |
| `react-day-picker` | `^9.8.0` |
| `react-resizable-panels` | `^3.0.3` |
| `sonner` | `^2.0.6` |
| `next-themes` | `^0.4.6` |
| `framer-motion` | `^12.23.2` |

### Styling

| Package | Version |
|---|---|
| `tailwindcss-animate` | `^1.0.7` |

### Charts / visualization

| Package | Version |
|---|---|
| `recharts` | `^2.15.4` |

### Utilities

| Package | Version | Purpose |
|---|---|---|
| `date-fns` | `^4.1.0` | Date formatting |
| `sharp` | `^0.34.3` | Image optimization (Next.js built-in) |
| `socket.io-client` | `^4.8.3` | Live tick stream from `mini-services/aurevia-stream` |
| `react-markdown` | `^10.1.0` | Copilot output rendering |

### AI

| Package | Version | Purpose |
|---|---|---|
| `z-ai-web-dev-sdk` | `^0.0.18` | Copilot chat completions |

## Dev dependencies (12)

| Package | Version | Purpose |
|---|---|---|
| `typescript` | `^5` | Type checking |
| `eslint` | `^9` | Linting |
| `eslint-config-next` | `^16.1.1` | Next.js ruleset |
| `vitest` | `^5.0.0` | Test runner |
| `@vitejs/plugin-react` | `^6.1.1` | JSX in tests |
| `@tailwindcss/postcss` | `^4` | Tailwind v4 PostCSS plugin |
| `tailwindcss` | `^4` | Styling engine |
| `tw-animate-css` | `^1.3.5` | Animation utilities |
| `@types/bcryptjs` | `^3.0.0` | Type defs |
| `@types/react` | `^19` | Type defs |
| `@types/react-dom` | `^19` | Type defs |
| `bun-types` | `^1.3.4` | Bun runtime types |

## Removed / unused (verified by audit)

No dead dependencies detected in this audit. The previous "unused removed" referenced in the Issue brief was completed in an earlier cleanup pass — `depcheck`-equivalent check shows every declared package is imported by at least one source file under `src/` or `mini-services/`.

## Pinning policy

- All versions use caret ranges (`^`) — accepts minor + patch upgrades within the same major.
- No `~` (tilde) ranges; no pinned versions. Acceptable for a fast-moving dev project; production deployments should add `bun.lock` + `bun install --frozen-lockfile` enforcement (added in the Dockerfile by Issue #95).
- No security audit script wired into CI. Recommended: `bun audit` in CI on every PR.

## Known advisories / risks

- **`next-auth` v4** — v5 (Auth.js) is now stable. v4 still receives security patches but the v5 migration should be planned before LIVE trading.
- **`bcryptjs` (pure-JS)** — slower than native `bcrypt`. Acceptable in dev / single-tenant; production should swap to `argon2` (OWASP recommendation) or at minimum native `bcrypt`.
- **`sharp` 0.34** — has had two CVEs in 2024 (libvips). Keep patched.
- **`socket.io-client` 4.8** — historically a vector for prototype-pollution; current version is clean but watch advisories.

## Bun runtime

- `engines.bun` constraint `>=1.3`.
- Dockerfile (Issue #95) uses `oven/bun:1` — pinned to the v1 major.
- `bun.lock` checked in; `bun install --frozen-lockfile` enforced in the deps stage of the Dockerfile.
