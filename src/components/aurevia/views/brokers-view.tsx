"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plug, Unplug, Router as RouterIcon, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

interface BrokerEntry {
  kind: string;
  connected: boolean;
  healthy: boolean;
  lastHealthCheck: number;
}

export function BrokersView() {
  const qc = useQueryClient();
  const [brokerKind, setBrokerKind] = useState<"alpaca" | "ibkr">("alpaca");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [accountId, setAccountId] = useState("");
  const [mode, setMode] = useState<"PAPER" | "SANDBOX" | "LIVE">("PAPER");

  const brokers = useQuery({
    queryKey: ["brokers"],
    queryFn: () => fetchJson<{ brokers: BrokerEntry[]; total: number }>("/api/v1/brokers").then((d) => d.brokers),
    refetchInterval: 15_000,
  });

  const connect = useMutation({
    mutationFn: () =>
      fetchJson<{ ok: boolean; brokers: BrokerEntry[] }>("/api/v1/brokers", {
        method: "POST",
        body: JSON.stringify({ action: "connect", kind: brokerKind, apiKey, apiSecret, accountId, mode }),
      }),
    onSuccess: () => {
      toast.success(`Connected to ${brokerKind} (${mode})`);
      qc.invalidateQueries({ queryKey: ["brokers"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Broker Adapters</h2>
        <p className="text-sm text-muted-foreground">
          Multi-broker routing infrastructure. Connect to Alpaca, Interactive Brokers, or use the built-in paper broker. Orders route to the best venue based on fees, liquidity, and availability.
        </p>
      </div>

      {/* Connected brokers */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <RouterIcon className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold">Registered Brokers</h3>
        </div>
        <div className="space-y-2">
          {(brokers.data ?? []).map((b) => (
            <div key={b.kind} className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${b.healthy ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                  {b.connected ? <Plug className="h-4 w-4" /> : <Unplug className="h-4 w-4" />}
                </div>
                <div>
                  <div className="text-sm font-medium capitalize">{b.kind === "ibkr" ? "Interactive Brokers" : b.kind}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.connected ? "Connected" : "Disconnected"} · {b.healthy ? "Healthy" : "Unhealthy"}
                  </div>
                </div>
              </div>
              <Badge variant="outline" className={b.healthy ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-muted text-muted-foreground"}>
                {b.healthy ? "● ONLINE" : "○ OFFLINE"}
              </Badge>
            </div>
          ))}
          {(brokers.data ?? []).length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading brokers…</div>
          )}
        </div>
      </Card>

      {/* Connect new broker */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Plug className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold">Connect Broker</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="broker-kind">Broker</Label>
              <Select value={brokerKind} onValueChange={(v) => setBrokerKind(v as "alpaca" | "ibkr")}>
                <SelectTrigger id="broker-kind" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alpaca">Alpaca</SelectItem>
                  <SelectItem value="ibkr">Interactive Brokers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="broker-mode">Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "PAPER" | "SANDBOX" | "LIVE")}>
                <SelectTrigger id="broker-mode" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAPER">Paper (simulated)</SelectItem>
                  <SelectItem value="SANDBOX">Sandbox (broker test env)</SelectItem>
                  <SelectItem value="LIVE">Live (real money — dangerous)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="broker-account">Account ID (optional)</Label>
              <Input id="broker-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="e.g. DU1234567" className="h-9" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="broker-key">API Key</Label>
              <Input id="broker-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AKXXXXXXXXXXXXXX" className="h-9 font-mono" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="broker-secret">API Secret</Label>
              <Input id="broker-secret" type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="••••••••••••••••••••••" className="h-9 font-mono" />
            </div>
            {mode === "LIVE" && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  <strong>LIVE mode warning:</strong> Real money will be at risk. Ensure your API key has withdrawal DISABLED and trading-only permissions. Never use unrestricted keys.
                </div>
              </div>
            )}
            <Button
              onClick={() => connect.mutate()}
              disabled={connect.isPending || !apiKey || !apiSecret}
              className="w-full gap-2"
            >
              <Plug className="h-4 w-4" />
              {connect.isPending ? "Connecting…" : `Connect to ${brokerKind === "ibkr" ? "IBKR" : "Alpaca"}`}
            </Button>
          </div>
        </div>
      </Card>

      {/* Safety note */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div className="text-sm">
            <div className="font-medium">Broker Security</div>
            <p className="mt-1 text-xs text-muted-foreground">
              All broker credentials are stored encrypted at rest. API keys must be trading-only (withdrawal disabled). Secrets never appear in logs, audit trails, or error messages. The broker router is the only component that decides execution venue — strategies and the risk engine never know which broker will handle an order.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
