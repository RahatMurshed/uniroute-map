import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";

export interface OverrideRecord {
  id: string;
  busId: string;
  busName: string;
  busLicensePlate: string | null;
  exceptionDate: string;
  type: string;
  timeOffsetMins: number | null;
  overrideRouteId: string | null;
  overrideRouteName: string | null;
  notes: string | null;
  notified: boolean;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  defaultRouteId: string | null;
}

export interface BusOption {
  id: string;
  name: string;
  licensePlate: string | null;
  defaultRouteId: string | null;
}

export interface RouteOption {
  id: string;
  name: string;
}

export function useOverrides() {
  const { user } = useAuthStore();
  const [overrides, setOverrides] = useState<OverrideRecord[]>([]);
  const [buses, setBuses] = useState<BusOption[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOverrides = useCallback(async () => {
    const { data, error } = await supabase
      .from("exceptions")
      .select(
        "id, bus_id, exception_date, type, time_offset_mins, override_route_id, notes, notified, created_by, created_at, buses(name, license_plate, default_route_id), profiles!exceptions_created_by_fkey(display_name), routes!exceptions_override_route_id_fkey(name)"
      )
      .gte("exception_date", new Date().toISOString().split("T")[0])
      .order("exception_date", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load overrides");
      return;
    }

    setOverrides(
      (data ?? []).map((e: any) => ({
        id: e.id,
        busId: e.bus_id,
        busName: e.buses?.name ?? "Unknown",
        busLicensePlate: e.buses?.license_plate ?? null,
        exceptionDate: e.exception_date,
        type: e.type,
        timeOffsetMins: e.time_offset_mins,
        overrideRouteId: e.override_route_id,
        overrideRouteName: e.routes?.name ?? null,
        notes: e.notes,
        notified: e.notified,
        createdBy: e.created_by,
        createdByName: e.profiles?.display_name ?? null,
        createdAt: e.created_at,
        defaultRouteId: e.buses?.default_route_id ?? null,
      }))
    );
  }, []);

  const fetchBuses = useCallback(async () => {
    const { data } = await supabase
      .from("buses")
      .select("id, name, license_plate, default_route_id")
      .order("name");
    setBuses(
      (data ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        licensePlate: b.license_plate,
        defaultRouteId: b.default_route_id,
      }))
    );
  }, []);

  const fetchRoutes = useCallback(async () => {
    const { data } = await supabase
      .from("routes")
      .select("id, name")
      .order("name");
    setRoutes((data ?? []).map((r) => ({ id: r.id, name: r.name })));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchOverrides(), fetchBuses(), fetchRoutes()]);
    setLoading(false);
  }, [fetchOverrides, fetchBuses, fetchRoutes]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime subscription for exceptions
  useEffect(() => {
    const channel = supabase
      .channel("overrides-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "exceptions" }, () => {
        fetchOverrides();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOverrides]);

  const createOverride = async (data: {
    busId: string;
    exceptionDate: string;
    type: string;
    timeOffsetMins: number | null;
    overrideRouteId: string | null;
    notes: string;
    notifyNow: boolean;
  }) => {
    if (!user) return false;

    const { data: inserted, error } = await supabase
      .from("exceptions")
      .insert({
        bus_id: data.busId,
        exception_date: data.exceptionDate,
        type: data.type,
        time_offset_mins: data.timeOffsetMins,
        override_route_id: data.overrideRouteId,
        notes: data.notes,
        notified: false,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      toast.error("Failed to create override: " + error.message);
      return false;
    }

    if (data.notifyNow && inserted) {
      await notifyStudents(inserted.id, data);
    }

    toast.success(
      data.notifyNow
        ? "✅ Override created and students notified"
        : "✅ Override created"
    );
    await fetchOverrides();
    return true;
  };

  const updateOverride = async (
    id: string,
    data: {
      busId: string;
      exceptionDate: string;
      type: string;
      timeOffsetMins: number | null;
      overrideRouteId: string | null;
      notes: string;
    }
  ) => {
    const { error } = await supabase
      .from("exceptions")
      .update({
        bus_id: data.busId,
        exception_date: data.exceptionDate,
        type: data.type,
        time_offset_mins: data.timeOffsetMins,
        override_route_id: data.overrideRouteId,
        notes: data.notes,
      })
      .eq("id", id);

    if (error) {
      toast.error("Failed to update override: " + error.message);
      return false;
    }
    toast.success("✅ Override updated");
    await fetchOverrides();
    return true;
  };

  const deleteOverride = async (id: string) => {
    const { error } = await supabase.from("exceptions").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete override: " + error.message);
      return false;
    }
    toast.success("✅ Override deleted");
    await fetchOverrides();
    return true;
  };

  const notifyStudents = async (
    exceptionId: string,
    data?: {
      busId: string;
      type: string;
      timeOffsetMins: number | null;
      overrideRouteId: string | null;
    }
  ) => {
    let busId = data?.busId;
    let type = data?.type;
    let timeOffsetMins = data?.timeOffsetMins;
    let routeId: string | null = data?.overrideRouteId ?? null;
    let busName = "";

    if (!data) {
      const override = overrides.find((o) => o.id === exceptionId);
      if (!override) return false;
      busId = override.busId;
      type = override.type;
      timeOffsetMins = override.timeOffsetMins;
      busName = override.busName;
      routeId = override.overrideRouteId;
    } else {
      const bus = buses.find((b) => b.id === data.busId);
      busName = bus?.name ?? "Bus";
    }

    // Fallback 1: check most recent trip for this bus
    if (!routeId && busId) {
      const { data: tripData } = await supabase
        .from("trips")
        .select("route_id")
        .eq("bus_id", busId)
        .in("status", ["active", "delayed", "completed"])
        .order("started_at", { ascending: false })
        .limit(1)
        .single();
      routeId = tripData?.route_id ?? null;
    }

    // Fallback 2: check bus default route
    if (!routeId && busId) {
      const { data: busData } = await supabase
        .from("buses")
        .select("default_route_id")
        .eq("id", busId)
        .single();
      routeId = busData?.default_route_id ?? null;
    }

    if (!routeId) {
      toast.error("No route found. Please assign a default route to this bus first.");
      return false;
    }

    try {
      const { error } = await supabase.functions.invoke("send-push-notifications", {
        body: {
          type: "exception",
          bus_id: busId,
          bus_name: busName,
          exception_type: type,
          time_offset_mins: timeOffsetMins,
          route_id: routeId,
        },
      });
      if (error) throw error;

      await supabase.from("exceptions").update({ notified: true }).eq("id", exceptionId);
      toast.success("Students notified successfully 🔔");
      await fetchOverrides();
      return true;
    } catch (err: any) {
      toast.error("Failed to notify: " + err.message);
      return false;
    }
  };

  return {
    overrides,
    buses,
    routes,
    loading,
    refresh,
    createOverride,
    updateOverride,
    deleteOverride,
    notifyStudents,
  };
}
