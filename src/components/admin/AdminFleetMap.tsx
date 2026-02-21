import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AdminBus } from "@/hooks/useAdminData";

const DEFAULT_CENTER: L.LatLngTuple = [23.8103, 90.4125];

function getBusColor(bus: AdminBus): string {
  if (!bus.tripStatus) return "#6b7280"; // inactive grey
  if (bus.tripStatus === "delayed") return "#eab308"; // yellow
  if (bus.lastPing) {
    const age = (Date.now() - new Date(bus.lastPing).getTime()) / 1000;
    if (age > 120) return "#ef4444"; // red - offline
  }
  return "#22c55e"; // green - active
}

function makeBusIcon(color: string) {
  return L.divIcon({
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
    html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid white;">🚌</div>`,
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
      zoom: 14,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);
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
      const popupContent = `<strong>${bus.name}</strong><br/>Status: ${bus.tripStatus ?? "Inactive"}<br/>${bus.routeName ? `Route: ${bus.routeName}` : ""}`;

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
