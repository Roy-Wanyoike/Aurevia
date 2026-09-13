#!/usr/bin/env python3
"""File Aurevia audit issues as GitHub issues via the REST API."""
import json
import os
import urllib.request
import urllib.error

TOKEN = os.environ["GH_TOKEN"]
REPO = "Roy-Wanyoike/Aurevia"

ISSUES = [
    {"title": "[P0][UI] No URL routing — view state lost on refresh", "body": "## Problem\nAll view state lives in Zustand (`src/lib/aurevia/ui-store.ts:22-44`) — there is no URL routing. Refreshing the page returns to Dashboard. Back button doesn't work. Backtest results aren't shareable via URL.\n\n## Impact\n- Refresh destroys the user's context\n- Back/forward browser buttons do nothing\n- Can't share a link to a specific backtest, asset, or signal\n\n## Fix\n- Move view state to URL: `/markets`, `/assets/[symbol]`, `/backtests/[id]`, `/signals?symbol=AAPL&strategy=momentum`\n- Add `error.tsx`, `not-found.tsx`, `loading.tsx`\n\n## Acceptance\n- Refreshing `/assets/AAPL` stays on AAPL\n- Back button works\n- Backtest results shareable via URL", "labels": ["P0", "UI/UX", "architecture"]},
    {"title": "[P0][UI] No mobile sidebar drawer — app unusable on phones", "body": "## Problem\n`src/components/aurevia/sidebar.tsx` — sidebar always renders at fixed width. No hamburger menu, no drawer overlay on mobile.\n\n## Impact\n- App is completely unusable on phones\n- ADA / EU EAA 2025 non-compliant\n\n## Fix\n- Below `md` breakpoint: hamburger button in topbar\n- Opens slide-in drawer overlay (shadcn `Sheet`)\n- Closes on navigation or backdrop click\n\n## Acceptance\n- Mobile: hamburger visible, sidebar hidden by default\n- Tap → drawer slides in; tap backdrop → closes", "labels": ["P0", "UI/UX", "accessibility", "responsive"]},
    {"title": "[P0][UI] Tables clip horizontally on mobile — no scroll", "body": "## Problem\n6 of 10 tables use `overflow-y-auto` only. They clip on narrow viewports — columns disappear with no way to see them.\n\n## Fix\n- Wrap every table in `<div className=\"overflow-x-auto\">`\n- Add `min-w` to tables\n- Sticky first column (symbol)\n\n## Acceptance\n- All tables scroll horizontally on mobile\n- First column sticky", "labels": ["P0", "UI/UX", "responsive"]},
    {"title": "[P0][UI] Circuit breaker changes have no confirmation — misclick halts all trading", "body": "## Problem\n`src/components/aurevia/views/risk-view.tsx` — clicking TRADING_PAUSED instantly changes state. No confirmation dialog.\n\n## Fix\n- Wrap breaker state buttons in `AlertDialog`\n- Show state transition + reason\n- For TRADING_PAUSED: require typed confirmation\n\n## Acceptance\n- Clicking TRADING_PAUSED → confirmation dialog\n- Cancel returns without change", "labels": ["P0", "UI/UX", "safety"]},
    {"title": "[P0][UI] No error state handling — failed fetches look like loading forever", "body": "## Problem\nEvery view uses react-query but NONE check `isError`. Failed API fetch leaves view stuck on 'Loading…' forever.\n\n## Fix\n- Build `<QueryState loading error empty success>` wrapper\n- Check `isError` in every view\n- Show error card with Retry button\n- Use shadcn `<Skeleton>` for loading\n\n## Acceptance\n- Kill API → error card with Retry appears\n- Loading shows skeletons", "labels": ["P0", "UI/UX", "reliability"]},
    {"title": "[P0][UI] Orders view is a fake duplicate of Portfolio", "body": "## Problem\n`src/components/aurevia/views/orders-view.tsx` — duplicate of Portfolio positions table. Admits it in its own UI. Every row's status hardcoded to 'FILLED'.\n\n## Fix\n- Add `/api/v1/orders` route returning `store.orders`\n- Orders view: timestamp, symbol, side, qty, type, status, filled price, strategy, reason\n- Filter by status\n\n## Acceptance\n- Real order history from store\n- Filterable by status", "labels": ["P0", "UI/UX", "backend"]},
    {"title": "[P0][UI] System Health view fabricates latency and subsystem status", "body": "## Problem\n`src/components/aurevia/views/system-view.tsx` — latency chart uses hardcoded array. 8-subsystem checklist always shows green.\n\n## Fix\n- Track real latency: sample `/api/v1/health` every 10s\n- Derive subsystem status from real health data\n- Remove fabricated arrays\n\n## Acceptance\n- Latency chart shows real measured API latencies\n- Subsystem checks reflect real state", "labels": ["P0", "UI/UX", "honesty", "observability"]},
    {"title": "[P0][UI] Dashboard sparklines are fabricated from current price", "body": "## Problem\n`dashboard-view.tsx` + `asset-detail-view.tsx` — sparklines use hardcoded `[price*0.98, price*0.99, price]` arrays.\n\n## Fix\n- Fetch last 30 closes from `/api/v1/assets/[symbol]`\n- Pass real closes to Sparkline\n- Or use WebSocket tick stream\n\n## Acceptance\n- Sparklines show real recent price history", "labels": ["P0", "UI/UX", "honesty"]},
    {"title": "[P0][UI] Settings page ships ASCII-art architecture diagram", "body": "## Problem\n`settings-view.tsx` — ASCII-art architecture flow in `<pre>` block. Amateurish for 'premium fintech'.\n\n## Fix\n- Replace with proper visual diagram (SVG) or remove\n- Link to ARCHITECTURE.md\n- Keep polished About card\n\n## Acceptance\n- No `<pre>` ASCII art on Settings", "labels": ["P0", "UI/UX", "polish"]},
    {"title": "[P0][UI] Sidebar logo uses raw <img> — not optimized, not clickable", "body": "## Problem\n`sidebar.tsx:69-73` — logo uses raw `<img>` not `next/image`. Not clickable.\n\n## Fix\n- Replace with `next/image`\n- Wrap in button that navigates to dashboard\n- Add `priority`\n\n## Acceptance\n- Logo uses next/image\n- Clicking navigates to dashboard", "labels": ["P0", "UI/UX", "performance"]},
    {"title": "[P1][UI] No loading skeletons — just 'Loading…' text", "body": "## Problem\nEvery view shows 'Loading…' text. shadcn `<Skeleton>` exists but never imported.\n\n## Fix\n- Build `<QueryState>` wrapper showing skeletons\n- Each view defines skeleton layout\n\n## Acceptance\n- All views show skeletons during load\n- No 'Loading…' text", "labels": ["P1", "UI/UX", "polish"]},
    {"title": "[P1][UI] Sidebar accessibility violations — no ARIA, no keyboard nav", "body": "## Problem\nNo ARIA roles, no `aria-current`, no skip link, no `<nav>` landmark.\n\n## Fix\n- `<nav aria-label=\"Main navigation\">`\n- `aria-current=\"page\"` on active\n- Skip-to-content link\n\n## Acceptance\n- Screen reader announces nav correctly", "labels": ["P1", "UI/UX", "accessibility"]},
    {"title": "[P1][UI] No keyboard accessibility on clickable rows and icon-only buttons", "body": "## Problem\nClickable table rows lack `tabIndex`, `role`, `onKeyDown`. Icon-only buttons lack `aria-label`.\n\n## Fix\n- `tabIndex={0} role=\"button\" onKeyDown` on clickable rows\n- `aria-label` on icon buttons\n- Focus-visible ring\n\n## Acceptance\n- Tab through all clickable rows\n- Enter/Space activates", "labels": ["P1", "UI/UX", "accessibility", "keyboard"]},
    {"title": "[P1][UI] Touch targets below 44px throughout", "body": "## Problem\n`size=\"sm\"` buttons are ~32px. WCAG 2.1 AA requires ≥ 44px.\n\n## Fix\n- `size=\"default\"` or custom `h-11` on mobile\n\n## Acceptance\n- All touch targets ≥ 44px", "labels": ["P1", "UI/UX", "accessibility", "mobile"]},
    {"title": "[P1][UI] PAPER MODE badge uses emerald — implies 'good' when it's just safe default", "body": "## Problem\nPAPER MODE badge is emerald. Should be neutral.\n\n## Fix\n- Change to cyan/muted\n- Reserve emerald for gains/approvals\n\n## Acceptance\n- PAPER MODE is neutral color", "labels": ["P1", "UI/UX", "design-system"]},
    {"title": "[P1][UI] Symbol dropdowns hardcoded to 11 tickers — should use full 18-asset universe", "body": "## Problem\nportfolio/backtests/ml views hardcode 11 tickers.\n\n## Fix\n- Fetch from `/api/v1/markets`\n- Searchable combobox\n\n## Acceptance\n- All dropdowns show full universe\n- Searchable", "labels": ["P1", "UI/UX", "data-quality"]},
    {"title": "[P1][UI] Order ticket has no validation, no cost preview, no order type", "body": "## Problem\nManual order ticket: no validation, no cost preview, MARKET only.\n\n## Fix\n- Validate qty > 0, symbol exists\n- Show estimated cost + commission\n- Add LIMIT/STOP with limit price\n- Disable if insufficient cash\n\n## Acceptance\n- Validated before submit\n- Cost preview shown\n- LIMIT/STOP supported", "labels": ["P1", "UI/UX", "trading"]},
    {"title": "[P1][UI] Drawdown color logic inverted in asset detail", "body": "## Problem\n`asset-detail-view.tsx` — drawdown colored green when high, red when low. Inverted.\n\n## Fix\n- Low DD (<5%) → green; High DD (>10%) → red\n\n## Acceptance\n- Color matches severity", "labels": ["P1", "UI/UX", "bug"]},
    {"title": "[P1][UI] No global command palette (Cmd+K)", "body": "## Problem\nNo Cmd+K for quick navigation.\n\n## Fix\n- Add cmdk palette (already installed)\n- Commands: navigate, search assets, run backtest, scan\n\n## Acceptance\n- Cmd+K opens palette\n- Type to search", "labels": ["P1", "UI/UX", "power-user"]},
    {"title": "[P1][UI] Topbar ticker hidden on mobile — no price visibility", "body": "## Problem\nTicker bar is `hidden lg:flex`. No prices on mobile.\n\n## Fix\n- Compact ticker (1-2 symbols) on mobile\n- LIVE badge always visible\n\n## Acceptance\n- Some price info visible on mobile", "labels": ["P1", "UI/UX", "responsive"]},
    {"title": "[P1][UI] Equity curve benchmark line invisible", "body": "## Problem\nBenchmark line uses nearly invisible color.\n\n## Fix\n- Increase opacity\n- More visible color\n- Add legend\n\n## Acceptance\n- Benchmark clearly visible\n- Legend explains both lines", "labels": ["P1", "UI/UX", "charts"]},
    {"title": "[P1][UI] Candlestick chart tooltip confusing — OHLC not shown clearly", "body": "## Problem\nTooltip returns null for range series, confusing labels.\n\n## Fix\n- Show explicit O/H/L/C values\n- Proper precision\n- Clear date/time\n\n## Acceptance\n- Tooltip: Date, O, H, L, C, Volume", "labels": ["P1", "UI/UX", "charts"]},
    {"title": "[P1][BE] No unit tests — zero test coverage", "body": "## Problem\nZero tests. Every financial calculation needs unit tests.\n\n## Fix\n- Add vitest or bun test\n- Test indicators, risk rules, portfolio accounting, backtest metrics\n- Target > 80% coverage on `src/lib/aurevia/**`\n\n## Acceptance\n- `bun test` passes\n- Coverage > 80%", "labels": ["P1", "backend", "testing", "quality"]},
    {"title": "[P1][BE] Daily/weekly loss-limit rollover scheduler not implemented", "body": "## Problem\n`store.ts:49-50` — `dayStartEquity`/`weekStartEquity` never roll over.\n\n## Fix\n- Request-time check for date/week boundary\n- Snapshot equity at boundary\n- Log rollover as risk event\n\n## Acceptance\n- Day boundary → `dayStartEquity` updates\n- Week boundary → `weekStartEquity` updates", "labels": ["P1", "backend", "risk-engine"]},
    {"title": "[P1][BE] Risk rules 9/10/11 check current portfolio, not post-fill hypothetical", "body": "## Problem\nPosition/exposure/leverage rules check CURRENT state, not hypothetical post-fill. Order pushing 80%→110% exposure approved.\n\n## Fix\n- `evaluateRisk` accepts proposed qty + price\n- Build hypothetical post-fill portfolio\n- Check caps against hypothetical\n\n## Acceptance\n- Order breaching exposure cap → REJECTED", "labels": ["P1", "backend", "risk-engine"]},
    {"title": "[P1][BE] No stale-data protection", "body": "## Problem\nNo stale-data detection. Orders accepted against stale prices.\n\n## Fix\n- Check `quote.timestamp` vs `Date.now()`\n- Reject if older than threshold (60s)\n- Add `maxStaleDataMs` to risk profile\n\n## Acceptance\n- Quote >60s old → REJECTED with 'stale data'", "labels": ["P1", "backend", "risk-engine", "safety"]},
]

def create_issue(issue):
    data = json.dumps(issue).encode()
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/issues",
        data=data,
        headers={"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github+json", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            return result.get("number"), result.get("html_url")
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}: {e.read().decode()[:200]}"

if __name__ == "__main__":
    # Create labels first
    for label in ["P0", "P1", "UI/UX", "backend", "accessibility", "responsive", "safety", "polish", "design-system", "data-quality", "trading", "keyboard", "mobile", "honesty", "observability", "charts", "power-user", "bug", "architecture", "reliability", "testing", "quality", "risk-engine", "performance"]:
        req = urllib.request.Request(
            f"https://api.github.com/repos/{REPO}/labels",
            data=json.dumps({"name": label, "color": "ededed"}).encode(),
            headers={"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github+json", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req)
        except urllib.error.HTTPError:
            pass
    created = []
    for issue in ISSUES:
        num, url = create_issue(issue)
        created.append((num, issue["title"]))
        print(f"#{num}: {issue['title'][:70]}")
    print(f"\nCreated {len(created)} issues")
