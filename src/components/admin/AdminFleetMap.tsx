import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@/styles/leaflet-custom.css";
import { TILE_URL, TILE_ATTRIBUTION, DEFAULT_CENTER, MU_RED, MU_AMBER, MU_GREY } from "@/lib/mapConfig";
import type { AdminBus } from "@/hooks/useAdminData";

function getBusColor(bus: AdminBus): string {
  if (!bus.tripStatus) return MU_GREY;
  if (bus.tripStatus === "delayed") return MU_AMBER;
  if (bus.lastPing) {
    const age = (Date.now() - new Date(bus.lastPing).getTime()) / 1000;
    if (age > 120) return MU_GREY;
  }
  return MU_RED;
}

function makeBusIcon(color: string, busName?: string) {
  const isInactive = color === MU_GREY;
  const opacity = isInactive ? "0.7" : "1";
  const name = busName || "Bus";
  return L.divIcon({
    className: "",
    iconSize: [106, 60],
    iconAnchor: [53, 60],
    popupAnchor: [0, -60],
    html: `<div style="position:relative;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.3));opacity:${opacity};">
      <div style="background:${color};border-radius:10px;padding:6px 10px 6px 8px;display:flex;align-items:center;gap:6px;min-width:90px;border:2px solid white;box-shadow:0 2px 8px rgba(204,27,27,0.5);">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM6 9V6h5v3H6zm7 0V6h5v3h-5z"/></svg>
        <span style="color:white;font-size:11px;font-weight:700;font-family:system-ui;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;">${name}</span>
      </div>
      <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid ${color};margin:0 auto;"></div>
    </div>`,
  });
}

interface AdminFleetMapProps {
  buses: AdminBus[];
  centerOnBusId?: string | null;
  onCenterDone?: () => void;
}

export default function AdminFleetMap({ buses, centerOnBusId, onCenterDone }: AdminFleetMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 16,
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: true,
    });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const activeBusIds = new Set<string>();

    for (const bus of buses) {
      if (bus.lat == null || bus.lng == null) continue;
      activeBusIds.add(bus.id);
      const color = getBusColor(bus);
      const existing = markersRef.current.get(bus.id);
      const popupContent = `<div style="padding:12px 14px;min-width:180px;font-family:Inter,system-ui,sans-serif;">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${bus.name}</div>
        <div style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:4px;">
          <div style="display:flex;align-items:center;font-size:12px;margin-bottom:3px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px;"></span>
            ${bus.tripStatus ?? "Inactive"}
          </div>
          ${bus.routeName ? `<div style="font-size:12px;color:#6b7280;">Route: ${bus.routeName}</div>` : ""}
        </div>
      </div>`;

      if (existing) {
        existing.setLatLng([bus.lat, bus.lng]);
        existing.setIcon(makeBusIcon(color, bus.name));
        existing.setPopupContent(popupContent);
      } else {
        const marker = L.marker([bus.lat, bus.lng], { icon: makeBusIcon(color, bus.name) })
          .addTo(map)
          .bindPopup(popupContent);
        markersRef.current.set(bus.id, marker);
      }
    }

    // Remove stale markers
    for (const [id, marker] of markersRef.current) {
      if (!activeBusIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Fit bounds on first load
    const withCoords = buses.filter((b) => b.lat != null && b.lng != null);
    if (withCoords.length > 0 && markersRef.current.size === withCoords.length) {
      const bounds = L.latLngBounds(withCoords.map((b) => [b.lat!, b.lng!] as L.LatLngTuple));
      map.fitBounds(bounds.pad(0.3), { maxZoom: 16 });
    }
  }, [buses]);

  // Center on specific bus
  useEffect(() => {
    if (!centerOnBusId || !mapRef.current) return;
    const bus = buses.find((b) => b.id === centerOnBusId);
    if (bus?.lat != null && bus?.lng != null) {
      mapRef.current.setView([bus.lat, bus.lng], 16, { animate: true });
      const marker = markersRef.current.get(bus.id);
      if (marker) marker.openPopup();
    }
    onCenterDone?.();
  }, [centerOnBusId, buses, onCenterDone]);

  return (
    <div ref={containerRef} className="w-full h-[350px] rounded-xl border border-border overflow-hidden" />
  );
}
