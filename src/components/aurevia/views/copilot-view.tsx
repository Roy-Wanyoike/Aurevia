"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { useAskCopilot } from "@/lib/aurevia/hooks";
import { toast } from "sonner";
import {
  Bot,
  Send,
  User,
  Sparkles,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Loader2,
  Info,
  AlertCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia AI Research Copilot view (issue #55).
//
// A focused chat interface:
//   - Message history with markdown-rendered assistant answers.
//   - Input box with send button (Enter to send, Shift+Enter for newline).
//   - Suggested-question chips to seed exploration.
//   - Loading state while waiting for the ZAI completion.
//   - Collapsible context card showing what data was sent to the model.
//
// The SDK only runs on the server (POST /api/v1/copilot). The browser only
// ever sees the answer + the context bundle that was sent.
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  context?: string;
}

const SUGGESTED_QUESTIONS = [
  "Why is AAPL moving?",
  "What's my portfolio risk?",
  "Which stocks have strong momentum?",
  "Summarize recent signals",
  "What's my current exposure?",
  "Are there any risk events I should know about?",
];

export function CopilotView() {
  const ask = useAskCopilot();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [showContext, setShowContext] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or while loading.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, ask.isPending]);

  // Persistent error banner for failed mutations. Toasts are ephemeral; this
  // banner stays visible until the user dismisses it or sends another query.
  // Conversation history is preserved (the banner sits above the chat column,
  // not as a takeover screen).
  const lastError =
    ask.isError && ask.error instanceof Error
      ? ask.error.message
      : ask.isError
        ? "Copilot request failed"
        : null;

  function send(query?: string) {
    const q = (query ?? input).trim();
    if (!q || ask.isPending) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: q,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    ask.mutate(
      { query: q },
      {
        onSuccess: (d) => {
          const assistantMsg: ChatMessage = {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: d.answer,
            context: d.context,
          };
          setMessages((m) => [...m, assistantMsg]);
        },
        onError: (e: any) => {
          toast.error(e?.message ?? "Copilot failed");
        },
      },
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const latestContext = [...messages].reverse().find((m) => m.context)?.context;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">AI Research Copilot</h2>
        <p className="text-sm text-muted-foreground">
          Ask questions about your portfolio and the markets. The copilot answers using live Aurevia context — never fabricates data.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Chat column */}
        <Card className="flex flex-col p-4 lg:col-span-2" style={{ minHeight: "70vh" }}>
          <div className="mb-3 flex items-center gap-2">
            <Bot className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">Conversation</h3>
            <Badge variant="outline" className="ml-auto text-xs">
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </Badge>
          </div>

          {lastError && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium">Last request failed:</span>
                <span className="text-muted-foreground">{lastError}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5"
                onClick={() => ask.reset()}
              >
                Retry
              </Button>
            </div>
          )}

          {/* Messages scroll area */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto rounded-md border border-border/60 bg-card/40 p-3"
            style={{ maxHeight: "55vh" }}
          >
            {messages.length === 0 && !ask.isPending && (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                  <Sparkles className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Ask me anything about your portfolio
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    I have access to your live equity, positions, exposure,
                    top movers, and recent signals.
                  </p>
                </div>
              </div>
            )}

            {messages.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}

            {ask.isPending && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                  <Bot className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  <span>Researching your portfolio…</span>
                </div>
              </div>
            )}
          </div>

          {/* Input row */}
          <div className="mt-3 space-y-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your portfolio, a specific asset, or recent signals…"
              className="min-h-[60px] max-h-32 resize-none"
              disabled={ask.isPending}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">
                Enter to send · Shift+Enter for newline · Answers are AI-generated — verify before acting.
              </p>
              <Button
                size="sm"
                onClick={() => send()}
                disabled={!input.trim() || ask.isPending}
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                {ask.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Sidebar: suggested questions + context card */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold">Suggested Questions</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={ask.isPending}
                  className="rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </Card>

          {/* Context card */}
          <Card className="p-4">
            <button
              onClick={() => setShowContext((v) => !v)}
              className="flex w-full items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              aria-expanded={showContext}
            >
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold">Context Sent to AI</h3>
              </div>
              {showContext ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {showContext && (
              <div className="mt-3">
                {latestContext ? (
                  <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                    {latestContext}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Ask a question — the context bundle (portfolio summary, top movers, recent signals, system state) will be shown here once the AI responds.
                  </p>
                )}
                <p className="mt-2 text-[10px] text-muted-foreground">
                  This is the exact context string the server appended to the system prompt. The AI sees only this — it has no other access to your data.
                </p>
              </div>
            )}
          </Card>

          {/* Disclaimer */}
          <Card className="border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-amber-400">
                  AI-generated responses
                </div>
                <p className="text-muted-foreground">
                  Answers are generated by an LLM using the live context bundle. They may be incomplete or wrong. Always verify against the underlying Aurevia data before acting on a recommendation.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Loading skeleton when initial render is hydrating */}
      {!ask.isPending && messages.length === 0 && false && (
        <Skeleton className="h-4 w-full" />
      )}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-cyan-500/10" : "bg-emerald-500/10"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-cyan-400" />
        ) : (
          <Bot className="h-4 w-4 text-emerald-400" />
        )}
      </div>
      <div
        className={`max-w-[80%] rounded-md border px-3 py-2 text-sm ${
          isUser
            ? "border-cyan-500/30 bg-cyan-500/5 text-foreground"
            : "border-border/60 bg-muted/40 text-foreground"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none">
            {/* Issue #158 / FINAL-003 — sanitize the rendered LLM output via
                rehype-sanitize. The default schema strips `javascript:`,
                `data:`, `vbscript:` URL schemes from anchor `href` attributes
                and disallows raw `<script>` / inline event handlers. The LLM
                response is untrusted input — never render it raw. We also
                override the `a` element via the `components` prop to inject
                `target="_blank" rel="noopener noreferrer"` so any external
                links the LLM emits open in a new tab without leaking
                referrer / window.opener (same hardening as the blog views). */}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[rehypeSanitize, defaultSchema]]}
              components={{
                p: ({ children }) => <p className="leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
                code: ({ children }) => (
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
                ),
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                a: ({ node, ...props }) => (
                  <a
                    {...props}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
