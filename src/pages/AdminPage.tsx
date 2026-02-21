import { useState } from "react";
import AdminLayout, { type AdminView } from "@/components/admin/AdminLayout";
import FleetOverview from "@/components/admin/FleetOverview";
import RouteManager from "@/components/admin/RouteManager";
import OverridesManager from "@/components/admin/OverridesManager";
import DriversManager from "@/components/admin/DriversManager";
import ReportsView from "@/components/admin/ReportsView";
import PdfExportView from "@/components/admin/PdfExportView";
import { useAdminData } from "@/hooks/useAdminData";

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
        return <PdfExportView />;
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
