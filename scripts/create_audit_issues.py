#!/usr/bin/env python3
"""
Batch-create GitHub issues for the Aurevia audit findings (Criticals + Highs only).
Uses the GitHub REST API via the token configured in the local git remote URL.

Idempotent: skips issues whose title already exists in the repo.
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error

REPO = "Roy-Wanyoike/Aurevia"

def get_token():
    """Extract the GitHub token from the local remote URL."""
    out = subprocess.check_output(
        ["git", "config", "--get", "remote.origin.url"], text=True
    ).strip()
    m = re.search(r"https://[^:]+:([^@]+)@", out)
    if not m:
        print("ERROR: could not parse token from remote URL", file=sys.stderr)
        sys.exit(1)
    return m.group(1)

TOKEN = get_token()

def gh(method, path, body=None):
    url = f"https://api.github.com/repos/{REPO}/{path.lstrip('/')}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"token {TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode()) if resp.status != 204 else {}
    except urllib.error.HTTPError as e:
        return {"_error": e.read().decode(), "_status": e.code}

def list_existing_issue_titles():
    titles = set()
    page = 1
    while True:
        r = gh("GET", f"issues?state=open&per_page=100&page={page}")
        if not isinstance(r, list) or len(r) == 0:
            break
        for issue in r:
            # PRs also appear in this list — skip them
            if "pull_request" not in issue:
                titles.add(issue["title"])
        if len(r) < 100:
            break
        page += 1
    return titles

def create_issue(title, body, labels):
    return gh("POST", "issues", {"title": title, "body": body, "labels": labels})

# ── Issue definitions ──────────────────────────────────────────────────────────
# Each tuple: (title, body, labels)
# Labels: priority + area + audit
ISSUES = [
    # ── CRITICALS ──────────────────────────────────────────────────────────────
    (
        "[CRITICAL][BE-001/SEC-015] Blog seed route is reachable in production",
        """## Summary
`POST /api/v1/blog/seed` only calls `requireAuth(req)`. Unlike `/api/v1/auth/seed-demo` (which returns 404 in production), this route has no `NODE_ENV` gate. Any holder of `AUREVIA_API_KEY` can re-seed the production database with 6 demo articles + 5 categories (with synthetic viewCount/likeCount).

## Location
`src/app/api/v1/blog/seed/route.ts:291-311`

## Recommended fix
Mirror the `seed-demo` pattern: `if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "not_found" }, { status: 404 })` as the first statement. If a prod-side admin "restore default content" action is genuinely desired, gate behind an explicit `admin` role check.

## Acceptance
- [ ] Production `POST /api/v1/blog/seed` returns 404
- [ ] Dev mode still works (one-click seed from empty state)
- [ ] Regression test asserts 404 in `NODE_ENV=production`

## Effort
S (≤30 min)

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` BE-001, SEC-015
- Mirrors pattern in `src/app/api/v1/auth/seed-demo/route.ts:20-27`
""",
        ["audit", "priority:critical", "area:backend", "blog-module"],
    ),
    (
        "[CRITICAL][BE-002] DRAFT articles are readable by any caller in production",
        """## Summary
`GET /api/v1/blog/articles/[slug]` returns the article regardless of `status`. The list endpoint defaults to `status=PUBLISHED`, but the by-slug GET bypasses that filter entirely. A caller who guesses (or scrapes) a draft slug can read unpublished research notes.

## Location
`src/app/api/v1/blog/articles/[slug]/route.ts:33-44` (GET handler)

## Recommended fix
In production, return 404 unless `article.status === "PUBLISHED"` OR `article.authorId === currentUserId` OR `currentRole === "admin"`. Requires threading `resolveCurrentUserId()` into the GET handler — it's currently not even called.

## Acceptance
- [ ] Production GET on a DRAFT slug by a non-author non-admin returns 404
- [ ] Author GET on their own DRAFT returns the article
- [ ] Admin GET on any DRAFT returns the article
- [ ] PUBLISHED articles remain world-readable (in dev)

## Effort
S (≤30 min)

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` BE-002
""",
        ["audit", "priority:critical", "area:backend", "blog-module"],
    ),
    (
        "[CRITICAL][BE-003/SEC-001] No role / ownership enforcement on blog mutations",
        """## Summary
Every blog mutating route calls only `requireAuth(req)`. Because `requireAuth` returns `{ ok: true, principal: "api-key" }` and never inspects role (verified at `auth/check.ts:144-152`), a `viewer`-role principal — or any holder of the shared API key — can create/edit/delete/publish any article or category. There's also no `authorId` ownership check on PATCH/DELETE.

## Location
- `src/app/api/v1/blog/articles/route.ts:173-245` (POST)
- `src/app/api/v1/blog/articles/[slug]/route.ts:79-191` (PATCH)
- `src/app/api/v1/blog/articles/[slug]/route.ts:200-224` (DELETE)
- `src/app/api/v1/blog/categories/route.ts:77-126` (POST)
- `src/app/api/v1/blog/ai-assist/route.ts:48-229`
- `src/lib/aurevia/auth/check.ts:144-152` (`requireAuth` — no role field)

## Recommended fix
1. Add a `requireRole(req, role: "trader" | "admin")` helper that resolves the current user's role from the session (or returns "trader" in dev) and rejects with 403 on mismatch.
2. Gate `POST/PATCH/DELETE` on `articles` and `categories` by `trader+`.
3. Add `authorId === currentUserId` ownership check on PATCH/DELETE (admin bypasses).
4. Gate `ai-assist` by `trader+` and ownership-check the `articleId` (see BE-004).

## Acceptance
- [ ] `viewer`-role user gets 403 on POST/PATCH/DELETE blog routes
- [ ] Non-author `trader` gets 403 on PATCH/DELETE another user's article
- [ ] Admin can mutate any article
- [ ] Dev mode still works (bypasses role check)

## Effort
M (half-day)

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` BE-003, SEC-001
- Extends `docs/AUDIT/TECHNICAL_DEBT.md` #5, `RISK_REGISTER.md` R-07
""",
        ["audit", "priority:critical", "area:backend", "area:security", "blog-module"],
    ),
    (
        "[CRITICAL][FE-001] useBlogChat effect re-fires on every render, flooding socket with join/leave",
        """## Summary
`useBlogChat()` returns a fresh object literal every render. `BlogArticleView`'s `useEffect(() => { chat.joinArticle(slug); return () => chat.leaveArticle(); }, [slug, chat])` therefore re-runs on every parent re-render (every state change, every incoming WS message, every keystroke in the comment box). Each cycle emits `blog:leave-article` then `blog:join-article`, which the mini-service fans out as `blog:reader-left` / `blog:reader-joined` broadcasts to everyone in the article room.

With 10 concurrent readers each typing, this becomes a re-render storm visible to all peers as flickering presence chips.

## Location
- `src/components/aurevia/views/blog-article-view.tsx:111-117, 121-126, 138-149`
- `src/lib/aurevia/hooks/use-blog-chat.ts:161-174`

## Recommended fix
Either memoize the returned object in `useBlogChat` (`useMemo` over the stable callbacks + state), or change the effect deps to `[slug]` and capture `chat` via a ref. Same fix applies to the `identify()` and typing effects.

## Acceptance
- [ ] Opening an article fires `blog:join-article` exactly once
- [ ] Closing the article fires `blog:leave-article` exactly once
- [ ] Typing in the comment box does NOT emit `blog:leave-article` / `blog:join-article`
- [ ] No re-render storm when other peers post comments

## Effort
S (≤30 min)

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` FE-001
""",
        ["audit", "priority:critical", "area:frontend", "blog-module"],
    ),
    (
        "[CRITICAL][FE-002] Blog-module toasts are silently dropped (legacy useToast never mounted)",
        """## Summary
The three new blog views import `useToast` from `@/hooks/use-toast` and call `toast({ title, description })` for every success/error path (seed, save, publish, AI-assist, comment, like, delete). That hook drives the legacy `<Toaster />` component — which is **never mounted** anywhere in the app (`layout.tsx` only renders `<SonnerToaster />`). Result: every blog confirmation toast is enqueued into a reducer with no listener and the user gets zero feedback.

"Seed demo content", "Draft saved", "Article published", "Comment failed" — all invisible.

## Location
- `src/components/aurevia/views/blog-view.tsx:40,81`
- `src/components/aurevia/views/blog-article-view.tsx:40,89`
- `src/components/aurevia/views/blog-editor-view.tsx:45,108`
- `src/app/layout.tsx:62-73` (only `<SonnerToaster />` mounted)
- `src/components/ui/toaster.tsx` (legacy, unused)
- `src/hooks/use-toast.ts` (legacy, unused)

## Recommended fix
Replace all three blog views' `import { useToast } from "@/hooks/use-toast"` with `import { toast } from "sonner"` and call `toast.success(...)` / `toast.error(...)` directly. Then delete the legacy `use-toast.ts` + `toaster.tsx` + `toast.tsx` files (dead code).

## Acceptance
- [ ] All 3 blog views use `sonner`'s `toast` directly
- [ ] "Draft saved" toast appears on save
- [ ] "Article published" toast appears on publish
- [ ] "Comment failed" toast appears on error
- [ ] Legacy `use-toast.ts` + `toaster.tsx` + `toast.tsx` deleted (grep returns 0 imports)

## Effort
S (≤30 min)

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` FE-002
""",
        ["audit", "priority:critical", "area:frontend", "blog-module"],
    ),
    (
        "[CRITICAL][FE-003/SEC-008] react-markdown in blog article view renders without rehype-sanitize",
        """## Summary
Article body markdown is rendered via `<ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content}</ReactMarkdown>` with no `rehypePlugins={[rehypeSanitize]}`. Content sources include (a) the demo seed script, (b) arbitrary authenticated authors, and (c) AI-assist output that replaces content via the `improve` and `generate` actions.

While react-markdown v10 escapes raw HTML by default, it still renders `[click](javascript:...)` links, `[xss](data:text/html,...)` links, and external `[link](https://evil.com)` links with no `target="_blank"` / `rel="noopener noreferrer"`.

This extends `TECHNICAL_DEBT.md` #11 (which only covers Copilot) to the entire new blog surface.

## Location
- `src/components/aurevia/views/blog-article-view.tsx:413-417`
- `src/components/aurevia/views/blog-editor-view.tsx:419-431`
- `package.json` (no `rehype-sanitize` installed)

## Recommended fix
1. Install `rehype-sanitize` (`bun add rehype-sanitize`)
2. Add `rehypePlugins={[rehypeSanitize]}` to both `ReactMarkdown` instances
3. Override the `a` element via the `components` prop to inject `target="_blank" rel="noopener noreferrer"`
4. Apply the same fix to `src/components/aurevia/views/copilot-view.tsx` (TD #11)

## Acceptance
- [ ] `[link](javascript:alert(1))` does NOT execute on render
- [ ] `[link](https://example.com)` opens in a new tab with `rel="noopener noreferrer"`
- [ ] Code blocks, tables, headings render normally
- [ ] Copilot view also sanitized (TD #11 closed)

## Effort
M (half-day — install + test + apply to both views + copilot)

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` FE-003, SEC-008
- Extends `docs/AUDIT/TECHNICAL_DEBT.md` #11, `RISK_REGISTER.md` R-19
""",
        ["audit", "priority:critical", "area:frontend", "area:security", "blog-module"],
    ),
    (
        "[CRITICAL][SEC-002] 3 critical + 46 high dependency vulnerabilities (next, next-auth, sharp)",
        """## Summary
`bun audit` reports **50 critical/high vulnerabilities**. The most dangerous:

| Package | Installed | Patched | Severity | Advisory |
|---|---|---|---|---|
| `next` | 16.1.3 | ≥16.2.5 | Critical | GHSA-2xp9-vwfh-vxw4 (RCE in Image Optimization AVIF), GHSA-p293-qw3h-jr36 (Windows RCE), multiple middleware/proxy bypasses |
| `next-auth` | 4.24.13 | ≥4.24.15 | Critical | GHSA-7rqj-j65f-68wh (email homoglyph @ bypass), GHSA-xmf8-cvqr-rfgj (DoS) |
| `sharp` | <0.35.0 | ≥0.35.0 | High | GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c (libvips/libheif) |
| `lodash` (via recharts) | — | — | High | GHSA-r5fr-rjxr-66jc (`_.template` code injection) |
| `defu`, `flatted`, `deepmerge-ts` | — | — | High | Prototype pollution |

The Next.js middleware bypasses are especially dangerous because the new blog module adds many public endpoints.

## Location
`package.json:70,86` (`next@^16.1.1`, `next-auth@^4.24.11`)

## Recommended fix
1. `bun update next@latest next-auth@latest sharp@latest`
2. Run regression: `bun test`, `bun run lint`, `npx tsc --noEmit`, `bun run e2e`
3. Pin exact versions in `package.json` (drop the `^`)
4. Add `bun audit --audit-level=high` to CI on every PR (R-15)

## Acceptance
- [ ] `bun audit` reports 0 critical + 0 high (or all are documented + accepted risks)
- [ ] All tests pass (`bun test`)
- [ ] Lint passes (`bun run lint`)
- [ ] TypeScript passes (`npx tsc --noEmit`)
- [ ] E2E tests pass (`bun run e2e`)
- [ ] CI runs `bun audit` on every PR

## Effort
M (half-day — update + regression + CI step)

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` SEC-002
- Extends `docs/AUDIT/SECURITY_AUDIT.md`, `RISK_REGISTER.md` R-15
""",
        ["audit", "priority:critical", "area:security", "area:devops"],
    ),
    (
        "[CRITICAL][SEC-013] NEXTAUTH_SECRET silently falls back to dev secret in compose",
        """## Summary
`docker-compose.yml:30` uses `NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-dev-secret-change-in-production}`. The `getNextAuthSecret()` helper (`auth-options.ts:39-45`) returns the same placeholder string instead of throwing in production — despite the SECURITY_AUDIT §7 claim that it "throws in prod if unset". A misconfigured compose deployment silently signs JWTs with a publicly-known secret, allowing full session forgery and account takeover.

## Location
- `docker-compose.yml:30`
- `src/lib/aurevia/auth/auth-options.ts:39-45`

## Recommended fix
1. Remove the `:-` default in `docker-compose.yml` (so compose fails if the env var is missing)
2. Make `getNextAuthSecret()` actually `throw` in production if unset (check at request time, not module load, so Vercel build doesn't break)

## Acceptance
- [ ] Compose fails fast if `NEXTAUTH_SECRET` is missing
- [ ] Production server throws on first request if `NEXTAUTH_SECRET` is unset
- [ ] Dev mode still works with the fallback
- [ ] `getNextAuthSecret()` test asserts the throw

## Effort
S (≤30 min)

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` SEC-013
""",
        ["audit", "priority:critical", "area:security", "area:devops"],
    ),
    # ── HIGHS ──────────────────────────────────────────────────────────────────
    (
        "[HIGH][BE-004] ai-assist mutates any article by ID without ownership check",
        """## Summary
When `articleId` is supplied in the body, `/api/v1/blog/ai-assist` overwrites `aiSummary`, `aiTags`, or `aiSentiment` on whatever article matches that ID — with no check that the caller owns or has admin rights. A malicious caller can pollute another author's AI metadata (e.g. flip someone's bullish article's `aiSentiment` to `bearish`), and each call also burns ZAI LLM tokens on someone else's behalf.

## Location
`src/app/api/v1/blog/ai-assist/route.ts:182-210`

## Recommended fix
Resolve `currentUserId` (the helper already exists in `blog/shared.ts:70`) and assert `article.authorId === currentUserId || role === "admin"` before any `db.article.update`. Also bound `parsed.data.articleId` to a cuid regex to prevent random-string scans.

## Acceptance
- [ ] Non-author gets 403 on `ai-assist` with `articleId` they don't own
- [ ] Admin can run `ai-assist` on any article
- [ ] Invalid `articleId` (not a cuid) returns 400

## Effort
S

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` BE-004
""",
        ["audit", "priority:high", "area:backend", "area:security", "blog-module"],
    ),
    (
        "[HIGH][BE-005] Blog schema is structurally single-tenant (no organizationId)",
        """## Summary
Unlike every other durable table per `DATABASE_AUDIT.md` (Signal, Backtest, Order, RiskProfile, PortfolioSnapshot, Alert all carry nullable `userId` + `organizationId` per Issue #71), none of the 5 new blog models have a `userId` or `organizationId` column. Only `Article.authorId` and `ArticleComment.authorId` exist. The moment a second org onboards, every org sees every article.

The `requireTenant()` contract established for the rest of v1 (see `auth/tenant.ts:42-63`) is structurally impossible to honor on blog queries without a schema migration.

## Location
`prisma/schema.prisma:303-399` (Article, Category, ArticleComment, ArticleLike, ArticleView)

## Recommended fix
1. Add `organizationId String?` + `@@index([organizationId])` to Article, ArticleComment, ArticleLike, ArticleView
2. Thread `withTenantFilter()` (from `auth/tenant.ts`) into every `where` clause
3. Decide whether `Category` is org-scoped or global; document the choice
4. Backfill existing rows with `organizationId = null` (system-owned)

## Acceptance
- [ ] Schema migration runs cleanly
- [ ] Every blog `findMany` / `findUnique` call passes through `withTenantFilter()`
- [ ] Cross-tenant reads return empty (regression test)

## Effort
M

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` BE-005
- Compounds `docs/AUDIT/TECHNICAL_DEBT.md` #3, `RISK_REGISTER.md` R-05
""",
        ["audit", "priority:high", "area:backend", "area:database", "blog-module"],
    ),
    (
        "[HIGH][FE-005] Sidebar New Article doesn't clear selectedArticleSlug (opens existing article in edit mode)",
        """## Summary
Clicking "New Article" in the sidebar calls `setView("blog-editor")` which sets only the `view` field. If the user previously edited an article, `selectedArticleSlug` is still set in the Zustand store (and synced to the URL). The editor view's `isEditing = !!selectedArticleSlug` evaluates true, so the editor loads the previously-opened article instead of starting a blank draft.

Same bug affects the command-palette entry.

## Location
- `src/components/aurevia/sidebar.tsx:111`
- `src/lib/aurevia/ui-store.ts:85` (`setView` only sets `view`)
- `src/components/aurevia/views/blog-editor-view.tsx:109` (`isEditing = !!selectedArticleSlug`)
- `src/components/aurevia/command-palette.tsx:94`

## Recommended fix
Change the sidebar/command-palette handlers to `openBlogEditor(null)` (which clears `selectedArticleSlug` per `ui-store.ts:90-91`) instead of `setView("blog-editor")`. Also consider having `setView("blog-editor")` defensively null out the slug.

## Acceptance
- [ ] After editing an article, clicking "New Article" opens a blank editor
- [ ] URL reflects `?view=blog-editor` (no `article=` param)
- [ ] Command palette "New Article" behaves the same way

## Effort
S

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` FE-005
""",
        ["audit", "priority:high", "area:frontend", "blog-module"],
    ),
    (
        "[HIGH][FE-007] Sonner toaster hardcodes dark-only colors; breaks in light theme",
        """## Summary
`<SonnerToaster toastOptions={{ style: { background: "oklch(0.205 0.014 250)", ... color: "oklch(0.95 0.005 250)" } }}>` bakes in the dark-mode card color. When the user toggles to the light theme via the new `ThemeToggleButton`, toasts render as a dark grey block on a light page — visually jarring and unreadable.

## Location
`src/app/layout.tsx:62-73`

## Recommended fix
Drop the `style` override and pass `theme="system"` (or read from `next-themes`'s `useTheme()`); let Sonner inherit from CSS variables. If a custom style is required, conditionally swap based on the resolved theme.

## Acceptance
- [ ] Toasts render correctly in dark mode
- [ ] Toasts render correctly in light mode
- [ ] No hardcoded oklch colors in the Sonner config

## Effort
S

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` FE-007
""",
        ["audit", "priority:high", "area:frontend"],
    ),
    (
        "[HIGH][FE-008] No viewport export → no safe-area handling on iOS notch / Dynamic Island",
        """## Summary
Next.js 16 requires a separate `export const viewport: Viewport = { ... }` from `layout.tsx` to set `<meta name="viewport">`. Currently there is none, so Next falls back to defaults without `viewport-fit=cover`. On iPhone X+ in PWA mode (or any full-screen mobile browser), content renders under the notch and home indicator.

The Topbar and the mobile Sheet have no `pt-[env(safe-area-inset-top)]` / `pb-[env(safe-area-inset-bottom)]` padding. The "sticky footer rule" can't be honored because there's no footer at all.

## Location
- `src/app/layout.tsx` (no `export const viewport`)
- `src/app/globals.css` (no `env(safe-area-inset-*)` usage)
- `src/components/aurevia/sidebar.tsx:314, 271`

## Recommended fix
1. Add `export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" }` to `layout.tsx`
2. Add `pt-[env(safe-area-inset-top)]` to the Topbar
3. Add `pb-[env(safe-area-inset-bottom)]` to the mobile Sheet content
4. If a sticky footer is mandated, add it to `page.tsx`'s outer `<div className="flex h-screen flex-col">` after `<main>`

## Acceptance
- [ ] Mobile viewport meta includes `viewport-fit=cover`
- [ ] Topbar respects the safe-area top inset
- [ ] Mobile Sheet respects the safe-area bottom inset
- [ ] Verified in iOS Safari (or agent-browser mobile emulation)

## Effort
M

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` FE-008
""",
        ["audit", "priority:high", "area:frontend", "area:mobile"],
    ),
    (
        "[HIGH][SEC-005] No per-route rate limit on blog engagement endpoints (view, like, comment)",
        """## Summary
Public engagement endpoints (view, like, comment POST) ride the same global 60-req/min-per-IP bucket as authenticated API routes. A botnet rotating IPs can inflate view counts, drain likes, or flood comments at 60/min per IP. The rate-limit key is just the first hop of `x-forwarded-for`, trivially spoofable if the LB doesn't overwrite it.

## Location
- `src/app/api/v1/blog/articles/[slug]/{like,view}/route.ts`
- `src/app/api/v1/blog/articles/[slug]/comments/route.ts` POST
- `src/lib/aurevia/rate-limit.ts:18-19`
- `src/middleware.ts:92-122`

## Recommended fix
1. Add per-route limits (e.g. 10/min for like, 30/min for comment POST)
2. Ignore client-supplied `x-forwarded-for` when an upstream trusted proxy sets it
3. Trust Caddy's `X-Real-IP` only
4. Consider per-article-per-IP cap (e.g. max 1 like per article per fingerprint)

## Acceptance
- [ ] Like endpoint rate-limited at 10/min/IP
- [ ] Comment POST rate-limited at 30/min/IP
- [ ] View endpoint rate-limited at 60/min/IP
- [ ] Rate-limit tests pass

## Effort
M

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` SEC-005, BE-006
""",
        ["audit", "priority:high", "area:security", "area:backend", "blog-module"],
    ),
    (
        "[HIGH][SEC-016] Middleware treats all /api/* as public, exempting them from session check",
        """## Summary
`PUBLIC_PATHS` includes `"/api"` and `isPublicPath` uses `pathname.startsWith(p)`, so every `/api/*` route (including `/api/v1/blog/seed`, `/api/v1/admin/*`, `/api/v1/brokers`) bypasses the page-level session cookie check. They still hit the rate limiter (good), but rely entirely on `requireAuth()` inside the route handler — which (per SEC-001 and RISK_REGISTER R-06) is not universally wired up. Defense-in-depth is missing.

## Location
`src/middleware.ts:29-40`

## Recommended fix
Tighten `PUBLIC_PATHS` for `/api` to explicit `/api/v1/health`, `/api/v1/health/*`, and `/api/auth/*`; treat all other `/api/*` as non-public so the session check also runs (in addition to `requireAuth()`).

## Acceptance
- [ ] `/api/v1/blog/seed` triggers the session check
- [ ] `/api/v1/admin/*` triggers the session check
- [ ] `/api/v1/health` remains public
- [ ] `/api/auth/*` remains public

## Effort
S

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` SEC-016
""",
        ["audit", "priority:high", "area:security"],
    ),
    (
        "[HIGH][SEC-010] Mini-services accept unauthenticated socket connections",
        """## Summary
Both `aurevia-stream` (port 3003) and `aurevia-blog-chat` (port 3004) gate only on CORS origin, not socket-handshake auth. Any client from an allowed origin can subscribe to `signals`, `orders`, `risk`, `portfolio`, `health` channels in `aurevia-stream` — channels that should never be public.

Worse, `aurevia-blog-chat` accepts a client-emitted `blog:comment` event and broadcasts it directly to the article room — bypassing the REST API's persistence and validation entirely. An attacker can inject arbitrary comment objects (with any `authorName`, any `content`) into every reader's screen.

## Location
- `mini-services/aurevia-stream/index.ts:30-37, 71-89`
- `mini-services/aurevia-blog-chat/index.ts:33-45, 164-216`

## Recommended fix
1. Add `io.use((socket, next) => verifyJWT(socket.handshake.auth.token))` to both services
2. In `aurevia-blog-chat`, never trust client-emitted `blog:comment` payloads — server should fetch the persisted row from DB by `commentId` and broadcast only after the REST POST succeeds
3. Restrict `risk` / `portfolio` / `orders` channels to authenticated users of the owning organization
4. Remove `clientsCount` from public broadcasts

## Acceptance
- [ ] Both services reject unauthenticated socket connections
- [ ] `blog:comment` client emissions are dropped (server fetches from DB by id)
- [ ] `risk`/`portfolio`/`orders` channels require authenticated session

## Effort
L

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` SEC-010, SEC-012
""",
        ["audit", "priority:high", "area:security", "area:devops", "blog-module"],
    ),
    (
        "[HIGH][BE-019] Blog module ships with no unit or integration tests (zero coverage)",
        """## Summary
No `*.test.ts` exists anywhere under `src/lib/aurevia/blog/` or `src/app/api/v1/blog/`. The only E2E test file (`tests/e2e/api.spec.ts`) covers 4 unrelated endpoints and was last touched before the blog module landed. The blog module adds 10 new route handlers + 1 shared lib + 5 new Prisma models — none of which have any automated coverage.

## Location
All files under `src/app/api/v1/blog/` and `src/lib/aurevia/blog/`

## Recommended fix
Add the following test files (priority order):
1. `src/lib/aurevia/blog/shared.test.ts` — slugify, ensureUniqueSlug, serializeTags/parseTags, getReaderFingerprint, estimateReadingMinutes
2. `src/app/api/v1/blog/articles/route.test.ts` — GET filter matrix; POST validation; footgun guard
3. `src/app/api/v1/blog/articles/[slug]/route.test.ts` — DRAFT visibility (BE-002 regression); PATCH status transitions; DELETE cascade
4. `src/app/api/v1/blog/articles/[slug]/comments/route.test.ts` — parent validation; commentCount increment; pagination
5. `src/app/api/v1/blog/articles/[slug]/like/route.test.ts` — toggle behavior; fingerprint dedup
6. `src/app/api/v1/blog/articles/[slug]/view/route.test.ts` — concurrent view increments; day-key rollup
7. `src/app/api/v1/blog/ai-assist/route.test.ts` — mock ZAI; verify each action parse path; ownership check (BE-004 regression)
8. `src/app/api/v1/blog/dashboard/route.test.ts` — KPI math; viewsByDay 14-day window; tag-cloud cap
9. `src/app/api/v1/blog/categories/route.test.ts` — slug uniqueness; color hex regex rejection
10. `src/app/api/v1/blog/seed/route.test.ts` — idempotency; production 404 gate (BE-001 regression)

## Acceptance
- [ ] At least the `shared.test.ts` + `articles/route.test.ts` + `seed/route.test.ts` files exist and pass
- [ ] Test count grows from 365 → 400+

## Effort
L (1-2 days)

## Audit refs
- `docs/AUDIT/BLOG_MODULE_AUDIT.md` BE-019
- Extends `docs/AUDIT/TESTING_AUDIT.md` gap "zero route tests"
""",
        ["audit", "priority:high", "area:backend", "area:testing", "blog-module"],
    ),
    (
        "[TRACKING] Production-readiness audit — Blog/CMS module + onboarding blockers",
        """## Summary
This is the tracking issue for the multi-agent audit conducted after the Research Hub (Blog/CMS) module landed. The full audit is in `docs/AUDIT/BLOG_MODULE_AUDIT.md`.

Three parallel audit agents inspected the codebase:
1. **Backend / API / DB** (Principal Backend Engineer) — 21 findings (BE-001 to BE-021)
2. **Frontend / UI / a11y** (Staff Frontend Engineer + UX Designer) — 25 findings (FE-001 to FE-025)
3. **Security** (Security Engineer) — 19 findings (SEC-001 to SEC-019)

Plus a product differentiation research report (`docs/AUDIT/BLOG_MODULE_AUDIT.md` §7) with 5 unique differentiators, 3 broadening moves, and role-based opinions.

## Criticals (must-fix before user onboarding)
- BE-001 / SEC-015 — Blog seed route reachable in production
- BE-002 — DRAFT articles readable by any caller in production
- BE-003 / SEC-001 — No role / ownership enforcement on blog mutations
- FE-001 — useBlogChat effect re-fires on every render
- FE-002 — Blog-module toasts are silently dropped
- FE-003 / SEC-008 — react-markdown in blog renders without rehype-sanitize
- SEC-002 — 3 critical + 46 high dependency vulnerabilities
- SEC-013 — NEXTAUTH_SECRET silently falls back to dev secret

## Highs
- BE-004 — ai-assist mutates any article without ownership check
- BE-005 — Blog schema is structurally single-tenant
- BE-019 — Blog module ships with no tests (zero coverage)
- FE-005 — Sidebar "New Article" doesn't clear selectedArticleSlug
- FE-007 — Sonner toaster hardcodes dark-only colors
- FE-008 — No viewport export → no safe-area handling
- SEC-005 — No per-route rate limit on blog engagement endpoints
- SEC-010 — Mini-services accept unauthenticated sockets
- SEC-016 — Middleware treats all /api/* as public

## TECHNICAL_DEBT verification (spot-checked)
- TD #3 (tenant enforcement) — **STILL OPEN**
- TD #4 (requireAuth coverage) — **LARGELY FIXED** (27/60 routes now)
- TD #5 (role enforcement) — **STILL OPEN**
- TD #6 (CSP) — **STILL OPEN + WORSENED** (cdn.jsdelivr.net added)
- TD #7 (in-memory store) — **STILL OPEN**
- TD #8 (AuditLog dead code) — **FIXED**
- TD #9 (no client-order idempotency) — **STILL OPEN**
- TD #10 (health leaks) — **STILL OPEN**
- TD #11 (copilot markdown sanitize) — **STILL OPEN** (extends to blog)
- TD #12 (no distributed rate limit) — **STILL OPEN**
- TD #15 (state machines) — **PARTIALLY FIXED**

## Recommended fix order
1. **Phase A — Security baseline**: BE-001, BE-002, BE-003, SEC-002, SEC-013, SEC-016, FE-003
2. **Phase B — UX polish**: FE-001, FE-002, FE-005, FE-007, FE-008
3. **Phase C — Test coverage**: BE-019, BE-020, BE-021
4. **Phase D — Architecture debt**: TD #3, TD #7, TD #9

## Linked issues
See issues tagged `audit` in this repo. Each individual issue links back to its finding ID.
""",
        ["audit", "priority:critical", "tracking"],
    ),
]

def main():
    print(f"Fetching existing issue titles from {REPO}...")
    existing = list_existing_issue_titles()
    print(f"Found {len(existing)} existing open issues (excluding PRs).")

    created = 0
    skipped = 0
    failed = 0

    for title, body, labels in ISSUES:
        if title in existing:
            print(f"  SKIP (already exists): {title}")
            skipped += 1
            continue
        print(f"  CREATE: {title}")
        result = create_issue(title, body, labels)
        if "_error" in result:
            print(f"    FAILED: {result['_status']} — {result['_error'][:200]}")
            failed += 1
        else:
            print(f"    Created #{result['number']}: {result['html_url']}")
            created += 1

    print(f"\nDone. Created {created}, skipped {skipped}, failed {failed}.")

if __name__ == "__main__":
    main()
