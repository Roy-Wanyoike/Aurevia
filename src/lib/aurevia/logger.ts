// Aurevia structured logger.
//
// Emits JSON to stdout/stderr. The shape is intentionally simple — in a
// production deployment the same payload could be shipped to Datadog,
// CloudWatch, Loki, or a Postgres `audit_log` table by swapping the sink.
//
// Level is controlled by the `LOG_LEVEL` env var ("debug" | "info" | "warn" |
// "error"), defaulting to "info".
//
// Every entry carries `timestamp` (ISO UTC), `level`, `message`, and any
// structured metadata the caller supplies. API routes should always include
// `requestId` (sourced from the `x-request-id` header) so log lines can be
// correlated to a single inbound request across services.

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info";
const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function log(level: LogLevel, message: string, meta?: Record<string, any>) {
  if (LEVELS[level] < LEVELS[LOG_LEVEL]) return;
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(meta && Object.keys(meta).length > 0 ? meta : {}),
  };
  // In production, this would go to a structured log sink (Datadog, CloudWatch, etc.)
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  // eslint-disable-next-line no-console -- this IS the logger sink
  else console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (msg: string, meta?: Record<string, any>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, any>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, any>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, any>) => log("error", msg, meta),
};
