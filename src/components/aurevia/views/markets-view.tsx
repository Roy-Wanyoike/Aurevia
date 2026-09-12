"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarkets, type MarketAsset } from "@/lib/aurevia/hooks";
import { fmtPrice, fmtPct, fmtCompact, gainColor, gainBg } from "@/lib/aurevia/format";
import { useUI } from "@/lib/aurevia/ui-store";
import { ArrowUpRight, ArrowDownRight, Search, ArrowUpDown } from "lucide-react";

type AssetType = "All" | "Equity" | "ETF" | "Crypto" | "FX";
type SortKey = "symbol" | "changePct" | "volume24h";
type SortDir = "asc" | "desc";

const TYPE_TABS: AssetType[] = ["All", "Equity", "ETF", "Crypto", "FX"];

export function MarketsView() {
  const { data, isLoading } = useMarkets();
  const { openAsset } = useUI();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<AssetType>("All");
  const [sortKey, setSortKey] = useState<SortKey>("changePct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const assets = data ?? [];

  const summary = useMemo(() => {
    const advancers = assets.filter((a) => a.quote.changePct > 0).length;
    const decliners = assets.filter((a) => a.quote.changePct < 0).length;
    const flat = assets.length - advancers - decliners;
    return { total: assets.length, advancers, decliners, flat };
  }, [assets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets
      .filter((a) => (type === "All" ? true : a.assetType === type))
      .filter((a) =>
        q === ""
          ? true
          : a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const av = sortKey === "symbol" ? a.symbol : sortKey === "changePct" ? Math.abs(a.quote.changePct) : a.quote.volume24h;
        const bv = sortKey === "symbol" ? b.symbol : sortKey === "changePct" ? Math.abs(b.quote.changePct) : b.quote.volume24h;
        if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
      });
  }, [assets, query, type, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Markets</h2>
        <p className="text-sm text-muted-foreground">
          Live universe screener across equities, ETFs, crypto and FX. Click any row to open detailed analysis.
        </p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile label="Total Assets" value={summary.total} accent="default" />
        <SummaryTile label="Advancers" value={summary.advancers} accent="gain" />
        <SummaryTile label="Decliners" value={summary.decliners} accent="loss" />
        <SummaryTile label="Unchanged" value={summary.flat} accent="warn" />
      </div>

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search symbol or name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-full max-w-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {TYPE_TABS.map((t) => (
              <Button
                key={t}
                size="sm"
                variant={type === t ? "default" : "outline"}
                onClick={() => setType(t)}
                className="h-7 px-2.5 text-xs"
              >
                {t}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card">
                  <button onClick={() => toggleSort("symbol")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Symbol <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </button>
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Exchange</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Sector</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>
                  <button onClick={() => toggleSort("changePct")} className="inline-flex items-center gap-1 hover:text-foreground">
                    24h % <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </button>
                </TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="text-right">Spread</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a: MarketAsset) => {
                const up = a.quote.changePct >= 0;
                return (
                  <TableRow
                    key={a.symbol}
                    onClick={() => openAsset(a.symbol)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openAsset(a.symbol);
                      }
                    }}
                    className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <TableCell className="sticky left-0 z-10 bg-card font-semibold">{a.symbol}</TableCell>
                    <TableCell className="text-muted-foreground">{a.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{a.exchange}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{a.assetType}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.sector ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular">{fmtPrice(a.quote.price)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1 ${gainBg(a.quote.changePct)}`}>
                        {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        <span className="tabular">{fmtPct(a.quote.changePct)}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{fmtCompact(a.quote.volume24h)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{fmtPrice(a.quote.spread, 4)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {isLoading && (
          <div className="space-y-2 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-8 w-8 rounded" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-40" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">No assets match the current filters.</div>
        )}
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: number; accent: "gain" | "loss" | "warn" | "default" }) {
  const color =
    accent === "gain" ? "text-emerald-400" :
    accent === "loss" ? "text-red-400" :
    accent === "warn" ? "text-amber-400" :
    "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular ${color}`}>{value}</div>
    </Card>
  );
}
