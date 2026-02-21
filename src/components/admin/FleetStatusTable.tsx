import type { AdminBus } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

function getStatusBadge(bus: AdminBus) {
  if (!bus.tripStatus) {
    return <Badge variant="outline" className="gap-1"><span>⚫</span>Inactive</Badge>;
  }
  if (bus.tripStatus === "delayed") {
    return <Badge className="gap-1 bg-yellow-500/15 text-yellow-700 border-yellow-500/30"><span>🟡</span>Delayed</Badge>;
  }
  if (bus.lastPing) {
    const ageSec = (Date.now() - new Date(bus.lastPing).getTime()) / 1000;
    if (ageSec > 120) {
      return <Badge variant="destructive" className="gap-1"><span>🔴</span>Offline</Badge>;
    }
  }
  return <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 border-emerald-500/30"><span>🟢</span>Active</Badge>;
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
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bus Name</TableHead>
            <TableHead className="hidden sm:table-cell">Driver</TableHead>
            <TableHead className="hidden sm:table-cell">Route</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Ping</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buses.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No buses configured</TableCell>
            </TableRow>
          ) : (
            buses.map((bus) => (
              <TableRow key={bus.id}>
                <TableCell>
                  <div className="font-medium text-foreground">{bus.name}</div>
                  {bus.licensePlate && <div className="text-xs text-muted-foreground">{bus.licensePlate}</div>}
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
