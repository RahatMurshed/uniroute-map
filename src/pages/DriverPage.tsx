import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, LogOut, Bus, MapPin, Play, Square, AlertOctagon, Radio, Navigation, Sunrise, Sun, Moon, RefreshCw, AlertTriangle, WifiOff, CheckCircle2, Battery, BatteryLow, Zap, Clock, Calendar, ChevronRight, Timer, Gauge, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGpsBroadcast, type BatteryTier } from "@/hooks/useGpsBroadcast";
import { ReportDelaySheet, ISSUE_OPTIONS, type IssueKey } from "@/components/ReportDelaySheet";

interface BusOption { id: string; name: string; license_plate: string | null; }
interface RouteOption { id: string; name: string; }
interface ActiveTrip { id: string; busId: string; busName: string; routeName: string; startedAt: string; }

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning,";
  if (h < 17) return "Good afternoon,";
  return "Good evening,";
};

const batteryLabel = (tier: BatteryTier): { text: string; color: string; icon: React.ReactNode } | null => {
  switch (tier) {
    case "reduced": return { text: "Reduced GPS (battery saving)", color: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400", icon: <BatteryLow className="h-5 w-5" /> };
    case "minimal": return { text: "Minimal GPS (low battery)", color: "bg-red-500/10 border-red-500/30 text-red-400", icon: <Battery className="h-5 w-5" /> };
    case "charging": return { text: "Charging — Full GPS active", color: "bg-green-500/10 border-green-500/30 text-green-400", icon: <Zap className="h-5 w-5" /> };
    default: return null;
  }
};

function formatDuration(startIso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function gpsQuality(pingCount: number): { label: string; color: string; percent: number } {
  if (pingCount === 0) return { label: "Waiting…", color: "bg-white/30", percent: 10 };
  if (pingCount < 3) return { label: "Acquiring", color: "bg-amber-400", percent: 40 };
  return { label: "Excellent", color: "bg-green-400", percent: 100 };
}

const DriverPage = () => {
  const { user, signOut, activeTripId, setActiveTripId } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState("");
  const [buses, setBuses] = useState<BusOption[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedBus, setSelectedBus] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [resumeTrip, setResumeTrip] = useState<ActiveTrip | null>(null);
  const [loadingResume, setLoadingResume] = useState(true);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [delayReason, setDelayReason] = useState<string | null>(null);
  const [duration, setDuration] = useState("00:00:00");
  const [currentTime, setCurrentTime] = useState(new Date());

  // Hold-to-end state
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number | null>(null);

  const {
    pingCount, gpsError, batteryTier, isOnline,
    queueSize, flushProgress, reconnectMsg, queueTrimmed, cleanup: cleanupGps,
  } = useGpsBroadcast({
    busId: activeTrip?.busId || "",
    tripId: activeTripId || "",
    active: !!activeTripId && !!activeTrip && !gpsDenied,
  });

  // Live clock + duration timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      if (activeTrip) setDuration(formatDuration(activeTrip.startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTrip]);

  useEffect(() => {
    if (gpsError && gpsError.toLowerCase().includes("denied")) setGpsDenied(true);
    else if (!gpsError) setGpsDenied(false);
  }, [gpsError]);

  const handleRetryGps = () => {
    navigator.geolocation.getCurrentPosition(
      () => setGpsDenied(false),
      (err) => { if (err.code === err.PERMISSION_DENIED) setGpsDenied(true); }
    );
  };

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [profileRes, busRes, routeRes] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).single(),
        supabase.from("buses").select("id, name, license_plate").eq("driver_id", user.id),
        supabase.from("routes").select("id, name"),
      ]);
      setDisplayName(profileRes.data?.display_name || user.email?.split("@")[0] || "Driver");
      setBuses(busRes.data ?? []);
      setRoutes(routeRes.data ?? []);
    };
    load();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const checkActive = async () => {
      setLoadingResume(true);
      const { data } = await supabase
        .from("trips")
        .select("id, bus_id, route_id, started_at, status, buses(name), routes(name)")
        .eq("driver_id", user.id)
        .in("status", ["active", "delayed"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        const trip: ActiveTrip = {
          id: data.id, busId: data.bus_id,
          busName: (data.buses as any)?.name ?? "Unknown Bus",
          routeName: (data.routes as any)?.name ?? "Unknown Route",
          startedAt: data.started_at ?? data.id,
        };
        if (activeTripId === data.id) setActiveTrip(trip);
        else setResumeTrip(trip);

        if (data.status === "delayed") {
          const { data: exc } = await supabase
            .from("exceptions").select("notes").eq("bus_id", data.bus_id)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          setDelayReason(exc?.notes ?? "Delay reported");
        }
      }
      setLoadingResume(false);
    };
    checkActive();
  }, [user, activeTripId, setActiveTripId]);

  const handleResumeTrip = () => { if (!resumeTrip) return; setActiveTripId(resumeTrip.id); setActiveTrip(resumeTrip); setResumeTrip(null); };

  const handleEndResumedTrip = async () => {
    if (!resumeTrip) return;
    setEnding(true);
    try {
      await supabase.from("trips").update({ status: "completed", ended_at: new Date().toISOString() }).eq("id", resumeTrip.id);
      setResumeTrip(null); setActiveTripId(null); setActiveTrip(null); setDelayReason(null);
      toast({ title: "Trip ended successfully" });
    } catch (err: any) { toast({ title: "Failed to end trip", description: err.message, variant: "destructive" }); }
    finally { setEnding(false); }
  };

  const handleStartTrip = async () => {
    if (!user || !selectedBus || !selectedRoute) return;
    setStarting(true);
    try {
      const { data, error } = await supabase.from("trips").insert({
        bus_id: selectedBus, route_id: selectedRoute, driver_id: user.id,
        started_at: new Date().toISOString(), status: "active",
      }).select("id").single();
      if (error) throw error;
      const bus = buses.find((b) => b.id === selectedBus);
      const route = routes.find((r) => r.id === selectedRoute);
      setActiveTripId(data.id);
      setActiveTrip({ id: data.id, busId: selectedBus, busName: bus?.name ?? "", routeName: route?.name ?? "", startedAt: new Date().toISOString() });
      setDelayReason(null);
    } catch (err: any) { toast({ title: "Failed to start trip", description: err.message, variant: "destructive" }); }
    finally { setStarting(false); }
  };

  const handleEndTrip = async () => {
    if (!activeTripId) return;
    setEnding(true);
    try {
      cleanupGps();
      const { error } = await supabase.from("trips").update({ status: "completed", ended_at: new Date().toISOString() }).eq("id", activeTripId);
      if (error) throw error;
      setActiveTripId(null); setActiveTrip(null); setDelayReason(null);
      toast({ title: "Trip ended successfully" });
    } catch (err: any) { toast({ title: "Failed to end trip", description: err.message, variant: "destructive" }); }
    finally { setEnding(false); setHoldProgress(0); }
  };

  // Hold-to-end handlers
  const startHold = useCallback(() => {
    if (ending) return;
    holdStartRef.current = Date.now();
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - (holdStartRef.current || Date.now());
      const progress = Math.min(elapsed / 2000, 1);
      setHoldProgress(progress);
      if (progress >= 1) {
        cancelHold();
        handleEndTrip();
      }
    }, 30);
  }, [ending, handleEndTrip]);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null; }
    holdStartRef.current = null;
    setHoldProgress(0);
  }, []);

  const handleReportSubmit = async (issueKey: IssueKey, notes: string) => {
    if (!user || !activeTrip || !activeTripId) return;
    const option = ISSUE_OPTIONS.find((o) => o.key === issueKey);
    const isCancellation = issueKey === "cancel";
    const combinedNotes = [option?.delayLabel, notes].filter(Boolean).join(" — ");
    try {
      const { data: tripData } = await supabase.from("trips").select("route_id").eq("id", activeTripId).single();
      const routeId = tripData?.route_id;
      let notified = false;
      if (routeId) {
        try {
          const { error: pushError } = await supabase.functions.invoke("send-push-notifications", {
            body: { type: "exception", bus_id: activeTrip.busId, bus_name: activeTrip.busName, exception_type: isCancellation ? "cancellation" : "time_shift", time_offset_mins: null, route_id: routeId, notes: combinedNotes },
          });
          if (!pushError) notified = true;
        } catch (pushErr) { console.error("Push notification failed:", pushErr); }
      }
      const { error: excError } = await supabase.from("exceptions").insert({
        bus_id: activeTrip.busId, exception_date: new Date().toISOString().split("T")[0],
        type: isCancellation ? "cancellation" : "time_shift", notes: combinedNotes, notified, created_by: user.id,
      });
      if (excError) throw excError;
      if (isCancellation) {
        cleanupGps();
        await supabase.from("trips").update({ status: "cancelled", ended_at: new Date().toISOString() }).eq("id", activeTripId);
        setActiveTripId(null); setActiveTrip(null); setDelayReason(null);
        toast({ title: "Trip cancelled and students notified" });
      } else {
        await supabase.from("trips").update({ status: "delayed" }).eq("id", activeTripId);
        setDelayReason(option?.delayLabel ?? "Delay reported");
        toast({ title: "Delay reported and students notified" });
      }
      setSheetOpen(false);
    } catch (err: any) { toast({ title: "Failed to submit report. Please try again.", variant: "destructive" }); }
  };

  const handleResolveDelay = async () => {
    if (!activeTripId) return;
    try {
      const { error } = await supabase.from("trips").update({ status: "active" }).eq("id", activeTripId);
      if (error) throw error;
      setDelayReason(null);
    } catch (err: any) { toast({ title: "Failed to resolve delay", variant: "destructive" }); }
  };

  const handleLogout = useCallback(async () => { cleanupGps(); await signOut(); navigate("/login", { replace: true }); }, [signOut, navigate, cleanupGps]);

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return "--:--"; }
  };

  const batInfo = batteryLabel(batteryTier);
  const greeting = getGreeting();
  const timeStr = currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = currentTime.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
  const selectedBusObj = buses.find((b) => b.id === selectedBus);
  const selectedRouteObj = routes.find((r) => r.id === selectedRoute);
  const gpsQ = gpsQuality(pingCount);

  // GPS Permission Denied
  if (gpsDenied && activeTrip) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-6 safe-top safe-bottom">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
            <MapPin className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">Location Required</h2>
          <p className="text-sm text-white/60 leading-relaxed">
            UniRoute needs GPS access to broadcast your bus location to students.
          </p>
          <div className="text-left bg-white/5 rounded-2xl border border-white/10 p-4 space-y-2 text-sm">
            <p className="font-semibold text-white">To enable:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-white/60">
              <li>Click the lock icon in your browser address bar</li>
              <li>Set Location to "Allow"</li>
              <li>Refresh this page</li>
            </ol>
          </div>
          <div className="space-y-3">
            <Button className="w-full h-14 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-base" onClick={handleRetryGps}>Try Again</Button>
            <Button className="w-full h-14 rounded-xl bg-white/10 hover:bg-white/20 text-white border-0 font-semibold" onClick={() => window.location.reload()}>Refresh Page</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 -left-20 w-80 h-80 bg-[#CC1B1B]/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-40 -right-20 w-96 h-96 bg-[#CC1B1B]/5 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-white/3 rounded-full blur-[100px]" />
      </div>

      {/* LIVE banner for active trip */}
      {activeTrip && isOnline && (
        <div className="relative z-10 bg-gradient-to-r from-[#CC1B1B] to-[#E53E3E] text-white text-center text-sm py-2.5 safe-top flex items-center justify-center gap-2 font-semibold shadow-lg shadow-[#CC1B1B]/30">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
          LIVE — Broadcasting your location
        </div>
      )}

      {/* Offline banner */}
      {activeTrip && !isOnline && (
        <div className="bg-red-500/20 border-b border-red-500/30 text-red-300 text-xs text-center py-2 safe-top flex items-center justify-center gap-2">
          <WifiOff className="h-3.5 w-3.5" /> Offline — queuing GPS
          {queueSize > 0 && <span className="opacity-80">({queueSize} point{queueSize !== 1 ? "s" : ""})</span>}
        </div>
      )}
      {flushProgress && <div className="bg-green-500/20 border-b border-green-500/30 text-green-300 text-xs text-center py-2">{flushProgress}</div>}
      {reconnectMsg && !flushProgress && <div className="bg-green-500/20 border-b border-green-500/30 text-green-300 text-xs text-center py-2">{reconnectMsg}</div>}

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4 safe-top">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
            <img src="/uniroute-logo.png" alt="UniRoute" className="h-5 w-5 object-contain brightness-0 invert" />
          </div>
          <span className="text-base font-bold text-white tracking-tight">UniRoute</span>
        </div>
        <button onClick={handleLogout} className="text-white/40 hover:text-white hover:bg-white/10 rounded-xl p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center transition-all">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="flex-1 flex flex-col relative z-10">
        {/* ═══ BUS SELECTION SCREEN ═══ */}
        {!activeTrip && !resumeTrip && !loadingResume && (
          <div className="flex-1 flex flex-col">
            {/* Left-aligned greeting */}
            <div className="px-6 pt-6 pb-10 space-y-1.5">
              <p className="text-2xl text-white/80">{greeting}</p>
              <p className="text-3xl font-extrabold text-white tracking-tight">{displayName}</p>
              <p className="text-sm text-white/40 mt-2">Ready to start your trip?</p>
              <div className="flex items-center gap-3 text-xs text-white/30 mt-3">
                <span className="flex items-center gap-1.5 bg-white/5 rounded-full px-3 py-1.5 border border-white/5"><Clock className="h-3 w-3" /> {timeStr}</span>
                <span className="flex items-center gap-1.5 bg-white/5 rounded-full px-3 py-1.5 border border-white/5"><Calendar className="h-3 w-3" /> {dateStr}</span>
              </div>
            </div>

            {/* White bottom card */}
            <div className="flex-1 bg-white rounded-t-[2rem] px-6 pt-8 pb-8 space-y-6 max-w-[480px] w-full mx-auto sm:mx-0 sm:ml-auto sm:mr-8 shadow-2xl shadow-black/20">
              <h2 className="text-lg font-extrabold text-gray-900 tracking-tight">Start Your Trip</h2>

              {gpsError && !gpsDenied && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 font-medium">{gpsError}</div>
              )}
              {queueTrimmed && (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Extended offline period detected.
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Select Your Bus</label>
                <Select value={selectedBus} onValueChange={setSelectedBus}>
                  <SelectTrigger className="h-14 rounded-2xl bg-gray-50 border-2 border-gray-100 text-gray-900 text-sm font-medium focus:ring-0 focus:border-[#CC1B1B]">
                    <SelectValue placeholder="Choose a bus…" />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-50 rounded-xl border border-gray-200 shadow-lg">
                    {buses.length === 0 && <SelectItem value="__none" disabled>No buses assigned</SelectItem>}
                    {buses.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="py-3 text-sm">
                        <span className="flex items-center gap-2">
                          <Bus className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{b.name}</span>
                          {b.license_plate && <span className="text-gray-400 text-xs">({b.license_plate})</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Select Route</label>
                <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                  <SelectTrigger className="h-14 rounded-2xl bg-gray-50 border-2 border-gray-100 text-gray-900 text-sm font-medium focus:ring-0 focus:border-[#CC1B1B]">
                    <SelectValue placeholder="Choose a route…" />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-50 rounded-xl border border-gray-200 shadow-lg">
                    {routes.length === 0 && <SelectItem value="__none" disabled>No routes available</SelectItem>}
                    {routes.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="py-3 text-sm">
                        <span className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{r.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Trip Preview */}
              {selectedBus && selectedRoute && selectedBusObj && selectedRouteObj && (
                <div className="rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100/50 border-2 border-gray-100 p-4 space-y-2 animate-fade-in shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Trip Preview</p>
                  <p className="text-sm text-gray-900 font-medium flex items-center gap-1.5"><Bus className="h-3.5 w-3.5 text-[#CC1B1B]" /> {selectedBusObj.name}</p>
                  <p className="text-sm text-gray-900 font-medium flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#CC1B1B]" /> {selectedRouteObj.name}</p>
                  <p className="text-sm text-gray-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {dateStr}</p>
                </div>
              )}

              <button
                className={`w-full h-16 rounded-2xl text-lg font-bold transition-all active:scale-[0.98] text-white flex items-center justify-center gap-2 ${
                  !selectedBus || !selectedRoute || starting
                    ? "bg-gray-200 text-gray-400 shadow-none cursor-not-allowed"
                    : "bg-gradient-to-r from-[#CC1B1B] to-[#E53E3E] hover:from-[#A81515] hover:to-[#CC1B1B] shadow-[0_8px_30px_rgba(204,27,27,0.4)]"
                }`}
                disabled={!selectedBus || !selectedRoute || starting}
                onClick={handleStartTrip}
              >
                {starting ? (
                  <><Loader2 className="h-5 w-5 animate-spin" />Starting…</>
                ) : (
                  <><Play className="h-5 w-5" /> START TRIP</>
                )}
              </button>
            </div>

            {/* Bottom helper text */}
            <div className="bg-[#0F172A] px-6 py-5 space-y-2 text-center">
              <p className="text-xs text-white/30 flex items-center justify-center gap-1.5"><Navigation className="h-3 w-3" /> GPS activates on trip start</p>
              <p className="text-xs text-white/30 flex items-center justify-center gap-1.5"><Users className="h-3 w-3" /> Students see your location live</p>
            </div>
          </div>
        )}

        {/* Resume Trip Banner */}
        {!activeTrip && resumeTrip && !loadingResume && (
          <div className="px-5 pt-8">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 space-y-5 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <RefreshCw className="h-5 w-5 text-white animate-spin" style={{ animationDuration: '3s' }} />
                </div>
                <div>
                  <p className="text-base font-bold text-white">Active trip in progress</p>
                  <p className="text-xs text-white/40">Resume or end your current trip</p>
                </div>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-2">
                <p className="text-sm text-white font-medium flex items-center gap-2"><Bus className="h-4 w-4 text-[#CC1B1B]" /> {resumeTrip.busName} — {resumeTrip.routeName}</p>
                <p className="text-xs text-white/40 flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> Started at {formatTime(resumeTrip.startedAt)}</p>
              </div>
              <div className="flex gap-3">
                <Button className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-bold text-base shadow-lg shadow-green-600/30" onClick={handleResumeTrip}>Resume Trip</Button>
                <Button className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-bold text-base shadow-lg shadow-red-600/30" disabled={ending} onClick={handleEndResumedTrip}>
                  {ending ? <Loader2 className="h-5 w-5 animate-spin" /> : "End Trip"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {!activeTrip && !resumeTrip && loadingResume && (
          <div className="flex-1 flex justify-center items-center"><Loader2 className="h-8 w-8 animate-spin text-white/30" /></div>
        )}

        {/* ═══ ACTIVE TRIP ═══ */}
        {activeTrip && (
          <div className="flex-1 flex flex-col px-4 pb-4">
            {/* Main glassmorphism card */}
            <div className="bg-white/[0.08] backdrop-blur-xl border border-white/15 rounded-3xl p-6 space-y-5 flex-1 shadow-2xl shadow-black/20">
              {/* Card top row */}
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold">Active Trip</p>
                  <p className="text-2xl font-extrabold text-white tracking-tight">{activeTrip.busName}</p>
                  <p className="text-sm text-white/50 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-[#CC1B1B]" /> {activeTrip.routeName}
                  </p>
                </div>
                <div className="bg-green-500/15 border border-green-500/30 rounded-full px-3.5 py-1.5 flex items-center gap-2 shadow-lg shadow-green-500/10">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                  </span>
                  <span className="text-green-400 text-xs font-semibold">Broadcasting</span>
                </div>
              </div>

              <div className="border-t border-white/10" />

              {/* Stats 2x2 grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Started */}
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 relative hover:bg-white/[0.08] transition-colors">
                  <Clock className="h-4 w-4 text-white/20 absolute top-3 right-3" />
                  <p className="text-[10px] text-white/35 uppercase font-bold tracking-[0.15em]">Started</p>
                  <p className="text-2xl font-extrabold text-white mt-1.5 tabular-nums">{formatTime(activeTrip.startedAt)}</p>
                </div>

                {/* GPS Pings */}
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 relative hover:bg-white/[0.08] transition-colors">
                  <Radio className="h-4 w-4 text-green-400/30 absolute top-3 right-3" />
                  <p className="text-[10px] text-white/35 uppercase font-bold tracking-[0.15em]">GPS Pings</p>
                  <p className="text-2xl font-extrabold text-green-400 mt-1.5 tabular-nums">{pingCount}</p>
                  {queueSize > 0 && <p className="text-[10px] text-yellow-400 font-bold mt-1">+{queueSize} queued</p>}
                </div>

                {/* Duration */}
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 relative hover:bg-white/[0.08] transition-colors">
                  <Timer className="h-4 w-4 text-white/20 absolute top-3 right-3" />
                  <p className="text-[10px] text-white/35 uppercase font-bold tracking-[0.15em]">Duration</p>
                  <p className="text-2xl font-extrabold text-white mt-1.5 font-mono tabular-nums">{duration}</p>
                </div>

                {/* GPS Status */}
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 relative hover:bg-white/[0.08] transition-colors">
                  <Navigation className={`h-4 w-4 absolute top-3 right-3 ${pingCount >= 3 ? 'text-green-400/30' : 'text-white/20'}`} />
                  <p className="text-[10px] text-white/35 uppercase font-bold tracking-[0.15em]">GPS Status</p>
                  <p className={`text-sm font-bold mt-1.5 ${pingCount >= 3 ? 'text-green-400' : pingCount > 0 ? 'text-amber-400' : 'text-white/40'}`}>
                    {gpsQ.label}
                  </p>
                </div>
              </div>

              {/* GPS Quality bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-white/35 uppercase font-bold tracking-[0.15em]">GPS Quality</p>
                  <p className="text-[10px] text-white/40 font-semibold">{gpsQ.percent}%</p>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${gpsQ.color}`}
                    style={{ width: `${gpsQ.percent}%` }}
                  />
                </div>
              </div>

              {/* Delay banner */}
              {delayReason && (
                <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 flex items-center justify-between">
                  <p className="text-sm text-yellow-400 font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {delayReason}</p>
                  <button onClick={handleResolveDelay} className="text-xs font-bold text-green-400 hover:underline ml-2 shrink-0 flex items-center gap-1 min-h-[44px]">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
                  </button>
                </div>
              )}

              {/* Battery tier */}
              {batInfo && (
                <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold flex items-center gap-2.5 ${batInfo.color}`}>
                  {batInfo.icon} {batInfo.text}
                </div>
              )}

              {/* GPS Error */}
              {gpsError && !gpsDenied && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 font-semibold">{gpsError}</div>
              )}
              {queueTrimmed && (
                <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400 font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Extended offline period. Some GPS history may be incomplete.
                </div>
              )}
            </div>

            {/* Bottom action buttons */}
            <div className="pt-4 space-y-3" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
              {/* Report delay button */}
              <button
                onClick={() => setSheetOpen(true)}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#D97706] to-[#F59E0B] text-white font-bold shadow-[0_4px_20px_rgba(217,119,6,0.35)] transition-all active:scale-[0.98] active:brightness-110 flex items-center justify-between px-5 min-h-[56px]"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5" />
                  <span>{delayReason ? "Update Report" : "Report Delay"}</span>
                </div>
                <ChevronRight className="h-5 w-5 text-white/60" />
              </button>

              {/* Hold-to-end trip button */}
              <button
                onPointerDown={startHold}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                onContextMenu={(e) => e.preventDefault()}
                disabled={ending}
                className="w-full h-14 rounded-2xl border-2 border-red-500/40 text-red-300 font-semibold transition-all flex items-center justify-center gap-2 min-h-[56px] relative overflow-hidden disabled:opacity-50"
              >
                {/* Hold progress fill */}
                <div
                  className="absolute inset-0 bg-red-600/30 transition-none"
                  style={{ width: `${holdProgress * 100}%` }}
                />
                <span className="relative flex items-center gap-2">
                  {ending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Square className="h-5 w-5" />
                      {holdProgress > 0 ? "Hold to end trip…" : "End Trip"}
                    </>
                  )}
                </span>
              </button>
            </div>
          </div>
        )}
      </main>

      <ReportDelaySheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={handleReportSubmit} />
    </div>
  );
};

export default DriverPage;
