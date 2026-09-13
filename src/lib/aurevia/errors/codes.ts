// ---------------------------------------------------------------------------
// Aurevia — Centralized error code registry (Issue #110).
//
// Every API failure now carries one of these codes. The frontend can branch
// on `error.code` instead of fragile string matching against `error.message`,
// and dashboards can aggregate error counts by code without parsing strings.
//
// The set is intentionally small — nine buckets is enough to express every
// failure mode the API currently surfaces without leaking implementation
// detail (no `PRISMA_P2002` or `ZOD_INVALID_ENUM`). Internal diagnostics
// stay in `error.details` and structured logs; the code is the public contract.
//
// Add a new code ONLY when a failure mode cannot be expressed by an existing
// one, and only together with a handler test + frontend handling update.
// ---------------------------------------------------------------------------

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR: "AUTHORIZATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  DEPENDENCY_FAILURE: "DEPENDENCY_FAILURE",
  DATA_QUALITY_ERROR: "DATA_QUALITY_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
