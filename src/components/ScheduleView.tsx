import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { haversineDistance, calculateETAsForStop } from "@/lib/eta";
import type { BusLocation, Stop, RouteInfo } from "@/hooks/useMapData";

interface FavouriteStop {
  stop_id: string;
  stop_name: string;
  landmark: string | null;
  lat: number;
  lng: number;
}

interface Exception {
  id: string;
  busId: string;
  busName: string;
  type: string;
  notes: string | null;
  timeOffsetMins: number | null;
  overrideRouteId: string | null;
}

interface StopScheduleEntry {
  stopId: string;
  stopName: string;
  scheduledTime: string | null;
  adjustedTime: string | null;
  offsetMins: number | null;
  status: "passed" | "current" | "upcoming" | "cancelled";
}

function formatActiveDays(days: number[] | null): string {
  if (!days || days.length === 0) return "No schedule set";
  const sorted = [...days].sort((a, b) => a - b);
  const key = sorted.join(",");
  if (key === "1,2,3,4,5,6,7") return "Every Day";
  if (key === "1,2,3,4,5,6") return "Monday – Saturday";
  if (key === "1,2,3,4,5") return "Monday – Friday";
  if (key === "6,7") return "Weekends Only";
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return sorted.map((d) => names[d] || `Day ${d}`).join(", ");
}

function isTodayActive(days: number[] | null): boolean {
  if (!days || days.length === 0) return true;
  const jsDay = new Date().getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  return days.includes(isoDay);
}

function formatTime12(time24: string | null | undefined): string | null {
  if (!time24) return null;
  const [hh, mm] = time24.split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return time24;
  const period = hh >= 12 ? "PM" : "AM";
  const h = hh % 12 || 12;
  return `${h}:${mm.toString().padStart(2, "0")} ${period}`;
}

function addMinutesToTime(time24: string, mins: number): string {
  const [hh, mm] = time24.split(":").map(Number);
  const total = hh * 60 + mm + mins;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${newH.toString().padStart(2, "0")}:${newM.toString().padStart(2, "0")}`;
}

function timeAgoShort(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function parseStopSequenceObjects(raw: unknown): { stop_id: string; scheduled_time?: string }[] {
  if (!raw || !Array.isArray(raw)) return [];
  if (raw.length === 0) return [];
  if (typeof raw[0] === "string") return (raw as string[]).map((id) => ({ stop_id: id }));
  return raw.map((item: any) => ({
    stop_id: item?.stop_id ?? "",
    scheduled_time: item?.scheduled_time ?? undefined,
  })).filter((x) => x.stop_id);
}

interface ScheduleViewProps {
  busLocations: Map<string, BusLocation>;
  stops: Stop[];
  routes: RouteInfo[];
  favouriteStop: FavouriteStop | null;
  onRemoveFavourite: () => void;
  onViewFavOnMap: () => void;
}

export default function ScheduleView({ busLocations, stops, routes, favouriteStop, onRemoveFavourite, onViewFavOnMap }: ScheduleViewProps) {
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);

  const buses = useMemo(() => [...busLocations.values()], [busLocations]);
  const stopMap = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops]);
  const activeRouteIds = useMemo(() => new Set(buses.map((b) => b.routeId)), [buses]);
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  }, []);

  const fetchExceptions = useCallback(async () => {
    const { data } = await supabase
      .from("exceptions")
      .select("id, bus_id, type, notes, time_offset_mins, override_route_id, buses(name)")
      .eq("exception_date", todayStr);
    if (data) {
      setExceptions(data.map((e: any) => ({
        id: e.id, busId: e.bus_id, busName: (e.buses as any)?.name ?? "Bus",
        type: e.type, notes: e.notes, timeOffsetMins: e.time_offset_mins, overrideRouteId: e.override_route_id,
      })));
    }
  }, [todayStr]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchExceptions();
    setLastRefreshed(new Date());
    setRefreshing(false);
  }, [fetchExceptions]);

  useEffect(() => { fetchExceptions(); }, [fetchExceptions]);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  const [rawRoutes, setRawRoutes] = useState<Map<string, any[]>>(new Map());
  useEffect(() => {
    const fetchRaw = async () => {
      const { data } = await supabase.from("routes").select("id, stop_sequence");
      if (data) {
        const map = new Map<string, any[]>();
        for (const r of data) { map.set(r.id, parseStopSequenceObjects(r.stop_sequence)); }
        setRawRoutes(map);
      }
    };
    fetchRaw();
  }, []);

  const favEtas = useMemo(() => {
    if (!favouriteStop) return [];
    const match = stops.find((s) => s.id === favouriteStop.stop_id);
    if (!match) return [];
    return calculateETAsForStop(match, buses, routes, stops);
  }, [favouriteStop, stops, buses, routes]);

  function getStopScheduleWithTimes(route: RouteInfo): StopScheduleEntry[] {
    const rawSeq = rawRoutes.get(route.id) ?? [];
    const ids = rawSeq.map((x) => x.stop_id);
    if (ids.length === 0) {
      const fallbackIds = route.stopSequence ?? [];
      if (fallbackIds.length === 0) return [];
      return fallbackIds.map((stopId) => ({
        stopId, stopName: stopMap.get(stopId)?.name ?? "Unknown Stop",
        scheduledTime: null, adjustedTime: null, offsetMins: null, status: "upcoming" as const,
      }));
    }
    const routeBuses = buses.filter((b) => b.routeId === route.id);
    let closestStopIdx = -1;
    if (routeBuses.length > 0) {
      const bus = routeBuses[0];
      let minDist = Infinity;
      for (let i = 0; i < ids.length; i++) {
        const s = stopMap.get(ids[i]);
        if (!s) continue;
        const d = haversineDistance(bus.lat, bus.lng, s.lat, s.lng);
        if (d < minDist) { minDist = d; closestStopIdx = i; }
      }
    }
    const cancelledBusIds = new Set(exceptions.filter((e) => e.type === "cancellation").map((e) => e.busId));
    const routeIsCancelled = routeBuses.some((b) => cancelledBusIds.has(b.busId));
    const delayException = exceptions.find((e) => e.type === "delay" && routeBuses.some((b) => b.busId === e.busId));
    const offsetMins = delayException?.timeOffsetMins ?? null;

    return rawSeq.map((entry, idx) => {
      const stop = stopMap.get(entry.stop_id);
      let status: StopScheduleEntry["status"] = "upcoming";
      if (routeIsCancelled) { status = "cancelled"; }
      else if (routeBuses.length > 0 && closestStopIdx >= 0) {
        if (idx < closestStopIdx) status = "passed";
        else if (idx === closestStopIdx) status = "current";
      }
      const scheduled = entry.scheduled_time ?? null;
      let adjusted: string | null = null;
      if (scheduled && offsetMins && offsetMins > 0) { adjusted = addMinutesToTime(scheduled, offsetMins); }
      return {
        stopId: entry.stop_id, stopName: stop?.name ?? "Unknown Stop",
        scheduledTime: scheduled, adjustedTime: adjusted,
        offsetMins: status !== "cancelled" ? offsetMins : null, status,
      };
    });
  }

  const statusIcon = (s: StopScheduleEntry["status"]) => {
    switch (s) {
      case "passed": return "✅";
      case "current": return "🚌";
      case "upcoming": return "⏳";
      case "cancelled": return "❌";
    }
  };

  const exceptionLabel = (e: Exception) => {
    if (e.type === "cancellation") return `${e.busName} — Cancelled today ❌`;
    if (e.type === "delay" && e.timeOffsetMins) return `${e.busName} — Running ${e.timeOffsetMins} mins late`;
    if (e.type === "route_change" || e.overrideRouteId) return `${e.busName} — Route changed today`;
    return `${e.busName} — ${e.notes ?? e.type}`;
  };

  if (routes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No routes configured yet</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Bus Schedules</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs rounded-full font-semibold ${
              buses.length > 0
                ? "bg-success/10 text-success border border-success/20"
                : "bg-destructive/10 text-destructive border border-destructive/20"
            }`}>
              {buses.length > 0 ? "🟢 Service Running" : "🔴 No Active Service"}
            </Badge>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="p-2 rounded-xl hover:bg-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Updated {timeAgoShort(lastRefreshed)}</p>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Favourite stop card */}
        {favouriteStop ? (
          <div className="bg-card rounded-xl border border-primary/20 shadow-sm p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">⭐</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Your Favourite Stop</p>
                <h3 className="font-bold text-foreground">📍 {favouriteStop.stop_name}</h3>
                {favouriteStop.landmark && (
                  <p className="text-xs text-muted-foreground">{favouriteStop.landmark}</p>
                )}
                {favEtas.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {favEtas.slice(0, 2).map((eta) => (
                      <p key={eta.busId} className="text-sm text-foreground">
                        🚌 {eta.busName} – {eta.routeName}<br />
                        <span className="text-muted-foreground">{eta.label}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic mt-1">
                    {buses.length === 0 ? "No buses currently active" : "No active buses heading here"}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={onViewFavOnMap}
                    className="text-sm font-semibold text-primary hover:underline min-h-[44px] flex items-center"
                  >
                    View on Map
                  </button>
                  <button
                    onClick={onRemoveFavourite}
                    className="text-sm font-medium text-muted-foreground hover:text-destructive min-h-[44px] flex items-center"
                  >
                    Remove ☆
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-center bg-card">
            <p className="text-sm text-muted-foreground">Tap ⭐ on any stop to save your favourite</p>
          </div>
        )}

        {/* Exception banner */}
        {exceptions.length > 0 && (
          <div className="rounded-xl bg-warning/10 border border-warning/20 p-3.5">
            <p className="text-sm font-bold text-warning mb-1">⚠️ Service Changes Today</p>
            <div className="space-y-1">
              {exceptions.map((e) => (
                <p key={e.id} className="text-sm text-foreground">{exceptionLabel(e)}</p>
              ))}
            </div>
          </div>
        )}

        {/* Route cards */}
        {routes.map((route) => {
          const active = activeRouteIds.has(route.id);
          const todayActive = isTodayActive(route.activeDays ?? null);
          const schedule = getStopScheduleWithTimes(route);

          return (
            <div key={route.id} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              {/* Route header with color accent */}
              <div className="flex items-center gap-3 px-4 pt-4 pb-2">
                <div
                  className="w-1 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: route.colorHex }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">{route.name}</span>
                    {!todayActive ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Not today</span>
                    ) : active ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">ACTIVE</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatActiveDays(route.activeDays ?? null)}</p>
                </div>
              </div>
              <div className="px-4 pb-4 pt-1">
                {schedule.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No stops configured</p>
                ) : (
                  <div className="border border-border rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-2 bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <span>Stop</span>
                      <span>Scheduled</span>
                      <span className="text-center">Status</span>
                    </div>
                    {schedule.map((entry, idx) => (
                      <div
                        key={entry.stopId + idx}
                        className={`grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-2.5 text-sm border-t border-border ${
                          entry.status === "current" ? "bg-primary/5" : ""
                        }`}
                      >
                        <span className="text-foreground truncate">{entry.stopName}</span>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {entry.adjustedTime ? (
                            <span className="text-warning">
                              <span className="line-through text-muted-foreground/60 mr-1">{formatTime12(entry.scheduledTime)}</span>
                              {formatTime12(entry.adjustedTime)}
                              <span className="text-xs ml-0.5">(+{entry.offsetMins})</span>
                            </span>
                          ) : entry.scheduledTime ? (
                            formatTime12(entry.scheduledTime)
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </span>
                        <span className="text-center">{statusIcon(entry.status)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
