import { describe, it, expect } from "vitest";
import {
  fmtPrice,
  fmtPct,
  fmtUsd,
  fmtCompact,
  fmtTime,
  fmtDateTime,
  fmtDuration,
  gainColor,
  gainBg,
  actionColor,
  regimeColor,
  breakerColor,
  decisionColor,
  trendColor,
  drawdownColor,
} from "./format";

// ---------------------------------------------------------------------------
// Format + color helper unit tests. Verifies exact strings, sign handling,
// and the graduated drawdown color ladder.
// ---------------------------------------------------------------------------

describe("fmtPrice", () => {
  it("fmtPrice(123.456, 2) = '123.46'", () => {
    expect(fmtPrice(123.456, 2)).toBe("123.46");
  });

  it("returns '—' for undefined / null / NaN", () => {
    expect(fmtPrice(undefined)).toBe("—");
    expect(fmtPrice(null)).toBe("—");
    expect(fmtPrice(NaN)).toBe("—");
  });

  it("uses thousands separators for n >= 1000", () => {
    expect(fmtPrice(1234.5, 2)).toBe("1,234.50");
  });
});

describe("fmtPct", () => {
  it("fmtPct(12.345, 2) = '+12.35%'", () => {
    expect(fmtPct(12.345, 2)).toBe("+12.35%");
  });

  it("fmtPct(-12.345, 2) = '-12.35%'", () => {
    expect(fmtPct(-12.345, 2)).toBe("-12.35%");
  });

  it("fmtPct(0, 2) has no '+' sign", () => {
    expect(fmtPct(0, 2)).toBe("0.00%");
  });

  it("returns '—' for NaN", () => {
    expect(fmtPct(NaN)).toBe("—");
  });
});

describe("fmtUsd", () => {
  it("fmtUsd(1234567.89) = '$1,234,568'", () => {
    expect(fmtUsd(1234567.89)).toBe("$1,234,568");
  });

  it("fmtUsd(0) = '$0'", () => {
    expect(fmtUsd(0)).toBe("$0");
  });

  it("returns '—' for null/undefined", () => {
    expect(fmtUsd(null)).toBe("—");
    expect(fmtUsd(undefined)).toBe("—");
  });
});

describe("fmtCompact", () => {
  it("formats large numbers compactly", () => {
    expect(fmtCompact(1_500_000)).toBe("1.5M");
  });
});

describe("fmtTime / fmtDateTime / fmtDuration", () => {
  it("fmtTime returns a non-empty string for valid ms", () => {
    const s = fmtTime(0);
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });

  it("fmtTime returns '—' for 0 ms (falsy)", () => {
    expect(fmtTime(0)).toBe("—");
  });

  it("fmtDateTime returns '—' for null", () => {
    expect(fmtDateTime(null)).toBe("—");
  });

  it("fmtDuration formats seconds correctly", () => {
    expect(fmtDuration(45 * 1000)).toBe("45s");
    expect(fmtDuration(125 * 1000)).toBe("2m 5s");
  });
});

describe("gainColor", () => {
  it("gainColor(1) = 'text-emerald-400'", () => {
    expect(gainColor(1)).toBe("text-emerald-400");
  });

  it("gainColor(-1) = 'text-red-400'", () => {
    expect(gainColor(-1)).toBe("text-red-400");
  });

  it("gainColor(0) = 'text-muted-foreground'", () => {
    expect(gainColor(0)).toBe("text-muted-foreground");
  });
});

describe("gainBg", () => {
  it("positive returns emerald background", () => {
    expect(gainBg(1)).toContain("emerald");
  });
  it("negative returns red background", () => {
    expect(gainBg(-1)).toContain("red");
  });
});

describe("actionColor", () => {
  it("BUY is emerald", () => {
    expect(actionColor("BUY")).toContain("emerald");
  });
  it("SELL is red", () => {
    expect(actionColor("SELL")).toContain("red");
  });
});

describe("drawdownColor", () => {
  it("drawdownColor(0.01) = 'text-emerald-400' (healthy < 3%)", () => {
    expect(drawdownColor(0.01)).toBe("text-emerald-400");
  });

  it("drawdownColor(0.05) = 'text-amber-400' (3-8%)", () => {
    expect(drawdownColor(0.05)).toBe("text-amber-400");
  });

  it("drawdownColor(0.10) = 'text-orange-400' (8-15%)", () => {
    expect(drawdownColor(0.10)).toBe("text-orange-400");
  });

  it("drawdownColor(0.2) = 'text-red-400' (severe >= 15%)", () => {
    expect(drawdownColor(0.2)).toBe("text-red-400");
  });
});

describe("regimeColor", () => {
  it("regimeColor('BULL') contains 'emerald'", () => {
    expect(regimeColor("BULL")).toContain("emerald");
  });

  it("regimeColor('BEAR') contains 'red'", () => {
    expect(regimeColor("BEAR")).toContain("red");
  });

  it("regimeColor('HIGH_VOLATILITY') contains 'amber'", () => {
    expect(regimeColor("HIGH_VOLATILITY")).toContain("amber");
  });
});

describe("breakerColor", () => {
  it("breakerColor('TRADING_PAUSED') contains 'red'", () => {
    expect(breakerColor("TRADING_PAUSED")).toContain("red");
  });

  it("breakerColor('NORMAL') contains 'emerald'", () => {
    expect(breakerColor("NORMAL")).toContain("emerald");
  });

  it("breakerColor('CAUTION') contains 'amber'", () => {
    expect(breakerColor("CAUTION")).toContain("amber");
  });

  it("breakerColor('RE_EVALUATING') contains 'purple'", () => {
    expect(breakerColor("RE_EVALUATING")).toContain("purple");
  });
});

describe("decisionColor / trendColor", () => {
  it("decisionColor('APPROVED') contains 'emerald'", () => {
    expect(decisionColor("APPROVED")).toContain("emerald");
  });
  it("decisionColor('REJECTED') contains 'red'", () => {
    expect(decisionColor("REJECTED")).toContain("red");
  });
  it("trendColor('UP') = 'text-emerald-400'", () => {
    expect(trendColor("UP")).toBe("text-emerald-400");
  });
  it("trendColor('DOWN') = 'text-red-400'", () => {
    expect(trendColor("DOWN")).toBe("text-red-400");
  });
});
