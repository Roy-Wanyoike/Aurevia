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

  // Subscribe to event channels
  socket.on("subscribe:channel", (channel: string) => {
    if (["signals", "orders", "risk", "portfolio", "health"].includes(channel)) {
      socket.join(`channel:${channel}`);
      socket.emit("subscribed:channel", { channel, timestamp: Date.now() });
    }
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
