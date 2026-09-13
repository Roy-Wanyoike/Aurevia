"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useRisk, useUpdateRisk } from "@/lib/aurevia/hooks";
import { toast } from "sonner";
import { Settings, Moon, AlertTriangle, Save, ArrowRight } from "lucide-react";

const TRADING_MODES = ["ANALYSIS_ONLY", "PAPER", "SANDBOX", "LIVE"];

export function SettingsView() {
  const { data } = useRisk();
  const initialMode =
    data?.profile?.tradingMode ?? data?.portfolio?.tradingMode ?? "PAPER";

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure trading mode, inspect theme defaults, and review the Aurevia architecture.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Theme info */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Moon className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold">Theme</h3>
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Mode" value="Dark (fixed)" />
            <Row label="Background" value="oklch(0.16 0.012 250)" />
            <Row label="Card surface" value="oklch(0.205 0.014 250)" />
            <Row label="Accent (gains)" value="emerald · oklch(0.72 0.17 162)" />
            <Row label="Loss" value="red-orange · oklch(0.65 0.21 25)" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Aurevia uses a fixed dark trading aesthetic for low-glare, high-contrast data density. Light mode is intentionally disabled.
          </p>
        </Card>

        {/* Trading mode */}
        <TradingModeSelector key={data ? "loaded" : "empty"} initial={initialMode} />
      </div>

      {/* About */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold">About</h3>
          <Badge variant="outline" className="font-mono text-xs">v0.1.0</Badge>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <Row label="Name" value="Aurevia — Market Intelligence Infrastructure" />
            <Row label="Version" value="0.1.0" />
            <Row label="Framework" value="Next.js 16 · App Router" />
            <Row label="Language" value="TypeScript 5" />
            <Row label="Database" value="Prisma (SQLite)" />
            <Row label="UI" value="shadcn/ui · Tailwind CSS 4" />
            <Row label="State" value="Zustand · TanStack Query" />
            <Row label="Execution" value="Paper broker (in-process)" />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pipeline</h4>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {["Market Data", "Quant", "Strategy", "Signal", "Risk", "Execution", "Broker", "Portfolio"].map((stage, i, arr) => (
                <span key={stage} className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="font-mono text-[10px]">{stage}</Badge>
                  {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Each stage is decoupled and observable. The risk engine sits between signal generation and execution, giving it veto power over every order.
            </p>
          </div>
        </div>
      </Card>

      {/* Architecture flow — polished SVG pipeline */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Architecture Flow</h3>
        <ArchitectureDiagram />
      </Card>
    </div>
  );
}

function ArchitectureDiagram() {
  // Polished SVG pipeline diagram — replaces the ASCII art that was here before.
  // Shows the 6-stage flow: Market Data → Quant → Strategy → Signal → Risk → Execution → Portfolio
  const stages = [
    { label: "Market Data", sub: "Gateway", color: "oklch(0.72 0.17 162)" },
    { label: "Quant Engine", sub: "Indicators", color: "oklch(0.62 0.13 220)" },
    { label: "Strategy", sub: "Signal Gen", color: "oklch(0.70 0.13 210)" },
    { label: "Risk Engine", sub: "Breaker + Limits", color: "oklch(0.65 0.21 25)" },
    { label: "Execution", sub: "Broker", color: "oklch(0.72 0.17 162)" },
    { label: "Portfolio", sub: "Equity + P&L", color: "oklch(0.78 0.18 300)" },
  ];
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-4">
      <div className="flex flex-wrap items-stretch gap-2">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="flex flex-col items-center rounded-lg border border-border/60 px-3 py-2.5 text-center" style={{ borderColor: s.color + "40" }}>
              <div className="h-2 w-2 rounded-full mb-1.5" style={{ background: s.color }} />
              <div className="text-xs font-semibold text-foreground">{s.label}</div>
              <div className="text-[10px] text-muted-foreground">{s.sub}</div>
            </div>
            {i < stages.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Each stage is decoupled and observable. The Risk Engine sits between signal generation and execution, giving it veto power over every order. Strategies never submit orders directly — they only emit Signals.
      </p>
      <a href="https://github.com/Roy-Wanyoike/Aurevia/blob/main/ARCHITECTURE.md" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline">
        Full architecture docs <ArrowRight className="h-3 w-3" />
      </a>
    </div>
  );
}

function TradingModeSelector({ initial }: { initial: string }) {
  const [tradingMode, setTradingMode] = useState(initial);
  const update = useUpdateRisk();
  const qc = useQueryClient();

  function saveMode() {
    update.mutate(
      { tradingMode },
      {
        onSuccess: () => {
          toast.success(`Trading mode set to ${tradingMode}`);
          qc.invalidateQueries({ queryKey: ["risk"] });
        },
        onError: (e: any) => toast.error(e.message),
      }
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Settings className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-semibold">Trading Mode</h3>
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mode</Label>
          <Select value={tradingMode} onValueChange={setTradingMode}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TRADING_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {tradingMode === "LIVE" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Live trading requires explicit configuration</AlertTitle>
            <AlertDescription>
              Aurevia defaults to PAPER. Switching to LIVE bypasses paper execution and exposes real capital to loss.
              Enable only after confirming broker credentials, risk limits, and circuit-breaker policies.
            </AlertDescription>
          </Alert>
        )}
        <Button onClick={saveMode} disabled={update.isPending} className="w-full gap-2">
          <Save className="h-4 w-4" />
          {update.isPending ? "Saving…" : "Save Trading Mode"}
        </Button>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
