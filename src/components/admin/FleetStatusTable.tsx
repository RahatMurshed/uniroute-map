import { Circle } from "lucide-react";
import type { AdminBus } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function getStatusBadge(bus: AdminBus) {
  if (!bus.tripStatus) {
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground"><Circle className="h-2 w-2 fill-muted-foreground" /> Inactive</span>;
  }
  if (bus.tripStatus === "delayed") {
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-warning/10 text-warning border border-warning/20"><Circle className="h-2 w-2 fill-warning" /> Delayed</span>;
  }
  if (bus.lastPing) {
    const ageSec = (Date.now() - new Date(bus.lastPing).getTime()) / 1000;
    if (ageSec > 120) {
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20"><Circle className="h-2 w-2 fill-destructive" /> Offline</span>;
    }
  }
  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20"><Circle className="h-2 w-2 fill-success" /> Active</span>;
}

function timeAgo(ts: string | null): string {
  if (!ts) return "No active trip";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 10) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

interface FleetStatusTableProps {
  buses: AdminBus[];
  onViewOnMap: (busId: string) => void;
}

export default function FleetStatusTable({ buses, onViewOnMap }: FleetStatusTableProps) {
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Bus Name</TableHead>
            <TableHead className="hidden sm:table-cell text-xs font-semibold uppercase tracking-wider">Driver</TableHead>
            <TableHead className="hidden sm:table-cell text-xs font-semibold uppercase tracking-wider">Route</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Last Ping</TableHead>
            <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buses.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No buses configured</TableCell>
            </TableRow>
          ) : (
            buses.map((bus, idx) => (
              <TableRow key={bus.id} className={`hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                <TableCell>
                  <div className="font-semibold text-foreground">{bus.name}</div>
                  {bus.licensePlate && <div className="text-xs text-muted-foreground font-mono">{bus.licensePlate}</div>}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-foreground">{bus.driverName ?? "—"}</TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-foreground">{bus.routeName ?? "—"}</TableCell>
                <TableCell>{getStatusBadge(bus)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{timeAgo(bus.lastPing)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={bus.lat == null}
                    onClick={() => onViewOnMap(bus.id)}
                    className="text-primary hover:text-primary/80 font-medium"
                  >
                    View on Map
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
