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

function makeBusIcon(color: string) {
  const isInactive = color === MU_GREY;
  return L.divIcon({
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -24],
    html: `<div style="width:40px;height:40px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 14px rgba(0,0,0,.25);border:3px solid white;opacity:${isInactive ? '0.5' : '1'};">🚌</div>`,
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
        existing.setIcon(makeBusIcon(color));
        existing.setPopupContent(popupContent);
      } else {
        const marker = L.marker([bus.lat, bus.lng], { icon: makeBusIcon(color) })
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
