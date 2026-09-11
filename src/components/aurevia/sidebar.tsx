"use client";

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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUI, type ViewKey } from "@/lib/aurevia/ui-store";
import { useAureviaStream } from "@/lib/aurevia/hooks/use-aurevia-stream";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NavItem {
  key: ViewKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "intelligence" | "trading" | "system";
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "intelligence" },
  { key: "markets", label: "Markets", icon: LineChart, group: "intelligence" },
  { key: "asset", label: "Asset Analysis", icon: CandlestickChart, group: "intelligence" },
  { key: "trends", label: "Trends", icon: TrendingUp, group: "intelligence" },
  { key: "regimes", label: "Regimes", icon: Activity, group: "intelligence" },
  { key: "signals", label: "Signals", icon: Radio, group: "intelligence" },
  { key: "ml", label: "ML Predictions", icon: Brain, group: "intelligence" },
  { key: "strategies", label: "Strategies", icon: Cpu, group: "trading" },
  { key: "backtests", label: "Backtests", icon: FlaskConical, group: "trading" },
  { key: "portfolio", label: "Portfolio", icon: Wallet, group: "trading" },
  { key: "orders", label: "Orders", icon: ScrollText, group: "trading" },
  { key: "risk", label: "Risk Engine", icon: ShieldAlert, group: "trading" },
  { key: "brokers", label: "Brokers", icon: Plug, group: "trading" },
  { key: "system", label: "System Health", icon: HeartPulse, group: "system" },
  { key: "settings", label: "Settings", icon: Settings, group: "system" },
];

const GROUP_LABELS: Record<string, string> = {
  intelligence: "Market Intelligence",
  trading: "Trading & Risk",
  system: "System",
};

export function Sidebar() {
  const { view, setView, sidebarCollapsed, toggleSidebar } = useUI();
  const groups = ["intelligence", "trading", "system"] as const;
  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
        sidebarCollapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Activity className="h-4 w-4" />
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold text-sidebar-foreground">Aurevia</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Market Intel</span>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((g) => (
          <div key={g} className="mb-4">
            {!sidebarCollapsed && (
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
                    onClick={() => setView(item.key)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="w-full justify-start gap-2 text-muted-foreground"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", sidebarCollapsed && "rotate-180")} />
          {!sidebarCollapsed && <span>Collapse</span>}
        </Button>
      </div>
    </aside>
  );
}

export function Topbar() {
  const { view } = useUI();
  const current = NAV.find((n) => n.key === view);
  const { connected, ticks } = useAureviaStream();
  const tickArr = Array.from(ticks.values()).slice(0, 6);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold">{current?.label ?? "Aurevia"}</h1>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
          <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          PAPER MODE
        </Badge>
        {connected && (
          <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            LIVE
          </Badge>
        )}
      </div>
      {/* Live ticker bar — streaming prices from WebSocket */}
      <div className="hidden items-center gap-3 overflow-hidden lg:flex">
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
        <Badge variant="outline" className="font-mono">v0.1.0</Badge>
      </div>
    </header>
  );
}
