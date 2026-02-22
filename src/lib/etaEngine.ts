/**
 * etaEngine.ts – Route-aware ETA with rolling speed, bus state detection,
 * confidence levels, and scheduled-time fallback.
 */

import type { BusLocation, Stop, RouteInfo } from "@/hooks/useMapData";

/* ───── Types ───── */

export interface LocationPing {
  lat: number;
  lng: number;
  timestamp: string;
  speed_kmh?: number;
}

export type BusState = "moving" | "slowing" | "stopped" | "stale" | "unknown";

export type ETAType =
  | "arriving"
  | "stopped"
  | "passed"
  | "stale"
  | "not_on_route"
  | "far"
  | "eta"
  | "no_data";

export interface ETAResult {
  busId: string;
  busName: string;
  routeName: string;
  routeColor: string;
  tripId: string;
  type: ETAType;
  message: string;
  minutes: number | null;
  distanceKm: number | null;
  routeProgressPercent: number | null;
  speedKmh: number | null;
  confidence: "high" | "low";
  timestamp: string;
  lastSeenAgo: string;
  accuracyM: number | null;
}

/* ───── Haversine ───── */

export function haversineDistance(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ───── Ping History (in-memory per bus) ───── */

const MAX_HISTORY = 10;
const busHistory = new Map<string, LocationPing[]>();

export function recordPing(busId: string, ping: LocationPing) {
  const history = busHistory.get(busId) ?? [];
  // Deduplicate by timestamp
  if (history.length > 0 && history[0].timestamp === ping.timestamp) return;
  history.unshift(ping);
  busHistory.set(busId, history.slice(0, MAX_HISTORY));
}

export function seedHistory(busId: string, pings: LocationPing[]) {
  const existing = busHistory.get(busId) ?? [];
  const existingTs = new Set(existing.map((p) => p.timestamp));
  const newPings = pings.filter((p) => !existingTs.has(p.timestamp));
  const merged = [...existing, ...newPings]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_HISTORY);
  busHistory.set(busId, merged);
}

export function getPingHistory(busId: string): LocationPing[] {
  return busHistory.get(busId) ?? [];
}

/* ───── Rolling Speed Average ───── */

export function getRollingSpeed(pings: LocationPing[]): number | null {
  const now = Date.now();
  const recent = pings.filter(
    (p) => now - new Date(p.timestamp).getTime() < 60000,
  );

  if (recent.length < 2) return null;

  const speeds: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const dist = haversineDistance(
      recent[i - 1].lat, recent[i - 1].lng,
      recent[i].lat, recent[i].lng,
    );
    const timeDiffH =
      (new Date(recent[i - 1].timestamp).getTime() -
        new Date(recent[i].timestamp).getTime()) /
      3600000;

    if (timeDiffH > 0) {
      speeds.push(dist / timeDiffH);
    }
  }

  if (speeds.length === 0) return null;

  // Weighted average — recent pings weighted more
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < speeds.length; i++) {
    const weight = i + 1;
    weightedSum += speeds[i] * weight;
    weightTotal += weight;
  }

  return weightedSum / weightTotal;
}

/* ───── Bus State Detection ───── */

export function getBusState(pings: LocationPing[]): BusState {
  if (pings.length === 0) return "unknown";

  const latest = pings[0];
  const ageMs = Date.now() - new Date(latest.timestamp).getTime();

  if (ageMs > 120000) return "stale";

  const speed = getRollingSpeed(pings);
  if (speed === null) return "unknown";
  if (speed < 2) return "stopped";
  if (speed < 5) return "slowing";
  return "moving";
}

/* ───── Parse Stop Sequence ───── */

interface StopSeqEntry {
  stop_id: string;
  scheduled_time?: string;
}

function parseStopSeq(raw: unknown): StopSeqEntry[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === "string")
    return (raw as string[]).map((id) => ({ stop_id: id }));
  return (raw as any[])
    .map((item) => ({
      stop_id: (item?.stop_id ?? "") as string,
      scheduled_time: item?.scheduled_time as string | undefined,
    }))
    .filter((x) => x.stop_id);
}

/* ───── Route-Aware ETA Calculation ───── */

export function calculateRouteETA(
  bus: BusLocation,
  targetStop: Stop,
  route: RouteInfo,
  allStops: Stop[],
  pings: LocationPing[],
): ETAResult {
  const base = {
    busId: bus.busId,
    busName: bus.busName,
    routeName: bus.routeName,
    routeColor: bus.routeColor ?? "#3b82f6",
    tripId: bus.tripId,
    timestamp: bus.timestamp,
    lastSeenAgo: formatTimeAgo(bus.timestamp),
    accuracyM: null as number | null,
    speedKmh: null as number | null,
    distanceKm: null as number | null,
    routeProgressPercent: null as number | null,
    confidence: "low" as "high" | "low",
  };

  const state = getBusState(pings);

  if (state === "stale") {
    return {
      ...base,
      type: "stale",
      message: "Bus location unavailable",
      minutes: null,
    };
  }

  // Get ordered stops from route
  const stopMap = new Map(allStops.map((s) => [s.id, s]));
  const seqIds = route.stopSequence ?? [];
  const orderedStops = seqIds
    .map((id) => stopMap.get(id))
    .filter(Boolean) as Stop[];

  if (orderedStops.length === 0) {
    // Fallback: straight-line distance
    const dist = haversineDistance(bus.lat, bus.lng, targetStop.lat, targetStop.lng);
    const speed = getRollingSpeed(pings) ?? 25;
    const mins = Math.round((dist / Math.max(speed, 1)) * 60);
    return {
      ...base,
      type: mins <= 0 ? "arriving" : "eta",
      message: mins <= 0 ? "Arriving now" : `Arriving in ~${mins} min`,
      minutes: mins,
      distanceKm: Math.round(dist * 10) / 10,
      speedKmh: Math.round(speed),
      confidence: pings.length >= 5 ? "high" : "low",
    };
  }

  // Find bus's nearest stop index
  let nearestIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < orderedStops.length; i++) {
    const d = haversineDistance(bus.lat, bus.lng, orderedStops[i].lat, orderedStops[i].lng);
    if (d < minDist) {
      minDist = d;
      nearestIdx = i;
    }
  }

  // Find target stop index
  const targetIdx = orderedStops.findIndex((s) => s.id === targetStop.id);
  if (targetIdx === -1) {
    return {
      ...base,
      type: "not_on_route",
      message: "Stop not on this route",
      minutes: null,
    };
  }

  // Bus passed the stop
  if (nearestIdx > targetIdx) {
    return {
      ...base,
      type: "passed",
      message: "Bus has passed this stop",
      minutes: null,
    };
  }

  if (state === "stopped") {
    return {
      ...base,
      type: "stopped",
      message: "Bus is currently stopped",
      minutes: null,
      speedKmh: 0,
    };
  }

  // Calculate route distance: bus → nearest stop → ... → target
  let totalDist = haversineDistance(
    bus.lat, bus.lng,
    orderedStops[nearestIdx].lat, orderedStops[nearestIdx].lng,
  );
  for (let i = nearestIdx; i < targetIdx; i++) {
    totalDist += haversineDistance(
      orderedStops[i].lat, orderedStops[i].lng,
      orderedStops[i + 1].lat, orderedStops[i + 1].lng,
    );
  }

  // Calculate total route distance for progress
  let fullRouteDist = 0;
  for (let i = 0; i < orderedStops.length - 1; i++) {
    fullRouteDist += haversineDistance(
      orderedStops[i].lat, orderedStops[i].lng,
      orderedStops[i + 1].lat, orderedStops[i + 1].lng,
    );
  }
  let coveredDist = 0;
  for (let i = 0; i < nearestIdx && i < orderedStops.length - 1; i++) {
    coveredDist += haversineDistance(
      orderedStops[i].lat, orderedStops[i].lng,
      orderedStops[i + 1].lat, orderedStops[i + 1].lng,
    );
  }
  const progressPercent =
    fullRouteDist > 0 ? Math.round((coveredDist / fullRouteDist) * 100) : 0;

  const rollingSpeed = getRollingSpeed(pings);
  const effectiveSpeed = rollingSpeed ?? 25; // Urban bus default only if truly unknown
  const recentPingCount = pings.filter(
    (p) => Date.now() - new Date(p.timestamp).getTime() < 60000,
  ).length;
  const confidence: "high" | "low" = recentPingCount >= 5 && rollingSpeed !== null ? "high" : "low";

  const etaMins = Math.round((totalDist / Math.max(effectiveSpeed, 1)) * 60);

  if (etaMins <= 0) {
    return {
      ...base,
      type: "arriving",
      message: "Arriving now",
      minutes: 0,
      distanceKm: Math.round(totalDist * 10) / 10,
      routeProgressPercent: progressPercent,
      speedKmh: Math.round(effectiveSpeed),
      confidence,
    };
  }

  if (etaMins > 120) {
    return {
      ...base,
      type: "far",
      message: "More than 2 hours away",
      minutes: etaMins,
      distanceKm: Math.round(totalDist * 10) / 10,
      routeProgressPercent: progressPercent,
      speedKmh: Math.round(effectiveSpeed),
      confidence,
    };
  }

  return {
    ...base,
    type: "eta",
    message: `Arriving in ~${etaMins} min`,
    minutes: etaMins,
    distanceKm: Math.round(totalDist * 10) / 10,
    routeProgressPercent: progressPercent,
    speedKmh: Math.round(effectiveSpeed),
    confidence,
  };
}

/* ───── Calculate ETAs for all buses serving a stop ───── */

export function calculateETAsForStop(
  stop: Stop,
  buses: BusLocation[],
  routes: RouteInfo[],
  allStops: Stop[],
): ETAResult[] {
  const routeMap = new Map(routes.map((r) => [r.id, r]));

  // Routes that serve this stop
  const servingRoutes = routes.filter(
    (r) => !r.stopSequence || r.stopSequence.includes(stop.id),
  );
  const servingRouteIds = new Set(servingRoutes.map((r) => r.id));

  const relevantBuses = buses.filter((b) => servingRouteIds.has(b.routeId));
  if (relevantBuses.length === 0) return [];

  const results: ETAResult[] = [];

  for (const bus of relevantBuses) {
    const route = routeMap.get(bus.routeId);
    if (!route) continue;

    const pings = getPingHistory(bus.busId);
    const result = calculateRouteETA(bus, stop, route, allStops, pings);
    results.push(result);
  }

  // Sort: arriving > eta > stopped > stale > passed > far
  const typePriority: Record<ETAType, number> = {
    arriving: 0,
    eta: 1,
    stopped: 2,
    no_data: 3,
    stale: 4,
    far: 5,
    passed: 6,
    not_on_route: 7,
  };

  results.sort((a, b) => {
    const pa = typePriority[a.type] ?? 99;
    const pb = typePriority[b.type] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.minutes ?? 999) - (b.minutes ?? 999);
  });

  return results;
}

/* ───── Helpers ───── */

function formatTimeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/* ───── Backward-compatible exports (same names as old eta.ts) ───── */

// BusETA alias for backward compatibility where components expect the old shape
export interface BusETA extends ETAResult {
  etaMinutes: number;
  label: string;
  stale: boolean;
  passed: boolean;
}

export function tolegacyETA(result: ETAResult): BusETA {
  return {
    ...result,
    etaMinutes: result.minutes ?? 999,
    label: result.message,
    stale: result.type === "stale",
    passed: result.type === "passed",
  };
}

/** Drop-in replacement for old calculateETAsForStop that returns BusETA[] */
export function calculateETAsForStopLegacy(
  stop: Stop,
  buses: BusLocation[],
  routes: RouteInfo[],
  allStops: Stop[],
): BusETA[] {
  return calculateETAsForStop(stop, buses, routes, allStops).map(tolegacyETA);
}
