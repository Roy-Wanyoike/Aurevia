// ---------------------------------------------------------------------------
// Aurevia — Centralized API error handler (Issue #110).
//
// Today every one of the 37 routes under `src/app/api/v1/*` wraps its body in
// a bespoke `try { ... } catch (e: any) { return NextResponse.json({ error:
// e?.message ?? "unknown" }, { status: 500 }) }`. That pattern has three
// problems this module fixes:
//
//   1. It leaks `Error.message` straight to the client — including Prisma
//      connection errors, Zod internals, and stack-adjacent strings. The
//      fix: known `ApiError`s pass through with their own message; unknown
//      errors are logged with full detail and returned as a generic
//      "Internal server error" envelope.
//
//   2. There's no stable response shape. The frontend has to guess whether
//      the error field is a string, an object, or `{ error: { message } }`.
//      The fix: every error response now has the same envelope —
//      `{ error: { code, message, requestId, details? } }`.
//
//   3. There's no error code. The frontend can't distinguish "validation
//      failed, show field errors" from "rate limited, back off" without
//      parsing the message. The fix: `error.code` is always one of the
//      `ERROR_CODES` from `codes.ts`.
//
// Routes can adopt this incrementally — replace the catch block with
// `return handleError(e, requestId)` and the contract is preserved (the
// response still has `{ error: ... }`, just structured). New routes should
// throw `ApiError` subclasses instead of building NextResponse manually.
//
// `handleError` is also the single place we can later add: Sentry capture,
// per-code metric increments, request-id redaction, PII scrubbing, etc.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { ApiError } from "./api-error";
import { ERROR_CODES } from "./codes";
import { logger } from "../logger";

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Record<string, any>;
  };
}

/**
 * Convert any thrown value into a NextResponse with the Aurevia error
 * envelope. `ApiError`s pass through with their own code/status/details;
 * everything else is logged and surfaced as a generic 500.
 *
 * `requestId` is threaded through so a client reporting an error can be
 * correlated to the exact log line server-side.
 */
export function handleError(error: unknown, requestId?: string): NextResponse {
  if (error instanceof ApiError) {
    // Known error — log at debug (these are expected business-rule failures,
    // not incidents) and return the structured envelope.
    if (error.statusCode >= 500) {
      // 5xx from a known ApiError (DEPENDENCY_FAILURE, INTERNAL_ERROR) IS
      // worth surfacing in the operator log — these represent incidents.
      logger.error("ApiError (5xx)", {
        requestId,
        code: error.code,
        statusCode: error.statusCode,
        message: error.message,
        details: error.details,
      });
    } else {
      logger.debug("ApiError (4xx)", {
        requestId,
        code: error.code,
        statusCode: error.statusCode,
        message: error.message,
      });
    }
    const body: ErrorEnvelope = {
      error: {
        code: error.code,
        message: error.message,
        requestId,
        details: error.details,
      },
    };
    return NextResponse.json(body, { status: error.statusCode });
  }

  // Unknown error — log the full detail (including stack via Error.message
  // for ops) and return a SAFE message. We deliberately do NOT echo
  // `error.message` to the client because it may include Prisma connection
  // strings, Zod internals, or PII from a malformed payload.
  const internalMessage = error instanceof Error ? error.message : String(error);
  logger.error("Unhandled API error", {
    requestId,
    error: internalMessage,
    // Preserve the prototype so ops can distinguish TypeError from
    // PrismaClientInitializationError etc. in log aggregation.
    errorType: error instanceof Error ? error.constructor.name : typeof error,
  });

  const body: ErrorEnvelope = {
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Internal server error",
      requestId,
    },
  };
  return NextResponse.json(body, { status: 500 });
}
