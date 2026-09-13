import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isFeatureEnabled, getAllFlags, FLAG_NAMES } from "./feature-flags";

// ---------------------------------------------------------------------------
// Issue #111 — feature flag unit tests.
//
// Flags are read from `process.env[NEXT_PUBLIC_ENABLE_*]`. Only "true" and
// "1" count as on — "false", "0", "" and unset all count as off. Unknown
// flag names fail closed (return false). These tests pin that contract so
// a future refactor can't accidentally turn a flag on by deleting an env var.
// ---------------------------------------------------------------------------

const ENV_VARS = {
  ml: "NEXT_PUBLIC_ENABLE_ML",
  broker_connect: "NEXT_PUBLIC_ENABLE_BROKER_CONNECT",
  live_trading: "NEXT_PUBLIC_ENABLE_LIVE_TRADING",
  ai_copilot: "NEXT_PUBLIC_ENABLE_AI_COPILOT",
  market_replay: "NEXT_PUBLIC_ENABLE_MARKET_REPLAY",
} as const;

describe("isFeatureEnabled — truthiness rules", () => {
  beforeEach(() => {
    // Start each test from a clean slate so flags don't leak across cases.
    for (const v of Object.values(ENV_VARS)) delete process.env[v];
  });
  afterEach(() => {
    for (const v of Object.values(ENV_VARS)) delete process.env[v];
  });

  it('returns true when env var is exactly "true"', () => {
    process.env.NEXT_PUBLIC_ENABLE_ML = "true";
    expect(isFeatureEnabled("ml")).toBe(true);
  });

  it('returns true when env var is exactly "1"', () => {
    process.env.NEXT_PUBLIC_ENABLE_BROKER_CONNECT = "1";
    expect(isFeatureEnabled("broker_connect")).toBe(true);
  });

  it('returns false when env var is "false" (NOT truthy-by-string-presence)', () => {
    process.env.NEXT_PUBLIC_ENABLE_LIVE_TRADING = "false";
    expect(isFeatureEnabled("live_trading")).toBe(false);
  });

  it('returns false when env var is "0"', () => {
    process.env.NEXT_PUBLIC_ENABLE_AI_COPILOT = "0";
    expect(isFeatureEnabled("ai_copilot")).toBe(false);
  });

  it("returns false when env var is unset", () => {
    expect(isFeatureEnabled("market_replay")).toBe(false);
  });

  it('returns false when env var is an empty string', () => {
    process.env.NEXT_PUBLIC_ENABLE_ML = "";
    expect(isFeatureEnabled("ml")).toBe(false);
  });

  it("returns false for an unknown flag name (fail closed)", () => {
    expect(isFeatureEnabled("nonexistent_flag")).toBe(false);
    expect(isFeatureEnabled("ML")).toBe(false); // case-sensitive
    expect(isFeatureEnabled("")).toBe(false);
  });
});

describe("getAllFlags — snapshot shape", () => {
  beforeEach(() => {
    for (const v of Object.values(ENV_VARS)) delete process.env[v];
  });
  afterEach(() => {
    for (const v of Object.values(ENV_VARS)) delete process.env[v];
  });

  it("returns one entry per known flag", () => {
    const flags = getAllFlags();
    expect(flags).toHaveLength(FLAG_NAMES.length);
    expect(FLAG_NAMES.length).toBe(5);
  });

  it("all flags default to false when env vars are unset", () => {
    const flags = getAllFlags();
    expect(flags.every((f) => f.enabled === false)).toBe(true);
  });

  it("reflects the current state of each env var", () => {
    process.env.NEXT_PUBLIC_ENABLE_ML = "true";
    process.env.NEXT_PUBLIC_ENABLE_LIVE_TRADING = "1";
    const flags = getAllFlags();
    const ml = flags.find((f) => f.name === "ml");
    const live = flags.find((f) => f.name === "live_trading");
    const copilot = flags.find((f) => f.name === "ai_copilot");
    expect(ml?.enabled).toBe(true);
    expect(live?.enabled).toBe(true);
    expect(copilot?.enabled).toBe(false);
  });

  it("returns stable order matching FLAG_NAMES", () => {
    const flags = getAllFlags();
    expect(flags.map((f) => f.name)).toEqual(FLAG_NAMES);
  });
});
