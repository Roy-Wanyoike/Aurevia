// Shared formatting + color helpers for the Aurevia dashboard.

export function fmtPrice(n: number | undefined | null, digits = 2): string {
  if (n === undefined || n === null || isNaN(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (n >= 1) return n.toFixed(digits);
  return n.toFixed(4);
}

export function fmtPct(n: number | undefined | null, digits = 2): string {
  if (n === undefined || n === null || isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function fmtUsd(n: number | undefined | null, digits = 0): string {
  if (n === undefined || n === null || isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtCompact(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return "—";
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function fmtTime(ms: number | undefined | null): string {
  if (!ms) return "—";
  // Fixed UTC timezone — prevents SSR/client hydration mismatch when the
  // server and browser are in different timezones.
  return new Date(ms).toLocaleTimeString("en-US", { hour12: false, timeZone: "UTC" });
}

export function fmtDateTime(ms: number | undefined | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-US", {
    hour12: false,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function gainColor(n: number): string {
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-red-400";
  return "text-muted-foreground";
}

export function gainBg(n: number): string {
  if (n > 0) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (n < 0) return "bg-red-500/10 text-red-400 border-red-500/20";
  return "bg-muted text-muted-foreground";
}

export function actionColor(action: string): string {
  switch (action) {
    case "BUY": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "SELL": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "CLOSE": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

export function regimeColor(regime: string): string {
  switch (regime) {
    case "BULL":
    case "BREAKOUT":
    case "ACCUMULATION":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "BEAR":
    case "BREAKDOWN":
    case "CRASH":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "HIGH_VOLATILITY":
    case "DISTRIBUTION":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "RECOVERY":
    case "LOW_VOLATILITY":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function breakerColor(state: string): string {
  switch (state) {
    case "NORMAL": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "CAUTION": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "TRADING_PAUSED": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "RE_EVALUATING": return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

export function decisionColor(decision: string): string {
  switch (decision) {
    case "APPROVED": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "REJECTED": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "PAUSED": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

export function trendColor(direction: string): string {
  switch (direction) {
    case "UP": return "text-emerald-400";
    case "DOWN": return "text-red-400";
    default: return "text-muted-foreground";
  }
}

// Graduated drawdown color — low drawdown is good (green), high is bad (red).
// Fixes the inverted logic that colored all drawdowns red.
export function drawdownColor(drawdown: number): string {
  if (drawdown < 0.03) return "text-emerald-400";   // <3% — healthy
  if (drawdown < 0.08) return "text-amber-400";      // 3-8% — caution
  if (drawdown < 0.15) return "text-orange-400";     // 8-15% — elevated
  return "text-red-400";                              // >15% — severe
}
