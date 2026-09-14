"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useUI, type ViewKey } from "@/lib/aurevia/ui-store";
import { useMarkets, useScanSignals, useResetPortfolio } from "@/lib/aurevia/hooks";
import { fmtPrice } from "@/lib/aurevia/format";
import { toast } from "sonner";
import {
  LayoutDashboard,
  LineChart,
  CandlestickChart,
  Radio,
  Cpu,
  FlaskConical,
  Wallet,
  ShieldAlert,
  Brain,
  Plug,
  HeartPulse,
  ShieldCheck,
  Settings,
  Search,
  RefreshCw,
  RotateCcw,
  Play,
  CornerDownLeft,
  Clock,
  ArrowUp,
  ArrowDown,
  Star,
  Filter,
  Gauge,
  Newspaper,
  Calendar,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia command palette (issue #37).
//
// Mounted once at the root of `page.tsx` so Cmd+K / Ctrl+K is always available
// regardless of which view is active. Three top-level groups:
//   1. Navigate — switch to any of the 12 primary views.
//   2. Assets   — fuzzy search the tradable universe, hit Enter to open the
//                 asset analysis view for that symbol.
//   3. Actions  — fire common mutations (scan signals, reset portfolio) or
//                 jump to the backtests view to run one.
//
// Recent commands are surfaced in a leading group backed by localStorage so
// the palette learns the user's habits across sessions.
// ---------------------------------------------------------------------------

interface NavCommand {
  key: ViewKey;
  label: string;
  icon: LucideIcon;
}

// The 12 navigation targets surfaced in the palette (matches the spec list —
// trends/regimes/orders are reachable from the sidebar; the palette stays
// focused on the primary destinations).
const NAV_COMMANDS: NavCommand[] = [
  { key: "market-pulse", label: "Market Pulse", icon: Gauge },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "markets", label: "Markets", icon: LineChart },
  { key: "asset", label: "Asset Analysis", icon: CandlestickChart },
  { key: "watchlists", label: "Watchlists", icon: Star },
  { key: "screener", label: "Screener", icon: Filter },
  { key: "signals", label: "Signals", icon: Radio },
  { key: "strategies", label: "Strategies", icon: Cpu },
  { key: "backtests", label: "Backtests", icon: FlaskConical },
  { key: "portfolio", label: "Portfolio", icon: Wallet },
  { key: "risk", label: "Risk", icon: ShieldAlert },
  { key: "ml", label: "ML Predictions", icon: Brain },
  { key: "brokers", label: "Brokers", icon: Plug },
  { key: "news", label: "News", icon: Newspaper },
  { key: "events", label: "Events", icon: Calendar },
  { key: "system", label: "System Health", icon: HeartPulse },
  { key: "admin", label: "Admin", icon: ShieldCheck },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "profile", label: "Profile", icon: UserCircle },
];

const RECENT_KEY = "aurevia.cmdk.recent";
const MAX_RECENT = 5;

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function writeRecent(items: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    /* localStorage may be unavailable (private mode) — non-fatal */
  }
}

function pushRecent(id: string) {
  const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, MAX_RECENT);
  writeRecent(next);
}

interface ResolvedRecent {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  onSelect: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  const { setView, openAsset } = useUI();
  const markets = useMarkets();
  const scan = useScanSignals();
  const reset = useResetPortfolio();
  const qc = useQueryClient();

  // Cmd+K (mac) / Ctrl+K (win/linux) toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Read recent IDs from localStorage only when the palette is open.
  // useMemo (rather than useEffect + setState) avoids the lint warning
  // about cascading renders and keeps the read off the SSR path.
  const recent = useMemo<string[]>(() => {
    if (!open || typeof window === "undefined") return [];
    return readRecent();
  }, [open]);

  const runNav = useCallback(
    (key: ViewKey) => {
      setView(key);
      pushRecent(`nav:${key}`);
      setOpen(false);
    },
    [setView],
  );

  const runAsset = useCallback(
    (symbol: string) => {
      openAsset(symbol);
      pushRecent(`asset:${symbol}`);
      setOpen(false);
    },
    [openAsset],
  );

  const runScan = useCallback(() => {
    scan.mutate(undefined, {
      onSuccess: (d) => {
        toast.success(`Scanned ${d.scanned} assets · ${d.newSignals.length} new signals`);
        qc.invalidateQueries({ queryKey: ["signals"] });
      },
      onError: (e: Error) => toast.error(e.message ?? "Scan failed"),
    });
    pushRecent("action:scan");
    setOpen(false);
  }, [scan, qc]);

  const runReset = useCallback(() => {
    reset.mutate(undefined, {
      onSuccess: () => {
        toast.success("Portfolio reset to initial capital");
        qc.invalidateQueries({ queryKey: ["portfolio"] });
      },
      onError: (e: Error) => toast.error(e.message ?? "Reset failed"),
    });
    pushRecent("action:reset");
    setOpen(false);
  }, [reset, qc]);

  const runBacktest = useCallback(() => {
    setView("backtests");
    pushRecent("action:backtest");
    setOpen(false);
  }, [setView]);

  // Resolve the recent IDs to renderable items, skipping any whose underlying
  // target has disappeared (e.g. an asset symbol removed from the universe).
  const recentItems: ResolvedRecent[] = recent
    .map((id): ResolvedRecent | null => {
      if (id.startsWith("asset:")) {
        const sym = id.slice(6);
        const asset = markets.data?.find((m) => m.symbol === sym);
        if (!asset) return null;
        return {
          id,
          label: asset.symbol,
          hint: `${asset.name} · ${fmtPrice(asset.quote.price)}`,
          icon: Search,
          onSelect: () => runAsset(sym),
        };
      }
      if (id === "action:scan") {
        return { id, label: "Scan signals", hint: "Action", icon: RefreshCw, onSelect: runScan };
      }
      if (id === "action:reset") {
        return { id, label: "Reset portfolio", hint: "Action", icon: RotateCcw, onSelect: runReset };
      }
      if (id === "action:backtest") {
        return { id, label: "Run backtest", hint: "Action", icon: Play, onSelect: runBacktest };
      }
      if (id.startsWith("nav:")) {
        const key = id.slice(4) as ViewKey;
        const nav = NAV_COMMANDS.find((n) => n.key === key);
        if (!nav) return null;
        return {
          id,
          label: nav.label,
          hint: "Navigate",
          icon: nav.icon,
          onSelect: () => runNav(key),
        };
      }
      return null;
    })
    .filter((x): x is ResolvedRecent => x !== null);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      className="sm:max-w-xl"
      title="Aurevia command palette"
      description="Search views, assets and actions. Press Enter to run, Esc to close."
    >
      <CommandInput placeholder="Type a command, view, or asset symbol…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {recentItems.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentItems.map((r) => {
                const Icon = r.icon;
                return (
                  <CommandItem
                    key={r.id}
                    value={`recent ${r.label} ${r.hint}`}
                    onSelect={r.onSelect}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">{r.label}</span>
                      <span className="truncate text-[11px] text-muted-foreground">{r.hint}</span>
                    </div>
                    <CommandShortcut>↵</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Navigate">
          {NAV_COMMANDS.map((n) => {
            const Icon = n.icon;
            return (
              <CommandItem
                key={n.key}
                value={`go to ${n.label} navigate view`}
                onSelect={() => runNav(n.key)}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{n.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem value="scan signals evaluate universe" onSelect={runScan}>
            <RefreshCw className={`h-4 w-4 shrink-0 text-muted-foreground ${scan.isPending ? "animate-spin" : ""}`} />
            <span>Scan signals</span>
            <CommandShortcut>evaluate universe</CommandShortcut>
          </CommandItem>
          <CommandItem value="reset portfolio clear positions paper" onSelect={runReset}>
            <RotateCcw className={`h-4 w-4 shrink-0 text-muted-foreground ${reset.isPending ? "animate-spin" : ""}`} />
            <span>Reset portfolio</span>
            <CommandShortcut>clear positions</CommandShortcut>
          </CommandItem>
          <CommandItem value="run backtest strategy symbol" onSelect={runBacktest}>
            <Play className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>Run backtest</span>
            <CommandShortcut>open backtests</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {(markets.data?.length ?? 0) > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Assets">
              {(markets.data ?? []).map((a) => (
                <CommandItem
                  key={a.symbol}
                  value={`${a.symbol} ${a.name} asset`}
                  onSelect={() => runAsset(a.symbol)}
                >
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{a.symbol}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">{a.name}</span>
                  <CommandShortcut className="tabular">{fmtPrice(a.quote.price)}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* Footer — keyboard hint legend. Rendered outside CommandList so it
          is not filtered out by cmdk when the query matches nothing. */}
      <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CornerDownLeft className="h-3 w-3" />
          <span>select</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> recent first
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-muted px-1 font-mono text-[10px]">
              <ArrowUp className="inline h-2.5 w-2.5" />
            </kbd>
            <kbd className="rounded bg-muted px-1 font-mono text-[10px]">
              <ArrowDown className="inline h-2.5 w-2.5" />
            </kbd>
            navigate
          </span>
          <span>
            <kbd className="rounded bg-muted px-1 font-mono text-[10px]">esc</kbd> close
          </span>
        </div>
      </div>
    </CommandDialog>
  );
}
