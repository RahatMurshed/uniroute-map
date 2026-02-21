import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface GpsPoint {
  bus_id: string;
  trip_id: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  heading: number;
  accuracy_m: number;
  timestamp: string;
  queued_at?: string;
}

interface UseGpsBroadcastOptions {
  busId: string;
  tripId: string;
  active: boolean;
}

const QUEUE_KEY = "uniroute_gps_queue";
const MAX_QUEUE = 100;

function loadQueue(): GpsPoint[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveQueue(q: GpsPoint[]) {
  // Keep only most recent MAX_QUEUE
  const trimmed = q.length > MAX_QUEUE ? q.slice(-MAX_QUEUE) : q;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
}

export type BatteryTier = "normal" | "reduced" | "minimal" | "charging";

function getTier(level: number, charging: boolean): BatteryTier {
  if (charging) return "charging";
  if (level < 0.2) return "minimal";
  if (level < 0.5) return "reduced";
  return "normal";
}

function getIntervalMs(tier: BatteryTier): number {
  switch (tier) {
    case "minimal": return 15000;
    case "reduced": return 10000;
    default: return 5000;
  }
}

export function useGpsBroadcast({ busId, tripId, active }: UseGpsBroadcastOptions) {
  const [pingCount, setPingCount] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [batteryTier, setBatteryTier] = useState<BatteryTier>("normal");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueSize, setQueueSize] = useState(loadQueue().length);
  const [flushProgress, setFlushProgress] = useState<string | null>(null);
  const [reconnectMsg, setReconnectMsg] = useState<string | null>(null);
  const [queueTrimmed, setQueueTrimmed] = useState(false);

  const latestCoords = useRef<GeolocationCoordinates | null>(null);
  const watchId = useRef<number | null>(null);
  const intervalId = useRef<ReturnType<typeof setInterval> | null>(null);
  const batteryRef = useRef<any>(null);
  const tierRef = useRef<BatteryTier>("normal");
  const flushingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (intervalId.current !== null) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }
    latestCoords.current = null;
  }, []);

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Flush queue when coming back online
  useEffect(() => {
    if (isOnline && active) {
      flushQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, active]);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return;
    const queue = loadQueue();
    if (queue.length === 0) return;

    flushingRef.current = true;
    const total = queue.length;
    let sent = 0;

    for (let i = 0; i < queue.length; i++) {
      setFlushProgress(`Sending ${i + 1} of ${total}…`);
      const { error } = await supabase.from("live_locations").insert(queue[i]);
      if (error) {
        // Stop on first failure, keep remaining
        const remaining = queue.slice(i);
        saveQueue(remaining);
        setQueueSize(remaining.length);
        setFlushProgress(null);
        flushingRef.current = false;
        return;
      }
      sent++;
    }

    saveQueue([]);
    setQueueSize(0);
    setFlushProgress(null);
    setPingCount((c) => c + sent);
    setReconnectMsg(`✅ Connected — ${sent} queued ping${sent > 1 ? "s" : ""} sent`);
    setTimeout(() => setReconnectMsg(null), 3000);
    flushingRef.current = false;
  }, []);

  // Restart interval when tier changes
  const restartInterval = useCallback((sendFn: () => void) => {
    if (intervalId.current !== null) clearInterval(intervalId.current);
    intervalId.current = setInterval(sendFn, getIntervalMs(tierRef.current));
  }, []);

  useEffect(() => {
    if (!active || !busId || !tripId) {
      cleanup();
      return;
    }

    setGpsError(null);
    setPingCount(0);
    setReconnectMsg(null);
    setQueueTrimmed(false);

    // GPS watch
    if (!navigator.geolocation) {
      setGpsError("GPS is not supported by your browser.");
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestCoords.current = pos.coords;
        setGpsError(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError("GPS access denied. Please enable location permissions in your browser settings.");
        } else {
          setGpsError(`GPS error: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000 }
    );

    // Battery monitoring with event listeners
    const setupBattery = async () => {
      try {
        const nav = navigator as any;
        if (!nav.getBattery) return;
        const battery = await nav.getBattery();
        batteryRef.current = battery;

        const update = () => {
          const newTier = getTier(battery.level, battery.charging);
          tierRef.current = newTier;
          setBatteryTier(newTier);
          // Restart interval with new timing
          restartInterval(sendPing);
        };

        update();
        battery.addEventListener("levelchange", update);
        battery.addEventListener("chargingchange", update);
      } catch {
        // Battery API not supported
      }
    };

    // Send ping
    const sendPing = async () => {
      const coords = latestCoords.current;
      if (!coords) return;

      const point: GpsPoint = {
        bus_id: busId,
        trip_id: tripId,
        lat: coords.latitude,
        lng: coords.longitude,
        speed_kmh: coords.speed != null ? Math.round(coords.speed * 3.6 * 100) / 100 : 0,
        heading: coords.heading != null ? Math.round(coords.heading * 100) / 100 : 0,
        accuracy_m: coords.accuracy != null ? Math.round(coords.accuracy) : 0,
        timestamp: new Date().toISOString(),
      };

      if (!navigator.onLine) {
        // Queue it
        const queue = loadQueue();
        queue.push({ ...point, queued_at: new Date().toISOString() });
        if (queue.length > MAX_QUEUE) {
          setQueueTrimmed(true);
        }
        saveQueue(queue);
        setQueueSize(Math.min(queue.length, MAX_QUEUE));
        return;
      }

      // Try flush first
      await flushQueue();

      const { error } = await supabase.from("live_locations").insert(point);
      if (error) {
        const queue = loadQueue();
        queue.push({ ...point, queued_at: new Date().toISOString() });
        saveQueue(queue);
        setQueueSize(Math.min(queue.length, MAX_QUEUE));
      } else {
        setPingCount((c) => c + 1);
        // Fire-and-forget push notification
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        if (projectId) {
          fetch(`https://${projectId}.supabase.co/functions/v1/send-push-notifications`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "proximity", trip_id: tripId, bus_id: busId, lat: point.lat, lng: point.lng }),
          }).catch(() => {});
        }
      }
    };

    setupBattery();
    // Start interval
    intervalId.current = setInterval(sendPing, getIntervalMs(tierRef.current));

    return () => {
      cleanup();
      if (batteryRef.current) {
        try {
          batteryRef.current.removeEventListener("levelchange", () => {});
          batteryRef.current.removeEventListener("chargingchange", () => {});
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, busId, tripId, cleanup]);

  return {
    pingCount,
    gpsError,
    batteryTier,
    isOnline,
    queueSize,
    flushProgress,
    reconnectMsg,
    queueTrimmed,
    cleanup,
  };
}
