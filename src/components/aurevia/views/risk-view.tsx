"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useRisk, useUpdateRisk, useSetBreaker } from "@/lib/aurevia/hooks";
import { breakerColor, fmtTime, fmtPct } from "@/lib/aurevia/format";
import { toast } from "sonner";
import { ShieldAlert, Save, AlertTriangle } from "lucide-react";

const BREAKER_STATES = ["NORMAL", "CAUTION", "TRADING_PAUSED", "RE_EVALUATING"];
const TRADING_MODES = ["ANALYSIS_ONLY", "PAPER", "SANDBOX", "LIVE"];

interface RiskProfile {
  maxPositionPct?: number;
  maxPortfolioPct?: number;
  maxLeverage?: number;
  maxDailyLossPct?: number;
  maxWeeklyLossPct?: number;
  maxDrawdownPct?: number;
  maxSpread?: number;
  maxVolatility?: number;
  minLiquidity?: number;
  cooldownMinutes?: number;
  tradingMode?: string;
  [k: string]: any;
}

const DEFAULT_PROFILE: RiskProfile = {
  maxPositionPct: 0.1,
  maxPortfolioPct: 1,
  maxLeverage: 1,
  maxDailyLossPct: 0.03,
  maxWeeklyLossPct: 0.06,
  maxDrawdownPct: 0.1,
  maxSpread: 0.01,
  maxVolatility: 0.05,
  minLiquidity: 1000000,
  cooldownMinutes: 30,
  tradingMode: "PAPER",
};

export function RiskView() {
  const { data, isLoading } = useRisk();
  const setBreaker = useSetBreaker();
  const qc = useQueryClient();

  function setBreakerState(state: string) {
    setBreaker.mutate(
      { state, reason: "manual override from risk console" },
      {
        onSuccess: () => {
          toast.success(`Circuit breaker set to ${state}`);
          qc.invalidateQueries({ queryKey: ["risk"] });
          qc.invalidateQueries({ queryKey: ["health"] });
        },
        onError: (e: any) => toast.error(e.message),
      }
    );
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-6 p-6">
        <Header />
        <div className="py-12 text-center text-sm text-muted-foreground">Loading risk engine…</div>
      </div>
    );
  }

  const breakerState = data?.portfolio?.circuitBreakerState ?? "NORMAL";
  const tradingMode = data?.profile?.tradingMode ?? data?.portfolio?.tradingMode ?? "PAPER";
  const drawdown = (data?.portfolio?.drawdown ?? 0) * 100;
  const maxDd = ((data?.profile?.maxDrawdownPct as number) ?? DEFAULT_PROFILE.maxDrawdownPct!) * 100;
  const drawdownPctOfLimit = Math.min(100, (drawdown / maxDd) * 100);
  const events: any[] = data?.events ?? [];
  const initialProfile: RiskProfile = { ...DEFAULT_PROFILE, ...(data?.profile ?? {}) };

  return (
    <div className="space-y-6 p-6">
      <Header />

      {/* Section 1: Circuit breaker */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-semibold">Circuit Breaker</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={breakerColor(breakerState)}>{breakerState}</Badge>
            <Badge variant="secondary" className="text-xs">Mode: {tradingMode}</Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BREAKER_STATES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={breakerState === s ? "default" : "outline"}
              onClick={() => setBreakerState(s)}
              disabled={setBreaker.isPending}
              className="text-xs"
            >
              {s}
            </Button>
          ))}
        </div>
        <div className="mt-4 rounded-md border border-border/60 p-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Portfolio Drawdown vs Limit</span>
            <span className="tabular">
              <span className={drawdown > maxDd * 0.8 ? "text-amber-400" : "text-foreground"}>{drawdown.toFixed(2)}%</span>
              <span className="text-muted-foreground"> / {maxDd.toFixed(2)}%</span>
            </span>
          </div>
          <Progress value={drawdownPctOfLimit} className="h-1.5" />
        </div>
      </Card>

      {/* Section 2: Risk profile editor */}
      <RiskProfileForm key={data?.profile ? "loaded" : "empty"} initial={initialProfile} />

      {/* Section 3: Risk events */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Risk Event Log</h3>
        <div className="max-h-80 overflow-y-auto rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e: any, i: number) => (
                <TableRow key={e.id ?? i}>
                  <TableCell className="text-xs text-muted-foreground">{fmtTime(e.timestamp ?? e.time)}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{e.type}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="outline" className={severityColor(e.severity)}>{e.severity}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.message}</TableCell>
                </TableRow>
              ))}
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">No risk events recorded.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function RiskProfileForm({ initial }: { initial: RiskProfile }) {
  const [profile, setProfile] = useState<RiskProfile>(initial);
  const update = useUpdateRisk();
  const qc = useQueryClient();

  function updateField(key: keyof RiskProfile, value: any) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  function saveProfile() {
    update.mutate(profile, {
      onSuccess: () => {
        toast.success("Risk profile updated");
        qc.invalidateQueries({ queryKey: ["risk"] });
      },
      onError: (e: any) => toast.error(e.message),
    });
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Risk Profile</h3>
        <Button size="sm" onClick={saveProfile} disabled={update.isPending} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Trading Mode">
          <Select value={profile.tradingMode ?? "PAPER"} onValueChange={(v) => updateField("tradingMode", v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TRADING_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Max Position %">
          <Input type="number" step="0.01" value={profile.maxPositionPct ?? 0.1} onChange={(e) => updateField("maxPositionPct", Number(e.target.value))} />
        </Field>
        <Field label="Max Portfolio %">
          <Input type="number" step="0.01" value={profile.maxPortfolioPct ?? 1} onChange={(e) => updateField("maxPortfolioPct", Number(e.target.value))} />
        </Field>
        <Field label="Max Leverage">
          <Input type="number" step="0.1" value={profile.maxLeverage ?? 1} onChange={(e) => updateField("maxLeverage", Number(e.target.value))} />
        </Field>
        <Field label="Max Daily Loss %">
          <Input type="number" step="0.01" value={profile.maxDailyLossPct ?? 0.03} onChange={(e) => updateField("maxDailyLossPct", Number(e.target.value))} />
        </Field>
        <Field label="Max Weekly Loss %">
          <Input type="number" step="0.01" value={profile.maxWeeklyLossPct ?? 0.06} onChange={(e) => updateField("maxWeeklyLossPct", Number(e.target.value))} />
        </Field>
        <Field label="Max Drawdown %">
          <Input type="number" step="0.01" value={profile.maxDrawdownPct ?? 0.1} onChange={(e) => updateField("maxDrawdownPct", Number(e.target.value))} />
        </Field>
        <Field label="Max Spread">
          <Input type="number" step="0.0001" value={profile.maxSpread ?? 0.01} onChange={(e) => updateField("maxSpread", Number(e.target.value))} />
        </Field>
        <Field label="Max Volatility">
          <Input type="number" step="0.01" value={profile.maxVolatility ?? 0.05} onChange={(e) => updateField("maxVolatility", Number(e.target.value))} />
        </Field>
        <Field label="Min Liquidity">
          <Input type="number" value={profile.minLiquidity ?? 1000000} onChange={(e) => updateField("minLiquidity", Number(e.target.value))} />
        </Field>
        <Field label="Cooldown (minutes)">
          <Input type="number" value={profile.cooldownMinutes ?? 30} onChange={(e) => updateField("cooldownMinutes", Number(e.target.value))} />
        </Field>
      </div>
      {profile.tradingMode === "LIVE" && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Live trading requires explicit safeguards.</div>
            <div className="text-amber-400/80">Aurevia defaults to PAPER. Switching to LIVE bypasses paper execution and may result in real capital losses.</div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Header() {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-2xl font-bold tracking-tight">Risk Engine</h2>
      <p className="text-sm text-muted-foreground">
        Pre-trade risk controls, circuit-breaker overrides, and the live risk event log.
      </p>
    </div>
  );
}

function severityColor(s: string): string {
  switch ((s ?? "").toUpperCase()) {
    case "INFO":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "WARN":
    case "WARNING":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "ERROR":
    case "CRITICAL":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
