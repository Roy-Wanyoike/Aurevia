// ---------------------------------------------------------------------------
// Aurevia — Typed API error class (Issue #110).
//
// `ApiError` is the single error type the route layer throws. Each instance
// carries a stable `code` (from `codes.ts`), a human-readable message, an
// HTTP status, and optional structured `details`. The centralized
// `handleError()` in `handler.ts` turns it into a NextResponse with a
// consistent envelope:
//
//   { error: { code, message, requestId, details? } }
//
// Static factory methods cover the common shapes so route code reads as
// intent, not as boilerplate:
//
//   throw ApiError.validation("symbol is required", { field: "symbol" });
//   throw ApiError.notFound(`backtest ${id} not found`);
//   throw ApiError.forbidden("LIVE mode requires confirmLive");
//
// Why NOT extend a base `HttpError` and let each subclass pick its status?
// Because the code->status mapping is the contract: VALIDATION_ERROR is ALWAYS
// 400, NOT_FOUND is ALWAYS 404, etc. Forcing every site through the factory
// methods keeps that invariant true by construction. The single `ApiError`
// class also makes `instanceof ApiError` checks in `handleError` a one-liner
// instead of a union of nine subclasses.
// ---------------------------------------------------------------------------

import { ERROR_CODES, type ErrorCode } from "./codes";

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static validation(message: string, details?: Record<string, any>) {
    return new ApiError(ERROR_CODES.VALIDATION_ERROR, message, 400, details);
  }
  static unauthorized(message: string = "Unauthorized") {
    return new ApiError(ERROR_CODES.AUTHENTICATION_ERROR, message, 401);
  }
  static forbidden(message: string = "Forbidden") {
    return new ApiError(ERROR_CODES.AUTHORIZATION_ERROR, message, 403);
  }
  static notFound(message: string = "Resource not found") {
    return new ApiError(ERROR_CODES.NOT_FOUND, message, 404);
  }
  static conflict(message: string) {
    return new ApiError(ERROR_CODES.CONFLICT, message, 409);
  }
  static rateLimited(retryAfterSec: number = 60) {
    return new ApiError(ERROR_CODES.RATE_LIMITED, "Rate limit exceeded", 429, { retryAfterSec });
  }
  static dependencyFailure(message: string) {
    return new ApiError(ERROR_CODES.DEPENDENCY_FAILURE, message, 503);
  }
  static dataQuality(message: string, details?: Record<string, any>) {
    return new ApiError(ERROR_CODES.DATA_QUALITY_ERROR, message, 422, details);
  }
  static internal(message: string = "Internal server error") {
    return new ApiError(ERROR_CODES.INTERNAL_ERROR, message, 500);
  }
}
