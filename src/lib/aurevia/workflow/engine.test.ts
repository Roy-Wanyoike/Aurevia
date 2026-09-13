import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkflowEngine, BACKOFF_BASE_MS } from "./engine";
import type { Workflow, WorkflowStep } from "./types";

// Speed up backoff for tests — 1ms instead of 1000ms
beforeEach(() => { BACKOFF_BASE_MS.value = 1; });
afterEach(() => { BACKOFF_BASE_MS.value = 1000; });

// ---------------------------------------------------------------------------
// Durable workflow engine unit tests (Issue #102).
//
// Uses REAL timers with short delays — the engine's backoff is overridden
// via a test-friendly maxRetries + the delays are small enough (1ms each)
// that the suite runs in under 1 second total.
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
    calls: 0 as unknown as number,
  };
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

// Silence console output during tests
let logSpy: any, warnSpy: any, errorSpy: any;
beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("WorkflowEngine — happy path", () => {
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
  it("retries a step that fails twice then succeeds — workflow COMPLETED", async () => {
    const step = flakyStep("flaky", 2);
    const wf = makeWorkflow([step]);
    await new WorkflowEngine().run(wf);
    expect(step.calls).toBe(3); // initial + 2 retries
    expect(wf.state).toBe("COMPLETED");
  });

  it("uses default maxRetries=3 when not specified (4 total attempts)", async () => {
    const step = flakyStep("flaky", 3);
    const wf = makeWorkflow([step]);
    await new WorkflowEngine().run(wf);
    expect(step.calls).toBe(4);
    expect(wf.state).toBe("COMPLETED");
  });

  it("respects a per-step maxRetries override", async () => {
    const step = flakyStep("flaky", 5, { maxRetries: 1 });
    const wf = makeWorkflow([step]);
    await new WorkflowEngine().run(wf);
    expect(step.calls).toBe(2); // initial + 1 retry
    expect(wf.state).toBe("COMPENSATED");
    expect(wf.error).toContain("failed");
  });
});

describe("WorkflowEngine — compensation", () => {
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
        maxRetries: 0,
      },
    ]);
    await new WorkflowEngine().run(wf);
    expect(wf.state).toBe("COMPENSATED");
    expect(order).toEqual([
      "exec-s1",
      "exec-s2",
      "exec-s3",
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
    await new WorkflowEngine().run(wf);
    expect(wf.state).toBe("COMPENSATED");
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
    await new WorkflowEngine().run(wf);
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
    await new WorkflowEngine().run(wf);
    expect(wf.currentStep).toBe(2);
  });
});

describe("WorkflowEngine — timeout handling", () => {
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
          new Promise((resolve) => setTimeout(resolve, 10_000)),
        timeoutMs: 100,
        maxRetries: 0,
      },
    ]);
    await new WorkflowEngine().run(wf);
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
          if (calls === 1) {
            return new Promise((resolve) => setTimeout(() => resolve("late"), 10_000));
          }
          return Promise.resolve("ok");
        },
        timeoutMs: 100,
        maxRetries: 1,
      },
    ]);
    await new WorkflowEngine().run(wf);
    expect(calls).toBe(2);
    expect(wf.state).toBe("COMPLETED");
  });
});

describe("WorkflowEngine — log surface", () => {
  it("emits a 'Workflow started' log on run()", async () => {
    const wf = makeWorkflow([succeedingStep("s1")]);
    await new WorkflowEngine().run(wf);
    const startedLine = logSpy.mock.calls.find((c: any[]) =>
      String(c[0]).includes("Workflow started"),
    );
    expect(startedLine).toBeTruthy();
    const completedLine = logSpy.mock.calls.find((c: any[]) =>
      String(c[0]).includes("Workflow completed"),
    );
    expect(completedLine).toBeTruthy();
  });

  it("emits 'Step retry' warnings during backoff", async () => {
    const step = flakyStep("flaky", 1);
    const wf = makeWorkflow([step]);
    await new WorkflowEngine().run(wf);
    const retryLine = warnSpy.mock.calls.find((c: any[]) =>
      String(c[0]).includes("Step retry"),
    );
    expect(retryLine).toBeTruthy();
  });
});

describe("WorkflowEngine — edge cases", () => {
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
