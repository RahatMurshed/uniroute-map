import type { BusLocation, Stop, RouteInfo } from "@/hooks/useMapData";

/* ── Haversine distance (km) ── */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ── Rolling-average speed tracker ── */
const speedHistory = new Map<string, number[]>();
const MAX_PINGS = 3;
const DEFAULT_SPEED = 20; // km/h

export function recordSpeed(busId: string, speed: number) {
  const arr = speedHistory.get(busId) ?? [];
  arr.push(speed);
  if (arr.length > MAX_PINGS) arr.shift();
  speedHistory.set(busId, arr);
}

export function getAverageSpeed(busId: string): number {
  const arr = speedHistory.get(busId);
  if (!arr || arr.length === 0) return DEFAULT_SPEED;
  const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
  return avg < 5 ? DEFAULT_SPEED : avg;
}

/* ── ETA result per bus ── */
export interface BusETA {
  busId: string;
  busName: string;
  routeName: string;
  etaMinutes: number;
  label: string;
  timestamp: string; // last ping ts
  stale: boolean; // ping > 2 min old
  passed: boolean; // bus already passed the stop
}

/* ── Check if bus already passed the stop ── */
function hasBusPassed(
  bus: BusLocation,
  stop: Stop,
  route: RouteInfo,
  stops: Stop[],
): boolean {
  const seq = route.stopSequence;
  if (!seq || seq.length < 2) return false;

  const stopIdx = seq.indexOf(stop.id);
  if (stopIdx === -1) return false;

  // Find position of the stop closest to the bus in the sequence
  const stopMap = new Map(stops.map((s) => [s.id, s]));
  let minDist = Infinity;
  let closestIdx = -1;
  for (let i = 0; i < seq.length; i++) {
    const s = stopMap.get(seq[i]);
    if (!s) continue;
    const d = haversineDistance(bus.lat, bus.lng, s.lat, s.lng);
    if (d < minDist) {
      minDist = d;
      closestIdx = i;
    }
  }
  return closestIdx > stopIdx;
}

/* ── Format ETA label ── */
function formatETA(minutes: number, stale: boolean, passed: boolean): string {
  if (stale) return "Bus location unavailable";
  if (passed) return "🚌 Bus has passed this stop";
  if (minutes < 1) return "Arriving now 🟢";
  if (minutes <= 2) return "Arriving in ~1-2 min 🟡";
  if (minutes > 60) return "No bus nearby";
  return `Arriving in ~${Math.round(minutes)} min 🚌`;
}

/* ── Main: calculate ETAs for a selected stop ── */
export function calculateETAsForStop(
  stop: Stop,
  buses: BusLocation[],
  routes: RouteInfo[],
  allStops: Stop[],
): BusETA[] {
  const routeMap = new Map(routes.map((r) => [r.id, r]));

  // Find routes that serve this stop
  // If route has stopSequence, check if stop is in it; if null, treat as serving all stops
  const servingRoutes = routes.filter(
    (r) => !r.stopSequence || r.stopSequence.includes(stop.id),
  );
  const servingRouteIds = new Set(servingRoutes.map((r) => r.id));

  // Filter buses on those routes
  const relevantBuses = buses.filter((b) => servingRouteIds.has(b.routeId));

  console.log("[ETA] Stop:", stop.id, stop.name, "| Serving routes:", servingRoutes.map(r => r.name), "| Buses:", relevantBuses.length);

  if (relevantBuses.length === 0) return [];

  const results: BusETA[] = [];

  for (const bus of relevantBuses) {
    const route = routeMap.get(bus.routeId)!;
    const dist = haversineDistance(bus.lat, bus.lng, stop.lat, stop.lng);
    const speed = getAverageSpeed(bus.busId);
    const etaMinutes = (dist / speed) * 60;
    const ageMs = Date.now() - new Date(bus.timestamp).getTime();
    const stale = ageMs > 2 * 60 * 1000;
    const passed = hasBusPassed(bus, stop, route, allStops);

    results.push({
      busId: bus.busId,
      busName: bus.busName,
      routeName: bus.routeName,
      etaMinutes,
      label: formatETA(etaMinutes, stale, passed),
      timestamp: bus.timestamp,
      stale,
      passed,
    });
  }

  // Sort: non-passed first, then by ETA
  results.sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? 1 : -1;
    if (a.stale !== b.stale) return a.stale ? 1 : -1;
    return a.etaMinutes - b.etaMinutes;
  });

  return results;
}
