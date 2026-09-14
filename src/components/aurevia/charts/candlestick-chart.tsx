"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  CartesianGrid,
  Cell,
} from "recharts";
import { fmtPrice, fmtDateTime } from "@/lib/aurevia/format";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandlestickChartProps {
  candles: Candle[];
  overlays?: { key: string; color: string; data: (number | null)[]; label: string }[];
  height?: number;
  showVolume?: boolean;
}

// Compact candlestick chart built on recharts ComposedChart. Each bar is a
// custom high-low wick + open-close body, colored by direction.
export function CandlestickChart({ candles, overlays = [], height = 320, showVolume = true }: CandlestickChartProps) {
  if (!candles || candles.length === 0) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">No data</div>;
  }
  // Downsample to ~80 bars max for readability.
  const step = Math.max(1, Math.ceil(candles.length / 80));
  const sample = candles.filter((_, i) => i % step === 0).slice(-80);
  const overlaySamples = overlays.map((o) => ({
    ...o,
    data: o.data.filter((_, i) => i % step === 0).slice(-80),
  }));

  const data = sample.map((c, i) => {
    const row: any = {
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      up: c.close >= c.open,
      body: [Math.min(c.open, c.close), Math.max(c.open, c.close)],
      range: [c.low, c.high],
    };
    for (const o of overlaySamples) {
      row[o.key] = o.data[i] ?? null;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={(t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          tick={{ fill: "oklch(0.65 0.015 255)", fontSize: 11 }}
          stroke="oklch(1 0 0 / 10%)"
          minTickGap={30}
        />
        <YAxis
          orientation="right"
          domain={["auto", "auto"]}
          tick={{ fill: "oklch(0.65 0.015 255)", fontSize: 11 }}
          stroke="oklch(1 0 0 / 10%)"
          tickFormatter={(v) => fmtPrice(v, 0)}
          width={56}
        />
        <Tooltip
          contentStyle={{
            background: "oklch(0.178 0.020 255)",
            border: "1px solid oklch(1 0 0 / 10%)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelFormatter={(t) => fmtDateTime(t as number)}
          formatter={(value: any, name: string, props: any) => {
            // Show explicit OHLC values from the row's payload
            const row = props?.payload;
            if (row && name === "body") {
              return [
                <div key="ohlc" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span>O <span style={{ color: "oklch(0.96 0.008 250)" }}>{fmtPrice(row.open)}</span></span>
                  <span>H <span style={{ color: "oklch(0.96 0.008 250)" }}>{fmtPrice(row.high)}</span></span>
                  <span>L <span style={{ color: "oklch(0.96 0.008 250)" }}>{fmtPrice(row.low)}</span></span>
                  <span>C <span style={{ color: row.up ? "oklch(0.70 0.18 145)" : "oklch(0.62 0.22 12)" }}>{fmtPrice(row.close)}</span></span>
                  <span style={{ marginTop: 2, color: "oklch(0.65 0.015 255)" }}>Vol {fmtPrice(row.volume, 0)}</span>
                </div>,
                "OHLC",
              ];
            }
            if (name === "range") return null;
            if (name === "volume") return [fmtPrice(value, 0), "Volume"];
            return [fmtPrice(value), name];
          }}
        />
        {/* High-low wick */}
        <Bar dataKey="range" barSize={step > 2 ? 2 : 4} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.up ? "oklch(0.70 0.18 145 / 0.5)" : "oklch(0.62 0.22 12 / 0.5)"} />
          ))}
        </Bar>
        {/* Open-close body */}
        <Bar dataKey="body" barSize={step > 2 ? 4 : 8} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.up ? "oklch(0.70 0.18 145)" : "oklch(0.62 0.22 12)"} />
          ))}
        </Bar>
        {overlays.map((o) => (
          <Line
            key={o.key}
            type="monotone"
            dataKey={o.key}
            stroke={o.color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        ))}
        {showVolume && (
          <Bar dataKey="volume" barSize={step > 2 ? 2 : 4} fill="oklch(0.5 0.015 255 / 0.25)" yAxisId="vol" />
        )}
        {showVolume && (
          <YAxis
            yAxisId="vol"
            orientation="left"
            hide
            domain={[0, "auto"]}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
