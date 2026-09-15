"use client";

import { useState } from "react";
import Image from "next/image";
import {
  LayoutDashboard,
  LineChart,
  CandlestickChart,
  Cpu,
  FlaskConical,
  Radio,
  TrendingUp,
  Activity,
  ShieldAlert,
  Wallet,
  ScrollText,
  HeartPulse,
  Settings,
  ChevronLeft,
  Brain,
  Plug,
  Menu,
  Star,
  Filter,
  Gauge,
  History,
  Bell,
  Radar,
  Newspaper,
  Calendar,
  GitCompareArrows,
  PlayCircle,
  PieChart,
  ShieldCheck,
  BookOpen,
  Bot,
  Blocks,
  Globe,
  Boxes,
  UserCircle,
  Sun,
  Moon,
  PenLine,
  BarChart3,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useUI, type ViewKey } from "@/lib/aurevia/ui-store";
import { useAureviaStream } from "@/lib/aurevia/hooks/use-aurevia-stream";
import { useHealth } from "@/lib/aurevia/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NavItem {
  key: ViewKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "intelligence" | "trading" | "system" | "content";
}

const NAV: NavItem[] = [
  // Market Pulse leads the intelligence group — it's the at-a-glance global
  // health view (advancers/decliners, breadth, fear/greed) the user lands on
  // to decide where to drill next. (Issue #43 — Market Pulse.)
  { key: "market-pulse", label: "Market Pulse", icon: Gauge, group: "intelligence" },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "intelligence" },
  { key: "markets", label: "Markets", icon: LineChart, group: "intelligence" },
  { key: "asset", label: "Asset Analysis", icon: CandlestickChart, group: "intelligence" },
  { key: "watchlists", label: "Watchlists", icon: Star, group: "intelligence" },
  { key: "screener", label: "Screener", icon: Filter, group: "intelligence" },
  { key: "trends", label: "Trends", icon: TrendingUp, group: "intelligence" },
  { key: "regimes", label: "Regimes", icon: Activity, group: "intelligence" },
  { key: "signals", label: "Signals", icon: Radio, group: "intelligence" },
  { key: "ml", label: "ML Predictions", icon: Brain, group: "intelligence" },
  { key: "historical-memory", label: "Historical Memory", icon: History, group: "intelligence" },
  { key: "alerts", label: "Alerts", icon: Bell, group: "intelligence" },
  { key: "radar", label: "Opportunity Radar", icon: Radar, group: "intelligence" },
  { key: "news", label: "News", icon: Newspaper, group: "intelligence" },
  { key: "events", label: "Events", icon: Calendar, group: "intelligence" },
  { key: "macro", label: "Macro", icon: Globe, group: "intelligence" },
  { key: "onchain", label: "On-Chain", icon: Boxes, group: "intelligence" },
  { key: "strategies", label: "Strategies", icon: Cpu, group: "trading" },
  { key: "strategy-builder", label: "Strategy Builder", icon: Blocks, group: "trading" },
  { key: "backtests", label: "Backtests", icon: FlaskConical, group: "trading" },
  { key: "what-if", label: "What-If", icon: GitCompareArrows, group: "trading" },
  { key: "replay", label: "Market Replay", icon: PlayCircle, group: "trading" },
  { key: "portfolio", label: "Portfolio", icon: Wallet, group: "trading" },
  { key: "portfolio-analytics", label: "Analytics", icon: PieChart, group: "trading" },
  { key: "risk-cockpit", label: "Risk Cockpit", icon: ShieldCheck, group: "trading" },
  { key: "journal", label: "Journal", icon: BookOpen, group: "trading" },
  { key: "orders", label: "Orders", icon: ScrollText, group: "trading" },
  { key: "risk", label: "Risk Engine", icon: ShieldAlert, group: "trading" },
  { key: "brokers", label: "Brokers", icon: Plug, group: "trading" },
  { key: "copilot", label: "AI Copilot", icon: Bot, group: "intelligence" },
  // Research Hub (Blog/CMS) — issue #128. Sits in its own group so the
  // publishing surface is visually distinct from the market-intel and
  // trading surfaces. The dashboard leads so the operator can see
  // engagement at a glance.
  { key: "blog", label: "Research Hub", icon: Newspaper, group: "content" },
  { key: "blog-editor", label: "New Article", icon: PenLine, group: "content" },
  { key: "blog-dashboard", label: "Engagement", icon: BarChart3, group: "content" },
  { key: "system", label: "System Health", icon: HeartPulse, group: "system" },
  { key: "admin", label: "Admin", icon: ShieldCheck, group: "system" },
  { key: "settings", label: "Settings", icon: Settings, group: "system" },
  { key: "profile", label: "Profile", icon: UserCircle, group: "system" },
];

const GROUP_LABELS: Record<string, string> = {
  intelligence: "Market Intelligence",
  trading: "Trading & Risk",
  content: "Research Hub",
  system: "System",
};

const GROUPS = ["intelligence", "trading", "content", "system"] as const;

// Shared nav body — rendered both inside the desktop <aside> and inside the
// mobile <Sheet>. The collapse affordance only shows on desktop.
function NavBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  // Issue #138 / FE-005 — pull openBlogEditor so the "New Article" nav item
  // clears `selectedArticleSlug` instead of reusing whatever was previously
  // edited. Without this, clicking "New Article" after editing an existing
  // article would load that article into the editor in edit mode (because
  // `isEditing = !!selectedArticleSlug` in blog-editor-view.tsx).
  const { view, setView, openBlogEditor } = useUI();
  return (
    <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-2 py-3">
      {GROUPS.map((g) => (
        <div key={g} className="mb-4">
          {!collapsed && (
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {GROUP_LABELS[g]}
            </div>
          )}
          <div className="space-y-0.5">
            {NAV.filter((n) => n.group === g).map((item) => {
              const Icon = item.icon;
              const active = view === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    // Issue #138 / FE-005 — special-case "New Article" so it
                    // always opens a blank draft instead of the most-recently-
                    // edited article.
                    if (item.key === "blog-editor") {
                      openBlogEditor(null);
                    } else {
                      setView(item.key);
                    }
                    onNavigate?.();
                  }}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex w-full min-h-[44px] items-center gap-3 rounded-md px-2.5 py-2.5 text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium border-l-2 border-primary"
                      : "border-l-2 border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, setView } = useUI();
  return (
    <>
      {/* Desktop sidebar — hidden below md breakpoint */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
          sidebarCollapsed ? "w-16" : "w-60"
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
          <button
            onClick={() => setView("dashboard")}
            className="rounded-md transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Go to dashboard"
          >
            <Image
              src="/branding/aurevia-logo.svg"
              alt="Aurevia logo"
              width={32}
              height={32}
              priority
              className="h-8 w-8 shrink-0"
            />
          </button>
          {!sidebarCollapsed && (
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">Aurevia</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Market Intel</span>
            </div>
          )}
        </div>
        <NavBody collapsed={sidebarCollapsed} />
        <div className="border-t border-sidebar-border p-2">
          {/* Theme toggle — light/dark switch (issue #127). Sits above the
              collapse button so it's always visible even when collapsed. */}
          <div className="mb-1.5 flex items-center gap-1.5">
            <ThemeToggleButton collapsed={sidebarCollapsed} />
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className="flex-1 justify-start gap-2 text-muted-foreground"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronLeft className={cn("h-4 w-4 transition-transform", sidebarCollapsed && "rotate-180")} />
              {!sidebarCollapsed && <span>Collapse</span>}
            </Button>
            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={() => {
                  // Synthesize a Cmd+K / Ctrl+K keydown so the global
                  // CommandPalette listener opens the palette. Avoids lifting
                  // palette-open state into the UI store.
                  window.dispatchEvent(
                    new KeyboardEvent("keydown", {
                      key: "k",
                      metaKey: typeof navigator !== "undefined" && /Mac/.test(navigator.platform),
                      ctrlKey: typeof navigator !== "undefined" && !/Mac/.test(navigator.platform),
                      bubbles: true,
                    }),
                  );
                }}
                className="inline-flex h-8 items-center justify-center rounded-md border border-sidebar-border/60 px-1.5 text-[10px] text-muted-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Open command palette"
                title="Open command palette (⌘K)"
              >
                <span className="font-mono">⌘K</span>
              </button>
            )}
          </div>
          {!sidebarCollapsed && (
            <p className="mt-1.5 px-1 text-[10px] text-muted-foreground/50">
              Press <span className="font-mono">⌘K</span> to search anywhere.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}

// Mobile sidebar drawer — rendered as a Sheet triggered from the Topbar
// hamburger. The trigger is exported separately so the Topbar can host it.
export function MobileSidebarTrigger() {
  const [open, setOpen] = useState(false);
  const { setView } = useUI();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-60 border-sidebar-border bg-sidebar p-0">
        <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
          <button
            onClick={() => { setView("dashboard"); setOpen(false); }}
            className="rounded-md transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Go to dashboard"
          >
            <Image
              src="/branding/aurevia-logo.svg"
              alt="Aurevia logo"
              width={32}
              height={32}
              priority
              className="h-8 w-8 shrink-0"
            />
          </button>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">Aurevia</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Market Intel</span>
          </div>
        </div>
        <NavBody collapsed={false} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function Topbar() {
  const { view } = useUI();
  const current = NAV.find((n) => n.key === view);
  const { connected, ticks } = useAureviaStream();
  const health = useHealth();
  // Slice to 4 ticks for the mobile-visible ticker (md+) — never use window
  // in render; we just bound the count and let overflow-hidden clip the rest.
  const tickArr = Array.from(ticks.values()).slice(0, 4);
  // Data source badge — driven by /api/v1/health. When a real provider has
  // an API key configured, dataSource is its id and dataIsLive is true.
  // Otherwise we transparently fall back to the simulated feed — and we
  // tell the user, loudly, that the data is simulated.
  const dataSource = (health.data?.dataSource as string | undefined) ?? "simulated";
  const dataIsLive = (health.data?.dataIsLive as boolean | undefined) ?? false;

  return (
    <header
      // Issue #140 / FE-008 — pt-[env(safe-area-inset-top)] pads the Topbar
      // away from the iOS notch / Dynamic Island. Requires `viewport-fit:
      // cover` from the viewport export in layout.tsx.
      className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/80 px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] backdrop-blur md:px-6"
    >
      <div className="flex items-center gap-3">
        {/* Mobile hamburger — opens the slide-in drawer */}
        <MobileSidebarTrigger />
        <h1 className="text-base font-semibold">{current?.label ?? "Aurevia"}</h1>
        <Badge variant="outline" className="hidden border-teal-500/30 bg-teal-500/10 text-teal-400 sm:inline-flex">
          <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
          PAPER MODE
        </Badge>
        {dataIsLive ? (
          <Badge
            variant="outline"
            className="hidden border-emerald-500/30 bg-emerald-500/10 text-emerald-400 sm:inline-flex"
            title={`Live data via ${dataSource} provider`}
          >
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            LIVE DATA
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="hidden border-amber-500/30 bg-amber-500/10 text-amber-400 sm:inline-flex"
            title="No real market data API key configured — running off the deterministic simulated feed."
          >
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            SIMULATED
          </Badge>
        )}
        {connected && (
          <Badge variant="outline" className="hidden border-cyan-500/30 bg-cyan-500/10 text-cyan-400 sm:inline-flex">
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            LIVE
          </Badge>
        )}
      </div>
      {/* Live ticker bar — streaming prices from WebSocket.
          Visible on md+ screens (not just lg+); 4 ticks + overflow-hidden. */}
      <div className="hidden items-center gap-3 overflow-hidden md:flex lg:gap-4">
        {tickArr.map((t) => (
          <div key={t.symbol} className="flex items-center gap-1.5 text-xs">
            <span className="font-medium text-muted-foreground">{t.symbol}</span>
            <span className="tabular text-foreground">{t.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className={`tabular ${t.changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {t.changePct >= 0 ? "+" : ""}{t.changePct.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="hidden font-mono sm:inline-flex">v0.1.0</Badge>
        {/* Interactive OpenAPI docs (issue #119) — opens in a new tab so the
            operator doesn't lose their dashboard context. */}
        <a
          href="/api-docs"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden font-mono text-[11px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline sm:inline-flex"
          title="Interactive OpenAPI documentation"
        >
          API docs
        </a>
        {/* Notifications bell (issue #125) — 15s polling, red unread badge,
            dropdown panel with the most recent 50 notifications. */}
        <NotificationsBell />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Notifications bell (Issue #125).
//
// Polls /api/v1/notifications every 15s. The red dot badge is hidden when
// there are no unread items. The dropdown panel shows the newest first; the
// "Mark all as read" button POSTs to the same endpoint with `{ read: true }`
// and invalidates the query so the badge clears immediately.
// ---------------------------------------------------------------------------

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      fetch("/api/v1/notifications")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
        .then((d: { notifications: NotificationRow[] }) => d.notifications),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetch("/api/v1/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

function NotificationsBell() {
  const q = useNotifications();
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);

  const notifications = q.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-background"
              aria-label={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuLabel className="flex items-center justify-between px-3 py-2 text-xs">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markRead.mutate()}
              disabled={markRead.isPending}
              className="text-[10px] text-primary hover:underline disabled:opacity-50"
            >
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        <ScrollArea className="max-h-96">
          {notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No notifications
            </div>
          ) : (
            notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className="flex flex-col items-start gap-0.5 px-3 py-2 text-xs"
              >
                <div className="flex w-full items-center gap-1.5">
                  {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                  <span className="font-medium">{n.title}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {timeAgo(n.createdAt)}
                  </span>
                </div>
                <span className="text-muted-foreground">{n.message}</span>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ---------------------------------------------------------------------------
// Theme toggle button (Issue #127).
//
// Reads the resolved theme from next-themes and flips it. Sits in the sidebar
// footer so it's reachable from every view without taking a topbar slot.
// `useTheme()` returns `theme` as `"light" | "dark" | "system" | undefined`
// — we treat `undefined` (pre-hydration) as dark to match the defaultTheme.
// ---------------------------------------------------------------------------

function ThemeToggleButton({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme !== "light";
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-full justify-start gap-2 text-muted-foreground"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      {!collapsed && <span>{isDark ? "Dark" : "Light"}</span>}
    </Button>
  );
}
