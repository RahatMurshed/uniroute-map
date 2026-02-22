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
import { Bus, Star, MapPin, Bell, BellRing, BellOff, Map as MapIcon, ClipboardList, Clock, AlertTriangle, X, CheckCircle2, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import OccupancyBar from "@/components/OccupancyBar";
import CountdownTimer from "@/components/CountdownTimer";
import { NoActiveBusesBanner } from "@/components/ServiceInfo";
import { useOccupancy, getOccupancyPillClasses, getAnonId, hasCheckedIn, markCheckedIn, type OccupancyInfo } from "@/hooks/useOccupancy";

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
    JSON.stringify({ stop_id: stop.id, stop_name: stop.name, landmark: stop.landmark, lat: stop.lat, lng: stop.lng })
  );
}

function clearFavourite() { localStorage.removeItem(FAV_STORAGE_KEY); }

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
    html: `<div style="width:40px;height:40px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,.25);border:3px solid white;opacity:${opacity};transition:all .6s ease;"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg></div>`,
  });
}

function makeStopIcon(isFavourite: boolean) {
  if (isFavourite) {
    return L.divIcon({
      className: "",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
      html: `<div style="width:28px;height:28px;border-radius:50%;background:hsl(45,93%,47%);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>`,
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

  // Occupancy tracking
  const tripIds = useMemo(() => buses.map((b) => b.tripId), [buses]);
  const { occupancy, refresh: refreshOccupancy } = useOccupancy(tripIds);

  // Check-in state
  const [checkedInTrip, setCheckedInTrip] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  // Countdown state
  const [showCountdown, setShowCountdown] = useState(false);
  const countdownEta = useMemo(() => {
    if (!selectedStop || etas.length === 0) return null;
    const best = etas.find((e) => !e.passed && !e.stale && e.etaMinutes <= 5);
    return best ?? null;
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
      const { error } = await supabase.from("students_on_bus").insert({
        trip_id: tripId,
        anonymous_id: anonId,
      });
      if (error) throw error;
      markCheckedIn(tripId);
      setCheckedInTrip(tripId);
      refreshOccupancy();
      toast({ title: "Checked in!", description: "Your boarding has been recorded." });
    } catch {
      toast({ title: "Check-in failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setCheckingIn(false);
    }
  }, [checkingIn, refreshOccupancy]);

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
      setFavouriteStop({ stop_id: stop.id, stop_name: stop.name, landmark: stop.landmark, lat: stop.lat, lng: stop.lng });
    }
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

  // Record speeds
  useEffect(() => { for (const bus of buses) recordSpeed(bus.busId, bus.speedKmh); }, [buses]);

  // Recalculate ETAs
  useEffect(() => {
    if (!selectedStop) { setEtas([]); return; }
    setEtas(calculateETAsForStop(selectedStop, buses, routes, stops));
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
    const map = L.map(containerRef.current, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, zoomControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
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
        existing.setIcon(makeBusIcon(bus.routeColor, isStale));
        existing.setPopupContent(busPopupHtml(bus, isStale, occ));
      } else {
        const marker = L.marker([bus.lat, bus.lng], { icon: makeBusIcon(bus.routeColor, isStale) })
          .addTo(map)
          .bindPopup(busPopupHtml(bus, isStale, occ));
        busMarkersRef.current.set(bus.busId, marker);
      }
    }
    for (const [id, marker] of busMarkersRef.current) {
      if (!currentIds.has(id)) { marker.remove(); busMarkersRef.current.delete(id); }
    }
  }, [buses, staleBuses, occupancy]);

  // Update stop markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = new Map();
    for (const s of stops) {
      const isFav = favouriteStop?.stop_id === s.id;
      const marker = L.marker([s.lat, s.lng], { icon: makeStopIcon(isFav) }).addTo(map);
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
    const sMap = new Map(stops.map((s) => [s.id, s]));
    for (const route of activeRoutes) {
      if (!route.stopSequence || route.stopSequence.length < 2) continue;
      const positions = route.stopSequence.map((id) => sMap.get(id)).filter(Boolean).map((s) => [s!.lat, s!.lng] as L.LatLngTuple);
      if (positions.length < 2) continue;
      const polyline = L.polyline(positions, { color: route.colorHex, weight: 4, opacity: 0.7 }).addTo(map);
      polylinesRef.current.push(polyline);
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

  return (
    <div className="fixed inset-0 z-0 flex flex-col">
      <div className="flex-1 relative overflow-hidden">
        {/* Map view */}
        <div className={activeTab === "map" ? "h-full w-full" : "hidden"}>
          <div ref={containerRef} className="h-full w-full" />

          {/* Top bar */}
          <div className="fixed top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 py-3 pointer-events-none safe-top">
            <div className="pointer-events-auto rounded-2xl bg-card/80 backdrop-blur-xl shadow-md border border-border/50 px-4 py-2.5 flex items-center gap-2">
              <img src="/metropolitan-logo.png" alt="MU" className="h-6 w-6 object-contain" />
              <span className="text-base font-extrabold tracking-tight text-foreground">MU Bus Tracker</span>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <div className={`rounded-full px-3 py-1.5 text-xs font-semibold shadow-md border flex items-center gap-1.5 ${
                connected ? "bg-success/90 text-success-foreground border-success/50" : "bg-destructive/90 text-destructive-foreground border-destructive/50"
              }`}>
                {connected ? (
                  <><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span></span> Live</>
                ) : (
                  <><span className="relative flex h-2 w-2"><span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span></span> Reconnecting...</>
                )}
              </div>

              <select
                value={selectedRoute ?? ""}
                onChange={(e) => setSelectedRoute(e.target.value || null)}
                className="rounded-2xl bg-card/80 backdrop-blur-xl shadow-md border border-border/50 px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Routes</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>

              <button
                onClick={() => {
                  if (!push.supported) { toast({ title: "Not supported", description: "Push notifications are not supported in this browser." }); return; }
                  if (push.subscribed) { if (confirm("Turn off notifications for this route?")) push.unsubscribe(); }
                  else setNotifSheetOpen(true);
                }}
                className={`rounded-2xl backdrop-blur-xl shadow-md border border-border/50 min-w-[44px] min-h-[44px] flex items-center justify-center text-lg transition-colors ${
                  push.subscribed ? "bg-primary/90 text-primary-foreground" : "bg-card/80 text-foreground"
                }`}
                aria-label="Notifications"
              >
                {push.permission === "denied" ? <BellOff className="h-5 w-5" /> : push.subscribed ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Favourite banner */}
          {showFavBanner && favouriteStop && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[1000] rounded-2xl bg-card/90 backdrop-blur-xl shadow-md border border-border/50 px-4 py-2.5 flex items-center gap-2 max-w-xs pointer-events-auto mt-2">
              <p className="text-sm text-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-primary" /> Showing: <strong>{favouriteStop.stop_name}</strong></p>
              <button onClick={() => setShowFavBanner(false)} className="text-muted-foreground hover:text-foreground ml-1 p-1 min-w-[28px] min-h-[28px] flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
          )}

          {/* No active buses — enhanced with service info */}
          {buses.length === 0 && !showFavBanner && (
            <NoActiveBusesBanner
              routes={routes}
              buses={buses}
              rawRoutes={rawRoutes}
              stopMap={stopMap}
              onViewSchedule={() => handleTabChange("schedule")}
            />
          )}

          {/* Signal lost banners */}
          {removedBusEntries.length > 0 && (
            <div className="fixed top-16 right-4 z-[1000] space-y-1.5 pointer-events-auto max-w-xs mt-2">
              {removedBusEntries.map(([busId, info]) => (
                <div key={busId} className="rounded-xl bg-card/90 backdrop-blur-xl shadow-md border border-border/50 px-3 py-2 text-xs text-muted-foreground">
                  {info.busName} signal lost. Showing scheduled times only.
                </div>
              ))}
            </div>
          )}

          {/* Bottom info card */}
          <div className="absolute bottom-0 left-0 right-0 z-[1000] px-4 pb-4 pointer-events-none">
            <div className="pointer-events-auto mx-auto max-w-md rounded-t-2xl rounded-b-xl bg-card/95 backdrop-blur-xl shadow-lg border border-border/50 overflow-hidden">
              <div className="flex justify-center pt-2 pb-1"><div className="w-10 h-1 rounded-full bg-muted-foreground/30" /></div>
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
                          {favouriteStop?.stop_id === selectedStop.id ? <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" /> : <Star className="h-5 w-5 text-muted-foreground" />}
                        </button>
                        <div className="min-w-0">
                          <h3 className="font-bold text-foreground truncate text-base flex items-center gap-1"><MapPin className="h-4 w-4 text-primary shrink-0" /> {selectedStop.name}</h3>
                          {selectedStop.landmark && <p className="text-xs text-muted-foreground">{selectedStop.landmark}</p>}
                        </div>
                      </div>
                      <button onClick={() => { setSelectedStop(null); setTickCounter(0); setShowCountdown(false); }} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 min-h-[44px] flex items-center"><X className="h-4 w-4" /></button>
                    </div>

                    {/* Countdown timer when ETA ≤ 5 min */}
                    {showCountdown && countdownEta ? (
                      <CountdownTimer
                        etaMinutes={countdownEta.etaMinutes}
                        busName={countdownEta.busName}
                        routeName={countdownEta.routeName}
                        stopName={selectedStop.name}
                        onExpired={() => setShowCountdown(false)}
                      />
                    ) : etas.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic py-1">
                        {buses.length === 0 ? "No buses currently active" : "No active buses heading to this stop"}
                      </p>
                    ) : (
                      <div className="space-y-2 mt-1">
                        {etas.map((eta) => {
                          const isStale = staleBuses.has(eta.busId);
                          const bus = buses.find((b) => b.busId === eta.busId);
                          const occ = bus ? occupancy.get(bus.tripId) : undefined;
                          const tripId = bus?.tripId;
                          const alreadyCheckedIn = tripId ? (hasCheckedIn(tripId) || checkedInTrip === tripId) : false;

                          return (
                            <div key={eta.busId} className={`rounded-xl px-3 py-2.5 ${isStale ? "bg-muted/40 border border-dashed border-muted-foreground/20" : "bg-muted/40"}`}>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-foreground flex items-center gap-1"><Bus className="h-3.5 w-3.5" /> {eta.busName}</span>
                                <div className="flex items-center gap-1.5">
                                  {occ && (
                                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border ${getOccupancyPillClasses(occ.level)}`}>
                                      {occ.label}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground font-medium">{eta.routeName}</span>
                                </div>
                              </div>
                              {occ && <div className="mt-1.5"><OccupancyBar info={occ} compact /></div>}
                              {isStale ? (
                                <>
                                  <p className="text-sm mt-0.5 text-warning font-medium flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Bus location unavailable</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">Last seen {timeAgo(eta.timestamp)}</p>
                                </>
                              ) : (
                                <>
                                  <p className="text-sm mt-0.5 font-medium">{eta.label}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">Updated: {Math.floor((Date.now() - new Date(eta.timestamp).getTime()) / 1000)}s ago</p>
                                </>
                              )}
                              {/* I'm on this bus button */}
                              {tripId && !isStale && !eta.passed && (
                                <div className="mt-2">
                                  {alreadyCheckedIn ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Checked in</span>
                                  ) : (
                                    <button
                                      onClick={() => handleCheckIn(tripId)}
                                      disabled={checkingIn}
                                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors min-h-[36px] disabled:opacity-50"
                                    >
                                      <UserCheck className="h-3.5 w-3.5" />
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
              occupancy={occupancy}
              rawRoutes={rawRoutes}
            />
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="shrink-0 bg-card/95 backdrop-blur-xl border-t border-border z-[1001] safe-bottom">
        <div className="flex max-w-md mx-auto">
          {[
            { id: "map" as TabId, icon: <MapIcon className="h-5 w-5" />, label: "Live Map" },
            { id: "schedule" as TabId, icon: <ClipboardList className="h-5 w-5" />, label: "Schedule" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-xs font-semibold transition-all ${
                activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`px-5 py-1 rounded-full transition-colors ${activeTab === tab.id ? "bg-primary/10" : ""}`}>
                {tab.icon}
              </div>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <NotificationSheet
        open={notifSheetOpen}
        onClose={() => setNotifSheetOpen(false)}
        routes={routes}
        stops={stops}
        favouriteStopId={favouriteStop?.stop_id ?? null}
        onSubscribe={push.subscribe}
      />

      <PwaInstallBanner />
    </div>
  );
};

function busPopupHtml(bus: BusLocation, stale?: boolean, occ?: OccupancyInfo) {
  const occHtml = occ
    ? `<div style="margin-top:4px;">
        <div style="display:flex;align-items:center;gap:4px;">
          <div style="flex:1;height:6px;background:#e5e5e5;border-radius:3px;overflow:hidden;">
            <div style="height:100%;border-radius:3px;background:${occ.level === 'empty' ? '#16A34A' : occ.level === 'filling' ? '#EAB308' : occ.level === 'almost_full' ? '#F97316' : '#DC2626'};width:${occ.percentage}%;"></div>
          </div>
          <span style="font-size:11px;font-weight:600;color:${occ.level === 'empty' ? '#16A34A' : occ.level === 'filling' ? '#EAB308' : occ.level === 'almost_full' ? '#F97316' : '#DC2626'}">${occ.percentage}% · ${occ.label}</span>
        </div>
        ${occ.capacity ? `<span style="font-size:10px;color:#78716C;">${occ.count}/${occ.capacity} passengers</span>` : ''}
      </div>`
    : '';

  if (stale) {
    return `<div style="font-size:13px;min-width:160px;font-family:Inter,system-ui,sans-serif;">
      <b>${bus.busName}</b><br/>
      <span style="color:#D97706;">Signal lost</span><br/>
      Last seen: ${timeAgo(bus.timestamp)}<br/>
      <span style="color:#78716C;font-size:11px;">Route: ${bus.routeName}</span>
      ${occHtml}
    </div>`;
  }
  return `<div style="font-size:13px;min-width:160px;font-family:Inter,system-ui,sans-serif;">
    <b>${bus.busName}</b><br/>
    Route: ${bus.routeName}<br/>
    Speed: ${Math.round(bus.speedKmh)} km/h<br/>
    <span style="color:#78716C;font-size:11px;">Updated: ${timeAgo(bus.timestamp)}</span>
    ${occHtml}
  </div>`;
}

export default MapPage;
