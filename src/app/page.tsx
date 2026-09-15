"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { Sidebar, Topbar } from "@/components/aurevia/sidebar";
import { QueryProvider } from "@/components/aurevia/query-provider";
import { useUI } from "@/lib/aurevia/ui-store";
import { CommandPalette } from "@/components/aurevia/command-palette";

// Dashboard is the landing page — load eagerly for instant first paint.
import { DashboardView } from "@/components/aurevia/views/dashboard-view";

// All other views are lazy-loaded to reduce the initial bundle.
// Each pays its cost only when the user navigates to it.
// ~400KB+ saved on initial JS payload.
const MarketsView = dynamic(() => import("@/components/aurevia/views/markets-view").then((m) => ({ default: m.MarketsView })), { ssr: false });
const AssetDetailView = dynamic(() => import("@/components/aurevia/views/asset-detail-view").then((m) => ({ default: m.AssetDetailView })), { ssr: false });
const StrategiesView = dynamic(() => import("@/components/aurevia/views/strategies-view").then((m) => ({ default: m.StrategiesView })), { ssr: false });
const BacktestsView = dynamic(() => import("@/components/aurevia/views/backtests-view").then((m) => ({ default: m.BacktestsView })), { ssr: false });
const SignalsView = dynamic(() => import("@/components/aurevia/views/signals-view").then((m) => ({ default: m.SignalsView })), { ssr: false });
const TrendsView = dynamic(() => import("@/components/aurevia/views/trends-view").then((m) => ({ default: m.TrendsView })), { ssr: false });
const RegimesView = dynamic(() => import("@/components/aurevia/views/regimes-view").then((m) => ({ default: m.RegimesView })), { ssr: false });
const RiskView = dynamic(() => import("@/components/aurevia/views/risk-view").then((m) => ({ default: m.RiskView })), { ssr: false });
const PortfolioView = dynamic(() => import("@/components/aurevia/views/portfolio-view").then((m) => ({ default: m.PortfolioView })), { ssr: false });
const OrdersView = dynamic(() => import("@/components/aurevia/views/orders-view").then((m) => ({ default: m.OrdersView })), { ssr: false });
const MLView = dynamic(() => import("@/components/aurevia/views/ml-view").then((m) => ({ default: m.MLView })), { ssr: false });
const BrokersView = dynamic(() => import("@/components/aurevia/views/brokers-view").then((m) => ({ default: m.BrokersView })), { ssr: false });
const MarketPulseView = dynamic(() => import("@/components/aurevia/views/market-pulse-view").then((m) => ({ default: m.MarketPulseView })), { ssr: false });
const CorrelationView = dynamic(() => import("@/components/aurevia/views/correlation-view").then((m) => ({ default: m.CorrelationView })), { ssr: false });
const HistoricalMemoryView = dynamic(() => import("@/components/aurevia/views/historical-memory-view").then((m) => ({ default: m.HistoricalMemoryView })), { ssr: false });
const AlertsView = dynamic(() => import("@/components/aurevia/views/alerts-view").then((m) => ({ default: m.AlertsView })), { ssr: false });
const RadarView = dynamic(() => import("@/components/aurevia/views/radar-view").then((m) => ({ default: m.RadarView })), { ssr: false });
const NewsView = dynamic(() => import("@/components/aurevia/views/news-view").then((m) => ({ default: m.NewsView })), { ssr: false });
const EventsView = dynamic(() => import("@/components/aurevia/views/events-view").then((m) => ({ default: m.EventsView })), { ssr: false });
const MacroView = dynamic(() => import("@/components/aurevia/views/macro-view").then((m) => ({ default: m.MacroView })), { ssr: false });
const OnchainView = dynamic(() => import("@/components/aurevia/views/onchain-view").then((m) => ({ default: m.OnchainView })), { ssr: false });
const WatchlistsView = dynamic(() => import("@/components/aurevia/views/watchlists-view").then((m) => ({ default: m.WatchlistsView })), { ssr: false });
const ScreenerView = dynamic(() => import("@/components/aurevia/views/screener-view").then((m) => ({ default: m.ScreenerView })), { ssr: false });
const WhatIfView = dynamic(() => import("@/components/aurevia/views/what-if-view").then((m) => ({ default: m.WhatIfView })), { ssr: false });
const PortfolioAnalyticsView = dynamic(() => import("@/components/aurevia/views/portfolio-analytics-view").then((m) => ({ default: m.PortfolioAnalyticsView })), { ssr: false });
const RiskCockpitView = dynamic(() => import("@/components/aurevia/views/risk-cockpit-view").then((m) => ({ default: m.RiskCockpitView })), { ssr: false });
const JournalView = dynamic(() => import("@/components/aurevia/views/journal-view").then((m) => ({ default: m.JournalView })), { ssr: false });
const CopilotView = dynamic(() => import("@/components/aurevia/views/copilot-view").then((m) => ({ default: m.CopilotView })), { ssr: false });
const ReplayView = dynamic(() => import("@/components/aurevia/views/replay-view").then((m) => ({ default: m.ReplayView })), { ssr: false });
const StrategyBuilderView = dynamic(() => import("@/components/aurevia/views/strategy-builder-view").then((m) => ({ default: m.StrategyBuilderView })), { ssr: false });
const SystemView = dynamic(() => import("@/components/aurevia/views/system-view").then((m) => ({ default: m.SystemView })), { ssr: false });
const AdminView = dynamic(() => import("@/components/aurevia/views/admin-view").then((m) => ({ default: m.AdminView })), { ssr: false });
const SettingsView = dynamic(() => import("@/components/aurevia/views/settings-view").then((m) => ({ default: m.SettingsView })), { ssr: false });
const ProfileView = dynamic(() => import("@/components/aurevia/views/profile-view").then((m) => ({ default: m.ProfileView })), { ssr: false });
const BlogView = dynamic(() => import("@/components/aurevia/views/blog-view").then((m) => ({ default: m.BlogView })), { ssr: false });
const BlogArticleView = dynamic(() => import("@/components/aurevia/views/blog-article-view").then((m) => ({ default: m.BlogArticleView })), { ssr: false });
const BlogEditorView = dynamic(() => import("@/components/aurevia/views/blog-editor-view").then((m) => ({ default: m.BlogEditorView })), { ssr: false });
const BlogDashboardView = dynamic(() => import("@/components/aurevia/views/blog-dashboard-view").then((m) => ({ default: m.BlogDashboardView })), { ssr: false });

export default function Home() {
  const { view, selectedSymbol, selectedBacktestId, selectedArticleSlug, syncFromUrl } = useUI();

  useEffect(() => {
    syncFromUrl();
    const onPop = () => syncFromUrl();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncFromUrl]);

  // Issue #121 — first-run onboarding gate.
  // On mount (and whenever the active view changes to "dashboard"), check
  // localStorage for the `aurevia:onboarded` flag. If it's missing, hard-
  // navigate to /onboarding so the wizard can collect trading mode,
  // watchlist, and risk profile before the dashboard renders.
  //
  // `view === "dashboard"` guard keeps the redirect from firing when the
  // user has explicitly navigated to a different view (e.g. via a deep link
  // like /?view=markets) — those should render as-is.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onboarded = window.localStorage.getItem("aurevia:onboarded");
    if (!onboarded && view === "dashboard") {
      window.location.href = "/onboarding";
    }
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("view", view);
    if (view === "asset" && selectedSymbol) params.set("symbol", selectedSymbol);
    if (view === "backtests" && selectedBacktestId) params.set("id", selectedBacktestId);
    if ((view === "blog-article" || view === "blog-editor") && selectedArticleSlug) params.set("article", selectedArticleSlug);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl === newUrl) {
      window.history.replaceState({}, "", newUrl);
    } else {
      window.history.pushState({}, "", newUrl);
    }
  }, [view, selectedSymbol, selectedBacktestId, selectedArticleSlug]);

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
  switch (view) {
    case "dashboard": return <DashboardView />;
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
    case "macro": return <MacroView />;
    case "onchain": return <OnchainView />;
    case "watchlists": return <WatchlistsView />;
    case "screener": return <ScreenerView />;
    case "what-if": return <WhatIfView />;
    case "portfolio-analytics": return <PortfolioAnalyticsView />;
    case "risk-cockpit": return <RiskCockpitView />;
    case "journal": return <JournalView />;
    case "copilot": return <CopilotView />;
    case "replay": return <ReplayView />;
    case "strategy-builder": return <StrategyBuilderView />;
    case "system": return <SystemView />;
    case "admin": return <AdminView />;
    case "settings": return <SettingsView />;
    case "profile": return <ProfileView />;
    case "blog": return <BlogView />;
    case "blog-article": return <BlogArticleView />;
    case "blog-editor": return <BlogEditorView />;
    case "blog-dashboard": return <BlogDashboardView />;
    default: return <DashboardView />;
  }
}
