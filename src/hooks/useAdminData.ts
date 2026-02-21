import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AdminBus {
  id: string;
  name: string;
  licensePlate: string | null;
  status: string;
  driverName: string | null;
  routeName: string | null;
  routeId: string | null;
  tripStatus: string | null;
  tripId: string | null;
  lastPing: string | null;
  lat: number | null;
  lng: number | null;
}

export interface AdminException {
  id: string;
  busId: string;
  busName: string;
  type: string;
  notes: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  routeId: string | null;
  notified: boolean;
}

export interface AdminStats {
  totalBuses: number;
  activeTrips: number;
  delayedToday: number;
  studentsOnBus: number;
}

export function useAdminData() {
  const [buses, setBuses] = useState<AdminBus[]>([]);
  const [exceptions, setExceptions] = useState<AdminException[]>([]);
  const [stats, setStats] = useState<AdminStats>({ totalBuses: 0, activeTrips: 0, delayedToday: 0, studentsOnBus: 0 });
  const [loading, setLoading] = useState(true);

  const fetchBuses = useCallback(async () => {
    // Get all buses with driver, active trip, route, and latest location
    const { data: busRows } = await supabase
      .from("buses")
      .select("id, name, license_plate, status, driver_id, profiles!buses_driver_id_fkey(display_name), default_route_id");

    if (!busRows) return;

    // Get active/delayed trips
    const { data: trips } = await supabase
      .from("trips")
      .select("id, bus_id, route_id, status, driver_id, routes(name), driver:profiles!trips_driver_id_fkey(display_name)")
      .in("status", ["active", "delayed"]);

    const tripByBus = new Map<string, { id: string; routeId: string; routeName: string; status: string; driverName: string | null }>();
    if (trips) {
      for (const t of trips) {
        tripByBus.set(t.bus_id, {
          id: t.id,
          routeId: t.route_id,
          routeName: (t.routes as any)?.name ?? "Unknown",
          status: t.status,
          driverName: (t.driver as any)?.display_name ?? null,
        });
      }
    }

    // Get latest locations for all buses
    const busIds = busRows.map((b) => b.id);
    const locPromises = busIds.map((busId) =>
      supabase
        .from("live_locations")
        .select("lat, lng, timestamp")
        .eq("bus_id", busId)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    const locResults = await Promise.all(locPromises);
    const locByBus = new Map<string, { lat: number; lng: number; timestamp: string }>();
    busIds.forEach((busId, i) => {
      const loc = locResults[i].data;
      if (loc) locByBus.set(busId, { lat: Number(loc.lat), lng: Number(loc.lng), timestamp: loc.timestamp });
    });

    const mapped: AdminBus[] = busRows.map((b) => {
      const trip = tripByBus.get(b.id);
      const loc = locByBus.get(b.id);
      return {
        id: b.id,
        name: b.name,
        licensePlate: b.license_plate,
        status: b.status,
        driverName: trip?.driverName ?? (b.profiles as any)?.display_name ?? null,
        routeName: trip?.routeName ?? null,
        routeId: trip?.routeId ?? null,
        tripStatus: trip?.status ?? null,
        tripId: trip?.id ?? null,
        lastPing: loc?.timestamp ?? null,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
      };
    });
    setBuses(mapped);
    return { busCount: busRows.length, activeTrips: trips?.filter((t) => t.status === "active").length ?? 0 };
  }, []);

  const fetchExceptions = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("exceptions")
      .select("id, bus_id, type, notes, created_by, created_at, override_route_id, notified, buses(name), profiles!exceptions_created_by_fkey(display_name)")
      .eq("exception_date", today)
      .order("created_at", { ascending: false });

    if (data) {
      setExceptions(
        data.map((e) => ({
          id: e.id,
          busId: e.bus_id,
          busName: (e.buses as any)?.name ?? "Unknown",
          type: e.type,
          notes: e.notes,
          createdBy: e.created_by,
          createdByName: (e.profiles as any)?.display_name ?? null,
          createdAt: e.created_at,
          routeId: e.override_route_id,
          notified: e.notified,
        }))
      );
    }
  }, []);

  const fetchStats = useCallback(async () => {
    const [busRes, activeRes, delayedRes] = await Promise.all([
      supabase.from("buses").select("id", { count: "exact", head: true }),
      supabase.from("trips").select("id", { count: "exact", head: true }).in("status", ["active", "delayed"]),
      supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "delayed"),
    ]);

    // Students on bus for active trips
    const { data: activeTrips } = await supabase.from("trips").select("id").in("status", ["active", "delayed"]);
    let studentCount = 0;
    if (activeTrips && activeTrips.length > 0) {
      const { count } = await supabase
        .from("students_on_bus")
        .select("id", { count: "exact", head: true })
        .in("trip_id", activeTrips.map((t) => t.id));
      studentCount = count ?? 0;
    }

    setStats({
      totalBuses: busRes.count ?? 0,
      activeTrips: activeRes.count ?? 0,
      delayedToday: delayedRes.count ?? 0,
      studentsOnBus: studentCount,
    });
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchBuses(), fetchExceptions(), fetchStats()]);
    setLoading(false);
  }, [fetchBuses, fetchExceptions, fetchStats]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("admin-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_locations" }, () => {
        fetchBuses();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => {
        fetchBuses();
        fetchStats();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "exceptions" }, () => {
        fetchExceptions();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchBuses, fetchExceptions, fetchStats]);

  return { buses, exceptions, stats, loading, refreshAll };
}
