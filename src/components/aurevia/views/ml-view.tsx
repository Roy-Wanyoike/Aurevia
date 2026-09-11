"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Brain, Sparkles, TrendingUp, TrendingDown, Activity, Shield } from "lucide-react";
import { toast } from "sonner";
import { fmtPct, fmtPrice } from "@/lib/aurevia/format";

const SYMBOLS = ["AAPL", "MSFT", "NVDA", "BTC", "ETH", "SPY", "QQQ", "TSLA", "AMZN", "GOOGL", "META"];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

interface MLModel {
  key: string;
  name: string;
  version: string;
  horizon: string;
  trainedAt: number;
}
interface MLPrediction {
  symbol: string;
  modelKey: string;
  modelVersion: string;
  probabilityUp: number;
  expectedReturn: number;
  expectedVolatility: number;
  riskScore: number;
  regimeConfidence: number;
  features: Record<string, number>;
  timestamp: number;
}

export function MLView() {
  const [modelKey, setModelKey] = useState("alm-v1");
  const [symbol, setSymbol] = useState("AAPL");
  const qc = useQueryClient();

  const models = useQuery({
    queryKey: ["ml-models"],
    queryFn: () => fetchJson<{ models: MLModel[]; predictions: MLPrediction[] }>("/api/v1/ml").then((d) => d.models),
  });
  const predictions = useQuery({
    queryKey: ["ml-predictions"],
    queryFn: () => fetchJson<{ models: MLModel[]; predictions: MLPrediction[]; total: number }>("/api/v1/ml").then((d) => d.predictions),
    refetchInterval: 30_000,
  });

  const predict = useMutation({
    mutationFn: () => fetchJson<{ prediction: MLPrediction }>("/api/v1/ml", {
      method: "POST",
      body: JSON.stringify({ modelKey, symbol }),
    }),
    onSuccess: () => {
      toast.success(`Prediction generated: ${modelKey} on ${symbol}`);
      qc.invalidateQueries({ queryKey: ["ml-predictions"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const latestPred = predictions.data?.find((p) => p.symbol === symbol && p.modelKey === modelKey);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">ML Predictions</h2>
        <p className="text-sm text-muted-foreground">
          Machine learning models that estimate probability of positive returns, expected magnitude, and risk. Predictions flow through the same Signal → Risk → Execution pipeline as rule-based strategies.
        </p>
      </div>

      {/* Run prediction */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-semibold">Run Prediction</h3>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Model</label>
            <Select value={modelKey} onValueChange={setModelKey}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(models.data ?? []).map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.name} ({m.horizon})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Symbol</label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYMBOLS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => predict.mutate()}
            disabled={predict.isPending}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            {predict.isPending ? "Predicting…" : "Run Prediction"}
          </Button>
        </div>
      </Card>

      {/* Latest prediction detail */}
      {latestPred ? (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">
                {symbol} · {latestPred.modelKey} v{latestPred.modelVersion}
              </h3>
            </div>
            <Badge variant="outline" className="font-mono text-xs">{modelKey.includes("alm") ? "5-bar" : "20-bar"} horizon</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard
              label="Probability Up"
              value={`${(latestPred.probabilityUp * 100).toFixed(1)}%`}
              icon={latestPred.probabilityUp >= 0.5 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
              bar={latestPred.probabilityUp * 100}
              barColor={latestPred.probabilityUp >= 0.5 ? "emerald" : "red"}
            />
            <MetricCard
              label="Expected Return"
              value={fmtPct(latestPred.expectedReturn * 100, 2)}
              icon={<TrendingUp className="h-3.5 w-3.5 text-cyan-400" />}
            />
            <MetricCard
              label="Risk Score"
              value={`${(latestPred.riskScore * 100).toFixed(0)}/100`}
              icon={<Shield className="h-3.5 w-3.5 text-amber-400" />}
              bar={latestPred.riskScore * 100}
              barColor={latestPred.riskScore > 0.5 ? "red" : "amber"}
            />
            <MetricCard
              label="Regime Confidence"
              value={`${(latestPred.regimeConfidence * 100).toFixed(0)}%`}
              icon={<Activity className="h-3.5 w-3.5 text-purple-400" />}
              bar={latestPred.regimeConfidence * 100}
              barColor="purple"
            />
          </div>
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Feature Importance</h4>
            <div className="space-y-1.5">
              {Object.entries(latestPred.features).map(([k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-32 text-xs text-muted-foreground">{k}</span>
                  <div className="flex-1">
                    <Progress value={v * 100} className="h-1.5" />
                  </div>
                  <span className="w-12 text-right text-xs tabular text-muted-foreground">{v.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400/80">
            ⚠ ML predictions are probabilistic estimates, NOT guarantees. Historical performance does not predict future results.
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No prediction yet for {symbol} · {modelKey}. Click "Run Prediction" to generate one.
        </Card>
      )}

      {/* All predictions table */}
      <Card className="p-0">
        <div className="border-b border-border/60 px-4 py-2">
          <h3 className="text-sm font-semibold">Recent Predictions</h3>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border/60 text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left">Symbol</th>
                <th className="px-4 py-2 text-left">Model</th>
                <th className="px-4 py-2 text-right">Prob. Up</th>
                <th className="px-4 py-2 text-right">Exp. Return</th>
                <th className="px-4 py-2 text-right">Risk</th>
                <th className="px-4 py-2 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {(predictions.data ?? []).slice(0, 30).map((p, i) => (
                <tr key={`${p.symbol}-${p.modelKey}-${i}`} className="border-b border-border/30 hover:bg-accent/20">
                  <td className="px-4 py-2 font-medium">{p.symbol}</td>
                  <td className="px-4 py-2"><Badge variant="secondary" className="font-mono text-[10px]">{p.modelKey}</Badge></td>
                  <td className={`px-4 py-2 text-right tabular ${p.probabilityUp >= 0.5 ? "text-emerald-400" : "text-red-400"}`}>
                    {(p.probabilityUp * 100).toFixed(0)}%
                  </td>
                  <td className={`px-4 py-2 text-right tabular ${p.expectedReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtPct(p.expectedReturn * 100, 2)}
                  </td>
                  <td className="px-4 py-2 text-right tabular text-amber-400">{(p.riskScore * 100).toFixed(0)}</td>
                  <td className="px-4 py-2 text-right tabular text-muted-foreground">{(p.regimeConfidence * 100).toFixed(0)}%</td>
                </tr>
              ))}
              {(predictions.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No predictions yet. Run a prediction above or scan the universe from the Signals view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  bar,
  barColor = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  bar?: number;
  barColor?: "emerald" | "red" | "amber" | "purple" | "default";
}) {
  const colorClass = {
    emerald: "[&>div]:bg-emerald-500",
    red: "[&>div]:bg-red-500",
    amber: "[&>div]:bg-amber-500",
    purple: "[&>div]:bg-purple-500",
    default: "",
  }[barColor];
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold tabular">{value}</div>
      {bar !== undefined && (
        <Progress value={bar} className={`mt-2 h-1 ${colorClass}`} />
      )}
    </div>
  );
}
