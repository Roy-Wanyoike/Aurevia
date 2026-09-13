"use client";

import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Aurevia global error boundary (issue #77).
//
// Catches unhandled runtime errors that bubble past the per-view QueryState
// error UI — e.g. a thrown render fn, a missing context provider, a faulty
// hook. Renders a minimal, accessible card with the error message and a
// "Try again" button that re-mounts the route segment via `reset()`.
//
// Per Next.js 16 App Router convention this MUST be a Client Component
// ("use client") and accept `error` + `reset` props.
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorBoundaryProps) {
  // Log to console for dev visibility — production wires Sentry via the
  // `SENTRY_DSN` env var (see .env.example). Keeping this defensive: any
  // error thrown here would otherwise loop the boundary.
  useEffect(() => {
    console.error("[aurevia] error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7 text-red-400"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold tracking-tight">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred while rendering this page."}
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground/70">Error ID: {error.digest}</p>
      ) : null}
      <button
        onClick={reset}
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Try again
      </button>
    </div>
  );
}
