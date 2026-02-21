import { useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TripReport } from "@/hooks/useReportsData";

interface Props {
  trips: TripReport[];
  computeGpsPct: (pings: number, start: string | null, end: string | null) => number;
  onViewDetail: (tripId: string) => void;
}

const statusBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  completed: { label: "🟢 Completed", variant: "secondary" },
  delayed: { label: "🟡 Delayed", variant: "outline" },
  cancelled: { label: "❌ Cancelled", variant: "destructive" },
  active: { label: "🔵 Active", variant: "default" },
};

type SortKey = "date" | "bus" | "driver" | "route" | "status" | "gps";
type SortDir = "asc" | "desc";

export default function TripsTable({ trips, computeGpsPct, onViewDetail }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = [...trips].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "date": cmp = (a.started_at || "").localeCompare(b.started_at || ""); break;
      case "bus": cmp = (a.bus_name || "").localeCompare(b.bus_name || ""); break;
      case "driver": cmp = (a.driver_name || "").localeCompare(b.driver_name || ""); break;
      case "route": cmp = (a.route_name || "").localeCompare(b.route_name || ""); break;
      case "status": cmp = a.status.localeCompare(b.status); break;
      case "gps": cmp = a.gps_pings - b.gps_pings; break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const SortHeader = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(k)}>
      {children} {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </TableHead>
  );

  if (trips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 rounded-xl border border-border bg-muted/30 text-center">
        <p className="text-lg text-muted-foreground">📊 No trips found for the selected period</p>
        <p className="text-sm text-muted-foreground mt-1">Try selecting a wider date range.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader k="date">Date</SortHeader>
            <SortHeader k="bus">Bus</SortHeader>
            <SortHeader k="driver">Driver</SortHeader>
            <SortHeader k="route">Route</SortHeader>
            <TableHead className="whitespace-nowrap">Departure</TableHead>
            <TableHead className="whitespace-nowrap">End Time</TableHead>
            <TableHead className="whitespace-nowrap">Duration</TableHead>
            <SortHeader k="status">Status</SortHeader>
            <SortHeader k="gps">GPS Pings</SortHeader>
            <TableHead className="whitespace-nowrap">GPS %</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((t) => {
            const dur = t.started_at && t.ended_at
              ? `${differenceInMinutes(new Date(t.ended_at), new Date(t.started_at))} min`
              : t.started_at && !t.ended_at
                ? `${differenceInMinutes(new Date(), new Date(t.started_at))} min`
                : "—";
            const gpsPct = computeGpsPct(t.gps_pings, t.started_at, t.ended_at);
            const badge = statusBadge[t.status] || statusBadge.active;

            return (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap">{t.started_at ? format(new Date(t.started_at), "dd MMM") : "—"}</TableCell>
                <TableCell>{t.bus_name || "—"}</TableCell>
                <TableCell>{t.driver_name || "—"}</TableCell>
                <TableCell>{t.route_name || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{t.started_at ? format(new Date(t.started_at), "hh:mm a") : "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{t.ended_at ? format(new Date(t.ended_at), "hh:mm a") : "Active"}</TableCell>
                <TableCell>{dur}</TableCell>
                <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                <TableCell>{t.gps_pings}</TableCell>
                <TableCell>{gpsPct}%</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => onViewDetail(t.id)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
