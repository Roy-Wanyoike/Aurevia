import type { MarketContext, Signal, Action } from "../types";

// ---------------------------------------------------------------------------
// Strategy plugin contract. A strategy NEVER submits orders — it only emits a
// Signal (or null). The risk engine + execution engine decide what happens
// next. This is the single-source-of-truth enforcement boundary.
// ---------------------------------------------------------------------------

export interface Strategy {
  key: string;
  name: string;
  description: string;
  category: "momentum" | "trend" | "mean-reversion" | "breakout" | "regime";
  version: string;
  defaultParams: Record<string, number | string>;
  // Pure evaluation. Returns a Signal or null (no action).
  evaluate(ctx: MarketContext, params?: Record<string, number | string>): Omit<Signal, "id" | "timestamp"> | null;
}

let idCounter = 0;
function nextId(): string {
  idCounter++;
  return `sig-${Date.now().toString(36)}-${idCounter}`;
}

// Wrap a raw strategy output into a full Signal with id + timestamp.
export function toSignal(
  raw: Omit<Signal, "id" | "timestamp"> | null
): Signal | null {
  if (!raw) return null;
  return { ...raw, id: nextId(), timestamp: Date.now() };
}

// Helper for confidence clamping.
export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export const ACTION = {
  BUY: "BUY" as Action,
  SELL: "SELL" as Action,
  HOLD: "HOLD" as Action,
  CLOSE: "CLOSE" as Action,
};
