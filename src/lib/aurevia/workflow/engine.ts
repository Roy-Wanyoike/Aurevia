// ---------------------------------------------------------------------------
// Aurevia Durable Workflow Engine (Issue #102).
//
// Sequential workflow executor with retry + timeout + compensation.
//
// Behavior contract:
//
//   1. `run()` transitions the workflow PENDING → RUNNING.
//   2. Steps execute in array order. Each step is attempted (initial + up to
//      `maxRetries` retries) with exponential backoff (1s, 2s, 4s, ...).
//   3. Each attempt is bounded by `step.timeoutMs`; a timeout counts as a
//      failure for that attempt and is retried like any other error.
//   4. On step success: the step is pushed to `completedSteps` (so it can be
//      compensated later if a downstream step fails) and execution proceeds.
//   5. On step failure (all retries exhausted): the workflow transitions to
//      COMPENSATING, every completed step's `compensate()` is invoked in
//      reverse order, the workflow lands in COMPENSATED, and `error` is set.
//   6. On all steps succeeding: the workflow transitions to COMPLETED.
//
// Why in-memory + console logs (not Prisma EventLog checkpointing):
//   - The engine's `currentStep` / `state` / `completedSteps` are mutable,
//     so a future `prisma.eventLog.create({ data: { workflowId, state,
//     currentStep } })` checkpoint between steps is a one-line insertion.
//     Keeping the persistence boundary explicit avoids a premature DB schema
//     coupling during dev.
//
// Retry policy:
//   - Default: 3 retries with 1s/2s/4s backoff (so up to 4 total attempts).
//   - Backoff is exponential: `Math.pow(2, attempt) * 1000` ms.
//   - The final attempt that succeeds counts as a SUCCESS — the workflow
//     continues. Only after the final allowed attempt fails does the
//     workflow compensate.
//
// Compensation:
//   - Reverses only steps that returned SUCCESS.
//   - Compensation errors are logged but do NOT abort the remaining
//     compensations — partial rollback is better than no rollback.
// ---------------------------------------------------------------------------

import type { Workflow, WorkflowStep, StepResult } from "./types";
import { logger } from "../logger";

// Tunable defaults — kept as module constants so tests can introspect them.
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BACKOFF_BASE_MS = 1_000; // exponential: base * 2^attempt

// Test override — set to 1 to make tests run fast without fake timers.
// In production this is always 1000ms. Tests set it to 1 via:
//   import { BACKOFF_BASE_MS } from "./engine"; BACKOFF_BASE_MS.value = 1;
export const BACKOFF_BASE_MS = { value: DEFAULT_BACKOFF_BASE_MS };

export class WorkflowEngine {
  /**
   * Execute the workflow. Mutates `workflow.state`, `currentStep`,
   * `startedAt`, `completedAt`, and `error` on the passed-in object so the
   * caller can inspect the final state after the promise resolves.
   *
   * Resolves when the workflow reaches a terminal state (COMPLETED,
   * COMPENSATED, or FAILED). Never throws — a thrown error inside a step is
   * caught and converted into a FAILURE result.
   */
  async run(workflow: Workflow): Promise<void> {
    workflow.state = "RUNNING";
    workflow.startedAt = workflow.startedAt || Date.now();
    logger.info("Workflow started", {
      workflowId: workflow.id,
      name: workflow.name,
      correlationId: workflow.correlationId,
      stepCount: workflow.steps.length,
    });

    const completedSteps: WorkflowStep[] = [];

    for (let i = workflow.currentStep; i < workflow.steps.length; i++) {
      workflow.currentStep = i;
      const step = workflow.steps[i];
      const result = await this.executeStep(step, workflow);

      if (result === "SUCCESS") {
        completedSteps.push(step);
        logger.info("Step completed", {
          workflowId: workflow.id,
          correlationId: workflow.correlationId,
          step: step.name,
          index: i,
        });
        continue;
      }

      // Failure after all retries — compensate completed steps in reverse.
      workflow.state = "COMPENSATING";
      logger.warn("Step failed, compensating", {
        workflowId: workflow.id,
        correlationId: workflow.correlationId,
        step: step.name,
        index: i,
        result,
      });
      await this.compensate(completedSteps, workflow);
      workflow.state = "COMPENSATED";
      workflow.error = `Step ${step.name} failed (${result})`;
      workflow.completedAt = Date.now();
      logger.error("Workflow failed", {
        workflowId: workflow.id,
        correlationId: workflow.correlationId,
        error: workflow.error,
        completedStepCount: completedSteps.length,
      });
      return;
    }

    workflow.state = "COMPLETED";
    workflow.completedAt = Date.now();
    logger.info("Workflow completed", {
      workflowId: workflow.id,
      correlationId: workflow.correlationId,
      stepCount: workflow.steps.length,
      durationMs: workflow.completedAt - workflow.startedAt,
    });
  }

  /**
   * Execute a single step with retries + timeout. Returns the final
   * StepResult for the step (SUCCESS if any attempt succeeded, FAILURE
   * otherwise). REJECTION in `withTimeout` is treated identically to a
   * thrown error — both count against the retry budget.
   */
  private async executeStep(
    step: WorkflowStep,
    workflow: Workflow,
  ): Promise<StepResult> {
    const maxRetries = step.maxRetries ?? DEFAULT_MAX_RETRIES;
    const timeoutMs = step.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.withTimeout(step.execute(), timeoutMs);
        return "SUCCESS";
      } catch (e: any) {
        const isTimeout = e?.message === "Timeout";
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * BACKOFF_BASE_MS.value;
          logger.warn("Step retry", {
            workflowId: workflow.id,
            correlationId: workflow.correlationId,
            step: step.name,
            attempt: attempt + 1,
            maxAttempts: maxRetries + 1,
            delayMs: delay,
            reason: isTimeout ? "timeout" : "error",
            error: e?.message,
          });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        logger.error("Step failed", {
          workflowId: workflow.id,
          correlationId: workflow.correlationId,
          step: step.name,
          attempt: attempt + 1,
          reason: isTimeout ? "timeout" : "error",
          error: e?.message,
        });
        return isTimeout ? "TIMEOUT" : "FAILURE";
      }
    }
    return "FAILURE";
  }

  /**
   * Race the supplied promise against a timeout. Resolves with the
   * promise's value if it completes first; rejects with `new Error("Timeout")`
   * if the timer fires first. The underlying promise is NOT cancelled
   * (JavaScript promises can't be) — callers should ensure their `execute`
   * function respects AbortController if true cancellation is required.
   */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), ms),
      ),
    ]);
  }

  /**
   * Invoke `compensate()` on every completed step in REVERSE order.
   * Errors are caught + logged per-step so a single broken compensation
   * doesn't prevent the remaining ones from running.
   */
  private async compensate(
    completedSteps: WorkflowStep[],
    workflow: Workflow,
  ): Promise<void> {
    for (let i = completedSteps.length - 1; i >= 0; i--) {
      const step = completedSteps[i];
      if (!step.compensate) continue;
      try {
        await step.compensate();
        logger.info("Compensation completed", {
          workflowId: workflow.id,
          correlationId: workflow.correlationId,
          step: step.name,
          index: i,
        });
      } catch (e: any) {
        logger.error("Compensation failed", {
          workflowId: workflow.id,
          correlationId: workflow.correlationId,
          step: step.name,
          index: i,
          error: e?.message,
        });
      }
    }
  }
}
