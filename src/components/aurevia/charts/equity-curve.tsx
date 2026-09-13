"use client";

import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ReferenceLine, Legend } from "recharts";
import { fmtPrice, fmtDateTime } from "@/lib/aurevia/format";

interface Point {
  t: number;
  equity: number;
  benchmark: number;
}

export function EquityCurve({ data, height = 280 }: { data: Point[]; height?: number }) {
  if (!data || data.length === 0) {
    return <div className="flex h-40 items-center justify-center text-muted-foreground">No equity data</div>;
  }
  const first = data[0].equity;
  return (
    <div>
      {/* Legend — explains both lines */}
      <div className="mb-2 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-emerald-400" />
          <span className="text-muted-foreground">Strategy Equity</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-cyan-400" />
          <span className="text-muted-foreground">Benchmark (Buy & Hold)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t border-dashed border-muted-foreground/40" />
          <span className="text-muted-foreground">Initial Capital</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.72 0.17 162)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="oklch(0.72 0.17 162)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }}
            stroke="oklch(1 0 0 / 10%)"
            minTickGap={30}
          />
          <YAxis
            orientation="right"
            tick={{ fill: "oklch(0.68 0.012 250)", fontSize: 11 }}
            stroke="oklch(1 0 0 / 10%)"
            tickFormatter={(v) => fmtPrice(v, 0)}
            width={60}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "oklch(0.19 0.012 250)",
              border: "1px solid oklch(1 0 0 / 10%)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(t) => fmtDateTime(t as number)}
            formatter={(v: any, n: string) => [fmtPrice(v, 2), n === "equity" ? "Equity" : "Benchmark"]}
          />
          <ReferenceLine y={first} stroke="oklch(1 0 0 / 25%)" strokeDasharray="4 4" />
          {/* Benchmark — visible cyan dashed line (was nearly invisible slate) */}
          <Area type="monotone" dataKey="benchmark" stroke="oklch(0.70 0.13 210)" strokeWidth={1.5} fill="none" strokeDasharray="5 3" opacity={0.8} />
          {/* Strategy equity — emerald filled area */}
          <Area type="monotone" dataKey="equity" stroke="oklch(0.72 0.17 162)" strokeWidth={2} fill="url(#eq)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
