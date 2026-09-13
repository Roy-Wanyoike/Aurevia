import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ApiError } from "./api-error";
import { ERROR_CODES } from "./codes";
import { handleError } from "./handler";

// ---------------------------------------------------------------------------
// Issue #110 — central error handler tests.
//
// Covers the ApiError factories (status + code mapping), the envelope shape
// produced by `handleError`, the unknown-error path (must be a generic 500
// with INTERNAL_ERROR), and the requestId propagation that lets the client
// correlate a 5xx back to the exact log line.
// ---------------------------------------------------------------------------

describe("ApiError — factory methods map to correct code + status", () => {
  it("validation() → 400 + VALIDATION_ERROR + details pass-through", () => {
    const e = ApiError.validation("symbol is required", { field: "symbol" });
    expect(e.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(e.statusCode).toBe(400);
    expect(e.message).toBe("symbol is required");
    expect(e.details).toEqual({ field: "symbol" });
  });

  it("unauthorized() → 401 + AUTHENTICATION_ERROR with default message", () => {
    const e = ApiError.unauthorized();
    expect(e.code).toBe(ERROR_CODES.AUTHENTICATION_ERROR);
    expect(e.statusCode).toBe(401);
    expect(e.message).toBe("Unauthorized");
  });

  it("forbidden() → 403 + AUTHORIZATION_ERROR", () => {
    const e = ApiError.forbidden("LIVE mode requires confirmLive");
    expect(e.code).toBe(ERROR_CODES.AUTHORIZATION_ERROR);
    expect(e.statusCode).toBe(403);
    expect(e.message).toBe("LIVE mode requires confirmLive");
  });

  it("notFound() → 404 + NOT_FOUND with default message", () => {
    const e = ApiError.notFound();
    expect(e.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(e.statusCode).toBe(404);
    expect(e.message).toBe("Resource not found");
  });

  it("conflict() → 409 + CONFLICT", () => {
    const e = ApiError.conflict("watchlist with that name already exists");
    expect(e.code).toBe(ERROR_CODES.CONFLICT);
    expect(e.statusCode).toBe(409);
  });

  it("rateLimited() → 429 + RATE_LIMITED + retryAfterSec details", () => {
    const e = ApiError.rateLimited(120);
    expect(e.code).toBe(ERROR_CODES.RATE_LIMITED);
    expect(e.statusCode).toBe(429);
    expect(e.details).toEqual({ retryAfterSec: 120 });
  });

  it("dependencyFailure() → 503 + DEPENDENCY_FAILURE", () => {
    const e = ApiError.dependencyFailure("Alpaca broker unreachable");
    expect(e.code).toBe(ERROR_CODES.DEPENDENCY_FAILURE);
    expect(e.statusCode).toBe(503);
  });

  it("dataQuality() → 422 + DATA_QUALITY_ERROR + details", () => {
    const e = ApiError.dataQuality("stale quote", { symbol: "AAPL", stalenessMs: 60000 });
    expect(e.code).toBe(ERROR_CODES.DATA_QUALITY_ERROR);
    expect(e.statusCode).toBe(422);
    expect(e.details).toEqual({ symbol: "AAPL", stalenessMs: 60000 });
  });

  it("internal() → 500 + INTERNAL_ERROR with default message", () => {
    const e = ApiError.internal();
    expect(e.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(e.statusCode).toBe(500);
    expect(e.message).toBe("Internal server error");
  });

  it("preserves Error prototype — instance of Error and ApiError", () => {
    const e = ApiError.notFound();
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.name).toBe("ApiError");
  });
});

describe("handleError — envelope shape and status propagation", () => {
  it("returns the ApiError's statusCode and structured envelope", async () => {
    const res = handleError(ApiError.notFound("backtest abc not found"), "req-123");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "backtest abc not found",
        requestId: "req-123",
        details: undefined,
      },
    });
  });

  it("preserves details on a validation error", async () => {
    const res = handleError(
      ApiError.validation("invalid side", { allowed: ["BUY", "SELL"] }),
      "req-456",
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual({ allowed: ["BUY", "SELL"] });
    expect(body.error.requestId).toBe("req-456");
  });

  it("returns 429 with retryAfterSec details for rate-limited errors", async () => {
    const res = handleError(ApiError.rateLimited(30), "req-789");
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.details).toEqual({ retryAfterSec: 30 });
  });
});

describe("handleError — unknown error path", () => {
  beforeEach(() => {
    // Silence the expected `logger.error` call from the unknown-error path
    // so the test runner output stays clean. We still assert it was called.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("converts a plain Error into a generic 500 INTERNAL_ERROR", async () => {
    const res = handleError(new Error("Prisma connection string leak: postgres://user:pw@..."), "req-abc");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    // The leaked Prisma string MUST NOT reach the client.
    expect(body.error.message).toBe("Internal server error");
    expect(body.error.message).not.toContain("postgres://");
    expect(body.error.requestId).toBe("req-abc");
  });

  it("handles a non-Error throw (string) without crashing", async () => {
    const res = handleError("something exploded", undefined);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Internal server error");
  });

  it("handles null/undefined throws without crashing", async () => {
    const res = handleError(null, "req-null");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.requestId).toBe("req-null");
  });

  it("logs the underlying error message server-side (so ops can debug)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    handleError(new TypeError("cannot read 'symbol' of undefined"), "req-log");
    // The logger.error path emits a JSON line via console.error.
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("Unhandled API error");
    expect(logged).toContain("cannot read 'symbol' of undefined");
  });
});

describe("handleError — requestId propagation", () => {
  it("always includes requestId in the envelope when provided", async () => {
    const res = handleError(ApiError.internal("boom"), "req-prop-1");
    const body = await res.json();
    expect(body.error.requestId).toBe("req-prop-1");
  });

  it("omits requestId cleanly when not provided (no 'undefined' string)", async () => {
    const res = handleError(ApiError.notFound());
    const body = await res.json();
    expect(body.error.requestId).toBeUndefined();
    // JSON.stringify drops undefined fields, so the serialized envelope has no
    // requestId key at all — which is the correct client-facing shape.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("undefined");
  });
});
