import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-polylinedecorator";
import "@/styles/leaflet-custom.css";
import { TILE_URL, TILE_URL_FALLBACK, TILE_ATTRIBUTION, TILE_ATTRIBUTION_FALLBACK, MU_RED, MU_AMBER, MU_GREY } from "@/lib/mapConfig";
import { useMapData, type BusLocation, type Stop } from "@/hooks/useMapData";
import { calculateETAsForStop, recordPing, type BusETA } from "@/lib/eta";
import { seedHistory } from "@/lib/etaEngine";
import ScheduleView from "@/components/ScheduleView";
import NotificationSheet from "@/components/NotificationSheet";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import { Bus, Star, MapPin, Bell, BellRing, BellOff, Map as MapIcon, ClipboardList, Clock, AlertTriangle, X, CheckCircle2, UserCheck, Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import OccupancyBar from "@/components/OccupancyBar";
import CountdownTimer from "@/components/CountdownTimer";
import { NoActiveBusesBanner } from "@/components/ServiceInfo";
import { useOccupancy, getOccupancyPillClasses, getAnonId, hasCheckedIn, markCheckedIn, type OccupancyInfo } from "@/hooks/useOccupancy";

const DEFAULT_CENTER: L.LatLngTuple = [23.8103, 90.4125];
const DEFAULT_ZOOM = 16;
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
  try { const s = localStorage.getItem("uniroute-tab"); if (s === "schedule") return "schedule"; } catch {} return "map";
}
function loadFavourite(): FavouriteStop | null {
  try { const r = localStorage.getItem(FAV_STORAGE_KEY); if (r) return JSON.parse(r); } catch {} return null;
}
function saveFavourite(stop: Stop) {
  localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify({ stop_id: stop.id, stop_name: stop.name, landmark: stop.landmark, lat: stop.lat, lng: stop.lng }));
}
function clearFavourite() { localStorage.removeItem(FAV_STORAGE_KEY); }

function timeAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 10) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/* ── Bus marker: label-style card with arrow pointer ── */
function makeBusIcon(bus: BusLocation, stale: boolean) {
  const bg = stale ? MU_GREY : (bus.routeColor || MU_RED);
  const opacity = stale ? "0.6" : "1";
  const speedText = stale ? "Offline" : `${Math.round(bus.speedKmh)} km/h`;
  return L.divIcon({
    className: "",
    iconSize: [84, 52],
    iconAnchor: [42, 52],
    popupAnchor: [0, -52],
    html: `<div class="bus-marker-label" style="opacity:${opacity}">
      <div class="bus-marker-body" style="background:${bg};">
        <span class="bus-marker-name">${bus.busName}</span>
        <span class="bus-marker-speed">${speedText}</span>
      </div>
      <div class="bus-marker-arrow" style="border-top-color:${bg};"></div>
    </div>`,
  });
}

/* ── Stop marker ── */
function makeStopIcon(isFavourite: boolean) {
  if (isFavourite) {
    return L.divIcon({
      className: "",
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -12],
      html: `<div class="stop-marker" style="width:18px;height:18px;border-radius:50%;background:${MU_RED};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>`,
    });
  }
  return L.divIcon({
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
    html: `<div class="stop-marker" style="width:14px;height:14px;border-radius:50%;background:white;border:2.5px solid ${MU_RED};box-shadow:0 2px 4px rgba(0,0,0,.2);"></div>`,
  });
}

/* ── Bus popup HTML ── */
function busPopupHtml(bus: BusLocation, stale: boolean, occ?: OccupancyInfo) {
  const statusDot = stale
    ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${MU_AMBER};margin-right:6px;"></span>`
    : `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#16A34A;margin-right:6px;"></span>`;
  const statusText = stale ? "Signal Lost" : "Active";
  const occHtml = occ
    ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #f3f4f6;">
        <div style="display:flex;align-items:center;gap:4px;">
          <div style="flex:1;height:5px;background:#f3f4f6;border-radius:3px;overflow:hidden;"><div style="height:100%;border-radius:3px;background:${occ.level === 'empty' ? '#16A34A' : occ.level === 'filling' ? '#EAB308' : occ.level === 'almost_full' ? '#F97316' : '#DC2626'};width:${occ.percentage}%;"></div></div>
          <span style="font-size:10px;font-weight:600;color:#6b7280;">${occ.percentage}%</span>
        </div>
        ${occ.capacity ? `<span style="font-size:10px;color:#9ca3af;">${occ.count}/${occ.capacity} passengers</span>` : ''}
      </div>` : '';

  return `<div style="padding:14px 16px;min-width:190px;font-family:Inter,system-ui,sans-serif;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <div style="width:36px;height:36px;border-radius:10px;background:${stale ? MU_GREY : bus.routeColor};display:flex;align-items:center;justify-content:center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>
      </div>
      <div>
        <div style="font-weight:700;font-size:14px;color:#111827;">${bus.busName}</div>
        <div style="font-size:11px;color:#9ca3af;">${bus.routeName}</div>
      </div>
    </div>
    <div style="border-top:1px solid #f3f4f6;padding-top:8px;">
      <div style="display:flex;align-items:center;font-size:12px;color:#374151;margin-bottom:4px;">${statusDot}${statusText}</div>
      ${!stale ? `<div style="font-size:12px;color:#374151;">Speed: ${Math.round(bus.speedKmh)} km/h</div>` : ''}
      <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Updated: ${timeAgo(bus.timestamp)}</div>
    </div>
    ${occHtml}
  </div>`;
}

const MapPage = () => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const busMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const stopMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const stopLabelsRef = useRef<Map<string, L.Marker>>(new Map());
  const polylinesRef = useRef<L.Layer[]>([]);

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

  // Occupancy
  const tripIds = useMemo(() => buses.map((b) => b.tripId), [buses]);
  const { occupancy, refresh: refreshOccupancy } = useOccupancy(tripIds);

  // Check-in
  const [checkedInTrip, setCheckedInTrip] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  // Countdown
  const [showCountdown, setShowCountdown] = useState(false);
  const countdownEta = useMemo(() => {
    if (!selectedStop || etas.length === 0) return null;
    return etas.find((e) => !e.passed && !e.stale && e.etaMinutes <= 5) ?? null;
  }, [etas, selectedStop]);

  useEffect(() => {
    if (countdownEta && !showCountdown) setShowCountdown(true);
    if (!countdownEta) setShowCountdown(false);
  }, [countdownEta]);

  // Raw routes for service info
  const [rawRoutes, setRawRoutes] = useState<Map<string, { stop_id: string; scheduled_time?: string }[]>>(new Map());
  useEffect(() => {
    const fetchRaw = async () => {
      const { data } = await supabase.from("routes").select("id, stop_sequence");
      if (data) {
        const map = new Map<string, { stop_id: string; scheduled_time?: string }[]>();
        for (const r of data) {
          const raw = r.stop_sequence;
          if (!raw || !Array.isArray(raw)) { map.set(r.id, []); continue; }
          if (raw.length === 0) { map.set(r.id, []); continue; }
          if (typeof raw[0] === "string") { map.set(r.id, (raw as string[]).map((id) => ({ stop_id: id }))); continue; }
          map.set(r.id, raw.map((item: any) => ({ stop_id: item?.stop_id ?? "", scheduled_time: item?.scheduled_time })).filter((x: any) => x.stop_id));
        }
        setRawRoutes(map);
      }
    };
    fetchRaw();
  }, []);

  const stopMap = useMemo(() => new Map(stops.map((s) => [s.id, { name: s.name }])), [stops]);

  const handleCheckIn = useCallback(async (tripId: string) => {
    if (hasCheckedIn(tripId) || checkingIn) return;
    setCheckingIn(true);
    try {
      const anonId = getAnonId();
      const { error } = await supabase.from("students_on_bus").insert({ trip_id: tripId, anonymous_id: anonId });
      if (error) throw error;
      markCheckedIn(tripId);
      setCheckedInTrip(tripId);
      refreshOccupancy();
      toast({ title: "Checked in!", description: "Your boarding has been recorded." });
    } catch {
      toast({ title: "Check-in failed", description: "Please try again.", variant: "destructive" });
    } finally { setCheckingIn(false); }
  }, [checkingIn, refreshOccupancy]);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    try { localStorage.setItem("uniroute-tab", tab); } catch {}
  }, []);

  const toggleFavourite = useCallback((stop: Stop) => {
    if (favouriteStop?.stop_id === stop.id) { clearFavourite(); setFavouriteStop(null); }
    else { saveFavourite(stop); setFavouriteStop({ stop_id: stop.id, stop_name: stop.name, landmark: stop.landmark, lat: stop.lat, lng: stop.lng }); }
  }, [favouriteStop]);

  const removeFavourite = useCallback(() => { clearFavourite(); setFavouriteStop(null); }, []);

  // Auto-select favourite stop
  useEffect(() => {
    if (favInitRef.current || !favouriteStop || stops.length === 0) return;
    const match = stops.find((s) => s.id === favouriteStop.stop_id);
    if (!match) { clearFavourite(); setFavouriteStop(null); return; }
    favInitRef.current = true;
    setSelectedStop(match);
    setShowFavBanner(true);
    if (mapRef.current) mapRef.current.setView([match.lat, match.lng], 16, { animate: true });
  }, [favouriteStop, stops]);

  // Record pings
  useEffect(() => { for (const bus of buses) recordPing(bus.busId, { lat: bus.lat, lng: bus.lng, timestamp: bus.timestamp, speed_kmh: bus.speedKmh }); }, [buses]);

  // Seed historical pings
  const seededRef = useRef(new Set<string>());
  useEffect(() => {
    const fetchHistory = async () => {
      for (const bus of buses) {
        if (seededRef.current.has(bus.busId)) continue;
        seededRef.current.add(bus.busId);
        const { data } = await supabase.from("live_locations").select("lat, lng, timestamp, speed_kmh").eq("bus_id", bus.busId).order("timestamp", { ascending: false }).limit(10);
        if (data && data.length > 0) seedHistory(bus.busId, data.map((d) => ({ lat: Number(d.lat), lng: Number(d.lng), timestamp: d.timestamp, speed_kmh: Number(d.speed_kmh ?? 0) })));
      }
    };
    if (buses.length > 0) fetchHistory();
  }, [buses]);

  // Recalculate ETAs
  useEffect(() => {
    if (!selectedStop) { setEtas([]); return; }
    setEtas(calculateETAsForStop(selectedStop, buses, routes, stops));
  }, [selectedStop, buses, routes, stops]);

  // Tick counter
  useEffect(() => {
    if (!selectedStop || etas.length === 0) return;
    const iv = setInterval(() => setTickCounter((c) => c + 1), 1000);
    return () => clearInterval(iv);
  }, [selectedStop, etas.length]);

  const activeRoutes = useMemo(
    () => routes.filter((r) => (selectedRoute ? r.id === selectedRoute : activeRouteIds.has(r.id))),
    [routes, selectedRoute, activeRouteIds]
  );

  // Initialize map with Stadia tiles + fallback
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, zoomControl: false, scrollWheelZoom: true, doubleClickZoom: true });

    const stadiaLayer = L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION });
    const fallbackLayer = L.tileLayer(TILE_URL_FALLBACK, { attribution: TILE_ATTRIBUTION_FALLBACK });

    let usedFallback = false;
    stadiaLayer.on("tileerror", () => {
      if (!usedFallback) {
        usedFallback = true;
        map.removeLayer(stadiaLayer);
        fallbackLayer.addTo(map);
      }
    });
    stadiaLayer.addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Update bus markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const currentIds = new Set<string>();
    for (const bus of buses) {
      currentIds.add(bus.busId);
      const isStale = staleBuses.has(bus.busId);
      const occ = occupancy.get(bus.tripId);
      const existing = busMarkersRef.current.get(bus.busId);
      if (existing) {
        existing.setLatLng([bus.lat, bus.lng]);
        existing.setIcon(makeBusIcon(bus, isStale));
        existing.setPopupContent(busPopupHtml(bus, isStale, occ));
      } else {
        const marker = L.marker([bus.lat, bus.lng], { icon: makeBusIcon(bus, isStale), zIndexOffset: 1000 })
          .addTo(map).bindPopup(busPopupHtml(bus, isStale, occ));
        busMarkersRef.current.set(bus.busId, marker);
      }
    }
    for (const [id, marker] of busMarkersRef.current) {
      if (!currentIds.has(id)) { marker.remove(); busMarkersRef.current.delete(id); }
    }
  }, [buses, staleBuses, occupancy]);

  // Update stop markers + labels on high zoom
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = new Map();
    stopLabelsRef.current.forEach((m) => m.remove());
    stopLabelsRef.current = new Map();

    for (const s of stops) {
      const isFav = favouriteStop?.stop_id === s.id;
      const marker = L.marker([s.lat, s.lng], { icon: makeStopIcon(isFav) }).addTo(map);
      marker.on("click", () => setSelectedStop(s));
      stopMarkersRef.current.set(s.id, marker);

      // Stop name label (visible at zoom > 16)
      const label = L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [0, 0],
          iconAnchor: [0, -10],
          html: `<div class="stop-label">${s.name}</div>`,
        }),
        interactive: false,
        zIndexOffset: -100,
      });
      stopLabelsRef.current.set(s.id, label);
    }

    const updateLabelVisibility = () => {
      const zoom = map.getZoom();
      stopLabelsRef.current.forEach((lbl) => {
        if (zoom > 16) { if (!map.hasLayer(lbl)) lbl.addTo(map); }
        else { if (map.hasLayer(lbl)) map.removeLayer(lbl); }
      });
    };
    updateLabelVisibility();
    map.on("zoomend", updateLabelVisibility);
    return () => { map.off("zoomend", updateLabelVisibility); };
  }, [stops, favouriteStop?.stop_id]);

  // Draw route polylines with direction arrows
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    polylinesRef.current.forEach((p) => map.removeLayer(p));
    polylinesRef.current = [];
    const sMap = new Map(stops.map((s) => [s.id, s]));
    for (const route of activeRoutes) {
      if (!route.stopSequence || route.stopSequence.length < 2) continue;
      const positions = route.stopSequence.map((id) => sMap.get(id)).filter(Boolean).map((s) => [s!.lat, s!.lng] as L.LatLngTuple);
      if (positions.length < 2) continue;
      const polyline = L.polyline(positions, { color: route.colorHex, weight: 4, opacity: 0.7 }).addTo(map);
      polylinesRef.current.push(polyline);
      const decorator = (L as any).polylineDecorator(polyline, {
        patterns: [{
          offset: 30,
          repeat: 300,
          symbol: (L as any).Symbol.arrowHead({ pixelSize: 8, polygon: false, pathOptions: { stroke: true, color: route.colorHex, weight: 2, opacity: 0.6 } }),
        }],
      }).addTo(map);
      polylinesRef.current.push(decorator);
    }
  }, [activeRoutes, stops]);

  // Fit bounds
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || buses.length === 0 || !mapRef.current) return;
    if (favInitRef.current) { fittedRef.current = true; return; }
    const bounds = L.latLngBounds(buses.map((b) => [b.lat, b.lng] as L.LatLngTuple));
    mapRef.current.fitBounds(bounds.pad(0.3), { maxZoom: 16 });
    fittedRef.current = true;
  }, [buses]);

  const goToFavOnMap = useCallback(() => {
    if (!favouriteStop) return;
    const match = stops.find((s) => s.id === favouriteStop.stop_id);
    if (!match) return;
    handleTabChange("map");
    setSelectedStop(match);
    setTimeout(() => { mapRef.current?.setView([match.lat, match.lng], 16, { animate: true }); }, 100);
  }, [favouriteStop, stops, handleTabChange]);

  const removedBusEntries = useMemo(() => [...removedBuses.entries()], [removedBuses]);

  /* ── ETA urgency color helper ── */
  function etaColorClass(mins: number | null, type: string): string {
    if (type === "arriving") return "text-emerald-600";
    if (type === "stale") return "text-destructive";
    if (type === "stopped") return "text-warning";
    if (type === "passed") return "text-muted-foreground";
    if (mins == null) return "text-muted-foreground";
    if (mins <= 3) return "text-amber-500";
    if (mins <= 10) return "text-emerald-600";
    if (mins <= 30) return "text-foreground";
    return "text-muted-foreground";
  }

  return (
    <div className="fixed inset-0 z-0 flex flex-col bg-background">
      {/* ── Top bar ── */}
      <div className="shrink-0 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm z-[2000] safe-top">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Left: logo */}
          <div className="flex items-center gap-2.5">
            <img src="/metropolitan-logo.png" alt="MU" className="h-8 w-8 object-contain" />
            <span className="text-base font-bold tracking-tight text-gray-900">MU Bus Tracker</span>
          </div>

          {/* Center: route filter (desktop only) */}
          <div className="hidden md:flex items-center gap-1.5">
            <button
              onClick={() => setSelectedRoute(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                !selectedRoute ? "bg-primary text-primary-foreground" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >All Routes</button>
            {routes.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedRoute(r.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  selectedRoute === r.id ? "bg-primary text-primary-foreground" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >{r.name}</button>
            ))}
          </div>

          {/* Right: live + bell */}
          <div className="flex items-center gap-2">
            <div className={`rounded-full px-3 py-1.5 text-xs font-semibold border flex items-center gap-1.5 ${
              connected ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"
            }`}>
              {connected ? (
                <><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span> Live</>
              ) : (
                <><span className="h-2 w-2 rounded-full bg-red-500 inline-block"></span> Offline</>
              )}
            </div>

            <button
              onClick={() => {
                if (!push.supported) { toast({ title: "Not supported", description: "Push notifications are not supported in this browser." }); return; }
                if (push.subscribed) { if (confirm("Turn off notifications for this route?")) push.unsubscribe(); }
                else setNotifSheetOpen(true);
              }}
              className={`relative w-10 h-10 rounded-full flex items-center justify-center shadow-sm border transition-colors ${
                push.subscribed ? "bg-primary text-primary-foreground border-primary/50" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
              aria-label="Notifications"
            >
              {push.permission === "denied" ? <BellOff className="h-5 w-5" /> : push.subscribed ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
              {push.subscribed && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-destructive rounded-full border-2 border-white" />}
            </button>
          </div>
        </div>

        {/* Mobile route filter */}
        <div className="md:hidden overflow-x-auto flex items-center gap-1.5 px-4 pb-2 -mt-1 scrollbar-none">
          <button
            onClick={() => setSelectedRoute(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              !selectedRoute ? "bg-primary text-primary-foreground" : "bg-gray-100 text-gray-600"
            }`}
          >All Routes</button>
          {routes.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedRoute(r.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                selectedRoute === r.id ? "bg-primary text-primary-foreground" : "bg-gray-100 text-gray-600"
              }`}
            >{r.name}</button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Map */}
        <div className={activeTab === "map" ? "h-full w-full" : "hidden"}>
          <div ref={containerRef} className="h-full w-full" />

          {/* Favourite banner */}
          {showFavBanner && favouriteStop && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] rounded-full bg-white/95 backdrop-blur-md shadow-md border border-gray-100 px-4 py-2 flex items-center gap-2 max-w-xs pointer-events-auto">
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-sm text-gray-700 truncate">Showing: <strong>{favouriteStop.stop_name}</strong></p>
              <button onClick={() => setShowFavBanner(false)} className="text-gray-400 hover:text-gray-600 ml-1 p-1"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {/* No active buses banner */}
          {buses.length === 0 && !showFavBanner && (
            <NoActiveBusesBanner routes={routes} buses={buses} rawRoutes={rawRoutes} stopMap={stopMap} onViewSchedule={() => handleTabChange("schedule")} />
          )}

          {/* Signal lost banners */}
          {removedBusEntries.length > 0 && (
            <div className="absolute top-3 right-4 z-[1000] space-y-1.5 pointer-events-auto max-w-xs">
              {removedBusEntries.map(([busId, info]) => (
                <div key={busId} className="rounded-xl bg-white/95 backdrop-blur-md shadow-md border border-gray-100 px-3 py-2 text-xs text-gray-500">
                  {info.busName} signal lost. Showing scheduled times only.
                </div>
              ))}
            </div>
          )}

          {/* ── Bottom ETA card ── */}
          <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
            {selectedStop ? (
              <div className="pointer-events-auto mx-auto max-w-md bg-white rounded-t-3xl shadow-2xl overflow-hidden">
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>

                <div className="px-5 pb-6 pt-2">
                  {/* Stop header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-1.5 truncate">
                        <MapPin className="h-5 w-5 text-primary shrink-0" /> {selectedStop.name}
                      </h3>
                      {selectedStop.landmark && <p className="text-sm text-gray-400 mt-0.5 ml-6">{selectedStop.landmark}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => toggleFavourite(selectedStop)}
                        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors active:scale-90"
                        aria-label={favouriteStop?.stop_id === selectedStop.id ? "Remove favourite" : "Set as favourite"}
                      >
                        {favouriteStop?.stop_id === selectedStop.id
                          ? <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                          : <Star className="h-5 w-5 text-gray-300" />}
                      </button>
                      <button
                        onClick={() => { setSelectedStop(null); setTickCounter(0); setShowCountdown(false); }}
                        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                      ><X className="h-5 w-5 text-gray-400" /></button>
                    </div>
                  </div>

                  {/* Countdown timer */}
                  {showCountdown && countdownEta ? (
                    <CountdownTimer
                      etaMinutes={countdownEta.etaMinutes}
                      busName={countdownEta.busName}
                      routeName={countdownEta.routeName}
                      stopName={selectedStop.name}
                      onExpired={() => setShowCountdown(false)}
                    />
                  ) : etas.length === 0 ? (
                    <p className="text-sm text-gray-400 italic py-3">{buses.length === 0 ? "No buses currently active" : "No active buses heading to this stop"}</p>
                  ) : (
                    <div className="space-y-3">
                      {etas.map((eta) => {
                        const isStale = eta.stale;
                        const bus = buses.find((b) => b.busId === eta.busId);
                        const occ = bus ? occupancy.get(bus.tripId) : undefined;
                        const tripId = bus?.tripId;
                        const alreadyCheckedIn = tripId ? (hasCheckedIn(tripId) || checkedInTrip === tripId) : false;

                        return (
                          <div key={eta.busId} className="rounded-2xl bg-gray-50 p-4">
                            {/* Bus info */}
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                                <Bus className="h-4 w-4 text-primary" /> {eta.busName}
                              </span>
                              {occ && (
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border ${getOccupancyPillClasses(occ.level)}`}>
                                  {occ.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mb-3">{eta.routeName}</p>

                            {/* ETA display */}
                            {eta.type === "arriving" ? (
                              <div className="flex items-center gap-2">
                                <span className="relative flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                                </span>
                                <span className="text-2xl font-bold text-emerald-600">Arriving now</span>
                              </div>
                            ) : eta.type === "stale" ? (
                              <>
                                <p className="text-sm font-medium text-destructive flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> {eta.message}</p>
                                <p className="text-xs text-gray-400 mt-1">Last seen {eta.lastSeenAgo ?? timeAgo(eta.timestamp)}</p>
                              </>
                            ) : eta.type === "stopped" ? (
                              <>
                                <p className="text-sm font-medium text-amber-600">{eta.message}</p>
                                <p className="text-xs text-gray-400 mt-1">Updated: {eta.lastSeenAgo ?? timeAgo(eta.timestamp)}</p>
                              </>
                            ) : eta.type === "passed" ? (
                              <p className="text-sm text-gray-400">{eta.message}</p>
                            ) : (
                              <>
                                <p className={`text-2xl font-bold ${etaColorClass(eta.minutes, eta.type)}`}>
                                  {eta.message}{eta.confidence === "low" ? "?" : ""}
                                </p>

                                {/* Distance progress bar */}
                                {eta.distanceKm != null && eta.routeProgressPercent != null && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${Math.min(100, eta.routeProgressPercent)}%` }} />
                                    </div>
                                    <span className="text-xs text-gray-400 font-medium shrink-0">{eta.distanceKm} km</span>
                                  </div>
                                )}

                                {/* Speed & accuracy */}
                                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                  {eta.speedKmh != null && eta.speedKmh > 0 && (
                                    <span className="flex items-center gap-1"><Gauge className="h-3 w-3" /> {eta.speedKmh} km/h</span>
                                  )}
                                  <span>Updated: {eta.lastSeenAgo ?? timeAgo(eta.timestamp)}</span>
                                </div>

                                {eta.confidence === "low" && (
                                  <p className="text-[10px] text-gray-300 mt-1">Estimate may vary</p>
                                )}
                              </>
                            )}

                            {/* Occupancy bar */}
                            {occ && <div className="mt-3"><OccupancyBar info={occ} compact /></div>}

                            {/* Check-in button */}
                            {tripId && !isStale && !eta.passed && (
                              <div className="mt-3">
                                {alreadyCheckedIn ? (
                                  <div className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold">
                                    <CheckCircle2 className="h-4 w-4" /> Checked in
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleCheckIn(tripId)}
                                    disabled={checkingIn}
                                    className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 active:scale-[0.98]"
                                  >
                                    <Bus className="h-4 w-4" />
                                    {checkingIn ? "Checking in..." : "I'm on this bus"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="pointer-events-auto flex justify-center pb-6">
                <div className="bg-white shadow-md rounded-full px-4 py-2.5 flex items-center gap-2 border border-gray-100">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-500">Tap a stop to see bus ETA</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Schedule */}
        {activeTab === "schedule" && (
          <div className="h-full overflow-y-auto">
            <ScheduleView
              busLocations={busLocations} stops={stops} routes={routes}
              favouriteStop={favouriteStop} onRemoveFavourite={removeFavourite}
              onViewFavOnMap={goToFavOnMap} occupancy={occupancy} rawRoutes={rawRoutes}
            />
          </div>
        )}
      </div>

      {/* ── Bottom navigation ── */}
      <div className="shrink-0 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] z-[2001] safe-bottom">
        <div className="flex max-w-md mx-auto h-16">
          {([
            { id: "map" as TabId, icon: MapIcon, label: "Live Map" },
            { id: "schedule" as TabId, icon: ClipboardList, label: "Schedule" },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
              >
                {isActive && <span className="w-1 h-1 rounded-full bg-primary mb-0.5" />}
                <Icon className={`h-6 w-6 ${isActive ? "text-primary" : "text-gray-400"}`} />
                <span className={`text-xs font-medium ${isActive ? "text-primary" : "text-gray-400"}`}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <NotificationSheet
        open={notifSheetOpen} onClose={() => setNotifSheetOpen(false)}
        routes={routes} stops={stops}
        favouriteStopId={favouriteStop?.stop_id ?? null}
        onSubscribe={push.subscribe}
      />
      <PwaInstallBanner />
    </div>
  );
};

export default MapPage;
