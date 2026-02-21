import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { Stop, RouteInfo } from "@/hooks/useMapData";

interface NotificationSheetProps {
  open: boolean;
  onClose: () => void;
  routes: RouteInfo[];
  stops: Stop[];
  favouriteStopId: string | null;
  onSubscribe: (routeId: string, stopId: string) => Promise<{ success: boolean; error?: string }>;
}

export default function NotificationSheet({
  open,
  onClose,
  routes,
  stops,
  favouriteStopId,
  onSubscribe,
}: NotificationSheetProps) {
  const [routeId, setRouteId] = useState("");
  const [stopId, setStopId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Pre-fill favourite stop
  useEffect(() => {
    if (open) {
      if (favouriteStopId && stops.some((s) => s.id === favouriteStopId)) {
        setStopId(favouriteStopId);
      }
      if (routes.length === 1) setRouteId(routes[0].id);
      setResult(null);
    }
  }, [open, favouriteStopId, stops, routes]);

  const handleSubscribe = async () => {
    if (!routeId || !stopId) return;
    setSubmitting(true);
    const res = await onSubscribe(routeId, stopId);
    setSubmitting(false);
    if (res.success) {
      setResult({ type: "success", msg: "✅ Notifications enabled!" });
      setTimeout(() => onClose(), 1500);
    } else if (res.error === "Permission denied") {
      setResult({ type: "error", msg: "Notifications blocked. Enable them in your browser settings to get alerts." });
    } else {
      setResult({ type: "error", msg: res.error ?? "Failed to subscribe" });
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-background border-t border-border shadow-lg transition-transform duration-300 ease-out ${open ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="mx-auto max-w-md px-5 pb-8 pt-4 space-y-4">
          <div className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/30" />

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Get Bus Alerts 🔔</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {result ? (
            <div className={`rounded-xl p-4 text-center text-sm ${
              result.type === "success" 
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" 
                : "bg-destructive/10 text-destructive"
            }`}>
              {result.msg}
            </div>
          ) : (
            <>
              {/* Route select */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Choose which route to follow:
                </label>
                <select
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a route</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* Stop select */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Your stop:
                </label>
                <select
                  value={stopId}
                  onChange={(e) => setStopId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a stop</option>
                  {stops.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.landmark ? ` (${s.landmark})` : ""}</option>
                  ))}
                </select>
              </div>

              {/* Notify options */}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Notify me when bus is:</p>
                <div className="space-y-2">
                  {[
                    { label: "~5 minutes away", defaultOn: true },
                    { label: "Delayed or cancelled", defaultOn: true },
                    { label: "Route changed today", defaultOn: true },
                  ].map((opt) => (
                    <label key={opt.label} className="flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" defaultChecked={opt.defaultOn} className="rounded" disabled />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <Button
                  className="w-full py-5 text-base"
                  disabled={!routeId || !stopId || submitting}
                  onClick={handleSubscribe}
                >
                  {submitting ? "Enabling…" : "Enable Notifications 🔔"}
                </Button>
                <Button variant="ghost" className="w-full" onClick={onClose}>
                  Not now
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
