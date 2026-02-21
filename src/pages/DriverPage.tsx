import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGpsBroadcast } from "@/hooks/useGpsBroadcast";
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
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
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

  // Delay state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [delayReason, setDelayReason] = useState<string | null>(null);

  // GPS broadcasting
  const { pingCount, gpsError, lowBattery, reconnectMsg, cleanup: cleanupGps } = useGpsBroadcast({
    busId: activeTrip?.busId || "",
    tripId: activeTripId || "",
    active: !!activeTripId && !!activeTrip,
  });

  // Fetch profile + buses + routes
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

  // Check for existing active trip on mount (also restore delay state)
  useEffect(() => {
    if (!user) return;
    const checkActive = async () => {
      const { data } = await supabase
        .from("trips")
        .select("id, bus_id, route_id, started_at, status, buses(name), routes(name)")
        .eq("driver_id", user.id)
        .in("status", ["active", "delayed"])
        .limit(1)
        .maybeSingle();
      if (data) {
        setActiveTripId(data.id);
        setActiveTrip({
          id: data.id,
          busId: data.bus_id,
          busName: (data.buses as any)?.name ?? "Unknown Bus",
          routeName: (data.routes as any)?.name ?? "Unknown Route",
          startedAt: data.started_at ?? data.id,
        });
        if (data.status === "delayed") {
          // Restore delay banner — fetch the latest exception for context
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
    };
    checkActive();
  }, [user, setActiveTripId]);

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
      // Insert exception first
      const payload = {
        bus_id: activeTrip.busId,
        exception_date: new Date().toISOString().split("T")[0],
        type: isCancellation ? "cancellation" : "time_shift",
        notes: combinedNotes,
        notified: false,
        created_by: user.id,
      };
      console.log("Exception payload:", payload);
      const { data: inserted, error: excError } = await supabase
        .from("exceptions")
        .insert(payload)
        .select("id")
        .single();
      if (excError) throw excError;

      // Send push notification, then update notified flag
      const { data: tripData } = await supabase
        .from("trips")
        .select("route_id")
        .eq("id", activeTripId)
        .single();
      const routeId = tripData?.route_id;

      if (routeId && inserted) {
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
          if (!pushError) {
            await supabase
              .from("exceptions")
              .update({ notified: true })
              .eq("id", inserted.id);
          }
        } catch (pushErr) {
          console.error("Push notification failed:", pushErr);
        }
      }

      if (isCancellation) {
        // Cancel trip
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
        // Mark as delayed
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-lg font-bold text-foreground">UniRoute Driver</h1>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="mr-1 h-4 w-4" />
          Logout
        </Button>
      </header>

      <main className="mx-auto max-w-md px-4 py-6 space-y-6">
        {/* Greeting */}
        <p className="text-lg text-foreground">
          {getGreeting()}, <span className="font-semibold">{displayName}</span>
        </p>

        {/* GPS Error */}
        {gpsError && (
          <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {gpsError}
          </div>
        )}

        {!activeTrip ? (
          /* ========== STATE 1: Before Trip ========== */
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-foreground">Start Your Trip</h2>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Select Your Bus</label>
              <Select value={selectedBus} onValueChange={setSelectedBus}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Choose a bus…" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
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

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Select Route</label>
              <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Choose a route…" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
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
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-lg py-6"
              disabled={!selectedBus || !selectedRoute || starting}
              onClick={handleStartTrip}
            >
              {starting ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Starting…</>
              ) : (
                "START TRIP 🚌"
              )}
            </Button>
          </div>
        ) : (
          /* ========== STATE 2: Active Trip ========== */
          <div className="space-y-5">
            {/* Active banner */}
            <div className="rounded-lg bg-emerald-600 px-4 py-3 text-center text-white font-semibold text-base">
              🟢 Trip Active
            </div>

            {/* Delay banner */}
            {delayReason && (
              <div className="rounded-lg bg-amber-500/15 border border-amber-500 px-4 py-2">
                <p className="text-sm text-amber-600 font-medium">⚠️ Delay reported — {delayReason}</p>
                <button
                  onClick={handleResolveDelay}
                  className="mt-1 text-xs font-medium text-emerald-600 hover:underline"
                >
                  ✅ Resolved
                </button>
              </div>
            )}

            {/* Low battery warning */}
            {lowBattery && (
              <div className="rounded-lg bg-amber-500/15 border border-amber-500 px-4 py-2 text-sm text-amber-600 font-medium">
                ⚠️ Low battery — reduced GPS accuracy
              </div>
            )}

            {/* Reconnect message */}
            {reconnectMsg && (
              <div className="rounded-lg bg-emerald-500/15 border border-emerald-500 px-4 py-2 text-sm text-emerald-600 font-medium">
                {reconnectMsg}
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-border p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bus</span>
                <span className="font-medium text-foreground">{activeTrip.busName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Route</span>
                <span className="font-medium text-foreground">{activeTrip.routeName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Started</span>
                <span className="font-medium text-foreground">{formatTime(activeTrip.startedAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">GPS Pings Sent</span>
                <span className="font-mono font-medium text-foreground">{pingCount}</span>
              </div>
            </div>

            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white text-lg py-6"
              disabled={ending}
              onClick={handleEndTrip}
            >
              {ending ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Ending…</>
              ) : (
                "END TRIP"
              )}
            </Button>

            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-white text-lg py-6"
              onClick={() => setSheetOpen(true)}
            >
              {delayReason ? "UPDATE DELAY ⚠️" : "REPORT DELAY ⚠️"}
            </Button>
          </div>
        )}
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
