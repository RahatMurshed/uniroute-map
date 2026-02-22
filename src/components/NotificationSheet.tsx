import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Bell, BellRing } from "lucide-react";
import type { Stop, RouteInfo } from "@/hooks/useMapData";

interface NotificationSheetProps {
  open: boolean;
  onClose: () => void;
  routes: RouteInfo[];
  stops: Stop[];
  favouriteStopId: string | null;
  onSubscribe: (routeId: string, stopId: string) => Promise<{ success: boolean; error?: string }>;
}

export default function NotificationSheet({ open, onClose, routes, stops, favouriteStopId, onSubscribe }: NotificationSheetProps) {
  const [routeId, setRouteId] = useState("");
  const [stopId, setStopId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (open) {
      if (favouriteStopId && stops.some((s) => s.id === favouriteStopId)) setStopId(favouriteStopId);
      if (routes.length === 1) setRouteId(routes[0].id);
      setResult(null);
    }
  }, [open, favouriteStopId, stops, routes]);

  const handleSubscribe = async () => {
    if (!routeId || !stopId) return;
    setSubmitting(true);
    const res = await onSubscribe(routeId, stopId);
    setSubmitting(false);
    if (res.success) { setResult({ type: "success", msg: "Notifications enabled!" }); setTimeout(() => onClose(), 1500); }
    else if (res.error === "Permission denied") { setResult({ type: "error", msg: "Notifications blocked. Enable them in your browser settings to get alerts." }); }
    else { setResult({ type: "error", msg: res.error ?? "Failed to subscribe" }); }
  };

  return (
    <>
      <div className={`fixed inset-0 z-[2000] bg-foreground/40 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`} onClick={onClose} />
      <div className={`fixed inset-x-0 bottom-0 z-[2001] rounded-t-2xl bg-card border-t border-border shadow-lg transition-transform duration-300 ease-out ${open ? "translate-y-0" : "translate-y-full"}`}>
        <div className="mx-auto max-w-md px-5 pb-8 pt-4 space-y-4 safe-bottom">
          <div className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/20" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2"><Bell className="h-5 w-5" /> Get Bus Alerts</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"><X className="h-5 w-5" /></button>
          </div>
          {result ? (
            <div className={`rounded-xl p-4 text-center text-sm font-medium ${result.type === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>{result.msg}</div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Choose which route to follow</label>
                <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">Select a route</option>
                  {routes.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your stop</label>
                <select value={stopId} onChange={(e) => setStopId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">Select a stop</option>
                  {stops.map((s) => (<option key={s.id} value={s.id}>{s.name}{s.landmark ? ` (${s.landmark})` : ""}</option>))}
                </select>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notify me when bus is</p>
                <div className="space-y-2">
                  {[{ label: "~5 minutes away", defaultOn: true }, { label: "Delayed or cancelled", defaultOn: true }, { label: "Route changed today", defaultOn: true }].map((opt) => (
                    <label key={opt.label} className="flex items-center gap-2 text-sm text-foreground min-h-[36px]">
                      <input type="checkbox" defaultChecked={opt.defaultOn} className="rounded" disabled /> {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-3 pt-2">
                <Button className="w-full h-12 rounded-xl text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all active:scale-[0.98] gap-2" disabled={!routeId || !stopId || submitting} onClick={handleSubscribe}>
                  <BellRing className="h-4 w-4" /> {submitting ? "Enabling…" : "Enable Notifications"}
                </Button>
                <Button variant="ghost" className="w-full rounded-xl" onClick={onClose}>Not now</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
