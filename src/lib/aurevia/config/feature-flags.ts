// ---------------------------------------------------------------------------
// Aurevia — Feature flag system (Issue #111).
//
// Today this is a thin wrapper over env vars: each known flag maps to a
// `NEXT_PUBLIC_ENABLE_*` env var (the `NEXT_PUBLIC_` prefix is intentional —
// it lets the client bundle read the flag too, so the frontend can hide a
// "Live Trading" nav item without a round-trip to the server).
//
// Why env vars instead of a DB table? Phase 1 has no operators UI yet, and a
// flag flip should require a deliberate deploy / env-var change — not a
// careless admin click. Phase 2 will grow a database-backed FlagStore with
// tenant / user / percentage rollouts, but the public API of this module
// (`isFeatureEnabled(flag)`, `getAllFlags()`) stays the same so callers don't
// change.
//
// Truthiness rules: only the literal strings "true" and "1" count as on.
// "false", "0", "" and unset all count as off. This avoids the classic
// `process.env.X = "false"` → `if (X)` → truthy bug.
// ---------------------------------------------------------------------------

type FlagValue = boolean;

const ENV_FLAGS: Record<string, string> = {
  ml: "NEXT_PUBLIC_ENABLE_ML",
  broker_connect: "NEXT_PUBLIC_ENABLE_BROKER_CONNECT",
  live_trading: "NEXT_PUBLIC_ENABLE_LIVE_TRADING",
  ai_copilot: "NEXT_PUBLIC_ENABLE_AI_COPILOT",
  market_replay: "NEXT_PUBLIC_ENABLE_MARKET_REPLAY",
};

/**
 * Return true iff the named flag's env var is set to "true" or "1".
 *
 * Unknown flag names return false (fail closed) — a typo in the flag string
 * should never enable a feature by accident.
 */
export function isFeatureEnabled(flag: string): boolean {
  const envVar = ENV_FLAGS[flag];
  if (!envVar) return false;
  const val = process.env[envVar];
  return val === "true" || val === "1";
}

/**
 * Snapshot of every known flag and its current state.
 *
 * Used by the admin /feature-flags endpoint and by client-side hydration.
 * The array order is stable (insertion order of ENV_FLAGS) so the admin UI
 * doesn't reshuffle on every render.
 */
export function getAllFlags(): { name: string; enabled: FlagValue }[] {
  return Object.entries(ENV_FLAGS).map(([name, envVar]) => ({
    name,
    enabled: process.env[envVar] === "true" || process.env[envVar] === "1",
  }));
}

/**
 * The list of known flag names. Exposed so consumers (tests, admin UI) can
 * iterate without depending on the env-var mapping internals.
 */
export const FLAG_NAMES = Object.keys(ENV_FLAGS);
