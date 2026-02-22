import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface OccupancyInfo {
  tripId: string;
  count: number;
  capacity: number | null;
  percentage: number;
  level: "empty" | "filling" | "almost_full" | "full";
  label: string;
}

function getLevel(pct: number): OccupancyInfo["level"] {
  if (pct <= 30) return "empty";
  if (pct <= 60) return "filling";
  if (pct <= 85) return "almost_full";
  return "full";
}

function getLabel(level: OccupancyInfo["level"]): string {
  switch (level) {
    case "empty": return "Empty";
    case "filling": return "Filling";
    case "almost_full": return "Almost Full";
    case "full": return "Full";
  }
}

export function getOccupancyColor(level: OccupancyInfo["level"]): string {
  switch (level) {
    case "empty": return "text-success";
    case "filling": return "text-yellow-500";
    case "almost_full": return "text-orange-500";
    case "full": return "text-destructive";
  }
}

export function getOccupancyBgColor(level: OccupancyInfo["level"]): string {
  switch (level) {
    case "empty": return "bg-success";
    case "filling": return "bg-yellow-500";
    case "almost_full": return "bg-orange-500";
    case "full": return "bg-destructive";
  }
}

export function getOccupancyPillClasses(level: OccupancyInfo["level"]): string {
  switch (level) {
    case "empty": return "bg-success/10 text-success border-success/20";
    case "filling": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    case "almost_full": return "bg-orange-500/10 text-orange-600 border-orange-500/20";
    case "full": return "bg-destructive/10 text-destructive border-destructive/20";
  }
}

const ANON_ID_KEY = "uniroute_anon_id";

export function getAnonId(): string {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = Math.random().toString(36).substr(2, 9);
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

export function hasCheckedIn(tripId: string): boolean {
  try {
    return localStorage.getItem(`uniroute_checkin_${tripId}`) === "true";
  } catch { return false; }
}

export function markCheckedIn(tripId: string) {
  try {
    localStorage.setItem(`uniroute_checkin_${tripId}`, "true");
  } catch {}
}

export function useOccupancy(tripIds: string[]) {
  const [occupancy, setOccupancy] = useState<Map<string, OccupancyInfo>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOccupancy = useCallback(async () => {
    if (tripIds.length === 0) {
      setOccupancy(new Map());
      return;
    }

    // Get counts for each trip
    const results = new Map<string, OccupancyInfo>();

    // Batch: get all students_on_bus for these trips
    const { data: students } = await supabase
      .from("students_on_bus")
      .select("trip_id")
      .in("trip_id", tripIds);

    // Get bus capacities via trips
    const { data: trips } = await supabase
      .from("trips")
      .select("id, bus_id, buses(capacity)")
      .in("id", tripIds);

    const countMap = new Map<string, number>();
    if (students) {
      for (const s of students) {
        countMap.set(s.trip_id, (countMap.get(s.trip_id) ?? 0) + 1);
      }
    }

    const capacityMap = new Map<string, number | null>();
    if (trips) {
      for (const t of trips) {
        capacityMap.set(t.id, (t.buses as any)?.capacity ?? null);
      }
    }

    for (const tripId of tripIds) {
      const count = countMap.get(tripId) ?? 0;
      const capacity = capacityMap.get(tripId) ?? null;
      const pct = capacity && capacity > 0 ? Math.min(100, Math.round((count / capacity) * 100)) : 0;
      const level = getLevel(pct);
      results.set(tripId, {
        tripId,
        count,
        capacity,
        percentage: pct,
        level,
        label: getLabel(level),
      });
    }

    setOccupancy(results);
  }, [tripIds.join(",")]);

  useEffect(() => {
    fetchOccupancy();
    intervalRef.current = setInterval(fetchOccupancy, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchOccupancy]);

  return { occupancy, refresh: fetchOccupancy };
}

export type { OccupancyInfo };
