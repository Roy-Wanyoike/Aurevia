"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  useMarkets,
  useRunBacktest,
  type RunBacktestInput,
} from "@/lib/aurevia/hooks";
import { toast } from "sonner";
import {
  Blocks,
  Plus,
  Trash2,
  Eye,
  Play,
  Save,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Settings2,
  ShieldCheck,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia Strategy Builder view (issue #56).
//
// A block-based UI for assembling a strategy spec without writing code:
//   - Entry conditions: indicator / operator / value, joined by AND / OR.
//   - Exit conditions: same pattern.
//   - Risk rules: position size %, stop loss %, take profit %.
//   - Regime filter: which regimes this strategy is active in.
//
// Three actions:
//   - "Preview" — shows the strategy as a sentence.
//   - "Backtest" — runs the spec through /api/v1/backtests using "momentum"
//     as the placeholder strategy key, but the conditions are passed in the
//     config so the spec is preserved with the result.
//   - "Save Strategy" — persists the spec to localStorage (no backend yet).
//
// No actual strategy execution — this is a builder UI that emits JSON.
// ---------------------------------------------------------------------------

type IndicatorKey =
  | "RSI"
  | "EMA20"
  | "EMA50"
  | "SMA50"
  | "SMA200"
  | "MACD"
  | "MACD_HIST"
  | "PRICE"
  | "ADX"
  | "STOCH_K"
  | "BOLLINGER_UPPER"
  | "BOLLINGER_LOWER";

type Operator = ">" | "<" | ">=" | "<=" | "==";

interface Condition {
  id: string;
  indicator: IndicatorKey;
  operator: Operator;
  value: string;
}

interface StrategySpec {
  name: string;
  description: string;
  entry: {
    conditions: Condition[];
    join: "AND" | "OR";
  };
  exit: {
    conditions: Condition[];
    join: "AND" | "OR";
  };
  risk: {
    positionPct: number;
    stopLossPct: number;
    takeProfitPct: number;
  };
  regimes: string[];
  symbol: string;
  bars: number;
  initialCapital: number;
}

const INDICATOR_OPTIONS: { value: IndicatorKey; label: string }[] = [
  { value: "RSI", label: "RSI (14)" },
  { value: "EMA20", label: "EMA (20)" },
  { value: "EMA50", label: "EMA (50)" },
  { value: "SMA50", label: "SMA (50)" },
  { value: "SMA200", label: "SMA (200)" },
  { value: "MACD", label: "MACD" },
  { value: "MACD_HIST", label: "MACD Histogram" },
  { value: "PRICE", label: "Price" },
  { value: "ADX", label: "ADX (14)" },
  { value: "STOCH_K", label: "Stochastic %K" },
  { value: "BOLLINGER_UPPER", label: "Bollinger Upper" },
  { value: "BOLLINGER_LOWER", label: "Bollinger Lower" },
];

const OPERATOR_OPTIONS: Operator[] = [">", "<", ">=", "<=", "=="];

const ALL_REGIMES = [
  "BULL",
  "BEAR",
  "SIDEWAYS",
  "ACCUMULATION",
  "DISTRIBUTION",
  "BREAKOUT",
  "BREAKDOWN",
  "RECOVERY",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY",
  "CRASH",
];

const DEFAULT_SPEC: StrategySpec = {
  name: "My Custom Strategy",
  description: "Built with the Aurevia Strategy Builder",
  entry: {
    conditions: [
      {
        id: "c-1",
        indicator: "RSI",
        operator: "<",
        value: "30",
      },
    ],
    join: "AND",
  },
  exit: {
    conditions: [
      {
        id: "x-1",
        indicator: "RSI",
        operator: ">",
        value: "70",
      },
    ],
    join: "AND",
  },
  risk: {
    positionPct: 0.95,
    stopLossPct: 0.05,
    takeProfitPct: 0.15,
  },
  regimes: ["BULL", "BREAKOUT", "ACCUMULATION", "RECOVERY"],
  symbol: "AAPL",
  bars: 500,
  initialCapital: 100000,
};

const STORAGE_KEY = "aurevia.strategy-builder.spec";

function newId(): string {
  return `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function loadSpec(): StrategySpec {
  if (typeof window === "undefined") return DEFAULT_SPEC;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SPEC;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SPEC, ...parsed };
  } catch {
    return DEFAULT_SPEC;
  }
}

export function StrategyBuilderView() {
  const markets = useMarkets();
  const run = useRunBacktest();
  const qc = useQueryClient();

  const [spec, setSpec] = useState<StrategySpec>(() => {
    // Lazy initializer — reads localStorage once on first client render.
    // Avoids the SSR-mismatch + setState-in-effect lint by doing the read
    // inside the initializer (which only runs on the client because this
    // is a "use client" component).
    if (typeof window === "undefined") return DEFAULT_SPEC;
    return loadSpec();
  });
  const [showPreview, setShowPreview] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function patch(partial: Partial<StrategySpec>) {
    setSpec((s) => ({ ...s, ...partial }));
  }

  function patchEntry(partial: Partial<StrategySpec["entry"]>) {
    setSpec((s) => ({ ...s, entry: { ...s.entry, ...partial } }));
  }
  function patchExit(partial: Partial<StrategySpec["exit"]>) {
    setSpec((s) => ({ ...s, exit: { ...s.exit, ...partial } }));
  }
  function patchRisk(partial: Partial<StrategySpec["risk"]>) {
    setSpec((s) => ({ ...s, risk: { ...s.risk, ...partial } }));
  }

  function addCondition(section: "entry" | "exit") {
    const c: Condition = {
      id: newId(),
      indicator: "RSI",
      operator: "<",
      value: "30",
    };
    if (section === "entry") {
      patchEntry({ conditions: [...spec.entry.conditions, c] });
    } else {
      patchExit({ conditions: [...spec.exit.conditions, c] });
    }
  }

  function updateCondition(
    section: "entry" | "exit",
    id: string,
    patch: Partial<Condition>,
  ) {
    const list = section === "entry" ? spec.entry.conditions : spec.exit.conditions;
    const next = list.map((c) => (c.id === id ? { ...c, ...patch } : c));
    if (section === "entry") patchEntry({ conditions: next });
    else patchExit({ conditions: next });
  }

  function removeCondition(section: "entry" | "exit", id: string) {
    const list = section === "entry" ? spec.entry.conditions : spec.exit.conditions;
    const next = list.filter((c) => c.id !== id);
    if (section === "entry") patchEntry({ conditions: next });
    else patchExit({ conditions: next });
  }

  function toggleRegime(regime: string) {
    const has = spec.regimes.includes(regime);
    patch({
      regimes: has
        ? spec.regimes.filter((r) => r !== regime)
        : [...spec.regimes, regime],
    });
  }

  function saveSpec() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(spec));
      setSavedAt(Date.now());
      toast.success("Strategy spec saved to localStorage");
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message ?? "unknown"}`);
    }
  }

  const sentence = buildSentence(spec);

  function runBacktest() {
    const input: RunBacktestInput = {
      // "momentum" is the placeholder key — the engine still executes
      // against the spec's symbol/bars/capital/risk. The full strategy
      // spec is recorded as a comment in the spec for future wiring to
      // a real custom-strategy engine.
      strategyKey: "momentum",
      symbol: spec.symbol,
      timeframe: "1d",
      bars: spec.bars,
      initialCapital: spec.initialCapital,
      positionPct: spec.risk.positionPct,
      stopLossPct: spec.risk.stopLossPct,
      takeProfitPct: spec.risk.takeProfitPct,
      allowShort: true,
      commissionBps: 5,
      slippageBps: 8,
    };
    run.mutate(input, {
      onSuccess: (d: any) => {
        // Persist the spec alongside the backtest id so future sessions can
        // trace results back to the spec that produced them.
        try {
          if (typeof window !== "undefined") {
            const historyRaw = window.localStorage.getItem(
              "aurevia.strategy-builder.history",
            );
            const history = historyRaw ? JSON.parse(historyRaw) : [];
            history.unshift({
              spec,
              backtestId: d.result?.id,
              at: Date.now(),
            });
            window.localStorage.setItem(
              "aurevia.strategy-builder.history",
              JSON.stringify(history.slice(0, 20)),
            );
          }
        } catch {
          /* non-fatal */
        }
        toast.success(
          `Backtest complete: ${d.result?.metrics?.totalReturnPct?.toFixed(2) ?? 0}% return`,
        );
        qc.invalidateQueries({ queryKey: ["backtests"] });
      },
      onError: (e: any) => toast.error(e.message),
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Strategy Builder</h2>
        <p className="text-sm text-muted-foreground">
          Assemble a strategy spec from blocks — entry conditions, exit conditions, risk rules, and regime filters. Preview, backtest, or save to localStorage.
        </p>
      </div>

      {/* Top-row meta + actions */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Strategy Name</Label>
            <Input
              value={spec.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Symbol</Label>
            <Select value={spec.symbol} onValueChange={(v) => patch({ symbol: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(markets.data ?? []).map((a) => (
                  <SelectItem key={a.symbol} value={a.symbol}>
                    {a.symbol} — {a.name.slice(0, 20)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Bars</Label>
            <Input
              type="number"
              min={60}
              max={2000}
              value={spec.bars}
              onChange={(e) => patch({ bars: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Initial Capital</Label>
            <Input
              type="number"
              value={spec.initialCapital}
              onChange={(e) => patch({ initialCapital: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview((v) => !v)} className="gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            {showPreview ? "Hide Preview" : "Preview"}
          </Button>
          <Button
            size="sm"
            onClick={runBacktest}
            disabled={run.isPending}
            className="gap-1.5"
          >
            <Play className="h-3.5 w-3.5" />
            {run.isPending ? "Running…" : "Backtest"}
          </Button>
          <Button variant="secondary" size="sm" onClick={saveSpec} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            Save Strategy
          </Button>
          {savedAt && (
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-emerald-400">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Saved {new Date(savedAt).toLocaleTimeString()}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs text-muted-foreground">
            v1 spec — localStorage
          </Badge>
        </div>

        {showPreview && (
          <div className="mt-3 rounded-md border border-cyan-500/30 bg-cyan-500/5 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-cyan-400">
              <Eye className="h-3.5 w-3.5" />
              Strategy Preview
            </div>
            <p className="text-sm text-foreground">
              <span className="font-mono font-semibold">{spec.name}</span>: {sentence}
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                Raw JSON spec
              </summary>
              <pre className="mt-2 max-h-60 overflow-auto rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(spec, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Entry conditions */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold">Entry Conditions</h3>
            </div>
            <Select
              value={spec.entry.join}
              onValueChange={(v: "AND" | "OR") => patchEntry({ join: v })}
            >
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">AND</SelectItem>
                <SelectItem value="OR">OR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            {spec.entry.conditions.map((c, i) => (
              <ConditionRow
                key={c.id}
                condition={c}
                index={i}
                join={spec.entry.join}
                onChange={(p) => updateCondition("entry", c.id, p)}
                onRemove={() => removeCondition("entry", c.id)}
              />
            ))}
            {spec.entry.conditions.length === 0 && (
              <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                No entry conditions. Add one to define when this strategy buys.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => addCondition("entry")}
              className="w-full gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Entry Condition
            </Button>
          </div>
        </Card>

        {/* Exit conditions */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-red-400 rotate-180" />
              <h3 className="text-sm font-semibold">Exit Conditions</h3>
            </div>
            <Select
              value={spec.exit.join}
              onValueChange={(v: "AND" | "OR") => patchExit({ join: v })}
            >
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">AND</SelectItem>
                <SelectItem value="OR">OR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            {spec.exit.conditions.map((c, i) => (
              <ConditionRow
                key={c.id}
                condition={c}
                index={i}
                join={spec.exit.join}
                onChange={(p) => updateCondition("exit", c.id, p)}
                onRemove={() => removeCondition("exit", c.id)}
              />
            ))}
            {spec.exit.conditions.length === 0 && (
              <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                No exit conditions. Add one to define when this strategy sells.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => addCondition("exit")}
              className="w-full gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Exit Condition
            </Button>
          </div>
        </Card>
      </div>

      {/* Risk rules + Regime filter */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Risk Rules</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Position Size (%)</Label>
              <Input
                type="number"
                step="0.01"
                min={0.01}
                max={1}
                value={spec.risk.positionPct}
                onChange={(e) =>
                  patchRisk({ positionPct: Number(e.target.value) })
                }
              />
              <p className="text-[10px] text-muted-foreground">
                Fraction of equity per trade (0.01 – 1.0)
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Stop Loss (%)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={0.5}
                value={spec.risk.stopLossPct}
                onChange={(e) =>
                  patchRisk({ stopLossPct: Number(e.target.value) })
                }
              />
              <p className="text-[10px] text-muted-foreground">
                Exit if price moves against by this fraction
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Take Profit (%)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={2}
                value={spec.risk.takeProfitPct}
                onChange={(e) =>
                  patchRisk({ takeProfitPct: Number(e.target.value) })
                }
              />
              <p className="text-[10px] text-muted-foreground">
                Exit if price moves in favor by this fraction
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <Label htmlFor="allowShort" className="text-xs">
              Allow Short Positions
            </Label>
            <Switch
              id="allowShort"
              checked={true}
              onCheckedChange={() => {
                /* always true for backtests; surfaced for clarity */
              }}
              disabled
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Backtests always allow shorts to fully exercise the strategy — flip this off in production risk rules.
          </p>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold">Regime Filter</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Strategy only fires in the selected regimes. Leave empty to run in all regimes.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALL_REGIMES.map((r) => {
              const checked = spec.regimes.includes(r);
              return (
                <label
                  key={r}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                    checked
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                      : "border-border/60 bg-card/40 text-muted-foreground hover:border-border"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleRegime(r)}
                  />
                  <span className="font-mono">{r}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <Badge variant="outline" className="text-xs">
              {spec.regimes.length} / {ALL_REGIMES.length} regimes
            </Badge>
            <button
              onClick={() => patch({ regimes: [] })}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={() => patch({ regimes: [...ALL_REGIMES] })}
              className="text-muted-foreground hover:text-foreground"
            >
              Select all
            </button>
          </div>
        </Card>
      </div>

      {/* Disclaimer */}
      <Card className="border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="font-semibold text-amber-400">Builder preview</div>
            <p>
              This is a builder UI that generates a strategy spec JSON. The &ldquo;Backtest&rdquo; button runs the spec through the existing momentum engine as a placeholder (the entry/exit conditions are preserved in the saved spec but not yet wired to a custom-strategy engine). Saving to localStorage preserves the spec across sessions; future iterations will register custom strategies with the engine.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

interface ConditionRowProps {
  condition: Condition;
  index: number;
  join: "AND" | "OR";
  onChange: (patch: Partial<Condition>) => void;
  onRemove: () => void;
}

function ConditionRow({ condition, index, join, onChange, onRemove }: ConditionRowProps) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-2">
      <div className="mb-2 flex items-center gap-2">
        {index === 0 ? (
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-emerald-400 text-[10px]">
            WHEN
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            {join}
          </Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {INDICATOR_OPTIONS.find((o) => o.value === condition.indicator)?.label ?? condition.indicator}
        </span>
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-red-400"
          aria-label="Remove condition"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Select
          value={condition.indicator}
          onValueChange={(v: IndicatorKey) => onChange({ indicator: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INDICATOR_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={condition.operator}
          onValueChange={(v: Operator) => onChange({ operator: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATOR_OPTIONS.map((op) => (
              <SelectItem key={op} value={op}>{op}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="text"
          value={condition.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="value"
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

function buildSentence(spec: StrategySpec): string {
  const entryStr = spec.entry.conditions.length
    ? spec.entry.conditions
        .map((c) => `${c.indicator} ${c.operator} ${c.value}`)
        .join(` ${spec.entry.join} `)
    : "always (no conditions)";
  const exitStr = spec.exit.conditions.length
    ? spec.exit.conditions
        .map((c) => `${c.indicator} ${c.operator} ${c.value}`)
        .join(` ${spec.exit.join} `)
    : "never (no conditions)";
  const regimeStr =
    spec.regimes.length === 0
      ? "any regime"
      : spec.regimes.length === ALL_REGIMES.length
        ? "all regimes"
        : `regimes [${spec.regimes.join(", ")}]`;
  return `BUY when ${entryStr}; SELL when ${exitStr}. Position size ${(spec.risk.positionPct * 100).toFixed(0)}% of equity, stop ${spec.risk.stopLossPct * 100}%, target ${spec.risk.takeProfitPct * 100}%. Active in ${regimeStr}.`;
}
