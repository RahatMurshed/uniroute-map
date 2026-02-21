import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StopInfo {
  id: string;
  name: string;
  landmark: string | null;
  lat: number;
  lng: number;
}

export interface RouteStop {
  stop_id: string;
  scheduled_time: string; // HH:MM
}

export interface RouteRecord {
  id: string;
  name: string;
  color_hex: string | null;
  active_days: number[] | null;
  stop_sequence: RouteStop[];
  created_at: string;
}

function parseStopSequence(raw: unknown): RouteStop[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => {
    if (typeof item === "string") return { stop_id: item, scheduled_time: "" };
    return { stop_id: item.stop_id ?? "", scheduled_time: item.scheduled_time ?? "" };
  });
}

export function useRouteManager() {
  const [routes, setRoutes] = useState<RouteRecord[]>([]);
  const [stops, setStops] = useState<StopInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoutes = useCallback(async () => {
    const { data, error } = await supabase
      .from("routes")
      .select("id, name, color_hex, active_days, stop_sequence, created_at")
      .order("name");

    if (error) {
      toast.error("Failed to load routes");
      return;
    }
    setRoutes(
      (data ?? []).map((r) => ({
        ...r,
        stop_sequence: parseStopSequence(r.stop_sequence),
      }))
    );
  }, []);

  const fetchStops = useCallback(async () => {
    const { data, error } = await supabase
      .from("stops")
      .select("id, name, landmark, lat, lng")
      .order("name");
    if (!error) setStops(data ?? []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchRoutes(), fetchStops()]);
    setLoading(false);
  }, [fetchRoutes, fetchStops]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createRoute = async (route: { name: string; color_hex: string; active_days: number[]; stop_sequence: RouteStop[] }) => {
    const { error } = await supabase.from("routes").insert({
      name: route.name,
      color_hex: route.color_hex,
      active_days: route.active_days,
      stop_sequence: route.stop_sequence as any,
    });
    if (error) {
      toast.error("Failed to create route: " + error.message);
      return false;
    }
    toast.success("✅ Route created successfully");
    await fetchRoutes();
    return true;
  };

  const updateRoute = async (id: string, route: { name: string; color_hex: string; active_days: number[]; stop_sequence: RouteStop[] }) => {
    const { error } = await supabase.from("routes").update({
      name: route.name,
      color_hex: route.color_hex,
      active_days: route.active_days,
      stop_sequence: route.stop_sequence as any,
    }).eq("id", id);
    if (error) {
      toast.error("Failed to update route: " + error.message);
      return false;
    }
    toast.success("✅ Route updated successfully");
    await fetchRoutes();
    return true;
  };

  const deleteRoute = async (id: string) => {
    const { error } = await supabase.from("routes").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete route: " + error.message);
      return false;
    }
    toast.success("Route deleted");
    await fetchRoutes();
    return true;
  };

  const createStop = async (stop: { name: string; landmark: string | null; lat: number; lng: number }) => {
    const { data, error } = await supabase.from("stops").insert(stop).select("id, name, landmark, lat, lng").single();
    if (error) {
      toast.error("Failed to create stop: " + error.message);
      return null;
    }
    toast.success("Stop created");
    setStops((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    return data;
  };

  return { routes, stops, loading, refresh, createRoute, updateRoute, deleteRoute, createStop };
}
