"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QueryState, TableSkeleton } from "@/components/aurevia/query-state";
import { toast } from "sonner";
import {
  ShieldCheck,
  Users,
  Activity,
  Database,
  Cpu,
  Server,
  ScrollText,
  Flag,
  RefreshCw,
  Trash2,
  Plus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia — Admin View (Issue #123).
//
// Single-page admin dashboard with four cards:
//   1. System metrics — uptime, memory, breaker, signal/order/backtest counts
//   2. Users table — every user in the system (id/email/name/role/createdAt)
//   3. Feature flags — read-only list of NEXT_PUBLIC_ENABLE_* flags
//   4. Audit logs — recent immutable audit-log entries
//
// Each card fetches its own data independently (parallel queries, isolated
// loading/error states). Polling is conservative — 30s for system metrics
// (so the strip feels alive), staleTime of 60s on the others so navigation
// back to the view doesn't re-fetch.
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// --- System metrics types -----------------------------------------------
interface SystemStats {
  timestamp: string;
  process: {
    uptimeSec: number;
    pid: number;
    nodeVersion: string;
    platform: string;
    arch: string;
    memory: {
      rss: { bytes: number; human: string };
      heapUsed: { bytes: number; human: string };
      heapTotal: { bytes: number; human: string };
      external: { bytes: number; human: string };
      arrayBuffers: { bytes: number; human: string };
    };
    cpu: { userMicros: number; systemMicros: number };
  };
  store: {
    circuitBreakerState: string;
    tradingMode: string;
    signalsTracked: number;
    backtestsRun: number;
    ordersPlaced: number;
    riskEvents: number;
    universeSize: number;
    portfolioEquity: number;
    portfolioCash: number;
    portfolioMarketValue: number;
    portfolioUnrealizedPnl: number;
    portfolioRealizedPnl: number;
    portfolioDrawdown: number;
    portfolioExposure: number;
    startedAt: string;
    uptimeMs: number;
  };
  health: {
    brokerConnected: boolean;
    marketDataLatencyMs: number;
    lastTickAt: string | null;
    apiErrors: number;
  };
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

interface FeatureFlag {
  name: string;
  enabled: boolean;
}

interface AuditLogRow {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string | null;
  timestamp: string;
}

function useSystemStats() {
  return useQuery({
    queryKey: ["admin", "system"],
    queryFn: () => fetchJson<SystemStats>("/api/v1/admin/system"),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

function useAdminUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () =>
      fetchJson<{ users: AdminUser[]; total: number }>("/api/v1/admin/users").then((d) => d.users),
    staleTime: 60_000,
  });
}

function useFeatureFlags() {
  return useQuery({
    queryKey: ["admin", "feature-flags"],
    queryFn: () =>
      fetchJson<{ flags: FeatureFlag[]; readOnly: boolean }>("/api/v1/admin/feature-flags").then(
        (d) => d.flags,
      ),
    staleTime: 60_000,
  });
}

function useAuditLogs() {
  return useQuery({
    queryKey: ["admin", "audit-logs"],
    queryFn: () =>
      fetchJson<{ items: AuditLogRow[] }>("/api/v1/admin/audit-logs?limit=25").then((d) => d.items),
    staleTime: 30_000,
  });
}

function useApiKeys() {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: () => fetchJson<{ keys: any[] }>("/api/v1/api-keys").then((d) => d.keys),
    staleTime: 15_000,
  });
}

function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      fetchJson<{ key: string; id: string; name: string }>("/api/v1/api-keys", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (data) => {
      // The plaintext key is returned ONCE — show it in a toast with a copy
      // button so the user can stash it in their secrets manager.
      await navigator.clipboard.writeText(data.key).catch(() => {});
      toast.success("API key created", {
        description: "Copied to clipboard — store it now, it won't be shown again.",
        duration: 10_000,
      });
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: Error) => toast.error(`Failed to create key: ${e.message}`),
  });
}

function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ ok: boolean; id: string }>(`/api/v1/api-keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      toast.success("API key revoked");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: Error) => toast.error(`Failed to revoke: ${e.message}`),
  });
}

function fmtUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return `${d}d ${rh}h`;
}

function breakerColor(state: string): string {
  switch (state) {
    case "NORMAL": return "text-emerald-400";
    case "CAUTION": return "text-amber-400";
    case "TRADING_PAUSED": return "text-red-400";
    case "RE_EVALUATING": return "text-cyan-400";
    default: return "text-muted-foreground";
  }
}

function roleColor(role: string): string {
  switch (role) {
    case "admin": return "text-cyan-400";
    case "viewer": return "text-muted-foreground";
    default: return "text-emerald-400";
  }
}

export function AdminView() {
  const system = useSystemStats();
  const users = useAdminUsers();
  const flags = useFeatureFlags();
  const audit = useAuditLogs();
  const apiKeys = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">Admin Panel</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Operate the platform: system health, users, feature flags, audit logs, and API keys.
        </p>
      </div>

      {/* --- System metrics strip --- */}
      <QueryState
        isLoading={system.isLoading}
        isError={system.isError}
        error={system.error}
        onRetry={() => system.refetch()}
        data={system.data}
      >
        {(d) => (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <MetricTile
              icon={<Activity className="h-3.5 w-3.5" />}
              label="Uptime"
              value={fmtUptime(d.process.uptimeSec)}
            />
            <MetricTile
              icon={<Cpu className="h-3.5 w-3.5" />}
              label="Memory (RSS)"
              value={d.process.memory.rss.human}
            />
            <MetricTile
              icon={<Database className="h-3.5 w-3.5" />}
              label="Heap Used"
              value={d.process.memory.heapUsed.human}
            />
            <MetricTile
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label="Circuit Breaker"
              value={d.store.circuitBreakerState}
              valueClassName={breakerColor(d.store.circuitBreakerState)}
            />
            <MetricTile
              icon={<Server className="h-3.5 w-3.5" />}
              label="Trading Mode"
              value={d.store.tradingMode}
            />
            <MetricTile
              icon={<Activity className="h-3.5 w-3.5" />}
              label="Latency"
              value={`${d.health.marketDataLatencyMs}ms`}
              valueClassName={d.health.marketDataLatencyMs > 100 ? "text-amber-400" : "text-emerald-400"}
            />
            <MetricTile icon={<Activity className="h-3.5 w-3.5" />} label="Signals" value={`${d.store.signalsTracked}`} />
            <MetricTile icon={<Activity className="h-3.5 w-3.5" />} label="Backtests" value={`${d.store.backtestsRun}`} />
            <MetricTile icon={<Activity className="h-3.5 w-3.5" />} label="Orders" value={`${d.store.ordersPlaced}`} />
            <MetricTile icon={<Activity className="h-3.5 w-3.5" />} label="Risk Events" value={`${d.store.riskEvents}`} />
            <MetricTile icon={<Activity className="h-3.5 w-3.5" />} label="Universe" value={`${d.store.universeSize}`} />
            <MetricTile
              icon={<Activity className="h-3.5 w-3.5" />}
              label="API Errors"
              value={`${d.health.apiErrors}`}
              valueClassName={d.health.apiErrors > 0 ? "text-red-400" : "text-emerald-400"}
            />
          </div>
        )}
      </QueryState>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* --- Users table --- */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">Users</h3>
              <Badge variant="outline" className="text-xs">
                {users.data?.length ?? 0}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => users.refetch()}
              className="gap-1.5 text-xs"
              disabled={users.isFetching}
            >
              <RefreshCw className={`h-3 w-3 ${users.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          {users.isLoading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : users.isError ? (
            <p className="text-xs text-red-400">Failed to load users</p>
          ) : (
            <ScrollArea className="max-h-72">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Role</TableHead>
                    <TableHead className="text-xs">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.data?.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs">{u.email}</TableCell>
                      <TableCell className="text-xs">{u.name ?? "—"}</TableCell>
                      <TableCell className={`text-xs font-medium ${roleColor(u.role)}`}>
                        {u.role}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.data?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-xs text-muted-foreground">
                        No users yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </Card>

        {/* --- Feature flags --- */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold">Feature Flags</h3>
              <Badge variant="outline" className="text-xs">read-only</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => flags.refetch()}
              className="gap-1.5 text-xs"
              disabled={flags.isFetching}
            >
              <RefreshCw className={`h-3 w-3 ${flags.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          {flags.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : flags.isError ? (
            <p className="text-xs text-red-400">Failed to load flags</p>
          ) : (
            <div className="space-y-2">
              {flags.data?.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2"
                >
                  <span className="font-mono text-xs">{f.name}</span>
                  <Switch checked={f.enabled} disabled aria-label={`${f.name} flag`} />
                </div>
              ))}
              {flags.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">No flags configured</p>
              )}
            </div>
          )}
        </Card>

        {/* --- Audit logs --- */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold">Audit Logs</h3>
              <Badge variant="outline" className="text-xs">
                {audit.data?.length ?? 0}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => audit.refetch()}
              className="gap-1.5 text-xs"
              disabled={audit.isFetching}
            >
              <RefreshCw className={`h-3 w-3 ${audit.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          {audit.isLoading ? (
            <TableSkeleton rows={4} cols={3} />
          ) : audit.isError ? (
            <p className="text-xs text-red-400">Failed to load audit logs</p>
          ) : (
            <ScrollArea className="max-h-72">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Actor</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.data?.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.actor}</TableCell>
                      <TableCell className="text-xs">
                        <span className="font-medium">{row.action}</span>
                        {row.entity && (
                          <span className="ml-1 text-muted-foreground">on {row.entity}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(row.timestamp).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {audit.data?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                        No audit entries yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </Card>

        {/* --- API keys (Issue #122) --- */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">API Keys</h3>
              <Badge variant="outline" className="text-xs">
                {apiKeys.data?.length ?? 0}
              </Badge>
            </div>
          </div>
          <ApiKeyCreator
            onCreate={(name) => createKey.mutate({ name })}
            isPending={createKey.isPending}
          />
          {apiKeys.isLoading ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : apiKeys.isError ? (
            <p className="mt-3 text-xs text-red-400">Failed to load API keys</p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {apiKeys.data?.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{k.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {k.maskedKey} · created {new Date(k.createdAt).toLocaleDateString()}
                      {k.lastUsedAt && ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-400"
                    onClick={() => revokeKey.mutate(k.id)}
                    disabled={revokeKey.isPending}
                    aria-label={`Revoke key ${k.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {apiKeys.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No active API keys. Create one above to start authenticating API requests.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1 truncate text-sm font-semibold tabular ${valueClassName ?? ""}`} title={value}>
        {value}
      </div>
    </Card>
  );
}

function ApiKeyCreator({
  onCreate,
  isPending,
}: {
  onCreate: (name: string) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onCreate(name.trim());
        setName("");
      }}
      className="flex items-end gap-2"
    >
      <div className="flex-1">
        <Label htmlFor="apikey-name" className="text-xs">
          New API key name
        </Label>
        <Input
          id="apikey-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. local-dev"
          className="mt-1 h-8 text-xs"
          maxLength={80}
          disabled={isPending}
        />
      </div>
      <Button type="submit" size="sm" className="gap-1.5" disabled={isPending || !name.trim()}>
        {isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Generate
      </Button>
    </form>
  );
}
