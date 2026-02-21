import { useState } from "react";
import AdminLayout, { type AdminView } from "@/components/admin/AdminLayout";
import FleetOverview from "@/components/admin/FleetOverview";
import RouteManager from "@/components/admin/RouteManager";
import OverridesManager from "@/components/admin/OverridesManager";
import DriversManager from "@/components/admin/DriversManager";
import ReportsView from "@/components/admin/ReportsView";
import { useAdminData } from "@/hooks/useAdminData";

const PlaceholderView = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center h-64 rounded-xl border border-border bg-muted/30">
    <p className="text-lg text-muted-foreground">🚧 {title} — Coming Soon</p>
  </div>
);

const AdminPage = () => {
  const [activeView, setActiveView] = useState<AdminView>("fleet");
  const { buses, exceptions, stats, loading, refreshAll } = useAdminData();

  const renderView = () => {
    switch (activeView) {
      case "fleet":
        return (
          <FleetOverview
            buses={buses}
            exceptions={exceptions}
            stats={stats}
            loading={loading}
            onRefresh={refreshAll}
          />
        );
      case "routes":
        return <RouteManager />;
      case "overrides":
        return <OverridesManager />;
      case "drivers":
        return <DriversManager />;
      case "reports":
        return <ReportsView />;
      case "export":
        return <PlaceholderView title="PDF Export" />;
      default:
        return null;
    }
  };

  return (
    <AdminLayout activeView={activeView} onViewChange={setActiveView}>
      {renderView()}
    </AdminLayout>
  );
};

export default AdminPage;
