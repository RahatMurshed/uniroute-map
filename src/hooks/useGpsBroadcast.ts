import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GpsPoint {
  bus_id: string;
  trip_id: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  heading: number;
  accuracy_m: number;
  timestamp: string;
}

interface UseGpsBroadcastOptions {
  busId: string;
  tripId: string;
  active: boolean;
}

const QUEUE_KEY = "uniroute_gps_queue";

function loadQueue(): GpsPoint[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveQueue(q: GpsPoint[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function useGpsBroadcast({ busId, tripId, active }: UseGpsBroadcastOptions) {
  const [pingCount, setPingCount] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [lowBattery, setLowBattery] = useState(false);
  const [reconnectMsg, setReconnectMsg] = useState<string | null>(null);

  const latestCoords = useRef<GeolocationCoordinates | null>(null);
  const watchId = useRef<number | null>(null);
  const intervalId = useRef<ReturnType<typeof setInterval> | null>(null);
  const batteryIntervalId = useRef<ReturnType<typeof setInterval> | null>(null);
  const lowBatteryRef = useRef(false);
  const { toast } = useToast();

  const cleanup = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (intervalId.current !== null) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }
    if (batteryIntervalId.current !== null) {
      clearInterval(batteryIntervalId.current);
      batteryIntervalId.current = null;
    }
    latestCoords.current = null;
  }, []);

  useEffect(() => {
    if (!active || !busId || !tripId) {
      cleanup();
      return;
    }

    setGpsError(null);
    setPingCount(0);
    setReconnectMsg(null);

    // Start watching position
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
          setGpsError(
            "GPS access denied. Please enable location permissions in your browser settings to use the driver app."
          );
        } else {
          setGpsError(`GPS error: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000 }
    );

    // Battery monitoring
    const checkBattery = async () => {
      try {
        const nav = navigator as any;
        if (nav.getBattery) {
          const battery = await nav.getBattery();
          const isLow = battery.level < 0.2;
          lowBatteryRef.current = isLow;
          setLowBattery(isLow);
        }
      } catch {
        // not supported
      }
    };
    checkBattery();
    batteryIntervalId.current = setInterval(checkBattery, 30000);

    // Flush queue helper
    const flushQueue = async () => {
      const queue = loadQueue();
      if (queue.length === 0) return;
      const { error } = await supabase.from("live_locations").insert(queue);
      if (!error) {
        const count = queue.length;
        saveQueue([]);
        setReconnectMsg(`📡 Reconnected — ${count} queued ping${count > 1 ? "s" : ""} sent`);
        setPingCount((c) => c + count);
        setTimeout(() => setReconnectMsg(null), 4000);
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

      // Try flush first
      await flushQueue();

      const { error } = await supabase.from("live_locations").insert(point);
      if (error) {
        // Queue it
        const queue = loadQueue();
        queue.push(point);
        saveQueue(queue);
      } else {
        setPingCount((c) => c + 1);
        // Fire-and-forget: trigger proximity push notifications
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        if (projectId) {
          fetch(`https://${projectId}.supabase.co/functions/v1/send-push-notifications`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "proximity", trip_id: tripId, bus_id: busId, lat: point.lat, lng: point.lng }),
          }).catch(() => {}); // silent
        }
      }
    };

    // Dynamic interval based on battery
    const startInterval = () => {
      if (intervalId.current !== null) clearInterval(intervalId.current);
      const ms = lowBatteryRef.current ? 15000 : 5000;
      intervalId.current = setInterval(sendPing, ms);
    };

    startInterval();

    // Re-check interval when battery state changes
    const batteryCheck = setInterval(() => {
      const currentMs = lowBatteryRef.current ? 15000 : 5000;
      // We just restart the interval periodically to adapt
      if (intervalId.current !== null) {
        clearInterval(intervalId.current);
      }
      intervalId.current = setInterval(sendPing, currentMs);
    }, 30000);

    return () => {
      cleanup();
      clearInterval(batteryCheck);
    };
  }, [active, busId, tripId, cleanup]);

  return { pingCount, gpsError, lowBattery, reconnectMsg, cleanup };
}
