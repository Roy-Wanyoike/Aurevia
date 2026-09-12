"use client";

import { useEffect } from "react";
import { Sidebar, Topbar } from "@/components/aurevia/sidebar";
import { QueryProvider } from "@/components/aurevia/query-provider";
import { useUI } from "@/lib/aurevia/ui-store";
import { DashboardView } from "@/components/aurevia/views/dashboard-view";
import { MarketsView } from "@/components/aurevia/views/markets-view";
import { AssetDetailView } from "@/components/aurevia/views/asset-detail-view";
import { StrategiesView } from "@/components/aurevia/views/strategies-view";
import { BacktestsView } from "@/components/aurevia/views/backtests-view";
import { SignalsView } from "@/components/aurevia/views/signals-view";
import { TrendsView } from "@/components/aurevia/views/trends-view";
import { RegimesView } from "@/components/aurevia/views/regimes-view";
import { RiskView } from "@/components/aurevia/views/risk-view";
import { PortfolioView } from "@/components/aurevia/views/portfolio-view";
import { OrdersView } from "@/components/aurevia/views/orders-view";
import { MLView } from "@/components/aurevia/views/ml-view";
import { BrokersView } from "@/components/aurevia/views/brokers-view";
import { MarketPulseView } from "@/components/aurevia/views/market-pulse-view";
import { CorrelationView } from "@/components/aurevia/views/correlation-view";
import { HistoricalMemoryView } from "@/components/aurevia/views/historical-memory-view";
import { AlertsView } from "@/components/aurevia/views/alerts-view";
import { RadarView } from "@/components/aurevia/views/radar-view";
import { NewsView } from "@/components/aurevia/views/news-view";
import { EventsView } from "@/components/aurevia/views/events-view";
import { WatchlistsView } from "@/components/aurevia/views/watchlists-view";
import { ScreenerView } from "@/components/aurevia/views/screener-view";
import { SystemView } from "@/components/aurevia/views/system-view";
import { SettingsView } from "@/components/aurevia/views/settings-view";
import { CommandPalette } from "@/components/aurevia/command-palette";

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
    case "watchlists": return <WatchlistsView />;
    case "screener": return <ScreenerView />;
    case "system": return <SystemView />;
    case "settings": return <SettingsView />;
    default: return <DashboardView />;
  }
}
