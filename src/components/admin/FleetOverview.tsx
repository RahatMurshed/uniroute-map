import { useState, useCallback } from "react";
import StatsRow from "./StatsRow";
import AdminFleetMap from "./AdminFleetMap";
import FleetStatusTable from "./FleetStatusTable";
import TodaysExceptions from "./TodaysExceptions";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus, Map, Bus } from "lucide-react";
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
    document.getElementById("admin-fleet-map")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="space-y-6 max-w-6xl">
      <StatsRow stats={stats} />

      <div id="admin-fleet-map">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <Map className="h-3.5 w-3.5" /> Live Fleet Map
        </h3>
        <div className="rounded-xl overflow-hidden border border-border shadow-sm">
          <AdminFleetMap
            buses={buses}
            centerOnBusId={centerBusId}
            onCenterDone={() => setCenterBusId(null)}
          />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <Bus className="h-3.5 w-3.5" /> Fleet Status
        </h3>
        {buses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-border bg-card text-center shadow-sm">
            <Bus className="h-10 w-10 text-muted-foreground/40 mb-2" />
            <p className="text-base font-semibold text-foreground">No buses configured yet</p>
            <p className="text-sm text-muted-foreground mt-1">Go to Route Manager to add routes and buses.</p>
          </div>
        ) : (
          <FleetStatusTable buses={buses} onViewOnMap={handleViewOnMap} />
        )}
      </div>

      <TodaysExceptions exceptions={exceptions} />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 rounded-lg">
          <Plus className="h-4 w-4" /> Add Override
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-lg">
          <Plus className="h-4 w-4" /> Add Route
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh All
        </Button>
      </div>
    </div>
  );
}
