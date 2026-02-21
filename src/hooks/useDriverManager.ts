import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface DriverRecord {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  role: string;
  assignedBus: { id: string; name: string } | null;
  totalTrips: number;
  gpsUptime: number;
  lastActive: string | null;
  hasActiveTrip: boolean;
}

export interface BusOption {
  id: string;
  name: string;
  licensePlate: string | null;
  driverId: string | null;
}

export function useDriverManager() {
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [buses, setBuses] = useState<BusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      // Get all driver/inactive_driver roles
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["driver", "inactive_driver"] as any[]);

      if (!roles || roles.length === 0) {
        setDrivers([]);
        setLoading(false);
        return;
      }

      const userIds = roles.map((r) => r.user_id);

      // Fetch profiles, buses, trips in parallel
      const [profilesRes, busesRes, tripsRes, locationsRes, activeTripsRes] = await Promise.all([
        supabase.from("profiles").select("id, display_name, email, phone").in("id", userIds),
        supabase.from("buses").select("id, name, license_plate, driver_id"),
        supabase.from("trips").select("id, driver_id, started_at, status").in("driver_id", userIds),
        supabase.from("live_locations").select("trip_id").in("trip_id",
          // We'll filter after
          (await supabase.from("trips").select("id").in("driver_id", userIds)).data?.map(t => t.id) ?? []
        ),
        supabase.from("trips").select("id, driver_id").in("driver_id", userIds).in("status", ["active", "delayed"]),
      ]);

      const profiles = profilesRes.data ?? [];
      const allBuses = busesRes.data ?? [];
      const trips = tripsRes.data ?? [];
      const locations = locationsRes.data ?? [];
      const activeTrips = activeTripsRes.data ?? [];

      // Build trip IDs with locations
      const tripIdsWithGps = new Set(locations.map((l) => l.trip_id));
      const activeTripDriverIds = new Set(activeTrips.map((t) => t.driver_id));

      const driverList: DriverRecord[] = roles.map((role) => {
        const profile = profiles.find((p) => p.id === role.user_id);
        const bus = allBuses.find((b) => b.driver_id === role.user_id);
        const driverTrips = trips.filter((t) => t.driver_id === role.user_id);
        const tripsWithGps = driverTrips.filter((t) => tripIdsWithGps.has(t.id));
        const gpsUptime = driverTrips.length > 0 ? Math.round((tripsWithGps.length / driverTrips.length) * 100) : 0;
        const lastTrip = driverTrips
          .filter((t) => t.started_at)
          .sort((a, b) => new Date(b.started_at!).getTime() - new Date(a.started_at!).getTime())[0];

        return {
          id: role.user_id,
          displayName: profile?.display_name ?? "Unknown",
          email: profile?.email ?? "",
          phone: profile?.phone ?? null,
          role: role.role,
          assignedBus: bus ? { id: bus.id, name: bus.name } : null,
          totalTrips: driverTrips.length,
          gpsUptime,
          lastActive: lastTrip?.started_at ?? null,
          hasActiveTrip: activeTripDriverIds.has(role.user_id),
        };
      });

      setDrivers(driverList);
      setBuses(allBuses.map((b) => ({ id: b.id, name: b.name, licensePlate: b.license_plate, driverId: b.driver_id })));
    } catch (err: any) {
      toast({ title: "Failed to load drivers", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const createDriver = async (data: {
    email: string;
    password: string;
    display_name: string;
    phone?: string;
    bus_id?: string;
  }) => {
    const { data: res, error } = await supabase.functions.invoke("manage-driver", {
      body: { action: "create", ...data },
    });
    if (error) throw error;
    if (res?.error) throw new Error(res.error);
    await fetchDrivers();
    return res;
  };

  const updateDriver = async (data: {
    user_id: string;
    display_name: string;
    phone?: string;
    bus_id?: string;
    old_bus_id?: string;
  }) => {
    const { data: res, error } = await supabase.functions.invoke("manage-driver", {
      body: { action: "update", ...data },
    });
    if (error) throw error;
    if (res?.error) throw new Error(res.error);
    await fetchDrivers();
    return res;
  };

  const deactivateDriver = async (userId: string) => {
    const { data: res, error } = await supabase.functions.invoke("manage-driver", {
      body: { action: "deactivate", user_id: userId },
    });
    if (error) throw error;
    if (res?.error) throw new Error(res.error);
    await fetchDrivers();
    return res;
  };

  const reactivateDriver = async (userId: string) => {
    const { data: res, error } = await supabase.functions.invoke("manage-driver", {
      body: { action: "reactivate", user_id: userId },
    });
    if (error) throw error;
    if (res?.error) throw new Error(res.error);
    await fetchDrivers();
    return res;
  };

  return { drivers, buses, loading, createDriver, updateDriver, deactivateDriver, reactivateDriver, refresh: fetchDrivers };
}
