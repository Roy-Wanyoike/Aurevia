"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useScreener,
  useScreenerOptions,
  type ScreenerFilter,
  type ScreenerResultRow,
} from "@/lib/aurevia/hooks";
import {
  fmtPrice,
  fmtPct,
  fmtCompact,
  gainColor,
  gainBg,
  regimeColor,
} from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { toast } from "sonner";
import {
  Filter,
  Play,
  Save,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Sparkles,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Smart Screener (issue #42).
//
// Multi-factor asset filter — every dropdown is populated from the
// /api/v1/screener GET endpoint (which derives options from the live asset
// catalog and the canonical Regime union), so no lists are hardcoded.
//
// Saved screens persist to localStorage — the store is server-side and we
// don't have user accounts in this phase, so client-side persistence is the
// pragmatic call. The user can name and reload their screens there.
// ---------------------------------------------------------------------------

const SAVED_SCREENS_KEY = "aurevia.screener.saved";

interface SavedScreen {
  id: string;
  name: string;
  filter: ScreenerFilter;
  createdAt: number;
}

function writeSavedScreens(items: SavedScreen[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_SCREENS_KEY, JSON.stringify(items));
    // Notify same-tab subscribers — the `storage` event only fires in
    // OTHER tabs, not the one that wrote. Dispatch a synthetic event so
    // useSyncExternalStore picks up the change immediately.
    window.dispatchEvent(new StorageEvent("storage", { key: SAVED_SCREENS_KEY }));
  } catch {
    /* localStorage may be unavailable — non-fatal */
  }
}

// --- useSyncExternalStore wiring (issue #82) -------------------------------
//
// Reading localStorage during render (the original `useState(() =>
// readSavedScreens())` lazy initializer) caused a hydration mismatch:
// SSR returned `[]` (window is undefined server-side), the client
// hydration called the initializer with `window` defined and got the
// actual saved value, and React flagged the divergence.
//
// `useSyncExternalStore` is the React 18+ primitive designed exactly for
// external mutable stores. It calls `getServerSnapshot` for SSR + the
// *first* client render (both return ""), then switches to `getSnapshot`
// (the real localStorage value) AFTER hydration. React handles the
// transition without a hydration warning. As a bonus, the `storage`
// event keeps the UI in sync across tabs.
//
// The hooks rule `react-hooks/set-state-in-effect` does NOT flag
// useSyncExternalStore because there's no setState-in-effect — React
// manages the snapshot internally.
function subscribeSavedScreens(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSavedScreensSnapshot(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(SAVED_SCREENS_KEY) ?? "";
}

function getSavedScreensServerSnapshot(): string {
  return "";
}

const DEFAULT_FILTER: ScreenerFilter = {};

export function ScreenerView() {
  const options = useScreenerOptions();
  const screen = useScreener();
  const { openAsset } = useUI();

  const [filter, setFilter] = useState<ScreenerFilter>(DEFAULT_FILTER);
  const [results, setResults] = useState<ScreenerResultRow[]>([]);
  const [universeSize, setUniverseSize] = useState<number | null>(null);
  const [hasRun, setHasRun] = useState(false);
  // Issue #82 — see module-level comment above. `useSyncExternalStore`
  // returns the raw localStorage string (stable snapshot), so React
  // handles the SSR→client transition without a hydration warning.
  // We parse the string into SavedScreen[] via useMemo below.
  const savedScreensRaw = useSyncExternalStore(
    subscribeSavedScreens,
    getSavedScreensSnapshot,
    getSavedScreensServerSnapshot,
  );
  const savedScreens: SavedScreen[] = useMemo(() => {
    if (!savedScreensRaw) return [];
    try {
      const parsed = JSON.parse(savedScreensRaw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [savedScreensRaw]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  function update<K extends keyof ScreenerFilter>(key: K, value: ScreenerFilter[K]) {
    setFilter((f) => {
      const next = { ...f, [key]: value };
      // Drop undefined values so they don't sneak into the JSON body — the
      // server treats a missing field as "no constraint", but explicit
      // undefined serializes as `null` which then trips z.coerce.number().
      Object.keys(next).forEach((k) => {
        if (next[k as keyof ScreenerFilter] === undefined) {
          delete next[k as keyof ScreenerFilter];
        }
      });
      return next;
    });
  }

  function clearFilter() {
    setFilter(DEFAULT_FILTER);
    setResults([]);
    setHasRun(false);
  }

  function runScreen() {
    screen.mutate(filter, {
      onSuccess: (d) => {
        setResults(d.results);
        setUniverseSize(d.universeSize);
        setHasRun(true);
        toast.success(`Screen matched ${d.results.length} of ${d.universeSize} assets`);
      },
      onError: (e: Error) => toast.error(e.message ?? "Screen failed"),
    });
  }

  function applySaved(s: SavedScreen) {
    setFilter(s.filter);
    setHasRun(false);
    setResults([]);
    toast.info(`Loaded "${s.name}" — click Run Screen to apply`);
  }

  function saveCurrent() {
    const name = saveName.trim();
    if (!name) {
      toast.error("Screen name cannot be empty");
      return;
    }
    const item: SavedScreen = {
      id: `screen-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name,
      filter,
      createdAt: Date.now(),
    };
    const next = [item, ...savedScreens];
    // `writeSavedScreens` updates localStorage + dispatches a synthetic
    // `storage` event. `useSyncExternalStore` sees it, re-reads the snapshot,
    // and re-renders with the new list — no manual setState needed.
    writeSavedScreens(next);
    setSaveOpen(false);
    setSaveName("");
    toast.success(`Saved screen "${name}"`);
  }

  function deleteSaved(id: string) {
    const next = savedScreens.filter((s) => s.id !== id);
    writeSavedScreens(next);
  }

  // Active filter count — drives the "Filters" badge in the header so the
  // user knows at a glance how constrained the current screen is.
  const activeCount = useMemo(() => {
    return Object.values(filter).filter((v) => v !== undefined && v !== "").length;
  }, [filter]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Screener</h2>
        <p className="text-sm text-muted-foreground">
          Multi-factor asset filter across the live universe. Combine price, volume, RSI, ADX, trend, regime and volatility constraints — all AND-composed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Filter builder */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">Filters</h3>
              {activeCount > 0 && (
                <Badge variant="outline" className="text-xs">{activeCount} active</Badge>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={clearFilter} className="h-7 px-2 text-xs text-muted-foreground">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>

          <div className="space-y-4">
            {/* Classification */}
            <FilterSection title="Classification">
              <FilterSelect
                label="Asset Type"
                value={filter.assetType ?? ""}
                placeholder="All types"
                options={options.data?.assetTypes ?? []}
                onChange={(v) => update("assetType", v || undefined)}
              />
              <FilterSelect
                label="Sector"
                value={filter.sector ?? ""}
                placeholder="All sectors"
                options={options.data?.sectors ?? []}
                onChange={(v) => update("sector", v || undefined)}
              />
              <FilterSelect
                label="Trend Direction"
                value={filter.trendDirection ?? ""}
                placeholder="Any direction"
                options={options.data?.trendDirections ?? []}
                onChange={(v) => update("trendDirection", v || undefined)}
              />
              <FilterSelect
                label="Regime"
                value={filter.regime ?? ""}
                placeholder="Any regime"
                options={options.data?.regimes ?? []}
                onChange={(v) => update("regime", v || undefined)}
              />
            </FilterSection>

            {/* Price */}
            <FilterSection title="Price">
              <RangePair
                label="Min Price"
                value={filter.priceMin}
                onChange={(v) => update("priceMin", v)}
              />
              <RangePair
                label="Max Price"
                value={filter.priceMax}
                onChange={(v) => update("priceMax", v)}
              />
            </FilterSection>

            {/* Volume */}
            <FilterSection title="Liquidity">
              <RangePair
                label="Min Volume 24h"
                value={filter.volumeMin}
                onChange={(v) => update("volumeMin", v)}
                placeholder="e.g. 1000000"
              />
            </FilterSection>

            {/* Oscillators */}
            <FilterSection title="Oscillators">
              <RangePair
                label="RSI Min (0-100)"
                value={filter.rsiMin}
                onChange={(v) => update("rsiMin", v)}
                placeholder="e.g. 30"
              />
              <RangePair
                label="RSI Max (0-100)"
                value={filter.rsiMax}
                onChange={(v) => update("rsiMax", v)}
                placeholder="e.g. 70"
              />
              <RangePair
                label="Min ADX (trend strength)"
                value={filter.adxMin}
                onChange={(v) => update("adxMin", v)}
                placeholder="e.g. 25"
              />
            </FilterSection>

            {/* Momentum / Risk */}
            <FilterSection title="Momentum & Risk">
              <RangePair
                label="Min 24h Change %"
                value={filter.changePctMin}
                onChange={(v) => update("changePctMin", v)}
                placeholder="e.g. -2"
              />
              <RangePair
                label="Max 24h Change %"
                value={filter.changePctMax}
                onChange={(v) => update("changePctMax", v)}
                placeholder="e.g. 10"
              />
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Max Volatility (annualized)
                </Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[filter.volatilityMax !== undefined ? filter.volatilityMax * 100 : 100]}
                    min={0}
                    max={150}
                    step={5}
                    onValueChange={(vals) => {
                      const v = vals[0];
                      // 100 = no constraint (filter off). Anything below 100
                      // is a hard cap on annualized volatility.
                      update("volatilityMax", v < 100 ? v / 100 : undefined);
                    }}
                    className="flex-1"
                  />
                  <span className="w-12 text-right text-xs tabular text-muted-foreground">
                    {filter.volatilityMax !== undefined
                      ? `${(filter.volatilityMax * 100).toFixed(0)}%`
                      : "—"}
                  </span>
                </div>
              </div>
            </FilterSection>

            {/* Action buttons */}
            <div className="space-y-2 border-t border-border/60 pt-3">
              <Button
                className="w-full gap-1.5"
                onClick={runScreen}
                disabled={screen.isPending}
              >
                <Play className={`h-4 w-4 ${screen.isPending ? "animate-spin" : ""}`} />
                Run Screen
              </Button>
              <Button
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => setSaveOpen(true)}
                disabled={activeCount === 0}
              >
                <Save className="h-4 w-4" />
                Save Screen
              </Button>
            </div>
          </div>
        </Card>

        {/* Results + saved screens */}
        <div className="space-y-4">
          {/* Saved screens */}
          {savedScreens.length > 0 && (
            <Card className="p-3">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Saved Screens
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {savedScreens.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-1 rounded-md border border-border/60 bg-card/40 py-1 pl-2 pr-1"
                  >
                    <button
                      onClick={() => applySaved(s)}
                      className="text-xs font-medium hover:text-emerald-400"
                    >
                      {s.name}
                    </button>
                    <button
                      onClick={() => deleteSaved(s.id)}
                      className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-destructive/20 hover:text-red-400"
                      aria-label={`Delete saved screen ${s.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Results table */}
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-semibold">Results</span>
                {hasRun && (
                  <Badge variant="outline" className="text-xs">
                    {results.length} matched{universeSize ? ` / ${universeSize}` : ""}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {hasRun ? "Sorted by absolute 24h change" : "Click Run Screen to apply filters"}
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 bg-card">Symbol</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>24h %</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">RSI</TableHead>
                    <TableHead className="text-right">ADX</TableHead>
                    <TableHead className="text-right">Vol</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead>Regime</TableHead>
                    <TableHead className="text-right">MACD Hist</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => {
                    const up = r.changePct >= 0;
                    return (
                      <TableRow
                        key={r.symbol}
                        onClick={() => openAsset(r.symbol)}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openAsset(r.symbol);
                          }
                        }}
                        className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <TableCell className="sticky left-0 z-10 bg-card font-semibold">{r.symbol}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.sector ?? "—"}</TableCell>
                        <TableCell className="text-right tabular font-medium">{fmtPrice(r.price)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1", gainBg(r.changePct))}>
                            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            <span className="tabular">{fmtPct(r.changePct)}</span>
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular text-muted-foreground">{fmtCompact(r.volume24h)}</TableCell>
                        <TableCell className={cn("text-right tabular", rsiColor(r.rsi14))}>
                          {fmtPrice(r.rsi14, 1)}
                        </TableCell>
                        <TableCell className="text-right tabular text-muted-foreground">
                          {fmtPrice(r.adx14, 1)}
                        </TableCell>
                        <TableCell className="text-right tabular text-muted-foreground">
                          {(r.volatility * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-xs", gainBg(r.trendDirection === "UP" ? 1 : r.trendDirection === "DOWN" ? -1 : 0))}>
                            {r.trendDirection}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-xs", regimeColor(r.regime))}>
                            {r.regime}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn("text-right tabular", gainColor(r.macdHist))}>
                          {fmtPrice(r.macdHist, 4)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!hasRun && !screen.isPending && (
                    <TableRow>
                      <TableCell colSpan={12} className="py-12 text-center text-sm text-muted-foreground">
                        Configure filters on the left, then click <span className="text-foreground">Run Screen</span> to find matching assets.
                      </TableCell>
                    </TableRow>
                  )}
                  {screen.isPending && (
                    <TableRow>
                      <TableCell colSpan={12} className="py-0">
                        <div className="space-y-2 p-2">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-2">
                              <Skeleton className="h-3 w-12" />
                              <Skeleton className="h-3 flex-1" />
                              <Skeleton className="h-3 w-16" />
                              <Skeleton className="h-3 w-16" />
                              <Skeleton className="h-5 w-12" />
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {hasRun && results.length === 0 && !screen.isPending && (
                    <TableRow>
                      <TableCell colSpan={12} className="py-12 text-center text-sm text-muted-foreground">
                        No assets match the current filters. Try loosening constraints (e.g. raise volatility ceiling or drop RSI bounds).
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save screen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Screen name (e.g. Tech momentum > ADX 25)"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCurrent();
              }}
            />
            <p className="text-xs text-muted-foreground">
              {activeCount} filter{activeCount === 1 ? "" : "s"} will be saved. Stored in your browser — not shared across devices.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={saveCurrent} disabled={!saveName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function rsiColor(v: number): string {
  if (isNaN(v)) return "text-muted-foreground";
  if (v > 70) return "text-red-400";   // overbought
  if (v < 30) return "text-emerald-400"; // oversold
  return "text-foreground";
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t border-border/40 pt-3 first:border-0 first:pt-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </div>
      {children}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{placeholder}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RangePair({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        value={value === undefined ? "" : String(value)}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") onChange(undefined);
          else {
            const n = Number(v);
            if (!isNaN(n)) onChange(n);
          }
        }}
        className="h-9"
      />
    </div>
  );
}
