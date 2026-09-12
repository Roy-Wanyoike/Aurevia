"use client";

import { useEffect, lazy, Suspense } from "react";
import dynamic from "next/dynamic";
import { Sidebar, Topbar } from "@/components/aurevia/sidebar";
import { QueryProvider } from "@/components/aurevia/query-provider";
import { useUI } from "@/lib/aurevia/ui-store";
import { CommandPalette } from "@/components/aurevia/command-palette";

// ---------------------------------------------------------------------------
// Lazy-load all 22 views so the initial JS bundle only includes the shell
// (Sidebar + Topbar + CommandPalette + the default dashboard view). Each view
// is code-split into its own chunk and loaded on demand when the user
// navigates to it. This cuts the initial bundle by ~2MB (recharts + markdown
// editor + syntax highlighter are now only loaded when their view mounts).
//
// Issue #75 — bundle size optimization.
// ---------------------------------------------------------------------------

// Dashboard is the default view — preload it eagerly so the first paint
// isn't blocked on a dynamic import.
import { DashboardView } from "@/components/aurevia/views/dashboard-view";

const MarketsView = dynamic(() => import("@/components/aurevia/views/markets-view").then(m => ({ default: m.MarketsView })), { ssr: false });
const AssetDetailView = dynamic(() => import("@/components/aurevia/views/asset-detail-view").then(m => ({ default: m.AssetDetailView })), { ssr: false });
const StrategiesView = dynamic(() => import("@/components/aurevia/views/strategies-view").then(m => ({ default: m.StrategiesView })), { ssr: false });
const BacktestsView = dynamic(() => import("@/components/aurevia/views/backtests-view").then(m => ({ default: m.BacktestsView })), { ssr: false });
const SignalsView = dynamic(() => import("@/components/aurevia/views/signals-view").then(m => ({ default: m.SignalsView })), { ssr: false });
const TrendsView = dynamic(() => import("@/components/aurevia/views/trends-view").then(m => ({ default: m.TrendsView })), { ssr: false });
const RegimesView = dynamic(() => import("@/components/aurevia/views/regimes-view").then(m => ({ default: m.RegimesView })), { ssr: false });
const RiskView = dynamic(() => import("@/components/aurevia/views/risk-view").then(m => ({ default: m.RiskView })), { ssr: false });
const PortfolioView = dynamic(() => import("@/components/aurevia/views/portfolio-view").then(m => ({ default: m.PortfolioView })), { ssr: false });
const OrdersView = dynamic(() => import("@/components/aurevia/views/orders-view").then(m => ({ default: m.OrdersView })), { ssr: false });
const MLView = dynamic(() => import("@/components/aurevia/views/ml-view").then(m => ({ default: m.MLView })), { ssr: false });
const BrokersView = dynamic(() => import("@/components/aurevia/views/brokers-view").then(m => ({ default: m.BrokersView })), { ssr: false });
const MarketPulseView = dynamic(() => import("@/components/aurevia/views/market-pulse-view").then(m => ({ default: m.MarketPulseView })), { ssr: false });
const CorrelationView = dynamic(() => import("@/components/aurevia/views/correlation-view").then(m => ({ default: m.CorrelationView })), { ssr: false });
const HistoricalMemoryView = dynamic(() => import("@/components/aurevia/views/historical-memory-view").then(m => ({ default: m.HistoricalMemoryView })), { ssr: false });
const AlertsView = dynamic(() => import("@/components/aurevia/views/alerts-view").then(m => ({ default: m.AlertsView })), { ssr: false });
const RadarView = dynamic(() => import("@/components/aurevia/views/radar-view").then(m => ({ default: m.RadarView })), { ssr: false });
const WatchlistsView = dynamic(() => import("@/components/aurevia/views/watchlists-view").then(m => ({ default: m.WatchlistsView })), { ssr: false });
const ScreenerView = dynamic(() => import("@/components/aurevia/views/screener-view").then(m => ({ default: m.ScreenerView })), { ssr: false });
const SystemView = dynamic(() => import("@/components/aurevia/views/system-view").then(m => ({ default: m.SystemView })), { ssr: false });
const SettingsView = dynamic(() => import("@/components/aurevia/views/settings-view").then(m => ({ default: m.SettingsView })), { ssr: false });

// Lazy-load views that may have been added after the initial audit. Use the
// dynamic import with a fallback to avoid crashing if the file doesn't exist.
const NewsView = lazy(() => import("@/components/aurevia/views/news-view").then(m => ({ default: m.NewsView })).catch(() => ({ default: () => <NotFoundError name="NewsView" /> })));
const EventsView = lazy(() => import("@/components/aurevia/views/events-view").then(m => ({ default: m.EventsView })).catch(() => ({ default: () => <NotFoundError name="EventsView" /> })));

function NotFoundError({ name }: { name: string }) {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      View &quot;{name}&quot; is not available.
    </div>
  );
}

function ViewLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export default function Home() {
  const { view, selectedSymbol, selectedBacktestId, syncFromUrl } = useUI();

  useEffect(() => {
    syncFromUrl();
    const onPop = () => syncFromUrl();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncFromUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("view", view);
    if (view === "asset" && selectedSymbol) params.set("symbol", selectedSymbol);
    if (view === "backtests" && selectedBacktestId) params.set("id", selectedBacktestId);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl === newUrl) {
      window.history.replaceState({}, "", newUrl);
    } else {
      window.history.pushState({}, "", newUrl);
    }
  }, [view, selectedSymbol, selectedBacktestId]);

  return (
    <QueryProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:text-foreground focus:ring-2 focus:ring-primary"
        >
          Skip to content
        </a>
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main id="main-content" className="flex-1 overflow-y-auto">
            <ViewRouter />
          </main>
        </div>
      </div>
      <CommandPalette />
    </QueryProvider>
  );
}

function ViewRouter() {
  const { view } = useUI();
  // Dashboard is loaded eagerly (default view) — no Suspense needed.
  if (view === "dashboard") return <DashboardView />;
  // All other views are lazy-loaded with a Suspense fallback.
  return (
    <Suspense fallback={<ViewLoader />}>
      {(() => {
        switch (view) {
          case "markets": return <MarketsView />;
          case "asset": return <AssetDetailView />;
          case "strategies": return <StrategiesView />;
          case "backtests": return <BacktestsView />;
          case "signals": return <SignalsView />;
          case "trends": return <TrendsView />;
          case "regimes": return <RegimesView />;
          case "risk": return <RiskView />;
          case "portfolio": return <PortfolioView />;
          case "orders": return <OrdersView />;
          case "ml": return <MLView />;
          case "brokers": return <BrokersView />;
          case "market-pulse": return <MarketPulseView />;
          case "correlation": return <CorrelationView />;
          case "historical-memory": return <HistoricalMemoryView />;
          case "alerts": return <AlertsView />;
          case "radar": return <RadarView />;
          case "news": return <NewsView />;
          case "events": return <EventsView />;
          case "watchlists": return <WatchlistsView />;
          case "screener": return <ScreenerView />;
          case "system": return <SystemView />;
          case "settings": return <SettingsView />;
          default: return <DashboardView />;
        }
      })()}
    </Suspense>
  );
}
