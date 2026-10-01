import { createServer } from "http";
import { Server } from "socket.io";

// ---------------------------------------------------------------------------
// Aurevia Research Hub — Blog Realtime Service.
//
// Mini-service running on port 3004 that powers two realtime surfaces:
//
//   1. Per-article live comments — when a reader posts a comment via the
//      POST /api/v1/blog/articles/[slug]/comments route, the server (Next.js
//      REST API or a co-located emitter) broadcasts a `blog:comment` event
//      to this service, which fans it out to every other reader on the same
//      article so they see the comment appear without a refetch. Typing
//      indicators (`blog:typing`) broadcast the same way.
//
//   2. A general "Research Lounge" chat room — a global chat for
//      researchers / readers to discuss market themes across articles.
//      The room is intentionally cross-article: it's the social layer
//      for the publishing platform, not a per-thread reply box.
//
// The Next.js frontend connects via `io("/?XTransformPort=3004")` so Caddy
// proxies to the correct port. The service is stateless — all persistence
// (comment rows in SQLite) happens via the REST API; this service only
// fans events out to connected sockets.
//
// Issue #201 — socket handshake auth is enforced via `io.use()` middleware:
// in production a JWT MUST be present in `socket.handshake.auth.token` or
// the connection is rejected. In dev, connections without a token are
// allowed (dev bypass) so local development against any localhost port
// keeps working. The client-emitted `blog:comment` handler has been removed
// — clients can no longer inject arbitrary comment payloads; only the
// server-side broadcast path (REST API → this service) may emit comments.
// Full JWT signature verification is a follow-up task that depends on the
// auth system becoming production-ready (see `auth/check.ts`).
// ---------------------------------------------------------------------------

const PORT = 3004;

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
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

// ---------------------------------------------------------------------------
// Connection tracking — for the "researchers online" presence indicator.
// We keep a Map<socketId, { name, articleSlug? }> so we can compute how
// many distinct readers are currently on each article page (and broadcast
// presence updates when that count changes).
// ---------------------------------------------------------------------------

interface Reader {
  id: string;
  name: string;
  articleSlug?: string;
  joinedAt: number;
}

const readers = new Map<string, Reader>();

function presenceFor(slug?: string) {
  const now = Date.now();
  const all = Array.from(readers.values());
  // Total readers in the lounge.
  const total = all.length;
  // Readers currently viewing a specific article.
  const onArticle = slug
    ? all.filter((r) => r.articleSlug === slug).length
    : 0;
  // Online names (deduped, capped at 12 for the UI).
  const names = Array.from(new Set(all.map((r) => r.name))).slice(0, 12);
  return { total, onArticle, names, ts: now };
}

// ---------------------------------------------------------------------------
// Issue #201 — socket handshake auth gate.
//
// Both mini-services used to accept unauthenticated socket connections, which
// let any web page open a socket against the service. Worse, this service
// accepted client-emitted `blog:comment` events and rebroadcast them —
// bypassing the REST API's validation, rate-limiting (issue #141), and XSS
// sanitization (issue #200). That let a malicious client inject fake
// comments with arbitrary HTML into other readers' views.
//
// This middleware closes the door:
//   - In production: a JWT MUST be supplied via `socket.handshake.auth.token`.
//     We do NOT verify the signature here — that wiring depends on the auth
//     system becoming production-ready (per `src/lib/aurevia/auth/check.ts`).
//     For now this is a presence gate: if no token is provided, the
//     connection is rejected. When the auth system lands, swap this for
//     `jwt.verify(token, secret)` and stamp the decoded user on
//     `socket.data.user`.
//   - In dev: connections without a token are allowed (dev bypass) — matches
//     the rest of the platform's posture. A one-shot warning is logged so
//     developers don't forget to wire auth up before deploying.
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
        "[aurevia-blog-chat] Dev-mode socket auth bypassed — supply `auth.token` before deploy (issue #201)",
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

// ---------------------------------------------------------------------------
// Issue #201 — server-side broadcast helper.
//
// The client-emitted `socket.on("blog:comment", ...)` handler was removed
// (see the comment block inside `io.on("connection")` below) because it let
// any connected client bypass REST validation, rate-limiting, and XSS
// sanitization. The REST API (Next.js server) is now the only legitimate
// source of `blog:comment` events.
//
// When the Next.js server creates a comment via
// POST /api/v1/blog/articles/[slug]/comments, it should emit `blog:comment`
// to the article room via this helper. The wiring path is one of:
//   - HTTP POST to an internal endpoint on this service (e.g. /internal/broadcast)
//   - Redis pubsub subscription in this service
//   - Direct in-process call if co-located with the Next.js server
// That wiring is a follow-up task tracked separately; it depends on the auth
// system landing first so the internal endpoint can be authenticated.
//
// The helper is exported so a future internal HTTP endpoint (or pubsub
// subscriber) added to this file can call it directly. It is intentionally
// uncalled today — the client-side `useBlogChat().broadcastComment()` callsite
// in `src/lib/aurevia/hooks/use-blog-chat.ts` is now a no-op until the
// server-side wiring lands.
// ---------------------------------------------------------------------------

interface BlogCommentPayload {
  slug: string;
  comment: {
    id: string;
    authorName: string;
    content: string;
    parentId: string | null;
    createdAt: string;
  };
}

export function broadcastBlogComment(payload: BlogCommentPayload) {
  if (!payload?.slug || !payload?.comment) return;
  io.to(`article:${payload.slug}`).emit("blog:comment", {
    slug: payload.slug,
    comment: payload.comment,
    ts: Date.now(),
  });
}

io.on("connection", (socket) => {
  // Generate a default name; the client can override it via `blog:identify`.
  const id = socket.id;
  const fallbackName = `Reader-${id.slice(0, 4)}`;
  readers.set(id, { id, name: fallbackName, joinedAt: Date.now() });
  console.log(`[aurevia-blog-chat] Connected: ${id} (${fallbackName})`);

  // Welcome + initial presence snapshot.
  socket.emit("blog:welcome", {
    service: "aurevia-blog-chat",
    version: "1.0.0",
    you: { id, name: fallbackName },
    presence: presenceFor(),
    timestamp: Date.now(),
  });

  // -----------------------------------------------------------------
  // Identity — a client can set its display name. This is purely
  // cosmetic; the actual comment authorship is recorded via the REST
  // API. We broadcast a presence update so the lounge header refreshes.
  // -----------------------------------------------------------------
  socket.on("blog:identify", (payload: { name?: string }) => {
    const reader = readers.get(id);
    if (!reader) return;
    const next = (payload?.name ?? "").toString().trim().slice(0, 40);
    if (next.length > 0) {
      reader.name = next;
      socket.emit("blog:identified", { id, name: next });
      io.emit("blog:presence", presenceFor());
    }
  });

  // -----------------------------------------------------------------
  // Article subscription — when a reader opens an article, they
  // subscribe to that article's room so they receive `blog:comment`
  // events for it. They also leave any previous article room and
  // update their `articleSlug` so presence reflects the right count.
  // -----------------------------------------------------------------
  let currentArticleRoom: string | null = null;

  socket.on("blog:join-article", (payload: { slug?: string }) => {
    const slug = (payload?.slug ?? "").toString().trim();
    if (!slug) return;

    // Leave the previous article room first.
    if (currentArticleRoom) {
      socket.leave(currentArticleRoom);
    }
    currentArticleRoom = `article:${slug}`;
    socket.join(currentArticleRoom);

    // Update our reader record so presence reflects the new article.
    const reader = readers.get(id);
    if (reader) reader.articleSlug = slug;

    // Tell the room a new reader joined (for typing-indicator context).
    socket.to(currentArticleRoom).emit("blog:reader-joined", {
      name: reader?.name ?? fallbackName,
      ts: Date.now(),
    });

    // Broadcast updated presence (readers on this article, plus lounge total).
    io.emit("blog:presence", presenceFor(slug));
  });

  socket.on("blog:leave-article", () => {
    if (currentArticleRoom) {
      socket.leave(currentArticleRoom);
      const reader = readers.get(id);
      if (reader) reader.articleSlug = undefined;
      socket.to(currentArticleRoom).emit("blog:reader-left", {
        name: reader?.name ?? fallbackName,
        ts: Date.now(),
      });
      currentArticleRoom = null;
      io.emit("blog:presence", presenceFor());
    }
  });

  // -----------------------------------------------------------------
  // Issue #201 — client-emitted `blog:comment` is intentionally NOT
  // handled. The previous handler accepted arbitrary payloads from any
  // connected client and rebroadcast them, bypassing the REST API's
  // validation, rate-limiting (5/min per article per IP — issue #141),
  // and XSS sanitization (issue #200). That let a malicious client inject
  // fake comments with arbitrary HTML into other readers' views.
  //
  // Correct flow (the REST API is the source of truth):
  //   1. Client POSTs to /api/v1/blog/articles/[slug]/comments
  //   2. REST API creates the comment row (validated, sanitized, rate-limited)
  //   3. REST API (or the Next.js server) emits `blog:comment` to this
  //      service via a server-side transport (HTTP endpoint on this
  //      service, Redis pubsub, etc.) — NOT from the client socket.
  //   4. This service fans the event out to the article room via
  //      `broadcastBlogComment()` (defined above).
  //
  // The server-broadcast capability is preserved (see the
  // `broadcastBlogComment()` export above) — `io.to(articleRoom).emit(...)`
  // is still callable from server-side code in this process. The wiring
  // to trigger it from the Next.js server side is a follow-up task
  // tracked separately; it depends on the auth system landing first so
  // the internal endpoint can be authenticated.
  //
  // Clients that attempt to emit `blog:comment` directly will be silently
  // ignored (no handler registered) — the event simply has no listener.
  // -----------------------------------------------------------------

  // -----------------------------------------------------------------
  // Typing indicator — broadcasts to the article room only. The
  // payload carries `isTyping: false` on blur so the indicator clears.
  // We throttle on the client (one emit per keystroke burst) so the
  // server doesn't need to deduplicate.
  // -----------------------------------------------------------------
  socket.on("blog:typing", (payload: { slug?: string; name?: string; isTyping?: boolean }) => {
    if (!payload?.slug) return;
    if (!currentArticleRoom) return;
    socket.to(currentArticleRoom).emit("blog:typing", {
      slug: payload.slug,
      name: payload.name ?? fallbackName,
      isTyping: payload.isTyping ?? true,
      ts: Date.now(),
    });
  });

  // -----------------------------------------------------------------
  // Research Lounge — global cross-article chat. Anyone connected can
  // post here; messages broadcast to everyone. This is the social
  // surface for the publishing platform.
  // -----------------------------------------------------------------
  socket.on("blog:lounge-message", (payload: { name?: string; text?: string }) => {
    const text = (payload?.text ?? "").toString().trim().slice(0, 1000);
    if (!text) return;
    const reader = readers.get(id);
    const name = reader?.name ?? fallbackName;
    // Echo back to sender AND to everyone else.
    io.emit("blog:lounge-message", {
      id: `lm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      authorName: name,
      text,
      ts: Date.now(),
    });
  });

  // -----------------------------------------------------------------
  // Disconnect — remove the reader and broadcast presence update.
  // -----------------------------------------------------------------
  socket.on("disconnect", () => {
    const reader = readers.get(id);
    if (reader) {
      if (currentArticleRoom) {
        socket.to(currentArticleRoom).emit("blog:reader-left", {
          name: reader.name,
          ts: Date.now(),
        });
      }
    }
    readers.delete(id);
    io.emit("blog:presence", presenceFor());
    console.log(`[aurevia-blog-chat] Disconnected: ${id}`);
  });
});

// Heartbeat — every 15s, broadcast a global presence snapshot so any
// newly-connected clients (or clients that lost and re-established
// connection) get a fresh count without waiting for the next event.
setInterval(() => {
  io.emit("blog:presence", presenceFor());
}, 15_000);

httpServer.listen(PORT, () => {
  console.log(`[aurevia-blog-chat] ✓ Listening on port ${PORT}`);
  console.log(`[aurevia-blog-chat] Frontend connects via: io("/?XTransformPort=${PORT}")`);
});
