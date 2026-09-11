"use client";

import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ReferenceLine } from "recharts";
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
        <ReferenceLine y={first} stroke="oklch(1 0 0 / 15%)" strokeDasharray="4 4" />
        <Area type="monotone" dataKey="benchmark" stroke="oklch(0.5 0.01 250)" strokeWidth={1} fill="none" strokeDasharray="3 3" />
        <Area type="monotone" dataKey="equity" stroke="oklch(0.72 0.17 162)" strokeWidth={2} fill="url(#eq)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
