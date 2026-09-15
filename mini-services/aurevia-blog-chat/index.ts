import { createServer } from "http";
import { Server } from "socket.io";

// ---------------------------------------------------------------------------
// Aurevia Research Hub — Blog Realtime Service.
//
// Mini-service running on port 3004 that powers two realtime surfaces:
//
//   1. Per-article live comments — when a reader posts a comment via the
//      POST /api/v1/blog/articles/[slug]/comments route, the frontend
//      also emits a `blog:comment` event here so all other readers on the
//      same article see the comment appear without a refetch. Typing
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
// In production, you'd add an auth check on the socket handshake (cookie
// or Bearer token); in dev we leave it open to match the rest of the
// platform's dev-bypass posture.
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
  // Live comment broadcast — emitted by the client immediately after
  // a successful POST to /api/v1/blog/articles/[slug]/comments. We
  // fan it out to the article room so other readers see the new
  // comment without polling. The comment row itself is the source of
  // truth — this event is just a "refresh now" signal with the data
  // pre-attached to avoid an extra round-trip.
  // -----------------------------------------------------------------
  socket.on("blog:comment", (payload: {
    slug: string;
    comment: {
      id: string;
      authorName: string;
      content: string;
      parentId: string | null;
      createdAt: string;
    };
  }) => {
    if (!payload?.slug || !payload?.comment) return;
    io.to(`article:${payload.slug}`).emit("blog:comment", {
      slug: payload.slug,
      comment: payload.comment,
      ts: Date.now(),
    });
  });

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
