import { useMemo } from "react";
import { Clock, Moon, Calendar, MapPin, Bus } from "lucide-react";
import type { RouteInfo, BusLocation } from "@/hooks/useMapData";

interface ServiceInfoProps {
  routes: RouteInfo[];
  buses: BusLocation[];
  rawRoutes: Map<string, { stop_id: string; scheduled_time?: string }[]>;
  onViewSchedule?: () => void;
  stopMap?: Map<string, { name: string }>;
}

function parseTime24ToMinutes(time24: string): number {
  const [hh, mm] = time24.split(":").map(Number);
  return hh * 60 + mm;
}

function formatTime12(time24: string): string {
  const [hh, mm] = time24.split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return time24;
  const period = hh >= 12 ? "PM" : "AM";
  const h = hh % 12 || 12;
  return `${h}:${mm.toString().padStart(2, "0")} ${period}`;
}

function minutesToHuman(mins: number): string {
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function isTodayActive(days: number[] | null): boolean {
  if (!days || days.length === 0) return true;
  const jsDay = new Date().getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  return days.includes(isoDay);
}

function formatActiveDays(days: number[] | null): string {
  if (!days || days.length === 0) return "Every Day";
  const sorted = [...days].sort((a, b) => a - b);
  const key = sorted.join(",");
  if (key === "1,2,3,4,5,6,7") return "Every Day";
  if (key === "1,2,3,4,5,6") return "Mon – Sat";
  if (key === "1,2,3,4,5") return "Mon – Fri";
  if (key === "6,7") return "Weekends Only";
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return sorted.map((d) => names[d] || `Day ${d}`).join(", ");
}

export type RouteServiceStatus = {
  routeId: string;
  status: "active" | "starting_soon" | "waiting" | "ended" | "not_today";
  label: string;
  nextDepartureTime: string | null;
  minutesUntilNext: number | null;
};

export function getRouteServiceStatus(
  route: RouteInfo,
  buses: BusLocation[],
  rawSeq: { stop_id: string; scheduled_time?: string }[] | undefined
): RouteServiceStatus {
  const routeId = route.id;
  const todayActive = isTodayActive(route.activeDays ?? null);
  
  if (!todayActive) {
    return { routeId, status: "not_today", label: "Not running today", nextDepartureTime: null, minutesUntilNext: null };
  }

  const routeBuses = buses.filter((b) => b.routeId === routeId);
  if (routeBuses.length > 0) {
    return { routeId, status: "active", label: "Service Active", nextDepartureTime: null, minutesUntilNext: null };
  }

  if (!rawSeq || rawSeq.length === 0) {
    return { routeId, status: "waiting", label: "No schedule data", nextDepartureTime: null, minutesUntilNext: null };
  }

  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const times = rawSeq.filter((s) => s.scheduled_time).map((s) => s.scheduled_time!);
  
  if (times.length === 0) {
    return { routeId, status: "waiting", label: "No scheduled times", nextDepartureTime: null, minutesUntilNext: null };
  }

  // First departure (earliest scheduled time)
  const firstTime = times.reduce((min, t) => parseTime24ToMinutes(t) < parseTime24ToMinutes(min) ? t : min);
  // Last departure (latest scheduled time)
  const lastTime = times.reduce((max, t) => parseTime24ToMinutes(t) > parseTime24ToMinutes(max) ? t : max);
  const lastMins = parseTime24ToMinutes(lastTime);

  if (nowMins > lastMins + 15) {
    return {
      routeId,
      status: "ended",
      label: "No more buses today",
      nextDepartureTime: firstTime,
      minutesUntilNext: null,
    };
  }

  // Find next departure after now
  const futureTimes = times.filter((t) => parseTime24ToMinutes(t) > nowMins);
  if (futureTimes.length > 0) {
    const nextTime = futureTimes.reduce((min, t) => parseTime24ToMinutes(t) < parseTime24ToMinutes(min) ? t : min);
    const minsUntil = parseTime24ToMinutes(nextTime) - nowMins;

    if (minsUntil <= 30) {
      return {
        routeId,
        status: "starting_soon",
        label: `Starting in ${minutesToHuman(minsUntil)}`,
        nextDepartureTime: nextTime,
        minutesUntilNext: minsUntil,
      };
    }

    return {
      routeId,
      status: "waiting",
      label: `${minutesToHuman(minsUntil)} until next bus`,
      nextDepartureTime: nextTime,
      minutesUntilNext: minsUntil,
    };
  }

  return { routeId, status: "ended", label: "No more buses today", nextDepartureTime: firstTime, minutesUntilNext: null };
}

/** Map page "no active buses" banner with next bus info */
export function NoActiveBusesBanner({ routes, buses, rawRoutes, onViewSchedule, stopMap }: ServiceInfoProps) {
  const nextBus = useMemo(() => {
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    let best: { routeName: string; stopName: string; time: string; minsAway: number } | null = null;

    for (const route of routes) {
      if (!isTodayActive(route.activeDays ?? null)) continue;
      const seq = rawRoutes.get(route.id);
      if (!seq) continue;

      for (const entry of seq) {
        if (!entry.scheduled_time) continue;
        const mins = parseTime24ToMinutes(entry.scheduled_time);
        const diff = mins - nowMins;
        if (diff > 0 && (!best || diff < best.minsAway)) {
          const name = stopMap?.get(entry.stop_id)?.name ?? "Stop";
          best = { routeName: route.name, stopName: name, time: entry.scheduled_time, minsAway: diff };
        }
      }
    }
    return best;
  }, [routes, rawRoutes, stopMap]);

  // Service hours
  const serviceHours = useMemo(() => {
    let earliest = Infinity;
    let latest = -Infinity;

    for (const route of routes) {
      const seq = rawRoutes.get(route.id);
      if (!seq) continue;
      for (const entry of seq) {
        if (!entry.scheduled_time) continue;
        const mins = parseTime24ToMinutes(entry.scheduled_time);
        if (mins < earliest) earliest = mins;
        if (mins > latest) latest = mins;
      }
    }

    if (earliest === Infinity) return null;
    const toTime = (m: number) => {
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
    };
    return { first: formatTime12(toTime(earliest)), last: formatTime12(toTime(latest)) };
  }, [routes, rawRoutes]);

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[1000] rounded-2xl bg-card/95 backdrop-blur-xl shadow-lg border border-border/50 px-5 py-4 max-w-xs pointer-events-auto mt-2 space-y-3">
      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Clock className="h-4 w-4 text-muted-foreground" /> No buses currently active</p>

      {nextBus && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Next departure</p>
          <p className="text-sm font-semibold text-foreground flex items-center gap-1"><Bus className="h-3.5 w-3.5" /> {nextBus.routeName}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> From {nextBus.stopName} at {formatTime12(nextBus.time)}</p>
          <p className="text-xs font-medium text-primary">Starts in {minutesToHuman(nextBus.minsAway)}</p>
        </div>
      )}

      {serviceHours && (
        <div className="border-t border-border pt-2 space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Service hours today</p>
          <p className="text-xs text-foreground">First bus: {serviceHours.first}</p>
          <p className="text-xs text-foreground">Last bus: {serviceHours.last}</p>
        </div>
      )}

      {onViewSchedule && (
        <button
          onClick={onViewSchedule}
          className="text-sm font-semibold text-primary hover:underline min-h-[44px] flex items-center"
        >
          View Full Schedule →
        </button>
      )}
    </div>
  );
}

/** Schedule tab service info footer */
export function ServiceInfoFooter({ routes, rawRoutes }: { routes: RouteInfo[]; rawRoutes: Map<string, { stop_id: string; scheduled_time?: string }[]> }) {
  const serviceHours = useMemo(() => {
    let earliest = Infinity;
    let latest = -Infinity;
    const activeDaysSets: number[][] = [];

    for (const route of routes) {
      if (route.activeDays) activeDaysSets.push(route.activeDays);
      const seq = rawRoutes.get(route.id);
      if (!seq) continue;
      for (const entry of seq) {
        if (!entry.scheduled_time) continue;
        const mins = parseTime24ToMinutes(entry.scheduled_time);
        if (mins < earliest) earliest = mins;
        if (mins > latest) latest = mins;
      }
    }

    if (earliest === Infinity) return null;
    const toTime = (m: number) => {
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
    };

    // Common days
    const allDays = activeDaysSets.length > 0
      ? activeDaysSets.reduce((a, b) => a.filter((d) => b.includes(d)))
      : [1, 2, 3, 4, 5, 6, 7];

    return {
      first: formatTime12(toTime(earliest)),
      last: formatTime12(toTime(latest)),
      days: formatActiveDays(allDays),
    };
  }, [routes, rawRoutes]);

  if (!serviceHours) return null;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-2">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <Clock className="h-4 w-4 text-muted-foreground" /> Service Information
      </h3>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>First bus: {serviceHours.first} ({serviceHours.days})</p>
        <p>Last bus: {serviceHours.last} ({serviceHours.days})</p>
      </div>
    </div>
  );
}

/** Route card status badge */
export function RouteStatusBadge({ status }: { status: RouteServiceStatus }) {
  switch (status.status) {
    case "active":
      return (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 flex items-center gap-1">
          <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" /></span>
          ACTIVE
        </span>
      );
    case "starting_soon":
      return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20 flex items-center gap-1"><Clock className="h-3 w-3" /> {status.label}</span>;
    case "waiting":
      return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> {status.label}</span>;
    case "ended":
      return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1"><Moon className="h-3 w-3" /> {status.label}</span>;
    case "not_today":
      return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> {status.label}</span>;
  }
}
