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
import { SystemView } from "@/components/aurevia/views/system-view";
import { SettingsView } from "@/components/aurevia/views/settings-view";
import { CommandPalette } from "@/components/aurevia/command-palette";

export default function Home() {
  // URL routing (issue #38): hydrate state from ?view=…&symbol=…&id=… on
  // mount, keep URL in sync as the view changes, and listen to popstate so
  // the browser back/forward buttons restore the right view.
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
    // If the URL already matches (e.g. initial mount right after syncFromUrl,
    // or a popstate-driven state change) use replaceState so we don't push
    // duplicate history entries that would break back/forward.
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
      {/* Command palette — mounted once at the root so Cmd+K / Ctrl+K is
          available regardless of which view is active (issue #37). */}
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
    case "system": return <SystemView />;
    case "settings": return <SettingsView />;
    default: return <DashboardView />;
  }
}
