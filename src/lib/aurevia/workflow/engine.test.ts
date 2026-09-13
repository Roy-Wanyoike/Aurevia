import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkflowEngine } from "./engine";
import type { Workflow, WorkflowStep } from "./types";

// ---------------------------------------------------------------------------
// Durable workflow engine unit tests (Issue #102).
//
// Covers:
//   - happy path: all steps succeed → COMPLETED, completedSteps populated
//   - retry-then-succeed: a step that fails twice then succeeds → COMPLETED
//   - retry exhaustion: all attempts fail → COMPENSATING → COMPENSATED
//   - compensation runs in REVERSE order
//   - compensation errors do not abort the remaining compensations
//   - timeout triggers compensation
//   - `currentStep` / `startedAt` / `completedAt` / `error` populated correctly
//
// Time is controlled via `vi.useFakeTimers()` so the exponential backoff
// (1s/2s/4s) does not slow the suite down.
// ---------------------------------------------------------------------------

function makeWorkflow(steps: WorkflowStep[], id = "wf-test"): Workflow {
  return {
    id,
    name: "test-workflow",
    steps,
    state: "PENDING",
    currentStep: 0,
    correlationId: `corr-${id}`,
    startedAt: 0,
  };
}

/** Step whose execute() rejects the first `failCount` times then resolves. */
function flakyStep(
  name: string,
  failCount: number,
  opts: { maxRetries?: number; timeoutMs?: number } = {},
): WorkflowStep & { calls: number } {
  const calls = { value: 0 };
  const step: WorkflowStep & { calls: number } = {
    name,
    async execute() {
      calls.value++;
      if (calls.value <= failCount) {
        throw new Error(`fail-${calls.value}`);
      }
      return "ok";
    },
    maxRetries: opts.maxRetries,
    timeoutMs: opts.timeoutMs,
    // expose call counter for assertions (must stay compatible with the
    // WorkflowStep shape — non-enumerable extra field is fine).
    calls: 0 as unknown as number,
  };
  // Reflect the counter through a getter so the test can read live updates.
  Object.defineProperty(step, "calls", {
    get: () => calls.value,
    configurable: true,
  });
  return step;
}

function succeedingStep(name: string, onExecute?: () => void): WorkflowStep {
  return {
    name,
    async execute() {
      onExecute?.();
      return "ok";
    },
  };
}

describe("WorkflowEngine — happy path", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("completes all steps in order when every step succeeds", async () => {
    const order: string[] = [];
    const wf = makeWorkflow([
      succeedingStep("s1", () => order.push("s1")),
      succeedingStep("s2", () => order.push("s2")),
      succeedingStep("s3", () => order.push("s3")),
    ]);
    await new WorkflowEngine().run(wf);
    expect(wf.state).toBe("COMPLETED");
    expect(order).toEqual(["s1", "s2", "s3"]);
    expect(wf.currentStep).toBe(2);
    expect(wf.completedAt).toBeGreaterThan(0);
    expect(wf.error).toBeUndefined();
  });

  it("populates startedAt and completedAt", async () => {
    const wf = makeWorkflow([succeedingStep("s1")]);
    await new WorkflowEngine().run(wf);
    expect(wf.startedAt).toBeGreaterThan(0);
    expect(wf.completedAt).toBeGreaterThanOrEqual(wf.startedAt);
  });
});

describe("WorkflowEngine — retry behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries a step that fails twice then succeeds — workflow COMPLETED", async () => {
    const step = flakyStep("flaky", 2);
    const wf = makeWorkflow([step]);
    const engine = new WorkflowEngine();
    const p = engine.run(wf);
    // Exponential backoff: 1s after attempt 1, 2s after attempt 2.
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    expect(step.calls).toBe(3); // initial + 2 retries
    expect(wf.state).toBe("COMPLETED");
  });

  it("uses default maxRetries=3 when not specified (4 total attempts)", async () => {
    const step = flakyStep("flaky", 3); // fails 3 times, succeeds on attempt 4
    const wf = makeWorkflow([step]);
    const p = new WorkflowEngine().run(wf);
    await vi.advanceTimersByTimeAsync(7000); // 1+2+4 = 7s of backoff
    await p;
    expect(step.calls).toBe(4);
    expect(wf.state).toBe("COMPLETED");
  });

  it("respects a per-step maxRetries override", async () => {
    const step = flakyStep("flaky", 5, { maxRetries: 1 });
    const wf = makeWorkflow([step]);
    const p = new WorkflowEngine().run(wf);
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(step.calls).toBe(2); // initial + 1 retry
    expect(wf.state).toBe("COMPENSATED");
    expect(wf.error).toContain("failed");
  });
});

describe("WorkflowEngine — compensation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs compensate() in REVERSE step order when a later step fails irrecoverably", async () => {
    const order: string[] = [];
    const wf = makeWorkflow([
      {
        name: "s1",
        execute: async () => order.push("exec-s1"),
        compensate: async () => { order.push("compensate-s1"); },
      },
      {
        name: "s2",
        execute: async () => order.push("exec-s2"),
        compensate: async () => { order.push("compensate-s2"); },
      },
      {
        name: "s3-fail",
        execute: async () => {
          order.push("exec-s3");
          throw new Error("boom");
        },
        // no compensate because it never succeeded
        maxRetries: 0, // fail immediately — no retries
      },
    ]);
    const p = new WorkflowEngine().run(wf);
    await vi.runAllTimersAsync();
    await p;
    expect(wf.state).toBe("COMPENSATED");
    expect(order).toEqual([
      "exec-s1",
      "exec-s2",
      "exec-s3",
      // compensation in REVERSE order:
      "compensate-s2",
      "compensate-s1",
    ]);
  });

  it("a compensation error does NOT abort the remaining compensations", async () => {
    const order: string[] = [];
    const wf = makeWorkflow([
      {
        name: "s1",
        execute: async () => "ok",
        compensate: async () => {
          order.push("compensate-s1");
          throw new Error("compensate-s1-boom");
        },
      },
      {
        name: "s2",
        execute: async () => "ok",
        compensate: async () => { order.push("compensate-s2"); },
      },
      {
        name: "s3-fail",
        execute: async () => {
          throw new Error("boom");
        },
        maxRetries: 0,
      },
    ]);
    const p = new WorkflowEngine().run(wf);
    await vi.runAllTimersAsync();
    await p;
    expect(wf.state).toBe("COMPENSATED");
    // s2 compensated first (reverse), then s1 — even though s1 throws,
    // both compensations are attempted.
    expect(order).toEqual(["compensate-s2", "compensate-s1"]);
  });

  it("workflow without compensate hooks still transitions to COMPENSATED", async () => {
    const wf = makeWorkflow([
      {
        name: "s1",
        execute: async () => "ok",
        maxRetries: 0,
      },
      {
        name: "s2-fail",
        execute: async () => {
          throw new Error("boom");
        },
        maxRetries: 0,
      },
    ]);
    const p = new WorkflowEngine().run(wf);
    await vi.runAllTimersAsync();
    await p;
    expect(wf.state).toBe("COMPENSATED");
    expect(wf.error).toContain("s2-fail");
    expect(wf.completedAt).toBeGreaterThan(0);
  });

  it("sets currentStep to the failing step index", async () => {
    const wf = makeWorkflow([
      succeedingStep("s1"),
      succeedingStep("s2"),
      {
        name: "s3-fail",
        execute: async () => {
          throw new Error("boom");
        },
        maxRetries: 0,
      },
    ]);
    const p = new WorkflowEngine().run(wf);
    await vi.runAllTimersAsync();
    await p;
    expect(wf.currentStep).toBe(2);
  });
});

describe("WorkflowEngine — timeout handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("a step that exceeds timeoutMs triggers compensation", async () => {
    const compensated: string[] = [];
    const wf = makeWorkflow([
      {
        name: "s1-quick",
        execute: async () => "ok",
        compensate: async () => { compensated.push("s1"); },
      },
      {
        name: "s2-slow",
        execute: () =>
          new Promise((resolve) => setTimeout(resolve, 10_000)), // never resolves within timeout
        timeoutMs: 100,
        maxRetries: 0,
      },
    ]);
    const p = new WorkflowEngine().run(wf);
    // Advance past the timeout. The slow step rejects with Timeout,
    // retries are exhausted (maxRetries=0), compensation runs.
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(wf.state).toBe("COMPENSATED");
    expect(wf.error).toContain("s2-slow");
    expect(compensated).toEqual(["s1"]);
  });

  it("a step that exceeds timeout is retried before compensation", async () => {
    let calls = 0;
    const wf = makeWorkflow([
      {
        name: "s-slow-then-fast",
        execute: () => {
          calls++;
          // First attempt: slow (will time out). Second attempt: resolves immediately.
          if (calls === 1) {
            return new Promise((resolve) => setTimeout(() => resolve("late"), 10_000));
          }
          return Promise.resolve("ok");
        },
        timeoutMs: 100,
        maxRetries: 1,
      },
    ]);
    const p = new WorkflowEngine().run(wf);
    await vi.advanceTimersByTimeAsync(100); // first attempt times out
    await vi.advanceTimersByTimeAsync(1000); // backoff for retry
    await p;
    expect(calls).toBe(2);
    expect(wf.state).toBe("COMPLETED");
  });
});

describe("WorkflowEngine — log surface", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("emits a 'Workflow started' log on run()", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const wf = makeWorkflow([succeedingStep("s1")]);
    await new WorkflowEngine().run(wf);
    const startedLine = logSpy.mock.calls.find((c) =>
      String(c[0]).includes("Workflow started"),
    );
    expect(startedLine).toBeTruthy();
    const completedLine = logSpy.mock.calls.find((c) =>
      String(c[0]).includes("Workflow completed"),
    );
    expect(completedLine).toBeTruthy();
    // happy path: no warns / errors emitted by the engine.
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("emits 'Step retry' warnings during backoff", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const step = flakyStep("flaky", 1);
    const wf = makeWorkflow([step]);
    const p = new WorkflowEngine().run(wf);
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    const retryLine = warnSpy.mock.calls.find((c) =>
      String(c[0]).includes("Step retry"),
    );
    expect(retryLine).toBeTruthy();
  });
});

describe("WorkflowEngine — edge cases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("workflow with zero steps transitions directly to COMPLETED", async () => {
    const wf = makeWorkflow([]);
    await new WorkflowEngine().run(wf);
    expect(wf.state).toBe("COMPLETED");
  });

  it("preserves a pre-set startedAt if the caller supplied one", async () => {
    const preset = 12345;
    const wf = makeWorkflow([succeedingStep("s1")]);
    wf.startedAt = preset;
    await new WorkflowEngine().run(wf);
    expect(wf.startedAt).toBe(preset);
  });
});
