"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";

// ---------------------------------------------------------------------------
// `useBlogChat` — React hook for the Aurevia Research Hub realtime service.
//
// Connects to the WebSocket mini-service at port 3004 (proxied via Caddy
// using `?XTransformPort=3004`). Exposes:
//
//   - `presence`   — { total, onArticle, names } for the current article
//                   (or the lounge total when no article is open).
//   - `comments`   — live-feed of new comments on the open article
//                   (useComments() in `hooks/blog.ts` is the source of
//                   truth for the existing comments; this hook only
//                   surfaces the *new* ones since the page was opened).
//   - `lounge`     — global chat messages for the Research Lounge.
//   - `identify(name)` — set the reader's display name.
//   - `joinArticle(slug)` / `leaveArticle()` — subscribe to an article's
//                   realtime events.
//   - `postComment(slug, comment)` — broadcast a freshly-created comment
//                   to other readers on the same article.
//   - `sendLoungeMessage(text)` — post to the global lounge chat.
//
// The connection is established lazily on first use (the hook doesn't
// open a socket until the user lands on a blog view) and torn down on
// unmount.
// ---------------------------------------------------------------------------

interface BlogComment {
  id: string;
  authorName: string;
  content: string;
  parentId: string | null;
  createdAt: string;
}

interface LoungeMessage {
  id: string;
  authorName: string;
  text: string;
  ts: number;
}

interface Presence {
  total: number;
  onArticle: number;
  names: string[];
  ts: number;
}

let singletonSocket: Socket | null = null;

function getSocket(): Socket {
  if (singletonSocket && singletonSocket.connected) return singletonSocket;
  if (singletonSocket) {
    singletonSocket.disconnect();
    singletonSocket = null;
  }
  singletonSocket = io("/?XTransformPort=3004", {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });
  return singletonSocket;
}

export function useBlogChat() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [liveComments, setLiveComments] = useState<BlogComment[]>([]);
  const [lounge, setLounge] = useState<LoungeMessage[]>([]);
  const [typingPeers, setTypingPeers] = useState<Record<string, { name: string; ts: number }>>({});

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onWelcome = (payload: { presence: Presence }) => {
      setPresence(payload.presence);
    };
    const onPresence = (p: Presence) => setPresence(p);
    const onComment = (payload: { slug: string; comment: BlogComment; ts: number }) => {
      setLiveComments((prev) =>
        prev.find((c) => c.id === payload.comment.id) ? prev : [...prev, payload.comment],
      );
    };
    const onLoungeMessage = (msg: LoungeMessage) => {
      setLounge((prev) => [...prev.slice(-100), msg]);
    };
    const onTyping = (payload: { slug: string; name: string; isTyping: boolean; ts: number }) => {
      setTypingPeers((prev) => {
        const next = { ...prev };
        if (payload.isTyping) {
          next[payload.name] = { name: payload.name, ts: payload.ts };
        } else {
          delete next[payload.name];
        }
        return next;
      });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("blog:welcome", onWelcome);
    socket.on("blog:presence", onPresence);
    socket.on("blog:comment", onComment);
    socket.on("blog:lounge-message", onLoungeMessage);
    socket.on("blog:typing", onTyping);

    // Try to connect immediately if not already.
    if (!socket.connected) socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("blog:welcome", onWelcome);
      socket.off("blog:presence", onPresence);
      socket.off("blog:comment", onComment);
      socket.off("blog:lounge-message", onLoungeMessage);
      socket.off("blog:typing", onTyping);
      // Don't disconnect — keep the singleton alive across view switches.
    };
  }, []);

  const identify = useCallback((name: string) => {
    socketRef.current?.emit("blog:identify", { name });
  }, []);

  const joinArticle = useCallback((slug: string) => {
    socketRef.current?.emit("blog:join-article", { slug });
    // Clear typing peers when switching articles.
    setTypingPeers({});
  }, []);

  const leaveArticle = useCallback(() => {
    socketRef.current?.emit("blog:leave-article");
  }, []);

  const broadcastComment = useCallback((slug: string, comment: BlogComment) => {
    socketRef.current?.emit("blog:comment", { slug, comment });
  }, []);

  const sendTyping = useCallback((slug: string, name: string, isTyping: boolean) => {
    socketRef.current?.emit("blog:typing", { slug, name, isTyping });
  }, []);

  const sendLoungeMessage = useCallback((text: string) => {
    socketRef.current?.emit("blog:lounge-message", { text });
  }, []);

  // Clear the live-comment buffer (called by the article view when it
  // integrates the new comments into the main list).
  const clearLiveComments = useCallback(() => setLiveComments([]), []);

  return {
    connected,
    presence,
    liveComments,
    lounge,
    typingPeers,
    identify,
    joinArticle,
    leaveArticle,
    broadcastComment,
    sendTyping,
    sendLoungeMessage,
    clearLiveComments,
  };
}
