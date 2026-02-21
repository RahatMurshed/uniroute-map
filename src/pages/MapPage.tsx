import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMapData, type BusLocation, type Stop } from "@/hooks/useMapData";

const DEFAULT_CENTER: L.LatLngTuple = [23.8103, 90.4125];
const DEFAULT_ZOOM = 15;

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

const stopIcon = L.divIcon({
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  popupAnchor: [0, -10],
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#1e293b;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);"></div>`,
});

const MapPage = () => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const busMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const stopMarkersRef = useRef<L.Marker[]>([]);
  const polylinesRef = useRef<L.Polyline[]>([]);

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

  const buses = useMemo(() => [...busLocations.values()], [busLocations]);

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

    // Remove stale markers
    for (const [id, marker] of busMarkersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        busMarkersRef.current.delete(id);
      }
    }
  }, [buses]);

  // Update stop markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    for (const s of stops) {
      const marker = L.marker([s.lat, s.lng], { icon: stopIcon })
        .addTo(map)
        .bindPopup(`<div style="font-size:13px;"><b>${s.name}</b>${s.landmark ? `<br/><span style="color:#64748b;font-size:11px;">${s.landmark}</span>` : ""}</div>`);
      marker.on("click", () => setSelectedStop(s));
      stopMarkersRef.current.push(marker);
    }
  }, [stops]);

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
    const bounds = L.latLngBounds(buses.map((b) => [b.lat, b.lng] as L.LatLngTuple));
    mapRef.current.fitBounds(bounds.pad(0.3), { maxZoom: 16 });
    fittedRef.current = true;
  }, [buses]);

  return (
    <div className="fixed inset-0 z-0">
      {/* Map container */}
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

      {/* ── No active buses banner ── */}
      {buses.length === 0 && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[1000] rounded-xl bg-secondary/95 backdrop-blur-md shadow-lg px-5 py-3 text-center max-w-xs">
          <p className="text-sm text-secondary-foreground">
            No buses currently active.<br />
            <span className="text-muted-foreground text-xs">Check back during service hours.</span>
          </p>
        </div>
      )}

      {/* ── Bottom info card ── */}
      <div className="fixed bottom-0 left-0 right-0 z-[1000] p-4 pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-background/95 backdrop-blur-md shadow-lg border border-border p-4">
          {selectedStop ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">{selectedStop.name}</h3>
                <button onClick={() => setSelectedStop(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
              </div>
              {selectedStop.landmark && (
                <p className="text-xs text-muted-foreground">{selectedStop.landmark}</p>
              )}
              <p className="text-sm text-muted-foreground italic">Calculating ETA...</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center">Tap a stop to see bus ETA</p>
          )}
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
