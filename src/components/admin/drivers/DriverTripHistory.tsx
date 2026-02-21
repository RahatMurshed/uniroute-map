import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TripRow {
  id: string;
  date: string;
  routeName: string;
  startTime: string;
  endTime: string;
  status: string;
  gpsPercent: number;
}

export default function DriverTripHistory({ driverId }: { driverId: string }) {
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: tripData } = await supabase
        .from("trips")
        .select("id, started_at, ended_at, status, routes(name)")
        .eq("driver_id", driverId)
        .order("started_at", { ascending: false })
        .limit(5);

      if (!tripData || tripData.length === 0) {
        setTrips([]);
        setLoading(false);
        return;
      }

      // Check GPS pings per trip
      const tripIds = tripData.map((t) => t.id);
      const { data: locData } = await supabase
        .from("live_locations")
        .select("trip_id")
        .in("trip_id", tripIds);

      const gpsMap = new Map<string, boolean>();
      (locData ?? []).forEach((l) => gpsMap.set(l.trip_id, true));

      const rows: TripRow[] = tripData.map((t) => {
        const started = t.started_at ? new Date(t.started_at) : null;
        const ended = t.ended_at ? new Date(t.ended_at) : null;
        const fmt = (d: Date | null) => d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
        const statusEmoji = t.status === "completed" ? "✅" : t.status === "active" ? "🟢" : t.status === "delayed" ? "⚠️" : "❌";

        return {
          id: t.id,
          date: started ? started.toLocaleDateString([], { day: "numeric", month: "short" }) : "--",
          routeName: (t.routes as any)?.name ?? "—",
          startTime: fmt(started),
          endTime: fmt(ended),
          status: statusEmoji,
          gpsPercent: gpsMap.has(t.id) ? 100 : 0,
        };
      });

      setTrips(rows);
      setLoading(false);
    };
    load();
  }, [driverId]);

  if (loading) return <Skeleton className="h-20 rounded" />;

  if (trips.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-2">No trips yet</p>;
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs py-1 px-2">Date</TableHead>
            <TableHead className="text-xs py-1 px-2">Route</TableHead>
            <TableHead className="text-xs py-1 px-2">Start</TableHead>
            <TableHead className="text-xs py-1 px-2">End</TableHead>
            <TableHead className="text-xs py-1 px-2">Status</TableHead>
            <TableHead className="text-xs py-1 px-2">GPS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trips.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="text-xs py-1 px-2">{t.date}</TableCell>
              <TableCell className="text-xs py-1 px-2">{t.routeName}</TableCell>
              <TableCell className="text-xs py-1 px-2">{t.startTime}</TableCell>
              <TableCell className="text-xs py-1 px-2">{t.endTime}</TableCell>
              <TableCell className="text-xs py-1 px-2">{t.status}</TableCell>
              <TableCell className="text-xs py-1 px-2">{t.gpsPercent}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
