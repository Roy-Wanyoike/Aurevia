import { createServer } from "http";
import { Server } from "socket.io";

// ---------------------------------------------------------------------------
// Aurevia WebSocket Streaming Service.
//
// This mini-service runs on port 3003 and pushes real-time updates to
// connected clients: live quotes, signal alerts, order fills, risk events,
// and circuit-breaker state changes. The Next.js frontend connects via
// io("/?XTransformPort=3003") so Caddy proxies to the correct port.
//
// In production, this service would subscribe to the market-data gateway
// and the event bus, forwarding events to authorized clients. In this dev
// environment, it emits simulated ticks every 2s so the frontend can
// demonstrate live streaming without external dependencies.
//
// Issue #201 — socket handshake auth is enforced via `io.use()` middleware:
// in production a JWT MUST be present in `socket.handshake.auth.token` or
// the connection is rejected. In dev, connections without a token are
// allowed (dev bypass) but restricted to the `health` channel — the
// `signals`, `orders`, `risk`, and `portfolio` channels require an
// authenticated socket. Full JWT signature verification is a follow-up
// task that depends on the auth system becoming production-ready
// (see `src/lib/aurevia/auth/check.ts`).
// ---------------------------------------------------------------------------

const PORT = 3003;

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
  // Issue #69 — `cors: { origin: "*" }` lets any website open a socket
  // against the stream service. In production that's a CSRF / data-exfil
  // vector: a malicious page could subscribe to live quotes / signals from
  // a victim's authenticated browser session. We restrict to explicit
  // origins in production (CORS_ALLOWED_ORIGINS, comma-separated, defaults
  // to the canonical domain) and stay permissive in dev so local dev
  // against any localhost port keeps working.
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? (process.env.CORS_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ??
          ["https://aurevia.io"])
        : "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Symbols to stream — the Aurevia universe
const SYMBOLS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA",
  "JPM", "V", "WMT", "SPY", "QQQ", "IWM",
  "BTC", "ETH", "SOL", "EURUSD", "GBPUSD",
];

// Base prices for simulated ticks
const BASE: Record<string, number> = {
  AAPL: 228, MSFT: 420, NVDA: 128, AMZN: 185, GOOGL: 165, META: 505,
  TSLA: 245, JPM: 215, V: 275, WMT: 78, SPY: 560, QQQ: 485, IWM: 218,
  BTC: 62000, ETH: 2950, SOL: 148, EURUSD: 1.085, GBPUSD: 1.305,
};

console.log(`[aurevia-stream] Starting WebSocket service on port ${PORT}`);

// ---------------------------------------------------------------------------
// Issue #201 — socket handshake auth gate.
//
// Same posture as aurevia-blog-chat: in production, a JWT MUST be supplied
// via `socket.handshake.auth.token`. We do NOT verify the signature here —
// that wiring depends on the auth system becoming production-ready
// (per `src/lib/aurevia/auth/check.ts`). For now this is a presence gate:
// if no token is provided in production, the connection is rejected.
//
// In dev, connections without a token are allowed (dev bypass) but
// `socket.data.authenticated` is set to `false` so the `subscribe:channel`
// handler can restrict sensitive channels (`signals`, `orders`, `risk`,
// `portfolio`) to authenticated sockets only. The `health` channel stays
// open so unauthenticated dev clients (e.g. smoke-test harnesses) can still
// confirm the service is alive.
//
// Frontend clients pass the token via `io(..., { auth: { token: jwtString } })`.
// ---------------------------------------------------------------------------

let warnedUnauthenticatedDev = false;

io.use((socket, next) => {
  const isProd = process.env.NODE_ENV === "production";
  const handshakeAuth = (socket.handshake.auth ?? {}) as { token?: unknown };
  const token = handshakeAuth.token;
  const hasToken = typeof token === "string" && token.trim().length > 0;

  if (!isProd) {
    if (!hasToken && !warnedUnauthenticatedDev) {
      warnedUnauthenticatedDev = true;
      console.warn(
        "[aurevia-stream] Dev-mode socket auth bypassed — supply `auth.token` before deploy (issue #201)",
      );
    }
    socket.data.authenticated = hasToken;
    return next();
  }

  if (!hasToken) {
    return next(new Error("unauthorized: missing auth.token"));
  }
  // TODO(#201): full JWT signature verification once the auth system is
  // production-ready. For now this is a presence gate — see header comment.
  socket.data.authenticated = true;
  return next();
});

// -----------------------------------------------------------------
// Event channel taxonomy — see `subscribe:channel` handler below.
// -----------------------------------------------------------------

const PUBLIC_CHANNELS = ["health"] as const;
const RESTRICTED_CHANNELS = ["signals", "orders", "risk", "portfolio"] as const;
const ALL_CHANNELS = [...PUBLIC_CHANNELS, ...RESTRICTED_CHANNELS] as const;
type ChannelName = (typeof ALL_CHANNELS)[number];

function isChannelName(value: string): value is ChannelName {
  return (ALL_CHANNELS as readonly string[]).includes(value);
}

function isRestrictedChannel(value: string): boolean {
  return (RESTRICTED_CHANNELS as readonly string[]).includes(value);
}

// --- Connection handling ---
io.on("connection", (socket) => {
  console.log(`[aurevia-stream] Client connected: ${socket.id}`);

  // Send an initial snapshot
  socket.emit("connected", {
    service: "aurevia-stream",
    version: "1.0.0",
    timestamp: Date.now(),
    message: "Connected to Aurevia real-time streaming service",
  });

  // Subscribe to specific symbols
  socket.on("subscribe", (symbols: string[]) => {
    if (!Array.isArray(symbols)) return;
    const upper = symbols.map((s) => s.toUpperCase()).filter((s) => BASE[s]);
    socket.join(`symbols:${upper.join(",")}`);
    socket.emit("subscribed", { symbols: upper, timestamp: Date.now() });
  });

  // -----------------------------------------------------------------
  // Subscribe to event channels.
  //
  // Issue #201 — `signals`, `orders`, `risk`, and `portfolio` carry
  // position/trade/risk state and must not leak to unauthenticated
  // clients. The `health` channel is intentionally public so smoke
  // tests and uptime probes can confirm the service is alive without
  // credentials (matches the REST `/api/v1/health` posture).
  //
  // In production, sockets without a token are rejected at the handshake
  // (see `io.use()` above), so every socket reaching this handler has
  // `socket.data.authenticated === true` and may subscribe to any
  // channel. In dev, unauthenticated sockets are allowed in but blocked
  // from the restricted channels — they receive an `error:channel`
  // event so the developer sees the denial in the console.
  // -----------------------------------------------------------------
  socket.on("subscribe:channel", (channel: string) => {
    if (!isChannelName(channel)) return;

    const authenticated = socket.data.authenticated === true;
    if (isRestrictedChannel(channel) && !authenticated) {
      socket.emit("error:channel", {
        channel,
        reason: "auth_required",
        message:
          "Subscription to this channel requires authentication (issue #201). Pass `auth.token` in the socket handshake.",
        timestamp: Date.now(),
      });
      return;
    }

    socket.join(`channel:${channel}`);
    socket.emit("subscribed:channel", { channel, timestamp: Date.now() });
  });

  socket.on("disconnect", () => {
    console.log(`[aurevia-stream] Client disconnected: ${socket.id}`);
  });
});

// --- Simulated live market data ticks (every 2s) ---
setInterval(() => {
  for (const symbol of SYMBOLS) {
    const base = BASE[symbol];
    // Small random walk: ±0.15%
    const change = (Math.random() - 0.5) * 0.003;
    const price = base * (1 + change);
    const bid = price * (1 - 0.0002);
    const ask = price * (1 + 0.0002);
    const tick = {
      symbol,
      price: Math.round(price * 100) / 100,
      bid: Math.round(bid * 100) / 100,
      ask: Math.round(ask * 100) / 100,
      spread: Math.round((ask - bid) * 10000) / 10000,
      changePct: Math.round(change * 10000) / 100,
      timestamp: Date.now(),
    };
    io.emit("tick", tick);
  }
  // Also emit a heartbeat
  io.emit("heartbeat", { timestamp: Date.now(), clients: io.engine.clientsCount });
}, 2000);

// --- Simulated signal alerts (every 15s) ---
const STRATEGIES = ["momentum", "trend-following", "ma-crossover", "mean-reversion", "breakout", "alm-v1", "arf-v1"];
const ACTIONS = ["BUY", "SELL"];
setInterval(() => {
  const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const strategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
  const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  const confidence = 0.5 + Math.random() * 0.4;
  io.to("channel:signals").emit("signal", {
    id: `ws-sig-${Date.now()}`,
    symbol,
    strategyKey: strategy,
    action,
    confidence: Math.round(confidence * 100) / 100,
    price: BASE[symbol],
    timestamp: Date.now(),
  });
}, 15000);

// --- Simulated health updates (every 10s) ---
setInterval(() => {
  io.to("channel:health").emit("health", {
    status: "ok",
    uptimeMs: process.uptime() * 1000,
    latencyMs: 1 + Math.floor(Math.random() * 4),
    brokerConnected: true,
    circuitBreakerState: "NORMAL",
    clients: io.engine.clientsCount,
    timestamp: Date.now(),
  });
}, 10000);

httpServer.listen(PORT, () => {
  console.log(`[aurevia-stream] ✓ Listening on port ${PORT}`);
  console.log(`[aurevia-stream] Frontend connects via: io("/?XTransformPort=${PORT}")`);
});
