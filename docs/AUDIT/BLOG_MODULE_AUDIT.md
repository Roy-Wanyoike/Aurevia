# AUDIT: Blog/CMS Module + Production-Readiness Pass

> Multi-agent audit conducted against `main` @ `0694769` after the Research Hub (Blog/CMS) module landed.
> Covers new issues introduced by the blog module + verification of which prior `TECHNICAL_DEBT.md` items remain open.
> Findings feed the GitHub issues under the `audit/blog-module-production-readiness` milestone.

## Scope

Three parallel audit agents inspected the codebase:

1. **Backend / API / DB** (Principal Backend Engineer) — 21 findings (BE-001 to BE-021)
2. **Frontend / UI / a11y** (Staff Frontend Engineer + UX Designer) — 25 findings (FE-001 to FE-025)
3. **Security** (Security Engineer) — 19 findings (SEC-001 to SEC-019)

Plus a product differentiation research report (5 unique differentiators, 3 broadening moves, role-based opinions).

## Headline

The blog module is functionally complete but ships with **3 Critical** production-blocking issues (seed route exposed in prod, no DRAFT gating, no role enforcement), plus a structural single-tenant schema that contradicts the existing `requireTenant()` contract the rest of the v1 surface already calls.

## Criticals (must-fix before user onboarding)

| ID | Title | Area |
|---|---|---|
| BE-001 / SEC-015 | Blog seed route is reachable in production | Backend |
| BE-002 | DRAFT articles are readable by any caller in production | Backend |
| BE-003 / SEC-001 | No role / ownership enforcement on blog mutations | Backend |
| BE-019 | Blog module ships with no unit or integration tests | Backend |
| FE-001 | `useBlogChat` effect re-fires on every render, flooding socket with join/leave | Frontend |
| FE-002 | Blog-module toasts are silently dropped (legacy useToast never mounted) | Frontend |
| FE-003 / SEC-008 | `react-markdown` in blog article view renders without `rehype-sanitize` | Frontend |
| SEC-002 | 3 critical + 46 high dependency vulnerabilities (`next`, `next-auth`, `sharp`) | Security |
| SEC-010 | Mini-services accept unauthenticated socket connections | Security |
| SEC-013 | `NEXTAUTH_SECRET` silently falls back to dev secret in compose | Security |

## Highs

| ID | Title | Area |
|---|---|---|
| BE-004 | `ai-assist` mutates any article by ID without ownership check | Backend |
| BE-005 | Blog schema is structurally single-tenant (no `organizationId`) | Backend |
| BE-006 | Article view tracking is non-idempotent and unthrottled per session | Backend |
| FE-004 | Clickable `<Card>` / `<Badge>` lack keyboard / screen-reader semantics | Frontend |
| FE-005 | Sidebar "New Article" doesn't clear `selectedArticleSlug` | Frontend |
| FE-006 | Blog editor has no unsaved-changes guard | Frontend |
| FE-007 | Sonner toaster hardcodes dark-only colors; breaks in light theme | Frontend |
| FE-008 | No `viewport` export → no safe-area handling on iOS | Frontend |
| SEC-003 | `cdn.jsdelivr.net` newly added to CSP `script-src` | Security |
| SEC-004 | CSP `connect-src` allows any http/https/ws/wss origin | Security |
| SEC-005 | Public blog engagement endpoints share the global 60/min rate-limit | Security |
| SEC-016 | Middleware treats all `/api/*` as public | Security |

## TECHNICAL_DEBT verification (spot-checked today)

| ID | Original claim | Status |
|---|---|---|
| TD #3 | No tenant enforcement in queries | **STILL OPEN** — `withTenantFilter()` is never called anywhere |
| TD #4 | `requireAuth()` on only 6/33 routes | **LARGELY FIXED** — now called in 27 of 60 v1 route files; gaps remain |
| TD #5 | No row-level role enforcement | **STILL OPEN** — no `requireRole` helper exists |
| TD #6 | CSP `unsafe-inline` / `unsafe-eval` | **STILL OPEN + WORSENED** — `cdn.jsdelivr.net` newly added |
| TD #7 | In-memory store loses state on restart | **STILL OPEN** |
| TD #8 | `AuditLog` model is dead code | **FIXED** — writer exists at `audit/logger.ts` |
| TD #9 | No client-order idempotency | **STILL OPEN** |
| TD #10 | Health endpoint leaks operational data | **STILL OPEN** |
| TD #11 | Copilot markdown output not sanitized | **STILL OPEN** — extends to blog surface now (FE-003) |
| TD #12 | No distributed rate-limit backend | **STILL OPEN** |
| TD #15 | State machine logic is implicit | **PARTIALLY FIXED** — `state-machines/` exists; blog doesn't use it |

## Recommended fix order

1. **Phase A — Security baseline** (1 sprint): BE-001, BE-002, BE-003, SEC-002 (dep upgrade), SEC-013, SEC-016, FE-003 (rehype-sanitize)
2. **Phase B — UX polish** (1 sprint): FE-001, FE-002, FE-005, FE-006, FE-007, FE-008
3. **Phase C — Test coverage** (1 sprint): BE-019, BE-020, BE-021
4. **Phase D — Architecture debt** (2+ sprints): TD #3 (tenant), TD #7 (persistence), TD #9 (idempotency)

See the per-area reports below for full details.
