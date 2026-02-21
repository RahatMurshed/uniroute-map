import { useState, useCallback } from "react";
import StatsRow from "./StatsRow";
import AdminFleetMap from "./AdminFleetMap";
import FleetStatusTable from "./FleetStatusTable";
import TodaysExceptions from "./TodaysExceptions";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus } from "lucide-react";
import type { AdminBus, AdminException, AdminStats } from "@/hooks/useAdminData";

interface FleetOverviewProps {
  buses: AdminBus[];
  exceptions: AdminException[];
  stats: AdminStats;
  loading: boolean;
  onRefresh: () => void;
}

export default function FleetOverview({ buses, exceptions, stats, loading, onRefresh }: FleetOverviewProps) {
  const [centerBusId, setCenterBusId] = useState<string | null>(null);

  const handleViewOnMap = useCallback((busId: string) => {
    setCenterBusId(busId);
    // Scroll to map
    document.getElementById("admin-fleet-map")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Stats */}
      <StatsRow stats={stats} />

      {/* Fleet Map */}
      <div id="admin-fleet-map">
        <h3 className="text-sm font-semibold text-foreground mb-2">🗺️ Live Fleet Map</h3>
        <AdminFleetMap
          buses={buses}
          centerOnBusId={centerBusId}
          onCenterDone={() => setCenterBusId(null)}
        />
      </div>

      {/* Fleet Table */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">🚌 Fleet Status</h3>
        {buses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-border bg-muted/30 text-center">
            <p className="text-lg text-muted-foreground">🚌 No buses configured yet</p>
            <p className="text-sm text-muted-foreground mt-1">Go to Route Manager to add routes and buses.</p>
          </div>
        ) : (
          <FleetStatusTable buses={buses} onViewOnMap={handleViewOnMap} />
        )}
      </div>

      {/* Today's Exceptions */}
      <TodaysExceptions exceptions={exceptions} />

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Add Override
        </Button>
        <Button variant="outline" size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Add Route
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh All
        </Button>
      </div>
    </div>
  );
}
