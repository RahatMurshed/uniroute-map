import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGpsBroadcast, type BatteryTier } from "@/hooks/useGpsBroadcast";
import { ReportDelaySheet, ISSUE_OPTIONS, type IssueKey } from "@/components/ReportDelaySheet";

interface BusOption {
  id: string;
  name: string;
  license_plate: string | null;
}

interface RouteOption {
  id: string;
  name: string;
}

interface ActiveTrip {
  id: string;
  busId: string;
  busName: string;
  routeName: string;
  startedAt: string;
}

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", emoji: "🌅" };
  if (h < 17) return { text: "Good afternoon", emoji: "☀️" };
  return { text: "Good evening", emoji: "🌙" };
};

const batteryLabel = (tier: BatteryTier): { text: string; color: string } | null => {
  switch (tier) {
    case "reduced": return { text: "🔋 Reduced GPS (battery saving)", color: "bg-warning/10 border-warning/30 text-warning" };
    case "minimal": return { text: "🔋 Minimal GPS (low battery ⚠️)", color: "bg-destructive/10 border-destructive/30 text-destructive" };
    case "charging": return { text: "⚡ Charging — Full GPS active", color: "bg-success/10 border-success/30 text-success" };
    default: return null;
  }
};

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

  const {
    pingCount, gpsError, batteryTier, isOnline,
    queueSize, flushProgress, reconnectMsg, queueTrimmed, cleanup: cleanupGps,
  } = useGpsBroadcast({
    busId: activeTrip?.busId || "",
    tripId: activeTripId || "",
    active: !!activeTripId && !!activeTrip && !gpsDenied,
  });

  useEffect(() => {
    if (gpsError && gpsError.toLowerCase().includes("denied")) {
      setGpsDenied(true);
    } else if (!gpsError) {
      setGpsDenied(false);
    }
  }, [gpsError]);

  const handleRetryGps = () => {
    navigator.geolocation.getCurrentPosition(
      () => setGpsDenied(false),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsDenied(true);
        }
      }
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
          id: data.id,
          busId: data.bus_id,
          busName: (data.buses as any)?.name ?? "Unknown Bus",
          routeName: (data.routes as any)?.name ?? "Unknown Route",
          startedAt: data.started_at ?? data.id,
        };

        if (activeTripId === data.id) {
          setActiveTrip(trip);
        } else {
          setResumeTrip(trip);
        }

        if (data.status === "delayed") {
          const { data: exc } = await supabase
            .from("exceptions")
            .select("notes")
            .eq("bus_id", data.bus_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          setDelayReason(exc?.notes ?? "Delay reported");
        }
      }
      setLoadingResume(false);
    };
    checkActive();
  }, [user, activeTripId, setActiveTripId]);

  const handleResumeTrip = () => {
    if (!resumeTrip) return;
    setActiveTripId(resumeTrip.id);
    setActiveTrip(resumeTrip);
    setResumeTrip(null);
  };

  const handleEndResumedTrip = async () => {
    if (!resumeTrip) return;
    setEnding(true);
    try {
      await supabase
        .from("trips")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", resumeTrip.id);
      setResumeTrip(null);
      setActiveTripId(null);
      setActiveTrip(null);
      setDelayReason(null);
      toast({ title: "✅ Trip ended successfully" });
    } catch (err: any) {
      toast({ title: "Failed to end trip", description: err.message, variant: "destructive" });
    } finally {
      setEnding(false);
    }
  };

  const handleStartTrip = async () => {
    if (!user || !selectedBus || !selectedRoute) return;
    setStarting(true);
    try {
      const { data, error } = await supabase
        .from("trips")
        .insert({
          bus_id: selectedBus,
          route_id: selectedRoute,
          driver_id: user.id,
          started_at: new Date().toISOString(),
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw error;

      const bus = buses.find((b) => b.id === selectedBus);
      const route = routes.find((r) => r.id === selectedRoute);
      setActiveTripId(data.id);
      setActiveTrip({
        id: data.id,
        busId: selectedBus,
        busName: bus?.name ?? "",
        routeName: route?.name ?? "",
        startedAt: new Date().toISOString(),
      });
      setDelayReason(null);
    } catch (err: any) {
      toast({ title: "Failed to start trip", description: err.message, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const handleEndTrip = async () => {
    if (!activeTripId) return;
    setEnding(true);
    try {
      cleanupGps();
      const { error } = await supabase
        .from("trips")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", activeTripId);
      if (error) throw error;

      setActiveTripId(null);
      setActiveTrip(null);
      setDelayReason(null);
      toast({ title: "✅ Trip ended successfully" });
    } catch (err: any) {
      toast({ title: "Failed to end trip", description: err.message, variant: "destructive" });
    } finally {
      setEnding(false);
    }
  };

  const handleReportSubmit = async (issueKey: IssueKey, notes: string) => {
    if (!user || !activeTrip || !activeTripId) return;

    const option = ISSUE_OPTIONS.find((o) => o.key === issueKey);
    const isCancellation = issueKey === "cancel";
    const combinedNotes = [option?.delayLabel, notes].filter(Boolean).join(" — ");

    try {
      const { data: tripData } = await supabase
        .from("trips")
        .select("route_id")
        .eq("id", activeTripId)
        .single();
      const routeId = tripData?.route_id;

      let notified = false;
      if (routeId) {
        try {
          const { error: pushError } = await supabase.functions.invoke("send-push-notifications", {
            body: {
              type: "exception",
              bus_id: activeTrip.busId,
              bus_name: activeTrip.busName,
              exception_type: isCancellation ? "cancellation" : "time_shift",
              time_offset_mins: null,
              route_id: routeId,
              notes: combinedNotes,
            },
          });
          if (!pushError) notified = true;
        } catch (pushErr) {
          console.error("Push notification failed:", pushErr);
        }
      }

      const { error: excError } = await supabase
        .from("exceptions")
        .insert({
          bus_id: activeTrip.busId,
          exception_date: new Date().toISOString().split("T")[0],
          type: isCancellation ? "cancellation" : "time_shift",
          notes: combinedNotes,
          notified,
          created_by: user.id,
        });
      if (excError) throw excError;

      if (isCancellation) {
        cleanupGps();
        await supabase
          .from("trips")
          .update({ status: "cancelled", ended_at: new Date().toISOString() })
          .eq("id", activeTripId);
        setActiveTripId(null);
        setActiveTrip(null);
        setDelayReason(null);
        toast({ title: "✅ Trip cancelled and students notified" });
      } else {
        await supabase.from("trips").update({ status: "delayed" }).eq("id", activeTripId);
        setDelayReason(option?.delayLabel ?? "Delay reported");
        toast({ title: "✅ Delay reported and students notified" });
      }

      setSheetOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to submit report. Please try again.", variant: "destructive" });
    }
  };

  const handleResolveDelay = async () => {
    if (!activeTripId) return;
    try {
      const { error } = await supabase.from("trips").update({ status: "active" }).eq("id", activeTripId);
      if (error) throw error;
      setDelayReason(null);
    } catch (err: any) {
      toast({ title: "Failed to resolve delay", variant: "destructive" });
    }
  };

  const handleLogout = useCallback(async () => {
    cleanupGps();
    await signOut();
    navigate("/login", { replace: true });
  }, [signOut, navigate, cleanupGps]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "--:--";
    }
  };

  const batInfo = batteryLabel(batteryTier);
  const greeting = getGreeting();

  // GPS Permission Denied full-screen
  if (gpsDenied && activeTrip) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 safe-top safe-bottom">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-4xl">📍</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Location Required</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            UniRoute needs GPS access to broadcast your bus location to students.
          </p>
          <div className="text-left bg-card rounded-xl border border-border p-4 space-y-2 text-sm shadow-sm">
            <p className="font-semibold text-foreground">To enable:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
              <li>Click the 🔒 lock icon in your browser address bar</li>
              <li>Set Location to "Allow"</li>
              <li>Refresh this page</li>
            </ol>
          </div>
          <div className="space-y-3">
            <Button className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold" onClick={handleRetryGps}>
              Try Again
            </Button>
            <Button variant="outline" className="w-full h-12 rounded-xl" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Offline / Online banner */}
      {activeTrip && !isOnline && (
        <div className="bg-destructive text-destructive-foreground text-center text-sm font-medium px-4 py-2.5 safe-top">
          📡 No Connection — GPS points queued locally
          {queueSize > 0 && <span className="ml-2 opacity-80">⏳ {queueSize} point{queueSize !== 1 ? "s" : ""} queued</span>}
        </div>
      )}
      {flushProgress && (
        <div className="bg-success text-success-foreground text-center text-sm font-medium px-4 py-2.5">
          {flushProgress}
        </div>
      )}
      {reconnectMsg && !flushProgress && (
        <div className="bg-success text-success-foreground text-center text-sm font-medium px-4 py-2.5">
          {reconnectMsg}
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card px-5 py-3.5 shadow-sm safe-top">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚌</span>
          <h1 className="text-lg font-bold tracking-tight text-foreground">UniRoute</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground gap-1.5">
          <LogOut className="h-4 w-4" />
          <span className="text-sm">Logout</span>
        </Button>
      </header>

      <main className="flex-1 mx-auto w-full max-w-md px-5 py-6 space-y-5">
        {/* Greeting */}
        <div className="space-y-0.5">
          <p className="text-lg text-foreground">
            {greeting.emoji} {greeting.text}, <span className="font-bold">{displayName}</span>
          </p>
          {!activeTrip && !resumeTrip && !loadingResume && (
            <p className="text-sm text-muted-foreground">Ready to start your trip?</p>
          )}
        </div>

        {/* GPS Error (non-denied) */}
        {gpsError && !gpsDenied && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium">
            {gpsError}
          </div>
        )}

        {/* Queue trimmed warning */}
        {queueTrimmed && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning font-medium">
            ⚠️ Extended offline period detected. Some GPS history may be incomplete.
          </div>
        )}

        {/* Trip Resume Banner */}
        {!activeTrip && resumeTrip && (
          <div className="rounded-xl border border-secondary/30 bg-secondary/10 p-5 space-y-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔄</span>
              <p className="text-sm font-bold text-foreground">Active trip in progress</p>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{resumeTrip.busName} — {resumeTrip.routeName}</p>
              <p>Started at {formatTime(resumeTrip.startedAt)}</p>
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1 h-11 rounded-xl bg-success hover:bg-success/90 text-success-foreground font-semibold"
                onClick={handleResumeTrip}
              >
                Resume Trip
              </Button>
              <Button
                className="flex-1 h-11 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
                disabled={ending}
                onClick={handleEndResumedTrip}
              >
                {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : "End Trip"}
              </Button>
            </div>
          </div>
        )}

        {!activeTrip && !resumeTrip ? (
          loadingResume ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-5">
              <h2 className="text-base font-bold tracking-tight text-foreground">Start Your Trip</h2>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Your Bus</label>
                <Select value={selectedBus} onValueChange={setSelectedBus}>
                  <SelectTrigger className="h-12 rounded-xl bg-background border-border">
                    <SelectValue placeholder="Choose a bus…" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50 rounded-xl">
                    {buses.length === 0 && (
                      <SelectItem value="__none" disabled>No buses assigned</SelectItem>
                    )}
                    {buses.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}{b.license_plate ? ` — ${b.license_plate}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Route</label>
                <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                  <SelectTrigger className="h-12 rounded-xl bg-background border-border">
                    <SelectValue placeholder="Choose a route…" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50 rounded-xl">
                    {routes.length === 0 && (
                      <SelectItem value="__none" disabled>No routes available</SelectItem>
                    )}
                    {routes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className={`w-full h-14 rounded-xl text-lg font-bold shadow-md transition-all active:scale-[0.98] bg-primary hover:bg-primary/90 text-primary-foreground ${
                  selectedBus && selectedRoute ? "animate-pulse" : ""
                }`}
                disabled={!selectedBus || !selectedRoute || starting}
                onClick={handleStartTrip}
              >
                {starting ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Starting…</>
                ) : (
                  <>🚌 START TRIP</>
                )}
              </Button>
            </div>
          )
        ) : activeTrip ? (
          <div className="space-y-4">
            {/* Active trip header */}
            <div className="bg-sidebar rounded-xl px-5 py-4 flex items-center justify-between shadow-sm">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">Active Trip</p>
                <p className="text-base font-bold text-sidebar-foreground">{activeTrip.routeName}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
                </span>
                <span className="text-sm font-semibold text-success">LIVE</span>
              </div>
            </div>

            {/* Delay banner */}
            {delayReason && (
              <div className="rounded-xl bg-warning/10 border border-warning/30 px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-warning font-medium">⚠️ {delayReason}</p>
                <button
                  onClick={handleResolveDelay}
                  className="text-xs font-semibold text-success hover:underline ml-2 shrink-0"
                >
                  ✅ Resolved
                </button>
              </div>
            )}

            {/* Battery tier indicator */}
            {batInfo && (
              <div className={`rounded-xl border px-4 py-2.5 text-sm font-medium ${batInfo.color}`}>
                {batInfo.text}
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Bus</p>
                <p className="text-sm font-bold text-foreground">{activeTrip.busName}</p>
              </div>
              <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Route</p>
                <p className="text-sm font-bold text-foreground">{activeTrip.routeName}</p>
              </div>
              <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Started</p>
                <p className="text-sm font-bold text-foreground">{formatTime(activeTrip.startedAt)}</p>
              </div>
              <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">GPS Pings</p>
                <p className="text-sm font-bold font-mono text-foreground">{pingCount}</p>
                {queueSize > 0 && (
                  <p className="text-xs text-warning font-medium mt-0.5">+{queueSize} queued</p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-3 pt-2">
              <Button
                className="w-full h-14 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground text-lg font-bold shadow-md transition-all active:scale-[0.98]"
                disabled={ending}
                onClick={handleEndTrip}
              >
                {ending ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Ending…</>
                ) : (
                  "🛑 END TRIP"
                )}
              </Button>

              <Button
                className="w-full h-14 rounded-xl bg-warning hover:bg-warning/90 text-warning-foreground text-lg font-bold shadow-md transition-all active:scale-[0.98]"
                onClick={() => setSheetOpen(true)}
              >
                {delayReason ? "📝 UPDATE REPORT" : "⚠️ REPORT DELAY"}
              </Button>
            </div>
          </div>
        ) : null}
      </main>

      {/* Report Delay Bottom Sheet */}
      <ReportDelaySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSubmit={handleReportSubmit}
      />
    </div>
  );
};

export default DriverPage;
