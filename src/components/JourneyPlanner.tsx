import { useState, useMemo } from "react";
import { MapPin, ArrowDownUp, Search, Bus, Clock, CheckCircle2, XCircle } from "lucide-react";
import type { Stop, RouteInfo, BusLocation } from "@/hooks/useMapData";
import { calculateETAsForStop, haversineDistance } from "@/lib/eta";
import { getOccupancyPillClasses, type OccupancyInfo } from "@/hooks/useOccupancy";

interface JourneyPlannerProps {
  stops: Stop[];
  routes: RouteInfo[];
  buses: BusLocation[];
  allStops: Stop[];
  occupancy: Map<string, OccupancyInfo>;
  rawRoutes: Map<string, { stop_id: string; scheduled_time?: string }[]>;
}

interface JourneyResult {
  routeId: string;
  routeName: string;
  routeColor: string;
  fromStop: Stop;
  toStop: Stop;
  hasActiveBus: boolean;
  etaToOriginMin: number | null;
  etaLabel: string | null;
  travelTimeMin: number | null;
  totalTimeMin: number | null;
  nextDepartureTime: string | null;
  occupancy: OccupancyInfo | null;
}

function parseTime24ToMinutes(time24: string): number {
  const [hh, mm] = time24.split(":").map(Number);
  return hh * 60 + mm;
}

function formatTime12(time24: string | null | undefined): string | null {
  if (!time24) return null;
  const [hh, mm] = time24.split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return time24;
  const period = hh >= 12 ? "PM" : "AM";
  const h = hh % 12 || 12;
  return `${h}:${mm.toString().padStart(2, "0")} ${period}`;
}

function formatMinutes(mins: number): string {
  if (mins < 1) return "< 1 min";
  return `~${Math.round(mins)} min`;
}

export default function JourneyPlanner({ stops, routes, buses, allStops, occupancy, rawRoutes }: JourneyPlannerProps) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [results, setResults] = useState<JourneyResult[] | null>(null);
  const [searched, setSearched] = useState(false);

  const sortedStops = useMemo(() => [...stops].sort((a, b) => a.name.localeCompare(b.name)), [stops]);

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
    setResults(null);
    setSearched(false);
  };

  const search = () => {
    if (!fromId || !toId || fromId === toId) return;
    const fromStop = stops.find((s) => s.id === fromId);
    const toStop = stops.find((s) => s.id === toId);
    if (!fromStop || !toStop) return;

    const found: JourneyResult[] = [];

    for (const route of routes) {
      const seq = rawRoutes.get(route.id);
      if (!seq || seq.length === 0) continue;

      const ids = seq.map((s) => s.stop_id);
      const fromIdx = ids.indexOf(fromId);
      const toIdx = ids.indexOf(toId);

      // Both stops must be on this route, and from must come before to
      if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) continue;

      // Check active bus on this route
      const routeBuses = buses.filter((b) => b.routeId === route.id);
      const hasActiveBus = routeBuses.length > 0;

      let etaToOriginMin: number | null = null;
      let etaLabel: string | null = null;
      let tripOccupancy: OccupancyInfo | null = null;

      if (hasActiveBus) {
        const etas = calculateETAsForStop(fromStop, routeBuses, [route], allStops);
        if (etas.length > 0 && !etas[0].passed && !etas[0].stale) {
          etaToOriginMin = etas[0].etaMinutes;
          etaLabel = etas[0].label;
        }
        // Get occupancy for first active bus trip
        const firstBus = routeBuses[0];
        if (firstBus) {
          const occ = occupancy.get(firstBus.tripId);
          if (occ) tripOccupancy = occ;
        }
      }

      // Travel time from schedule
      let travelTimeMin: number | null = null;
      const fromTime = seq[fromIdx]?.scheduled_time;
      const toTime = seq[toIdx]?.scheduled_time;
      if (fromTime && toTime) {
        travelTimeMin = parseTime24ToMinutes(toTime) - parseTime24ToMinutes(fromTime);
        if (travelTimeMin < 0) travelTimeMin = null;
      }

      const totalTimeMin = etaToOriginMin != null && travelTimeMin != null
        ? etaToOriginMin + travelTimeMin
        : null;

      // Next departure if no active bus
      let nextDepartureTime: string | null = null;
      if (!hasActiveBus && fromTime) {
        const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
        const depMins = parseTime24ToMinutes(fromTime);
        if (depMins > nowMins) {
          nextDepartureTime = fromTime;
        }
      }

      found.push({
        routeId: route.id,
        routeName: route.name,
        routeColor: route.colorHex,
        fromStop,
        toStop,
        hasActiveBus,
        etaToOriginMin,
        etaLabel,
        travelTimeMin,
        totalTimeMin,
        nextDepartureTime,
        occupancy: tripOccupancy,
      });
    }

    setResults(found);
    setSearched(true);
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Plan Your Journey</h3>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">From</label>
            <select
              value={fromId}
              onChange={(e) => { setFromId(e.target.value); setResults(null); setSearched(false); }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
            >
              <option value="">Select stop</option>
              {sortedStops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">To</label>
            <select
              value={toId}
              onChange={(e) => { setToId(e.target.value); setResults(null); setSearched(false); }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
            >
              <option value="">Select stop</option>
              {sortedStops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <button
          onClick={swap}
          className="mt-4 p-2 rounded-lg hover:bg-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Swap stops"
        >
          <ArrowDownUp className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      <button
        onClick={search}
        disabled={!fromId || !toId || fromId === toId}
        className="w-full rounded-lg bg-primary text-primary-foreground font-medium py-2.5 text-sm transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2"
      >
        <Search className="h-4 w-4" />
        Find Bus
      </button>

      {searched && results !== null && (
        <div className="space-y-3 pt-1">
          {results.length === 0 ? (
            <div className="text-center py-4 space-y-1">
              <XCircle className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium text-foreground">No direct bus between these stops</p>
              <p className="text-xs text-muted-foreground">Consider walking to a nearby stop or checking a different time.</p>
            </div>
          ) : (
            results.map((r) => (
              <div key={r.routeId} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <span className="text-sm font-semibold text-foreground">Route Found</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-1 h-8 rounded-full" style={{ backgroundColor: r.routeColor }} />
                  <div>
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1"><Bus className="h-3.5 w-3.5" /> {r.routeName}</p>
                  </div>
                </div>

                <div className="text-sm space-y-1 pl-3">
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Board at:</span> {r.fromStop.name}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Alight at:</span> {r.toStop.name}
                  </p>
                </div>

                {r.hasActiveBus ? (
                  <div className="bg-muted/40 rounded-lg p-2.5 text-sm space-y-1">
                    {r.etaToOriginMin != null && (
                      <p className="text-foreground">
                        <Clock className="h-3.5 w-3.5 inline mr-1" />
                        Bus arrives at {r.fromStop.name} in {formatMinutes(r.etaToOriginMin)}
                      </p>
                    )}
                    {r.travelTimeMin != null && (
                      <p className="text-muted-foreground">Journey time: {formatMinutes(r.travelTimeMin)}</p>
                    )}
                    {r.totalTimeMin != null && (
                      <p className="font-medium text-foreground">Arrive at destination: {formatMinutes(r.totalTimeMin)}</p>
                    )}
                    {r.occupancy && (
                      <p className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getOccupancyPillClasses(r.occupancy.level)}`}>
                          {r.occupancy.label}
                        </span>
                      </p>
                    )}
                  </div>
                ) : r.nextDepartureTime ? (
                  <div className="bg-muted/40 rounded-lg p-2.5 text-sm">
                    <p className="text-foreground">
                      <Clock className="h-3.5 w-3.5 inline mr-1" />
                      Next bus at {formatTime12(r.nextDepartureTime)}
                    </p>
                  </div>
                ) : (
                  <div className="bg-muted/40 rounded-lg p-2.5 text-sm">
                    <p className="text-muted-foreground">No active bus on this route right now</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
