"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Aurevia QueryState — the single wrapper every view uses for data fetching.
//
// Fixes three audit issues at once:
//   #7  — isError handling (failed fetches showed "Loading…" forever)
//   #13 — skeletons instead of "Loading…" text
//   #15 — loading state no longer masks error state
//
// Usage:
//   const q = useMarkets();
//   <QueryState query={q} empty={q.data?.length === 0} skeleton={<MarketsSkeleton/>}>
//     {(data) => <Table data={data} />}
//   </QueryState>
// ---------------------------------------------------------------------------

interface QueryStateProps<T> {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  skeleton?: React.ReactNode;
  skeletonCount?: number;
  skeletonClassName?: string;
  children: (data: T) => React.ReactNode;
  data?: T;
}

export function QueryState<T>({
  isLoading,
  isError,
  error,
  isEmpty,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Data will appear here once available.",
  onRetry,
  skeleton,
  skeletonClassName,
  children,
  data,
}: QueryStateProps<T>) {
  // 1. Error state takes priority over loading (fixes #15)
  if (isError) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
          <AlertCircle className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Failed to load</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{message}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  // 2. Loading state — skeleton or default shimmer
  if (isLoading) {
    if (skeleton) return <>{skeleton}</>;
    return (
      <div className={cn("space-y-3 py-4", skeletonClassName)}>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  // 3. Empty state
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Inbox className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{emptyDescription}</p>
        </div>
      </div>
    );
  }

  // 4. Success — render children with data
  if (data === undefined) return null;
  return <>{children(data)}</>;
}

// Reusable skeleton layouts for common view patterns
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-4 border-b border-border/60 pb-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border/60 p-4">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
