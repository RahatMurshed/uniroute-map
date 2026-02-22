import { useEffect, useState, useRef } from "react";
import { format, differenceInMinutes } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { TripDetailData } from "@/hooks/useReportsData";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@/styles/leaflet-custom.css";
import { TILE_URL, TILE_ATTRIBUTION } from "@/lib/mapConfig";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: TripDetailData | null;
  loading: boolean;
}

function TripMap({ locations }: { locations: { lat: number; lng: number }[] }) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current || locations.length === 0) return;
    const map = L.map(mapRef.current, { zoomControl: false, scrollWheelZoom: true, doubleClickZoom: true }).setView([locations[0].lat, locations[0].lng], 16);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION }).addTo(map);
    
    L.control.zoom({ position: "bottomright" }).addTo(map);
    const coords: L.LatLngExpression[] = locations.map(l => [l.lat, l.lng]);
    L.polyline(coords, { color: "#CC1B1B", weight: 4, opacity: 0.8 }).addTo(map);
    map.fitBounds(L.latLngBounds(coords), { padding: [20, 20] });
    return () => { map.remove(); };
  }, [locations]);

  if (locations.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No GPS data available for this trip.</p>;
  }

  return <div ref={mapRef} className="h-[200px] rounded-lg border border-border" />;
}

export default function TripDetailModal({ open, onOpenChange, data, loading }: Props) {
  const gpsPct = data && data.started_at
    ? (() => {
        const end = data.ended_at ? new Date(data.ended_at) : new Date();
        const mins = differenceInMinutes(end, new Date(data.started_at));
        if (mins <= 0) return 0;
        return Math.min(100, Math.round((data.gps_pings / (mins * 12)) * 100));
      })()
    : 0;

  // Build status history
  const timeline: { time: string; event: string }[] = [];
  if (data?.started_at) {
    timeline.push({ time: format(new Date(data.started_at), "hh:mm a"), event: "Trip started" });
  }
  if (data?.exceptions) {
    for (const ex of data.exceptions) {
      timeline.push({
        time: format(new Date(ex.created_at), "hh:mm a"),
        event: ex.type === "cancellation" ? "Trip cancelled" : `Delay reported: ${ex.notes || "No details"}`,
      });
    }
  }
  if (data?.ended_at) {
    timeline.push({ time: format(new Date(data.ended_at), "hh:mm a"), event: "Trip completed" });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trip Details</DialogTitle>
        </DialogHeader>
        {loading || !data ? (
          <p className="text-muted-foreground py-8 text-center">Loading…</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs font-mono text-muted-foreground">{data.id}</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Bus:</span> {data.bus_name || "—"}</div>
              <div><span className="text-muted-foreground">Driver:</span> {data.driver_name || "—"}</div>
              <div><span className="text-muted-foreground">Route:</span> {data.route_name || "—"}</div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{data.status}</Badge></div>
              <div><span className="text-muted-foreground">Start:</span> {data.started_at ? format(new Date(data.started_at), "hh:mm a") : "—"}</div>
              <div><span className="text-muted-foreground">End:</span> {data.ended_at ? format(new Date(data.ended_at), "hh:mm a") : "Active"}</div>
              <div><span className="text-muted-foreground">Duration:</span> {data.started_at ? `${differenceInMinutes(data.ended_at ? new Date(data.ended_at) : new Date(), new Date(data.started_at))} min` : "—"}</div>
              <div><span className="text-muted-foreground">GPS:</span> {data.gps_pings} pings ({gpsPct}%)</div>
            </div>

            {timeline.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-foreground">Status History</h4>
                <div className="space-y-1">
                  {timeline.map((t, i) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <span className="text-muted-foreground font-mono w-20 shrink-0">{t.time}</span>
                      <span className="text-foreground">→ {t.event}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-2 text-foreground">GPS Trace</h4>
              <TripMap locations={data.locations} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
