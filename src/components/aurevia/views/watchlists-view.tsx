"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useMarkets,
  useWatchlists,
  useWatchlistAction,
  type WatchlistData,
} from "@/lib/aurevia/hooks";
import {
  fmtPrice,
  fmtPct,
  fmtCompact,
  gainColor,
  gainBg,
  accentColor,
} from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { Sparkline } from "@/components/aurevia/charts/sparkline";
import { toast } from "sonner";
import {
  Star,
  Plus,
  X,
  Trash2,
  Pencil,
  ArrowUpRight,
  ArrowDownRight,
  Search,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Watchlists view (issue #41).
//
// Multiple named watchlists are surfaced as a left-rail list + a wide right
// panel showing the active watchlist's table. Each row carries a live quote
// and a 30-bar sparkline so the user sees the same per-asset context as on
// the markets view. The "Add Symbol" affordance is a search combobox backed
// by useMarkets — keeps the universe as the single source of truth (issue #29).
// ---------------------------------------------------------------------------

export function WatchlistsView() {
  const { data, isLoading } = useWatchlists();
  const markets = useMarkets();
  const action = useWatchlistAction();
  const qc = useQueryClient();
  const { openAsset } = useUI();

  const watchlists = data ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  // Track the active watchlist by id; fall back to the first watchlist (or
  // "default") when none is selected yet. Using useEffect to sync would cause
  // a flash of "no watchlist" on first load — computed default avoids that.
  const active: WatchlistData | undefined =
    watchlists.find((w) => w.id === activeId) ?? watchlists[0];

  const [addSymbol, setAddSymbol] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [renaming, setRenaming] = useState<WatchlistData | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<WatchlistData | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["watchlists"] });
  }

  const universe = markets.data ?? [];
  const availableSymbols = useMemo(() => {
    if (!active) return [];
    const inList = new Set(active.symbols.map((s) => s.toUpperCase()));
    const q = addSymbol.trim().toUpperCase();
    return universe
      .filter((a) => !inList.has(a.symbol))
      .filter((a) =>
        q === ""
          ? true
          : a.symbol.includes(q) || a.name.toUpperCase().includes(q),
      )
      .slice(0, 30);
  }, [universe, active, addSymbol]);

  function runCreate() {
    const name = newName.trim();
    if (!name) {
      toast.error("Watchlist name cannot be empty");
      return;
    }
    action.mutate(
      { action: "create", name },
      {
        onSuccess: (d) => {
          const created = d.watchlists[d.watchlists.length - 1];
          toast.success(`Created watchlist "${created?.name ?? name}"`);
          setActiveId(created?.id ?? null);
          setCreating(false);
          setNewName("");
          invalidate();
        },
        onError: (e: Error) => toast.error(e.message ?? "Failed to create watchlist"),
      },
    );
  }

  function runAdd(symbol: string) {
    if (!active) return;
    action.mutate(
      { action: "addSymbol", watchlistId: active.id, symbol },
      {
        onSuccess: () => {
          toast.success(`Added ${symbol} to "${active.name}"`);
          setAddSymbol("");
          invalidate();
        },
        onError: (e: Error) => toast.error(e.message ?? "Failed to add symbol"),
      },
    );
  }

  function runRemove(symbol: string) {
    if (!active) return;
    action.mutate(
      { action: "removeSymbol", watchlistId: active.id, symbol },
      {
        onSuccess: () => {
          toast.success(`Removed ${symbol} from "${active.name}"`);
          invalidate();
        },
        onError: (e: Error) => toast.error(e.message ?? "Failed to remove symbol"),
      },
    );
  }

  function runRename() {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) {
      toast.error("Name cannot be empty");
      return;
    }
    action.mutate(
      { action: "rename", watchlistId: renaming.id, name },
      {
        onSuccess: () => {
          toast.success(`Renamed to "${name}"`);
          setRenaming(null);
          setRenameValue("");
          invalidate();
        },
        onError: (e: Error) => toast.error(e.message ?? "Failed to rename"),
      },
    );
  }

  function runDelete() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    action.mutate(
      { action: "delete", watchlistId: target.id },
      {
        onSuccess: (d) => {
          if (d.deleted) {
            toast.success(`Deleted watchlist "${target.name}"`);
            // If we just deleted the active one, snap back to the first remaining.
            if (activeId === target.id) {
              setActiveId(d.watchlists[0]?.id ?? null);
            }
          } else {
            toast.error("Default watchlist cannot be deleted");
          }
          setConfirmDelete(null);
          invalidate();
        },
        onError: (e: Error) => toast.error(e.message ?? "Failed to delete"),
      },
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Watchlists</h2>
        <p className="text-sm text-muted-foreground">
          Save and track curated asset lists across the universe. Each row carries a live quote and a 30-bar sparkline.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Left rail: list of watchlists */}
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold">Lists</h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-3.5 w-3.5" /> New
            </Button>
          </div>
          <div className="space-y-1">
            {watchlists.map((wl) => {
              const isActive = active?.id === wl.id;
              return (
                <button
                  key={wl.id}
                  onClick={() => setActiveId(wl.id)}
                  className={cn(
                    "flex w-full min-h-[44px] items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary"
                      : "border-l-2 border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{wl.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {wl.symbols.length} symbol{wl.symbols.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {wl.id !== "default" && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete ${wl.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(wl);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setConfirmDelete(wl);
                        }
                      }}
                      className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/20 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              );
            })}
            {watchlists.length === 0 && isLoading && (
              <div className="space-y-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Right: active watchlist table */}
        <Card className="p-0">
          {!active ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
              <Star className="h-8 w-8 text-muted-foreground/40" />
              <div className="space-y-1">
                <p className="text-sm font-medium">No watchlist selected</p>
                <p className="text-xs text-muted-foreground">Create a new watchlist to get started.</p>
              </div>
              <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> New Watchlist
              </Button>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400" />
                  <h3 className="text-sm font-semibold">{active.name}</h3>
                  <Badge variant="outline" className="text-xs">
                    {active.symbols.length} symbol{active.symbols.length === 1 ? "" : "s"}
                  </Badge>
                  <button
                    onClick={() => {
                      setRenaming(active);
                      setRenameValue(active.name);
                    }}
                    className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Rename watchlist"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="h-4 w-4" /> Add Symbol
                </Button>
              </div>

              {/* Table */}
              <div className="max-h-[60vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 bg-card">Symbol</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>24h %</TableHead>
                      <TableHead>30-bar</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Spread</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {active.rows.map((row) => {
                      const up = row.changePct >= 0;
                      return (
                        <TableRow key={row.symbol}>
                          <TableCell className="sticky left-0 z-10 bg-card font-semibold">
                            <button
                              onClick={() => openAsset(row.symbol)}
                              className="hover:text-emerald-400"
                            >
                              {row.symbol}
                            </button>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.name}
                          </TableCell>
                          <TableCell className="text-right tabular font-medium">
                            {fmtPrice(row.price)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn("gap-1", gainBg(row.changePct))}
                            >
                              {up ? (
                                <ArrowUpRight className="h-3 w-3" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3" />
                              )}
                              <span className="tabular">{fmtPct(row.changePct)}</span>
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Sparkline
                              data={row.sparkline?.length ? row.sparkline : [row.price]}
                              width={88}
                              height={22}
                              positive={up}
                            />
                          </TableCell>
                          <TableCell className="text-right tabular text-muted-foreground">
                            {fmtCompact(row.volume24h)}
                          </TableCell>
                          <TableCell className="text-right tabular text-muted-foreground">
                            {fmtPrice(row.spread, 4)}
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              onClick={() => runRemove(row.symbol)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/20 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Remove ${row.symbol} from ${active.name}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {active.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                          No symbols yet. Click <span className="text-foreground">Add Symbol</span> to start tracking assets.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Footer summary */}
              {active.rows.length > 0 && (
                <WatchlistSummary wl={active} />
              )}
            </>
          )}
        </Card>
      </div>

      {/* Add Symbol dialog — combobox backed by useMarkets */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add symbol to "{active?.name}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search symbol or name…"
                value={addSymbol}
                onChange={(e) => setAddSymbol(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {availableSymbols.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No matching assets available to add.
                </div>
              )}
              {availableSymbols.map((a) => {
                const up = a.quote.changePct >= 0;
                return (
                  <button
                    key={a.symbol}
                    onClick={() => runAdd(a.symbol)}
                    className="flex w-full items-center justify-between rounded-md border border-border/50 bg-card/40 px-3 py-2 text-left transition-colors hover:bg-accent/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{a.symbol}</span>
                      <span className="truncate text-xs text-muted-foreground">{a.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <span className="text-xs tabular text-muted-foreground">
                        {fmtPrice(a.quote.price)}
                      </span>
                      <span className={cn("text-xs tabular", gainColor(a.quote.changePct))}>
                        {fmtPct(a.quote.changePct)}
                      </span>
                      <Plus className="h-3.5 w-3.5 text-muted-foreground/70" />
                    </div>
                    {up ? null : null}
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New watchlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Watchlist name (e.g. Tech Megacaps)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") runCreate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={runCreate} disabled={action.isPending || !newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename watchlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Watchlist name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") runRename();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button onClick={runRename} disabled={action.isPending || !renameValue.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete watchlist?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-medium text-foreground">{confirmDelete?.name}</span>?
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={runDelete} disabled={action.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WatchlistSummary({ wl }: { wl: WatchlistData }) {
  const advancers = wl.rows.filter((r) => r.changePct > 0).length;
  const decliners = wl.rows.filter((r) => r.changePct < 0).length;
  const avgChange =
    wl.rows.length === 0
      ? 0
      : wl.rows.reduce((acc, r) => acc + r.changePct, 0) / wl.rows.length;
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-border/60 px-4 py-3 text-xs sm:grid-cols-4">
      <SummaryStat label="Advancers" value={advancers} accent="gain" />
      <SummaryStat label="Decliners" value={decliners} accent="loss" />
      <div>
        <div className="uppercase tracking-wider text-muted-foreground">Avg Change</div>
        <div className={cn("mt-0.5 text-base font-semibold tabular", accentColor(avgChange >= 0 ? "gain" : "loss"))}>
          {fmtPct(avgChange)}
        </div>
      </div>
      <SummaryStat label="Tracked" value={wl.symbols.length} accent="default" />
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: number; accent: "gain" | "loss" | "default" }) {
  return (
    <div>
      <div className="uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-base font-semibold tabular", accentColor(accent))}>{value}</div>
    </div>
  );
}
