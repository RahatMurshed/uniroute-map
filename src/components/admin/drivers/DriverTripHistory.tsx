import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface TripRow {
  id: string;
  date: string;
  routeName: string;
  duration: string;
  status: string;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed")
    return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (status === "cancelled")
    return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === "delayed")
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <CheckCircle className="h-4 w-4 text-muted-foreground" />;
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

      const rows: TripRow[] = tripData.map((t) => {
        const started = t.started_at ? new Date(t.started_at) : null;
        const ended = t.ended_at ? new Date(t.ended_at) : null;

        let duration = "--";
        if (started && ended) {
          const mins = Math.round((ended.getTime() - started.getTime()) / 60000);
          duration = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}min`;
        }

        return {
          id: t.id,
          date: started
            ? started.toLocaleDateString([], { day: "numeric", month: "short" })
            : "--",
          routeName: (t.routes as any)?.name ?? "—",
          duration,
          status: t.status,
        };
      });

      setTrips(rows);
      setLoading(false);
    };
    load();
  }, [driverId]);

  if (loading) return <Skeleton className="h-20 rounded-xl" />;

  if (trips.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No trips yet
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-muted/50 text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
        <span>Date</span>
        <span>Route</span>
        <span>Time</span>
        <span className="text-right">Status</span>
      </div>
      {/* Rows */}
      {trips.map((t, i) => (
        <div
          key={t.id}
          className={`grid grid-cols-4 gap-2 px-4 py-2.5 text-sm items-center ${
            i < trips.length - 1 ? "border-b border-border" : ""
          }`}
        >
          <span className="text-foreground font-medium">{t.date}</span>
          <span className="text-foreground truncate">{t.routeName}</span>
          <span className="text-muted-foreground">{t.duration}</span>
          <span className="flex justify-end">
            <StatusIcon status={t.status} />
          </span>
        </div>
      ))}
    </div>
  );
}
