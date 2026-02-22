import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, LogOut, Bus, MapPin, Play, Square, AlertOctagon, Radio, Navigation, Sunrise, Sun, Moon, RefreshCw, AlertTriangle, WifiOff, CheckCircle2, Battery, BatteryLow, Zap, Clock, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGpsBroadcast, type BatteryTier } from "@/hooks/useGpsBroadcast";
import { ReportDelaySheet, ISSUE_OPTIONS, type IssueKey } from "@/components/ReportDelaySheet";

interface BusOption { id: string; name: string; license_plate: string | null; }
interface RouteOption { id: string; name: string; }
interface ActiveTrip { id: string; busId: string; busName: string; routeName: string; startedAt: string; }

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", icon: <Sunrise className="h-6 w-6" /> };
  if (h < 17) return { text: "Good afternoon", icon: <Sun className="h-6 w-6" /> };
  return { text: "Good evening", icon: <Moon className="h-6 w-6" /> };
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
    finally { setEnding(false); }
  };

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

  // GPS Permission Denied
  if (gpsDenied && activeTrip) {
    return (
      <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center px-6 safe-top safe-bottom">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
            <MapPin className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">Location Required</h2>
          <p className="text-sm text-white/60 leading-relaxed">
            MU Bus Tracker needs GPS access to broadcast your bus location to students.
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
    <div className="min-h-screen bg-[#1A1A2E] flex flex-col">
      {/* Offline / Reconnect banners */}
      {activeTrip && !isOnline && (
        <div className="bg-red-600 text-white text-center text-sm font-semibold px-4 py-3 safe-top flex items-center justify-center gap-2">
          <WifiOff className="h-4 w-4" /> No connection — GPS queued
          {queueSize > 0 && <span className="opacity-80">({queueSize} point{queueSize !== 1 ? "s" : ""})</span>}
        </div>
      )}
      {flushProgress && <div className="bg-green-600 text-white text-center text-sm font-semibold px-4 py-3">{flushProgress}</div>}
      {reconnectMsg && !flushProgress && <div className="bg-green-600 text-white text-center text-sm font-semibold px-4 py-3">{reconnectMsg}</div>}

      {/* LIVE TRACKING BAR (active trip only) */}
      {activeTrip && isOnline && (
        <div className="bg-[#16A34A] text-white text-center text-sm font-bold px-4 py-2.5 safe-top flex items-center justify-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          LIVE TRACKING ACTIVE
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 safe-top">
        <div className="flex items-center gap-2.5">
          <img src="/metropolitan-logo.png" alt="MU" className="h-7 w-7 object-contain brightness-0 invert" />
          <span className="text-base font-bold text-white tracking-tight">MU Transport</span>
        </div>
        <button onClick={handleLogout} className="text-white/50 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="flex-1 flex flex-col px-5 pb-8">
        {!activeTrip && !resumeTrip && !loadingResume && (
          <>
            {/* Greeting */}
            <div className="pt-4 pb-8 space-y-2">
              <div className="flex items-center gap-2 text-white/40">
                {greeting.icon}
              </div>
              <h1 className="text-3xl font-bold text-white leading-tight">
                {greeting.text},<br />
                <span className="text-primary">{displayName}</span>
              </h1>
              <p className="text-white/40 text-sm">Ready to start your trip?</p>
              <div className="flex items-center gap-3 text-white/50 text-sm pt-1">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {timeStr}</span>
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {dateStr}</span>
              </div>
            </div>

            {/* Main Card */}
            <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-[440px] mx-auto space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Bus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#1A1A2E] tracking-tight">Start Your Trip</h2>
                  <p className="text-xs text-[#78716C]">Select your bus and route to begin GPS broadcasting</p>
                </div>
              </div>

              {/* GPS Error */}
              {gpsError && !gpsDenied && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 font-medium">{gpsError}</div>
              )}
              {queueTrimmed && (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Extended offline period detected. Some GPS history may be incomplete.
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#78716C]">Select Your Bus</label>
                <Select value={selectedBus} onValueChange={setSelectedBus}>
                  <SelectTrigger className="h-14 rounded-xl bg-[#F8F8F8] border-[#E5E5E5] text-[#1A1A2E] text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent">
                    <SelectValue placeholder="Choose a bus…" />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-50 rounded-xl border border-[#E5E5E5] shadow-lg">
                    {buses.length === 0 && <SelectItem value="__none" disabled>No buses assigned</SelectItem>}
                    {buses.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="py-3 text-sm">
                        <span className="flex items-center gap-2">
                          <Bus className="h-4 w-4 text-[#78716C]" />
                          <span className="font-medium">{b.name}</span>
                          {b.license_plate && <span className="text-[#A8A29E] text-xs">({b.license_plate})</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#78716C]">Select Route</label>
                <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                  <SelectTrigger className="h-14 rounded-xl bg-[#F8F8F8] border-[#E5E5E5] text-[#1A1A2E] text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent">
                    <SelectValue placeholder="Choose a route…" />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-50 rounded-xl border border-[#E5E5E5] shadow-lg">
                    {routes.length === 0 && <SelectItem value="__none" disabled>No routes available</SelectItem>}
                    {routes.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="py-3 text-sm">
                        <span className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-[#78716C]" />
                          <span className="font-medium">{r.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Trip Preview */}
              {selectedBus && selectedRoute && selectedBusObj && selectedRouteObj && (
                <div className="rounded-xl bg-[#F8F8F8] border border-[#E5E5E5] p-4 space-y-1.5 animate-fade-in">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#78716C]">Trip Preview</p>
                  <p className="text-sm text-[#1A1A2E] font-medium flex items-center gap-1.5"><Bus className="h-3.5 w-3.5 text-primary" /> {selectedBusObj.name}</p>
                  <p className="text-sm text-[#1A1A2E] font-medium flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-primary" /> {selectedRouteObj.name}</p>
                  <p className="text-sm text-[#78716C] flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {dateStr}</p>
                  <p className="text-sm text-[#78716C] flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Starting now</p>
                </div>
              )}

              <Button
                className={`w-full h-14 rounded-xl text-base font-bold shadow-lg transition-all active:scale-[0.97] bg-primary hover:bg-[#A81515] text-white ${
                  selectedBus && selectedRoute && !starting ? "animate-pulse" : ""
                }`}
                disabled={!selectedBus || !selectedRoute || starting}
                onClick={handleStartTrip}
              >
                {starting ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Starting…</>
                ) : (
                  <><Play className="mr-2 h-5 w-5" /> START TRIP</>
                )}
              </Button>
            </div>

            {/* Bottom info */}
            <div className="text-center pt-6 space-y-1">
              <p className="text-xs text-white/30 flex items-center justify-center gap-1"><Navigation className="h-3 w-3" /> GPS will activate automatically</p>
              <p className="text-xs text-white/30">Students will see your location live</p>
            </div>
          </>
        )}

        {/* Resume Trip Banner */}
        {!activeTrip && resumeTrip && !loadingResume && (
          <div className="pt-8">
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-white" />
                <p className="text-base font-bold text-white">Active trip in progress</p>
              </div>
              <div className="space-y-1 text-sm text-white/60">
                <p className="flex items-center gap-1.5"><Bus className="h-3.5 w-3.5" /> {resumeTrip.busName} — {resumeTrip.routeName}</p>
                <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Started at {formatTime(resumeTrip.startedAt)}</p>
              </div>
              <div className="flex gap-3">
                <Button className="flex-1 h-14 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-base" onClick={handleResumeTrip}>Resume Trip</Button>
                <Button className="flex-1 h-14 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-base" disabled={ending} onClick={handleEndResumedTrip}>
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
          <div className="flex-1 space-y-4 pt-2">
            {/* Trip info card */}
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              {/* Card header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5E5]">
                <div className="flex items-center gap-2">
                  <img src="/metropolitan-logo.png" alt="MU" className="h-5 w-5 object-contain" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#78716C]">Trip Active</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#16A34A]" />
                  </span>
                  <span className="text-xs font-bold text-[#16A34A]">LIVE</span>
                </div>
              </div>

              {/* Bus & Route */}
              <div className="px-5 py-4 border-b border-[#E5E5E5] space-y-1.5">
                <p className="text-base font-bold text-[#1A1A2E] flex items-center gap-2"><Bus className="h-4 w-4 text-primary" /> {activeTrip.busName}</p>
                <p className="text-sm text-[#78716C] flex items-center gap-2"><MapPin className="h-4 w-4" /> {activeTrip.routeName}</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 divide-x divide-[#E5E5E5]">
                <div className="px-5 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#A8A29E]">Started</p>
                  <p className="text-lg font-bold text-[#1A1A2E] tabular-nums">{formatTime(activeTrip.startedAt)}</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#A8A29E]">GPS Pings</p>
                  <p className="text-lg font-bold text-[#1A1A2E] tabular-nums font-mono">{pingCount}</p>
                  {queueSize > 0 && <p className="text-xs text-yellow-600 font-medium">+{queueSize} queued</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-[#E5E5E5] border-t border-[#E5E5E5]">
                <div className="px-5 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#A8A29E]">Duration</p>
                  <p className="text-lg font-bold text-[#1A1A2E] tabular-nums font-mono">{duration}</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#A8A29E]">Status</p>
                  <p className="text-sm font-bold text-[#16A34A] flex items-center gap-1">
                    <Navigation className="h-3.5 w-3.5" /> Broadcasting
                  </p>
                </div>
              </div>
            </div>

            {/* Delay banner */}
            {delayReason && (
              <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/20 px-5 py-4 flex items-center justify-between">
                <p className="text-sm text-yellow-400 font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {delayReason}</p>
                <button onClick={handleResolveDelay} className="text-xs font-bold text-green-400 hover:underline ml-2 shrink-0 flex items-center gap-1 min-h-[44px]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
                </button>
              </div>
            )}

            {/* Battery tier */}
            {batInfo && (
              <div className={`rounded-2xl border px-5 py-3.5 text-sm font-semibold flex items-center gap-2.5 ${batInfo.color}`}>
                {batInfo.icon} {batInfo.text}
              </div>
            )}

            {/* GPS Error */}
            {gpsError && !gpsDenied && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-3.5 text-sm text-red-400 font-semibold">{gpsError}</div>
            )}
            {queueTrimmed && (
              <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-5 py-3.5 text-sm text-yellow-400 font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" /> Extended offline period. Some GPS history may be incomplete.
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-3 pt-2">
              <button
                onClick={() => setSheetOpen(true)}
                className="w-full h-14 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-base font-bold shadow-lg transition-all active:scale-[0.97] flex items-center justify-center gap-2 min-h-[52px]"
              >
                <AlertOctagon className="h-5 w-5" />
                {delayReason ? "UPDATE REPORT" : "REPORT DELAY"}
              </button>

              <button
                onClick={handleEndTrip}
                disabled={ending}
                className="w-full h-14 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-base font-bold shadow-lg transition-all active:scale-[0.97] flex items-center justify-center gap-2 min-h-[52px] disabled:opacity-50"
              >
                {ending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Square className="h-5 w-5" /> END TRIP</>}
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
