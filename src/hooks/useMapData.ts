import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface BusLocation {
  busId: string;
  busName: string;
  routeId: string;
  routeName: string;
  routeColor: string;
  lat: number;
  lng: number;
  speedKmh: number;
  heading: number;
  timestamp: string;
  tripId: string;
}

interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  landmark: string | null;
}

interface RouteInfo {
  id: string;
  name: string;
  colorHex: string;
  stopSequence: string[] | null;
  activeDays: number[] | null;
}

/** Parse stop_sequence JSONB – handles both flat string[] and object[] with stop_id */
function parseStopSequence(raw: unknown): string[] | null {
  if (!raw || !Array.isArray(raw)) return null;
  if (raw.length === 0) return null;
  if (typeof raw[0] === "string") return raw as string[];
  // Object format: [{stop_id: "...", scheduled_time: "..."}, ...]
  return raw
    .map((item: any) => item?.stop_id as string | undefined)
    .filter(Boolean) as string[];
}

export function useMapData() {
  const [busLocations, setBusLocations] = useState<Map<string, BusLocation>>(new Map());
  const [stops, setStops] = useState<Stop[]>([]);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [connected, setConnected] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

  // Cache trip→bus/route mappings
  const tripMapRef = useRef<Map<string, { busId: string; busName: string; routeId: string; routeName: string; routeColor: string }>>(new Map());

  // Load initial static data
  useEffect(() => {
    const load = async () => {
      const [stopsRes, routesRes] = await Promise.all([
        supabase.from("stops").select("id, name, lat, lng, landmark"),
        supabase.from("routes").select("id, name, color_hex, stop_sequence, active_days"),
      ]);
      if (stopsRes.data) setStops(stopsRes.data.map((s) => ({ id: s.id, name: s.name, lat: Number(s.lat), lng: Number(s.lng), landmark: s.landmark })));
      if (routesRes.data) setRoutes(routesRes.data.map((r) => ({ id: r.id, name: r.name, colorHex: r.color_hex ?? "#3b82f6", stopSequence: parseStopSequence(r.stop_sequence), activeDays: r.active_days ?? null })));
    };
    load();
  }, []);

  // Load active trips and their latest locations
  const loadActiveTrips = useCallback(async () => {
    const { data: trips } = await supabase
      .from("trips")
      .select("id, bus_id, route_id, buses(name), routes(name, color_hex)")
      .in("status", ["active", "delayed"]);

    if (!trips) return;

    const newTripMap = new Map<string, { busId: string; busName: string; routeId: string; routeName: string; routeColor: string }>();
    for (const t of trips) {
      newTripMap.set(t.id, {
        busId: t.bus_id,
        busName: (t.buses as any)?.name ?? "Bus",
        routeId: t.route_id,
        routeName: (t.routes as any)?.name ?? "Route",
        routeColor: (t.routes as any)?.color_hex ?? "#3b82f6",
      });
    }
    tripMapRef.current = newTripMap;

    // Fetch latest location for each active trip
    const newLocs = new Map<string, BusLocation>();
    for (const t of trips) {
      const { data: loc } = await supabase
        .from("live_locations")
        .select("lat, lng, speed_kmh, heading, timestamp")
        .eq("trip_id", t.id)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (loc) {
        const info = newTripMap.get(t.id)!;
        newLocs.set(t.bus_id, {
          busId: t.bus_id,
          busName: info.busName,
          routeId: t.route_id,
          routeName: info.routeName,
          routeColor: info.routeColor,
          lat: Number(loc.lat),
          lng: Number(loc.lng),
          speedKmh: Number(loc.speed_kmh ?? 0),
          heading: Number(loc.heading ?? 0),
          timestamp: loc.timestamp,
          tripId: t.id,
        });
      }
    }
    setBusLocations(newLocs);
  }, []);

  useEffect(() => {
    loadActiveTrips();
  }, [loadActiveTrips]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("live-map")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_locations" },
        (payload) => {
          const row = payload.new as any;
          const tripInfo = tripMapRef.current.get(row.trip_id);
          if (!tripInfo) {
            // Unknown trip — refresh trip list
            loadActiveTrips();
            return;
          }
          setBusLocations((prev) => {
            const next = new Map(prev);
            next.set(tripInfo.busId, {
              busId: tripInfo.busId,
              busName: tripInfo.busName,
              routeId: tripInfo.routeId,
              routeName: tripInfo.routeName,
              routeColor: tripInfo.routeColor,
              lat: Number(row.lat),
              lng: Number(row.lng),
              speedKmh: Number(row.speed_kmh ?? 0),
              heading: Number(row.heading ?? 0),
              timestamp: row.timestamp,
              tripId: row.trip_id,
            });
            return next;
          });
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadActiveTrips]);

  // Filter by selected route
  const filteredBuses = selectedRoute
    ? new Map([...busLocations].filter(([, b]) => b.routeId === selectedRoute))
    : busLocations;

  const filteredStops = selectedRoute
    ? (() => {
        const route = routes.find((r) => r.id === selectedRoute);
        if (!route?.stopSequence) return stops;
        const ids = new Set(route.stopSequence);
        return stops.filter((s) => ids.has(s.id));
      })()
    : stops;

  // Active routes (routes with at least one active trip)
  const activeRouteIds = new Set([...busLocations.values()].map((b) => b.routeId));

  return {
    busLocations: filteredBuses,
    stops: filteredStops,
    routes,
    activeRouteIds,
    connected,
    selectedRoute,
    setSelectedRoute,
  };
}

export type { BusLocation, Stop, RouteInfo };
