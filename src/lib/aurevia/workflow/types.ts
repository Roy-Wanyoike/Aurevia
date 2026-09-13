// ---------------------------------------------------------------------------
// Aurevia Durable Workflow Engine — type contract (Issue #102).
//
// A workflow is an ordered, idempotent sequence of `WorkflowStep`s executed by
// `WorkflowEngine` (see `engine.ts`). Steps run sequentially; each step may
// declare its own retry policy and timeout; each step may declare a
// `compensate()` rollback hook so that, when a downstream step fails
// irrecoverably, completed steps are unwound in reverse order.
//
// State machine:
//
//   PENDING ──run()──► RUNNING ──all steps ok──► COMPLETED
//                          │
//                          └──step failed (retries exhausted)──► COMPENSATING
//                                                                     │
//                                                                     └──► COMPENSATED
//                                                                     (or FAILED if no compensation ran)
//
// Notes:
//   - This is intentionally in-memory for dev. The Prisma `EventLog` table
//     already exists for future persistence — the engine is structured so a
//     `prisma.eventLog.create()` checkpoint call could be inserted between
//     steps without touching the type contract.
//   - The `correlationId` is propagated through every log line so a single
//     workflow instance can be traced end-to-end across services.
//   - `currentStep` is mutable so a future resumable executor could pick up
//     where a crashed process left off (deferred — current engine is single-
//     shot per `run()` invocation).
// ---------------------------------------------------------------------------

export type WorkflowState =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "COMPENSATING"
  | "COMPENSATED";

export type StepResult = "SUCCESS" | "FAILURE" | "TIMEOUT" | "RETRYING";

export interface WorkflowStep {
  /** Human-readable step name; appears in every log line for this step. */
  name: string;
  /** Side-effecting work. MUST be idempotent if `maxRetries > 0`. */
  execute: () => Promise<any>;
  /**
   * Optional rollback hook invoked (in reverse step order) when a downstream
   * step fails irrecoverably. Best-effort: an exception here is logged but
   * does not abort the remaining compensations.
   */
  compensate?: () => Promise<void>;
  /** Maximum retry attempts AFTER the initial attempt. Default 3. */
  maxRetries?: number;
  /** Per-attempt timeout in ms. Default 30 000. */
  timeoutMs?: number;
}

export interface Workflow {
  /** Unique id; surfaced in every log line. */
  id: string;
  /** Human-readable workflow name (e.g. "order-pipeline"). */
  name: string;
  /** Ordered list of steps to execute. */
  steps: WorkflowStep[];
  /** Current lifecycle state; mutated by the engine. */
  state: WorkflowState;
  /** Index of the step currently executing (or next to execute on resume). */
  currentStep: number;
  /** Propagated to every structured log line for end-to-end tracing. */
  correlationId: string;
  /** Epoch ms when `run()` was first invoked. */
  startedAt: number;
  /** Epoch ms when the workflow reached a terminal state. */
  completedAt?: number;
  /** Populated on FAILURE / COMPENSATED; absent on COMPLETED. */
  error?: string;
}
