import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInMinutes, format } from "date-fns";

export type DatePreset = "today" | "week" | "month" | "custom";

export interface TripReport {
  id: string;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  bus_name: string | null;
  driver_name: string | null;
  driver_id: string;
  route_name: string | null;
  route_id: string;
  gps_pings: number;
}

export interface TripDetailData {
  id: string;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  bus_name: string | null;
  driver_name: string | null;
  route_name: string | null;
  gps_pings: number;
  locations: { lat: number; lng: number; timestamp: string }[];
  exceptions: { type: string; notes: string | null; created_at: string }[];
}

export interface DriverSummary {
  driver_id: string;
  driver_name: string;
  total_trips: number;
  on_time_pct: number;
  avg_gps_pct: number;
  last_trip: string | null;
}

export interface RouteSummary {
  route_id: string;
  route_name: string;
  total_trips: number;
  on_time_pct: number;
  avg_duration_mins: number;
}

function getDateRange(preset: DatePreset, customFrom?: Date, customTo?: Date): [Date, Date] {
  const now = new Date();
  switch (preset) {
    case "today":
      return [startOfDay(now), endOfDay(now)];
    case "week":
      return [startOfWeek(now, { weekStartsOn: 0 }), endOfWeek(now, { weekStartsOn: 0 })];
    case "month":
      return [startOfMonth(now), endOfMonth(now)];
    case "custom":
      return [
        customFrom ? startOfDay(customFrom) : startOfDay(now),
        customTo ? endOfDay(customTo) : endOfDay(now),
      ];
  }
}

function computeGpsPct(pings: number, startedAt: string | null, endedAt: string | null): number {
  if (!startedAt) return 0;
  const end = endedAt ? new Date(endedAt) : new Date();
  const mins = differenceInMinutes(end, new Date(startedAt));
  if (mins <= 0) return 0;
  const expected = mins * 12;
  return Math.min(100, Math.round((pings / expected) * 100));
}

export function useReportsData() {
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [trips, setTrips] = useState<TripReport[]>([]);
  const [loading, setLoading] = useState(true);

  const [from, to] = useMemo(() => getDateRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch trips with joins
      const { data: tripsData, error } = await supabase
        .from("trips")
        .select(`
          id, started_at, ended_at, status, driver_id, route_id,
          buses!inner(name),
          profiles!inner(display_name),
          routes!inner(name)
        `)
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .order("started_at", { ascending: false });

      if (error) throw error;

      // Fetch GPS ping counts per trip
      const tripIds = (tripsData || []).map((t: any) => t.id);
      let pingMap: Record<string, number> = {};
      if (tripIds.length > 0) {
        // Batch count - fetch all locations for these trips
        const { data: locData } = await supabase
          .from("live_locations")
          .select("trip_id")
          .in("trip_id", tripIds);
        if (locData) {
          for (const loc of locData) {
            pingMap[loc.trip_id] = (pingMap[loc.trip_id] || 0) + 1;
          }
        }
      }

      const mapped: TripReport[] = (tripsData || []).map((t: any) => ({
        id: t.id,
        started_at: t.started_at,
        ended_at: t.ended_at,
        status: t.status,
        bus_name: t.buses?.name ?? null,
        driver_name: t.profiles?.display_name ?? null,
        driver_id: t.driver_id,
        route_name: t.routes?.name ?? null,
        route_id: t.route_id,
        gps_pings: pingMap[t.id] || 0,
      }));

      setTrips(mapped);
    } catch (err) {
      console.error("Failed to fetch reports:", err);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  // Summary stats
  const stats = useMemo(() => {
    const total = trips.length;
    const cancelled = trips.filter(t => t.status === "cancelled").length;
    const delayed = trips.filter(t => t.status === "delayed").length;
    const onTime = total - cancelled - delayed;
    return {
      total,
      onTime,
      delayed,
      cancelled,
      onTimePct: total > 0 ? ((onTime / total) * 100).toFixed(1) : "0.0",
      delayedPct: total > 0 ? ((delayed / total) * 100).toFixed(1) : "0.0",
      cancelledPct: total > 0 ? ((cancelled / total) * 100).toFixed(1) : "0.0",
    };
  }, [trips]);

  // Driver summaries
  const driverSummaries = useMemo((): DriverSummary[] => {
    const map = new Map<string, TripReport[]>();
    for (const t of trips) {
      const key = t.driver_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).map(([driverId, dTrips]) => {
      const total = dTrips.length;
      const onTime = dTrips.filter(t => t.status !== "cancelled" && t.status !== "delayed").length;
      const gpsPcts = dTrips.map(t => computeGpsPct(t.gps_pings, t.started_at, t.ended_at));
      const avgGps = gpsPcts.length > 0 ? Math.round(gpsPcts.reduce((a, b) => a + b, 0) / gpsPcts.length) : 0;
      const sorted = [...dTrips].sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""));
      return {
        driver_id: driverId,
        driver_name: dTrips[0].driver_name || "Unknown",
        total_trips: total,
        on_time_pct: total > 0 ? Math.round((onTime / total) * 100) : 0,
        avg_gps_pct: avgGps,
        last_trip: sorted[0]?.started_at || null,
      };
    });
  }, [trips]);

  // Route summaries
  const routeSummaries = useMemo((): RouteSummary[] => {
    const map = new Map<string, TripReport[]>();
    for (const t of trips) {
      const key = t.route_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).map(([routeId, rTrips]) => {
      const total = rTrips.length;
      const onTime = rTrips.filter(t => t.status !== "cancelled" && t.status !== "delayed").length;
      const durations = rTrips
        .filter(t => t.started_at && t.ended_at)
        .map(t => differenceInMinutes(new Date(t.ended_at!), new Date(t.started_at!)));
      const avgDur = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
      return {
        route_id: routeId,
        route_name: rTrips[0].route_name || "Unknown",
        total_trips: total,
        on_time_pct: total > 0 ? Math.round((onTime / total) * 100) : 0,
        avg_duration_mins: avgDur,
      };
    });
  }, [trips]);

  // Fetch trip detail
  const fetchTripDetail = useCallback(async (tripId: string): Promise<TripDetailData | null> => {
    try {
      const [tripRes, locRes, excRes] = await Promise.all([
        supabase
          .from("trips")
          .select(`id, started_at, ended_at, status, buses(name), profiles(display_name), routes(name)`)
          .eq("id", tripId)
          .single(),
        supabase
          .from("live_locations")
          .select("lat, lng, timestamp")
          .eq("trip_id", tripId)
          .order("timestamp", { ascending: true }),
        supabase
          .from("exceptions")
          .select("type, notes, created_at")
          .eq("bus_id", (await supabase.from("trips").select("bus_id").eq("id", tripId).single()).data?.bus_id || "")
          .order("created_at", { ascending: true }),
      ]);

      if (tripRes.error) throw tripRes.error;
      const t: any = tripRes.data;
      const locations = (locRes.data || []).map((l: any) => ({ lat: Number(l.lat), lng: Number(l.lng), timestamp: l.timestamp }));

      return {
        id: t.id,
        started_at: t.started_at,
        ended_at: t.ended_at,
        status: t.status,
        bus_name: t.buses?.name ?? null,
        driver_name: t.profiles?.display_name ?? null,
        route_name: t.routes?.name ?? null,
        gps_pings: locations.length,
        locations,
        exceptions: excRes.data || [],
      };
    } catch (err) {
      console.error("Failed to fetch trip detail:", err);
      return null;
    }
  }, []);

  // Export CSV
  const exportCsv = useCallback(() => {
    if (trips.length === 0) return;
    const headers = ["Date", "Bus", "Driver", "Route", "Departure", "End Time", "Duration (mins)", "Status", "GPS Pings", "GPS %"];
    const rows = trips.map(t => {
      const dur = t.started_at && t.ended_at ? differenceInMinutes(new Date(t.ended_at), new Date(t.started_at)) : "";
      const gpsPct = computeGpsPct(t.gps_pings, t.started_at, t.ended_at);
      return [
        t.started_at ? format(new Date(t.started_at), "yyyy-MM-dd") : "",
        t.bus_name || "",
        t.driver_name || "",
        t.route_name || "",
        t.started_at ? format(new Date(t.started_at), "hh:mm a") : "",
        t.ended_at ? format(new Date(t.ended_at), "hh:mm a") : "Active",
        dur,
        t.status,
        t.gps_pings,
        gpsPct + "%",
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trip-reports-${format(from, "yyyy-MM-dd")}-to-${format(to, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [trips, from, to]);

  return {
    preset, setPreset,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    trips, stats, loading,
    driverSummaries, routeSummaries,
    fetchTripDetail, exportCsv,
    computeGpsPct,
  };
}
