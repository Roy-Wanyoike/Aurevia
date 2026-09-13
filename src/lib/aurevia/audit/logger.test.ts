import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the db module BEFORE importing the audit logger so the audit logger
// captures the mocked `db.auditLog.create`. We mock only the surface the
// logger touches; the rest of the Prisma client is left as the real impl
// (which the test never reaches).
const createMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    auditLog: {
      create: createMock,
    },
  },
}));

// Silence the expected stderr emission from the swallow-error path.
beforeEach(() => {
  createMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// Import AFTER the mock is registered.
import { auditLog } from "./logger";

// ---------------------------------------------------------------------------
// Issue #112 — audit logger unit tests.
//
// The audit logger has two contracts:
//   1. It calls `db.auditLog.create` with the right shape (actor, action,
//      entity, entityId, detail).
//   2. It NEVER throws — even if the DB is unreachable. A failed audit
//      record is logged to stderr and swallowed so the trading pipeline
//      isn't broken by the audit sink.
// ---------------------------------------------------------------------------

describe("auditLog — happy path", () => {
  it("writes the supplied detail verbatim when provided", async () => {
    createMock.mockResolvedValue({ id: "log-1" });
    await auditLog({
      actor: "system",
      action: "ORDER_PLACED",
      entity: "order",
      entityId: "ord-123",
      detail: JSON.stringify({ symbol: "AAPL", side: "BUY", quantity: 10 }),
      requestId: "req-1",
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith({
      data: {
        actor: "system",
        action: "ORDER_PLACED",
        entity: "order",
        entityId: "ord-123",
        detail: JSON.stringify({ symbol: "AAPL", side: "BUY", quantity: 10 }),
      },
    });
  });

  it("serializes before/after/reason/requestId into detail when detail is omitted", async () => {
    createMock.mockResolvedValue({ id: "log-2" });
    await auditLog({
      actor: "operator-1",
      action: "RISK_PROFILE_UPDATED",
      entity: "risk_profile",
      before: JSON.stringify({ maxLeverage: 1 }),
      after: JSON.stringify({ maxLeverage: 2 }),
      reason: "manual override",
      requestId: "req-2",
    });
    const call = createMock.mock.calls[0][0];
    expect(call.data.actor).toBe("operator-1");
    expect(call.data.action).toBe("RISK_PROFILE_UPDATED");
    expect(call.data.entity).toBe("risk_profile");
    // detail is a JSON string carrying every supplied structured field.
    const parsed = JSON.parse(call.data.detail);
    expect(parsed.before).toBe(JSON.stringify({ maxLeverage: 1 }));
    expect(parsed.after).toBe(JSON.stringify({ maxLeverage: 2 }));
    expect(parsed.reason).toBe("manual override");
    expect(parsed.requestId).toBe("req-2");
  });

  it("allows undefined entityId — schema column is nullable", async () => {
    createMock.mockResolvedValue({ id: "log-3" });
    await auditLog({
      actor: "system",
      action: "CIRCUIT_BREAKER_CHANGED",
      entity: "circuit_breaker",
      detail: JSON.stringify({ from: "NORMAL", to: "TRADING_PAUSED" }),
    });
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: undefined,
        entity: "circuit_breaker",
      }),
    });
  });
});

describe("auditLog — failure isolation", () => {
  it("does NOT throw when db.auditLog.create rejects", async () => {
    createMock.mockRejectedValue(new Error("connection refused"));
    // The whole point of the swallow-error path: a DB outage must NOT
    // propagate up the trading pipeline.
    await expect(
      auditLog({
        actor: "system",
        action: "ORDER_PLACED",
        entity: "order",
        entityId: "ord-456",
        detail: "{}",
      }),
    ).resolves.toBeUndefined();
  });

  it("logs the failure to stderr (so ops sees a missed audit record)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createMock.mockRejectedValue(new Error("connection refused"));
    await auditLog({
      actor: "system",
      action: "ORDER_PLACED",
      entity: "order",
      entityId: "ord-789",
      detail: "{}",
    });
    // console.error is called with multiple args — join ALL args of every
    // call so we capture both the prefix and the error object's toString().
    const logged = errSpy.mock.calls
      .map((c) => c.map((arg) => String(arg)).join(" "))
      .join("\n");
    expect(logged).toContain("audit log failed");
    expect(logged).toContain("connection refused");
  });

  it("does NOT throw when db.auditLog.create throws synchronously", async () => {
    createMock.mockImplementation(() => {
      throw new TypeError("schema mismatch");
    });
    await expect(
      auditLog({
        actor: "system",
        action: "X",
        entity: "y",
        detail: "{}",
      }),
    ).resolves.toBeUndefined();
  });
});
