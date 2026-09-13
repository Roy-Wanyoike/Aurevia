// ---------------------------------------------------------------------------
// Aurevia SSE streaming endpoint (Issue #107).
//
// GET /api/v1/stream — text/event-stream pushing live market ticks.
//
// Wire format (server-sent events):
//
//   data: {"type":"connected","timestamp":<epochMs>}\n\n
//   data: {"type":"tick","quotes":[{"symbol","price","changePct","timestamp"}, ...]}\n\n
//   data: {"type":"heartbeat","timestamp":<epochMs>}\n\n
//
// Cadence:
//   - `connected` fired once on stream open.
//   - `tick`        fired every 2s with the first 6 assets of the catalog.
//   - `heartbeat`   fired every 15s so any intermediate proxy that buffers
//                    idle connections (e.g. nginx) keeps the stream alive.
//
// Cleanup:
//   - Both intervals are tracked and cleared in the ReadableStream `cancel`
//     handler, which Next.js calls when the client disconnects.
//
// Frontend hook: `useSSEStream` (src/lib/aurevia/hooks/use-sse-stream.ts).
// ---------------------------------------------------------------------------

import { store } from "@/lib/aurevia/store";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";
// Inline the maximum-duration hint for Vercel so the platform does not cap the
// long-lived stream at the default function timeout. (No-op off Vercel.)
export const maxDuration = 300;

// Tunables — module-level so they can be tweaked without re-reading the file.
const TICK_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const TICK_ASSET_COUNT = 6;

export async function GET() {
  const encoder = new TextEncoder();

  // Hold the teardown function in a closure so both `start()` and `cancel()`
  // (which Next.js calls on client disconnect) can reach it. The intervals
  // themselves are only assigned inside start(); the closure variable lets
  // cancel() tear them down idempotently.
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const safeEnqueue = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Controller may have errored mid-stream — bail out cleanly.
          cleanup?.();
        }
      };

      // Tick: push the first N assets' quotes every TICK_INTERVAL_MS.
      const tickInterval = setInterval(() => {
        try {
          const quotes = store.assetCatalog.slice(0, TICK_ASSET_COUNT).map((a) => {
            const q = store.getQuote(a.symbol);
            return {
              symbol: a.symbol,
              price: q.price,
              changePct: q.changePct,
              timestamp: q.timestamp,
            };
          });
          safeEnqueue({ type: "tick", quotes });
        } catch (e: any) {
          // Never let a single tick kill the stream — log + continue.
          logger.warn("SSE tick failed", { error: e?.message ?? "unknown" });
        }
      }, TICK_INTERVAL_MS);

      // Heartbeat: keep proxies from closing an idle connection.
      const heartbeatInterval = setInterval(() => {
        safeEnqueue({ type: "heartbeat", timestamp: Date.now() });
      }, HEARTBEAT_INTERVAL_MS);

      // Teardown — idempotent so it's safe to call from enqueue errors,
      // cancel(), or the controller's erroring.
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(tickInterval);
        clearInterval(heartbeatInterval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Initial connection ack — fires immediately so the client knows the
      // stream is wired up before the first 2s tick.
      safeEnqueue({ type: "connected", timestamp: Date.now() });
    },

    cancel() {
      // Next.js (Web Streams API) calls `cancel` when the client disconnects.
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disables nginx buffering so bytes flush to the client immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
