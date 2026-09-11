"use client";

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
import { SystemView } from "@/components/aurevia/views/system-view";
import { SettingsView } from "@/components/aurevia/views/settings-view";

export default function Home() {
  return (
    <QueryProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto">
            <ViewRouter />
          </main>
        </div>
      </div>
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
    case "system": return <SystemView />;
    case "settings": return <SettingsView />;
    default: return <DashboardView />;
  }
}
