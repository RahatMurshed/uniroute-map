import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMapData, type BusLocation, type Stop } from "@/hooks/useMapData";
import { calculateETAsForStop, recordSpeed, type BusETA } from "@/lib/eta";
import ScheduleView from "@/components/ScheduleView";

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

function makeBusIcon(color: string) {
  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
    html: `<div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,.3);border:3px solid white;transition:all .8s ease;">🚌</div>`,
  });
}

function makeStopIcon(isFavourite: boolean) {
  if (isFavourite) {
    return L.divIcon({
      className: "",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -14],
      html: `<div style="width:24px;height:24px;border-radius:50%;background:hsl(45,93%,47%);border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:12px;">⭐</div>`,
    });
  }
  return L.divIcon({
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#1e293b;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);"></div>`,
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
  const favInitRef = useRef(false);

  const {
    busLocations,
    stops,
    routes,
    activeRouteIds,
    connected,
    selectedRoute,
    setSelectedRoute,
  } = useMapData();

  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [etas, setEtas] = useState<BusETA[]>([]);
  const [tickCounter, setTickCounter] = useState(0);

  const buses = useMemo(() => [...busLocations.values()], [busLocations]);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    try { localStorage.setItem("uniroute-tab", tab); } catch {}
  }, []);

  // Toggle favourite
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
      // Stop no longer exists
      clearFavourite();
      setFavouriteStop(null);
      return;
    }
    favInitRef.current = true;
    setSelectedStop(match);
    setShowFavBanner(true);
    // Pan map
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

  // Update bus markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set<string>();

    for (const bus of buses) {
      currentIds.add(bus.busId);
      const existing = busMarkersRef.current.get(bus.busId);
      if (existing) {
        existing.setLatLng([bus.lat, bus.lng]);
        existing.setPopupContent(busPopupHtml(bus));
      } else {
        const marker = L.marker([bus.lat, bus.lng], { icon: makeBusIcon(bus.routeColor) })
          .addTo(map)
          .bindPopup(busPopupHtml(bus));
        busMarkersRef.current.set(bus.busId, marker);
      }
    }

    for (const [id, marker] of busMarkersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        busMarkersRef.current.delete(id);
      }
    }
  }, [buses]);

  // Update stop markers — rebuilt when stops or favourite changes
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
    // Don't fit if we already panned to favourite
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

  return (
    <div className="fixed inset-0 z-0 flex flex-col">
      {/* ── Content area ── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Map view */}
        <div className={activeTab === "map" ? "h-full w-full" : "hidden"}>
          <div ref={containerRef} className="h-full w-full" />

          {/* ── Top bar ── */}
          <div className="fixed top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 py-3 pointer-events-none">
            <div className="pointer-events-auto rounded-xl bg-background/90 backdrop-blur-md shadow-lg px-4 py-2">
              <span className="text-lg font-bold text-foreground">UniRoute 🚌</span>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <div className={`rounded-full px-3 py-1 text-xs font-medium shadow-md ${
                connected
                  ? "bg-emerald-500/90 text-white"
                  : "bg-destructive/90 text-destructive-foreground"
              }`}>
                {connected ? "🟢 Live" : "🔴 Reconnecting..."}
              </div>

              <select
                value={selectedRoute ?? ""}
                onChange={(e) => setSelectedRoute(e.target.value || null)}
                className="rounded-xl bg-background/90 backdrop-blur-md shadow-lg border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Routes</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Favourite banner ── */}
          {showFavBanner && favouriteStop && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[1000] rounded-xl bg-accent/95 backdrop-blur-md shadow-lg px-4 py-2.5 flex items-center gap-2 max-w-xs pointer-events-auto">
              <p className="text-sm text-accent-foreground">
                📍 Showing your favourite stop: <strong>{favouriteStop.stop_name}</strong>
              </p>
              <button
                onClick={() => setShowFavBanner(false)}
                className="text-muted-foreground hover:text-foreground ml-1 p-1 min-w-[28px] min-h-[28px] flex items-center justify-center"
              >✕</button>
            </div>
          )}

          {/* ── No active buses banner ── */}
          {buses.length === 0 && !showFavBanner && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[1000] rounded-xl bg-secondary/95 backdrop-blur-md shadow-lg px-5 py-3 text-center max-w-xs">
              <p className="text-sm text-secondary-foreground">
                No buses currently active.<br />
                <span className="text-muted-foreground text-xs">Check back during service hours.</span>
              </p>
            </div>
          )}

          {/* ── Bottom info card ── */}
          <div className="absolute bottom-0 left-0 right-0 z-[1000] p-4 pointer-events-none">
            <div className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-background/95 backdrop-blur-md shadow-lg border border-border p-4">
              {selectedStop ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => toggleFavourite(selectedStop)}
                        className="text-lg min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                        aria-label={favouriteStop?.stop_id === selectedStop.id ? "Remove favourite" : "Set as favourite"}
                      >
                        {favouriteStop?.stop_id === selectedStop.id ? "⭐" : "☆"}
                      </button>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground truncate">📍 {selectedStop.name}</h3>
                        {selectedStop.landmark && (
                          <p className="text-xs text-muted-foreground">{selectedStop.landmark}</p>
                        )}
                      </div>
                    </div>
                    <button onClick={() => { setSelectedStop(null); setTickCounter(0); }} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1">✕</button>
                  </div>

                  {etas.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      {buses.length === 0 ? "No buses currently active" : "No active buses heading to this stop"}
                    </p>
                  ) : (
                    <div className="space-y-2 mt-1">
                      {etas.map((eta) => (
                        <div key={eta.busId} className="rounded-lg bg-muted/50 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">🚌 {eta.busName}</span>
                            <span className="text-xs text-muted-foreground">Route: {eta.routeName}</span>
                          </div>
                          <p className="text-sm mt-0.5">{eta.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Last updated: {Math.floor((Date.now() - new Date(eta.timestamp).getTime()) / 1000)}s ago
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center">Tap a stop to see bus ETA</p>
              )}
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
      <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur-md z-[1001]">
        <div className="flex">
          <button
            onClick={() => handleTabChange("map")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              activeTab === "map"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="text-lg">🗺️</span>
            <span>Live Map</span>
          </button>
          <button
            onClick={() => handleTabChange("schedule")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              activeTab === "schedule"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="text-lg">📋</span>
            <span>Schedule</span>
          </button>
        </div>
      </div>
    </div>
  );
};

function busPopupHtml(bus: BusLocation) {
  return `<div style="font-size:13px;min-width:160px;">
    <b>🚌 ${bus.busName}</b><br/>
    Route: ${bus.routeName}<br/>
    Speed: ${Math.round(bus.speedKmh)} km/h<br/>
    <span style="color:#64748b;font-size:11px;">Updated: ${timeAgo(bus.timestamp)}</span>
  </div>`;
}

export default MapPage;
