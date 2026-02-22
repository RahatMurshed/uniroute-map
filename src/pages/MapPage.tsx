import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMapData, type BusLocation, type Stop } from "@/hooks/useMapData";
import { calculateETAsForStop, recordSpeed, type BusETA } from "@/lib/eta";
import ScheduleView from "@/components/ScheduleView";
import NotificationSheet from "@/components/NotificationSheet";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import PwaInstallBanner from "@/components/PwaInstallBanner";

const DEFAULT_CENTER: L.LatLngTuple = [23.8103, 90.4125];
const DEFAULT_ZOOM = 15;

const FAV_STORAGE_KEY = "uniroute_favourite_stop";

type TabId = "map" | "schedule";

interface FavouriteStop {
  stop_id: string;
  stop_name: string;
  landmark: string | null;
  lat: number;
  lng: number;
}

function getInitialTab(): TabId {
  try {
    const saved = localStorage.getItem("uniroute-tab");
    if (saved === "schedule") return "schedule";
  } catch {}
  return "map";
}

function loadFavourite(): FavouriteStop | null {
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as FavouriteStop;
  } catch {}
  return null;
}

function saveFavourite(stop: Stop) {
  localStorage.setItem(
    FAV_STORAGE_KEY,
    JSON.stringify({
      stop_id: stop.id,
      stop_name: stop.name,
      landmark: stop.landmark,
      lat: stop.lat,
      lng: stop.lng,
    })
  );
}

function clearFavourite() {
  localStorage.removeItem(FAV_STORAGE_KEY);
}

function timeAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 10) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function makeBusIcon(color: string, stale?: boolean) {
  const opacity = stale ? "0.4" : "1";
  const bg = stale ? "#9ca3af" : color;
  return L.divIcon({
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
    html: `<div style="width:40px;height:40px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 3px 12px rgba(0,0,0,.25);border:3px solid white;opacity:${opacity};transition:all .6s ease;">🚌</div>`,
  });
}

function makeStopIcon(isFavourite: boolean) {
  if (isFavourite) {
    return L.divIcon({
      className: "",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
      html: `<div style="width:28px;height:28px;border-radius:50%;background:hsl(45,93%,47%);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:14px;">⭐</div>`,
    });
  }
  return L.divIcon({
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#0A0A0F;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);"></div>`,
  });
}

const MapPage = () => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const busMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const stopMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const polylinesRef = useRef<L.Polyline[]>([]);

  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab);
  const [favouriteStop, setFavouriteStop] = useState<FavouriteStop | null>(loadFavourite);
  const [showFavBanner, setShowFavBanner] = useState(false);
  const [notifSheetOpen, setNotifSheetOpen] = useState(false);
  const favInitRef = useRef(false);

  const push = usePushNotifications();

  const {
    busLocations, stops, routes, activeRouteIds, connected,
    selectedRoute, setSelectedRoute, staleBuses, removedBuses,
  } = useMapData();

  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [etas, setEtas] = useState<BusETA[]>([]);
  const [tickCounter, setTickCounter] = useState(0);

  const buses = useMemo(() => [...busLocations.values()], [busLocations]);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    try { localStorage.setItem("uniroute-tab", tab); } catch {}
  }, []);

  const toggleFavourite = useCallback((stop: Stop) => {
    if (favouriteStop?.stop_id === stop.id) {
      clearFavourite();
      setFavouriteStop(null);
    } else {
      saveFavourite(stop);
      setFavouriteStop({
        stop_id: stop.id,
        stop_name: stop.name,
        landmark: stop.landmark,
        lat: stop.lat,
        lng: stop.lng,
      });
    }
  }, [favouriteStop]);

  const removeFavourite = useCallback(() => {
    clearFavourite();
    setFavouriteStop(null);
  }, []);

  // On load: auto-select favourite stop once stops are loaded
  useEffect(() => {
    if (favInitRef.current || !favouriteStop || stops.length === 0) return;
    const match = stops.find((s) => s.id === favouriteStop.stop_id);
    if (!match) {
      clearFavourite();
      setFavouriteStop(null);
      return;
    }
    favInitRef.current = true;
    setSelectedStop(match);
    setShowFavBanner(true);
    if (mapRef.current) {
      mapRef.current.setView([match.lat, match.lng], 16, { animate: true });
    }
  }, [favouriteStop, stops]);

  // Record speeds
  useEffect(() => {
    for (const bus of buses) {
      recordSpeed(bus.busId, bus.speedKmh);
    }
  }, [buses]);

  // Recalculate ETAs
  useEffect(() => {
    if (!selectedStop) {
      setEtas([]);
      return;
    }
    const results = calculateETAsForStop(selectedStop, buses, routes, stops);
    setEtas(results);
  }, [selectedStop, buses, routes, stops]);

  // Tick counter
  useEffect(() => {
    if (!selectedStop || etas.length === 0) return;
    const interval = setInterval(() => setTickCounter((c) => c + 1), 1000);
    return () => clearInterval(interval);
  }, [selectedStop, etas.length]);

  const activeRoutes = useMemo(
    () => routes.filter((r) => (selectedRoute ? r.id === selectedRoute : activeRouteIds.has(r.id))),
    [routes, selectedRoute, activeRouteIds]
  );

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update bus markers — now handles stale state
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set<string>();

    for (const bus of buses) {
      currentIds.add(bus.busId);
      const isStale = staleBuses.has(bus.busId);
      const existing = busMarkersRef.current.get(bus.busId);
      if (existing) {
        existing.setLatLng([bus.lat, bus.lng]);
        existing.setIcon(makeBusIcon(bus.routeColor, isStale));
        existing.setPopupContent(busPopupHtml(bus, isStale));
      } else {
        const marker = L.marker([bus.lat, bus.lng], { icon: makeBusIcon(bus.routeColor, isStale) })
          .addTo(map)
          .bindPopup(busPopupHtml(bus, isStale));
        busMarkersRef.current.set(bus.busId, marker);
      }
    }

    for (const [id, marker] of busMarkersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        busMarkersRef.current.delete(id);
      }
    }
  }, [buses, staleBuses]);

  // Update stop markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = new Map();

    for (const s of stops) {
      const isFav = favouriteStop?.stop_id === s.id;
      const marker = L.marker([s.lat, s.lng], { icon: makeStopIcon(isFav) })
        .addTo(map);
      marker.on("click", () => setSelectedStop(s));
      stopMarkersRef.current.set(s.id, marker);
    }
  }, [stops, favouriteStop?.stop_id]);

  // Draw route polylines
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    polylinesRef.current.forEach((p) => p.remove());
    polylinesRef.current = [];

    const stopMap = new Map(stops.map((s) => [s.id, s]));

    for (const route of activeRoutes) {
      if (!route.stopSequence || route.stopSequence.length < 2) continue;
      const positions = route.stopSequence
        .map((id) => stopMap.get(id))
        .filter(Boolean)
        .map((s) => [s!.lat, s!.lng] as L.LatLngTuple);
      if (positions.length < 2) continue;

      const polyline = L.polyline(positions, {
        color: route.colorHex,
        weight: 4,
        opacity: 0.7,
      }).addTo(map);
      polylinesRef.current.push(polyline);
    }
  }, [activeRoutes, stops]);

  // Fit bounds on first bus data
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || buses.length === 0 || !mapRef.current) return;
    if (favInitRef.current) { fittedRef.current = true; return; }
    const bounds = L.latLngBounds(buses.map((b) => [b.lat, b.lng] as L.LatLngTuple));
    mapRef.current.fitBounds(bounds.pad(0.3), { maxZoom: 16 });
    fittedRef.current = true;
  }, [buses]);

  // Navigate to favourite stop from schedule tab
  const goToFavOnMap = useCallback(() => {
    if (!favouriteStop) return;
    const match = stops.find((s) => s.id === favouriteStop.stop_id);
    if (!match) return;
    handleTabChange("map");
    setSelectedStop(match);
    setTimeout(() => {
      mapRef.current?.setView([match.lat, match.lng], 16, { animate: true });
    }, 100);
  }, [favouriteStop, stops, handleTabChange]);

  // Removed buses banner entries
  const removedBusEntries = useMemo(() => [...removedBuses.entries()], [removedBuses]);

  return (
    <div className="fixed inset-0 z-0 flex flex-col">
      {/* ── Content area ── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Map view */}
        <div className={activeTab === "map" ? "h-full w-full" : "hidden"}>
          <div ref={containerRef} className="h-full w-full" />

          {/* ── Top bar ── */}
          <div className="fixed top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 py-3 pointer-events-none safe-top">
            <div className="pointer-events-auto rounded-2xl bg-card/80 backdrop-blur-xl shadow-md border border-border/50 px-4 py-2.5">
              <span className="text-lg font-extrabold tracking-tight text-foreground">UniRoute 🚌</span>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <div className={`rounded-full px-3 py-1.5 text-xs font-semibold shadow-md border ${
                connected
                  ? "bg-success/90 text-success-foreground border-success/50"
                  : "bg-destructive/90 text-destructive-foreground border-destructive/50"
              }`}>
                {connected ? "🟢 Live" : "🔴 Reconnecting..."}
              </div>

              <select
                value={selectedRoute ?? ""}
                onChange={(e) => setSelectedRoute(e.target.value || null)}
                className="rounded-2xl bg-card/80 backdrop-blur-xl shadow-md border border-border/50 px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Routes</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>

              {/* Notification bell */}
              <button
                onClick={() => {
                  if (!push.supported) {
                    toast({
                      title: "Not supported",
                      description: "Push notifications are not supported in this browser.",
                    });
                    return;
                  }
                  if (push.subscribed) {
                    if (confirm("Turn off notifications for this route?")) {
                      push.unsubscribe();
                    }
                  } else {
                    setNotifSheetOpen(true);
                  }
                }}
                className={`rounded-2xl backdrop-blur-xl shadow-md border border-border/50 min-w-[44px] min-h-[44px] flex items-center justify-center text-lg transition-colors ${
                  push.subscribed ? "bg-primary/90 text-primary-foreground" : "bg-card/80 text-foreground"
                }`}
                aria-label="Notifications"
              >
                {push.permission === "denied" ? "🔕" : "🔔"}
              </button>
            </div>
          </div>

          {/* ── Favourite banner ── */}
          {showFavBanner && favouriteStop && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[1000] rounded-2xl bg-card/90 backdrop-blur-xl shadow-md border border-border/50 px-4 py-2.5 flex items-center gap-2 max-w-xs pointer-events-auto mt-2">
              <p className="text-sm text-foreground">
                📍 Showing: <strong>{favouriteStop.stop_name}</strong>
              </p>
              <button
                onClick={() => setShowFavBanner(false)}
                className="text-muted-foreground hover:text-foreground ml-1 p-1 min-w-[28px] min-h-[28px] flex items-center justify-center"
              >✕</button>
            </div>
          )}

          {/* ── No active buses banner ── */}
          {buses.length === 0 && !showFavBanner && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[1000] rounded-2xl bg-card/90 backdrop-blur-xl shadow-md border border-border/50 px-5 py-4 text-center max-w-xs pointer-events-auto mt-2">
              <p className="text-sm font-semibold text-foreground">🕐 No buses currently active</p>
              <p className="text-xs text-muted-foreground mt-1">Service hours: 7:00 AM – 9:00 PM</p>
              <p className="text-xs text-muted-foreground">Tap a stop for scheduled times</p>
            </div>
          )}

          {/* ── Signal lost banners ── */}
          {removedBusEntries.length > 0 && (
            <div className="fixed top-16 right-4 z-[1000] space-y-1.5 pointer-events-auto max-w-xs mt-2">
              {removedBusEntries.map(([busId, info]) => (
                <div key={busId} className="rounded-xl bg-card/90 backdrop-blur-xl shadow-md border border-border/50 px-3 py-2 text-xs text-muted-foreground">
                  {info.busName} signal lost. Showing scheduled times only.
                </div>
              ))}
            </div>
          )}

          {/* ── Bottom info card ── */}
          <div className="absolute bottom-0 left-0 right-0 z-[1000] px-4 pb-4 pointer-events-none">
            <div className="pointer-events-auto mx-auto max-w-md rounded-t-2xl rounded-b-xl bg-card/95 backdrop-blur-xl shadow-lg border border-border/50 overflow-hidden">
              {/* Drag handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>
              <div className="px-4 pb-4">
                {selectedStop ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => toggleFavourite(selectedStop)}
                          className="text-lg min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 transition-transform active:scale-90"
                          aria-label={favouriteStop?.stop_id === selectedStop.id ? "Remove favourite" : "Set as favourite"}
                        >
                          {favouriteStop?.stop_id === selectedStop.id ? "⭐" : "☆"}
                        </button>
                        <div className="min-w-0">
                          <h3 className="font-bold text-foreground truncate text-base">📍 {selectedStop.name}</h3>
                          {selectedStop.landmark && (
                            <p className="text-xs text-muted-foreground">{selectedStop.landmark}</p>
                          )}
                        </div>
                      </div>
                      <button onClick={() => { setSelectedStop(null); setTickCounter(0); }} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 min-h-[44px] flex items-center">✕</button>
                    </div>

                    {etas.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic py-1">
                        {buses.length === 0 ? "No buses currently active" : "No active buses heading to this stop"}
                      </p>
                    ) : (
                      <div className="space-y-2 mt-1">
                        {etas.map((eta) => {
                          const isStale = staleBuses.has(eta.busId);
                          return (
                            <div key={eta.busId} className={`rounded-xl px-3 py-2.5 ${isStale ? "bg-muted/40 border border-dashed border-muted-foreground/20" : "bg-muted/40"}`}>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-foreground">🚌 {eta.busName}</span>
                                <span className="text-xs text-muted-foreground font-medium">{eta.routeName}</span>
                              </div>
                              {isStale ? (
                                <>
                                  <p className="text-sm mt-0.5 text-warning font-medium">⚠️ Bus location unavailable</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">Last seen {timeAgo(eta.timestamp)}</p>
                                </>
                              ) : (
                                <>
                                  <p className="text-sm mt-0.5 font-medium">{eta.label}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Updated: {Math.floor((Date.now() - new Date(eta.timestamp).getTime()) / 1000)}s ago
                                  </p>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">Tap a stop to see bus ETA</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Schedule view */}
        {activeTab === "schedule" && (
          <div className="h-full overflow-y-auto">
            <ScheduleView
              busLocations={busLocations}
              stops={stops}
              routes={routes}
              favouriteStop={favouriteStop}
              onRemoveFavourite={removeFavourite}
              onViewFavOnMap={goToFavOnMap}
            />
          </div>
        )}
      </div>

      {/* ── Bottom navigation bar ── */}
      <div className="shrink-0 bg-card/95 backdrop-blur-xl border-t border-border z-[1001] safe-bottom">
        <div className="flex max-w-md mx-auto">
          {[
            { id: "map" as TabId, emoji: "🗺️", label: "Live Map" },
            { id: "schedule" as TabId, emoji: "📋", label: "Schedule" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-xs font-semibold transition-all ${
                activeTab === tab.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`px-5 py-1 rounded-full transition-colors ${
                activeTab === tab.id ? "bg-primary/10" : ""
              }`}>
                <span className="text-lg">{tab.emoji}</span>
              </div>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Notification subscription sheet */}
      <NotificationSheet
        open={notifSheetOpen}
        onClose={() => setNotifSheetOpen(false)}
        routes={routes}
        stops={stops}
        favouriteStopId={favouriteStop?.stop_id ?? null}
        onSubscribe={push.subscribe}
      />

      {/* PWA install banner */}
      <PwaInstallBanner />
    </div>
  );
};

function busPopupHtml(bus: BusLocation, stale?: boolean) {
  if (stale) {
    return `<div style="font-size:13px;min-width:160px;font-family:Inter,system-ui,sans-serif;">
      <b>🚌 ${bus.busName}</b><br/>
      <span style="color:#C45C00;">⚠️ Signal lost</span><br/>
      Last seen: ${timeAgo(bus.timestamp)}<br/>
      <span style="color:#6B6B6B;font-size:11px;">Route: ${bus.routeName}</span>
    </div>`;
  }
  return `<div style="font-size:13px;min-width:160px;font-family:Inter,system-ui,sans-serif;">
    <b>🚌 ${bus.busName}</b><br/>
    Route: ${bus.routeName}<br/>
    Speed: ${Math.round(bus.speedKmh)} km/h<br/>
    <span style="color:#6B6B6B;font-size:11px;">Updated: ${timeAgo(bus.timestamp)}</span>
  </div>`;
}

export default MapPage;
