"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export interface LiveTick {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  spread: number;
  changePct: number;
  timestamp: number;
}

export interface LiveSignal {
  id: string;
  symbol: string;
  strategyKey: string;
  action: string;
  confidence: number;
  price: number;
  timestamp: number;
}

export function useAureviaStream() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [ticks, setTicks] = useState<Map<string, LiveTick>>(new Map());
  const [signals, setSignals] = useState<LiveSignal[]>([]);
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const [clients, setClients] = useState<number>(0);

  useEffect(() => {
    // Connect via Caddy proxy using XTransformPort query param. When running
    // locally (not behind Caddy), fall back to a direct localhost connection.
    // The Caddy gateway listens on port 81 and proxies /?XTransformPort=N to
    // localhost:N. In the preview/sandbox environment, the frontend is
    // served through Caddy, so the relative path works. For local dev
    // (agent-browser hitting localhost:3000 directly), we connect to
    // localhost:3003 directly.
    const isLocalDev =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
      window.location.port === "3000";

    const socketUrl = isLocalDev
      ? "http://localhost:3003"
      : undefined; // undefined = same origin (through Caddy)

    const socket = io(socketUrl ?? "/", {
      path: "/",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
      ...(isLocalDev ? {} : { query: { XTransformPort: "3003" } }),
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("subscribe:channel", "signals");
      socket.emit("subscribe:channel", "health");
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on("reconnect_attempt", () => setConnected(false));

    socket.on("tick", (tick: LiveTick) => {
      setTicks((prev) => {
        const next = new Map(prev);
        next.set(tick.symbol, tick);
        if (next.size > 50) {
          const firstKey = next.keys().next().value;
          if (firstKey) next.delete(firstKey);
        }
        return next;
      });
    });

    socket.on("signal", (sig: LiveSignal) => {
      setSignals((prev) => [sig, ...prev].slice(0, 20));
    });

    socket.on("heartbeat", (h: { timestamp: number; clients: number }) => {
      setLastHeartbeat(h.timestamp);
      setClients(h.clients);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { connected, ticks, signals, lastHeartbeat, clients };
}
