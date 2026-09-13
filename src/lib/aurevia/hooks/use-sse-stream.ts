"use client";

// ---------------------------------------------------------------------------
// Aurevia SSE client hook (Issue #107).
//
// `useSSEStream()` opens an `EventSource` against `/api/v1/stream` and tracks
// the inbound events. Auto-reconnect is provided by the browser's
// `EventSource` implementation (it retries with backoff).
//
// Returned state:
//   - connected      — boolean, true while the underlying EventSource is OPEN.
//   - ticks          — Map<symbol, SSETick>, latest tick per symbol. The
//                      Map is replaced on each tick (referential change) so
//                      React re-renders consumers cleanly.
//   - lastHeartbeat  — epoch ms of the most recent heartbeat (or null).
//
// Wire format expected (matches src/app/api/v1/stream/route.ts):
//
//   { type: "connected",  timestamp: number }
//   { type: "tick",       quotes:   SSETick[] }
//   { type: "heartbeat",  timestamp: number }
//
// Robustness:
//   - Parse errors are swallowed (the SSE server may briefly emit a partial
//     chunk at the start of a chunked response).
//   - On unmount the EventSource is closed so the connection doesn't leak.
//   - The hook is SSR-safe: it only opens the connection inside useEffect,
//     which runs client-side only.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";

export interface SSETick {
  symbol: string;
  price: number;
  changePct: number;
  timestamp: number;
}

export interface SSESignal {
  id: string;
  symbol: string;
  action: string;
  strategyKey: string;
  confidence: number;
}

export interface UseSSEStreamResult {
  connected: boolean;
  ticks: Map<string, SSETick>;
  lastHeartbeat: number | null;
}

export function useSSEStream(): UseSSEStreamResult {
  const [connected, setConnected] = useState(false);
  const [ticks, setTicks] = useState<Map<string, SSETick>>(new Map());
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Guard against SSR — the hook body may be evaluated on the server
    // during Next.js's initial render, but EventSource only exists in
    // browser environments.
    if (typeof window === "undefined") return;

    const es = new EventSource("/api/v1/stream");
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "tick" && Array.isArray(data.quotes)) {
          setTicks((prev) => {
            // New Map so React detects the change — mutating the existing
            // Map in place would NOT trigger a re-render.
            const next = new Map(prev);
            for (const q of data.quotes as SSETick[]) {
              if (q && typeof q.symbol === "string") {
                next.set(q.symbol, q);
              }
            }
            // Bound the cache so a long-lived tab doesn't grow forever.
            if (next.size > 50) {
              const firstKey = next.keys().next().value;
              if (firstKey) next.delete(firstKey);
            }
            return next;
          });
        } else if (data.type === "heartbeat") {
          setLastHeartbeat(data.timestamp ?? Date.now());
        }
        // `connected` event is consumed implicitly via `onopen`; we don't
        // emit it through state to avoid an unnecessary re-render cycle.
      } catch {
        // Ignore parse errors — partial chunks during connect are rare but
        // possible, and there's nothing actionable we could do here.
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, []);

  return { connected, ticks, lastHeartbeat };
}
