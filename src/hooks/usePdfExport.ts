import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import jsPDF from "jspdf";

export interface RouteForExport {
  id: string;
  name: string;
  colorHex: string | null;
  activeDays: number[] | null;
  stopSequence: { stop_id: string; depart_time: string }[] | null;
}

export interface StopForExport {
  id: string;
  name: string;
}

export interface BusForExport {
  id: string;
  name: string;
  licensePlate: string | null;
  defaultRouteId: string | null;
  driverName: string | null;
}

export interface ExceptionForExport {
  id: string;
  busId: string;
  busName: string;
  type: string;
  timeOffsetMins: number | null;
  notes: string | null;
  overrideRouteName: string | null;
}

export interface PdfOptions {
  date: Date;
  selectedRouteIds: string[];
  includeSchedules: boolean;
  includeOverrides: boolean;
  includeDriverInfo: boolean;
  includeGpsStats: boolean;
  universityName: string;
  footerNote: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function usePdfExport() {
  const [routes, setRoutes] = useState<RouteForExport[]>([]);
  const [stops, setStops] = useState<Map<string, StopForExport>>(new Map());
  const [buses, setBuses] = useState<BusForExport[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionForExport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (date: Date) => {
    setLoading(true);
    const dateStr = format(date, "yyyy-MM-dd");

    const [routesRes, stopsRes, busesRes, exceptionsRes] = await Promise.all([
      supabase.from("routes").select("id, name, color_hex, active_days, stop_sequence").order("name"),
      supabase.from("stops").select("id, name"),
      supabase
        .from("buses")
        .select("id, name, license_plate, default_route_id, profiles!buses_driver_id_fkey(display_name)")
        .order("name"),
      supabase
        .from("exceptions")
        .select("id, bus_id, type, time_offset_mins, notes, buses(name), routes!exceptions_override_route_id_fkey(name)")
        .eq("exception_date", dateStr),
    ]);

    setRoutes(
      (routesRes.data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        colorHex: r.color_hex,
        activeDays: r.active_days,
        stopSequence: r.stop_sequence as any,
      }))
    );

    const stopMap = new Map<string, StopForExport>();
    (stopsRes.data ?? []).forEach((s: any) => stopMap.set(s.id, { id: s.id, name: s.name }));
    setStops(stopMap);

    setBuses(
      (busesRes.data ?? []).map((b: any) => ({
        id: b.id,
        name: b.name,
        licensePlate: b.license_plate,
        defaultRouteId: b.default_route_id,
        driverName: b.profiles?.display_name ?? null,
      }))
    );

    setExceptions(
      (exceptionsRes.data ?? []).map((e: any) => ({
        id: e.id,
        busId: e.bus_id,
        busName: e.buses?.name ?? "Unknown",
        type: e.type,
        timeOffsetMins: e.time_offset_mins,
        notes: e.notes,
        overrideRouteName: e.routes?.name ?? null,
      }))
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData(new Date());
  }, [fetchData]);

  const generatePdf = useCallback(
    (options: PdfOptions): jsPDF => {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = 210;
      const margin = 15;
      const contentW = pageW - margin * 2;
      let y = margin;

      const addPageIfNeeded = (need: number) => {
        if (y + need > 280) {
          doc.addPage();
          y = margin;
        }
      };

      // --- HEADER ---
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text(options.universityName, pageW / 2, y + 8, { align: "center" });
      y += 12;

      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      const dateLabel = format(options.date, "dd MMM yyyy");
      const dayName = DAY_NAMES[options.date.getDay()];
      doc.text(`Bus Schedule — ${dateLabel}`, pageW / 2, y + 6, { align: "center" });
      y += 8;
      doc.setFontSize(12);
      doc.text(dayName, pageW / 2, y + 5, { align: "center" });
      y += 10;

      // divider
      doc.setDrawColor(100);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      // --- SERVICE CHANGES ---
      const todayExceptions = exceptions;
      if (options.includeOverrides && todayExceptions.length > 0) {
        addPageIfNeeded(20 + todayExceptions.length * 7);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("SERVICE CHANGES TODAY", margin, y + 5);
        y += 10;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        todayExceptions.forEach((ex) => {
          addPageIfNeeded(8);
          let text = `• ${ex.busName} — `;
          if (ex.type === "cancellation") text += "Cancelled today";
          else if (ex.type === "time_shift" && ex.timeOffsetMins)
            text += `Running ${ex.timeOffsetMins > 0 ? "+" : ""}${ex.timeOffsetMins} minutes`;
          else text += ex.notes ?? ex.type;
          doc.text(text, margin + 2, y + 4);
          y += 7;
        });

        doc.setDrawColor(180);
        doc.line(margin, y, pageW - margin, y);
        y += 6;
      }

      // --- ROUTE SCHEDULES ---
      if (options.includeSchedules) {
        const selectedRoutes = routes.filter((r) => options.selectedRouteIds.includes(r.id));

        selectedRoutes.forEach((route) => {
          addPageIfNeeded(30);

          // Route header
          doc.setFontSize(13);
          doc.setFont("helvetica", "bold");
          const routeColor = route.colorHex ?? "#1a1a1a";
          try {
            const r = parseInt(routeColor.slice(1, 3), 16);
            const g = parseInt(routeColor.slice(3, 5), 16);
            const b = parseInt(routeColor.slice(5, 7), 16);
            doc.setFillColor(r, g, b);
            doc.circle(margin + 3, y + 3, 3, "F");
          } catch { /* skip color dot */ }

          doc.setTextColor(0);
          doc.text(route.name.toUpperCase(), margin + 9, y + 5);
          y += 9;

          // Active days
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          if (route.activeDays && route.activeDays.length > 0) {
            const dayLabels = route.activeDays.map((d) => DAY_NAMES[d]).join(", ");
            doc.text(dayLabels, margin + 2, y + 3);
            y += 6;
          }

          // Bus & driver info
          if (options.includeDriverInfo) {
            const assignedBuses = buses.filter((b) => b.defaultRouteId === route.id);
            assignedBuses.forEach((bus) => {
              addPageIfNeeded(7);
              const plateStr = bus.licensePlate ? ` (${bus.licensePlate})` : "";
              const driverStr = bus.driverName ? `Driver: ${bus.driverName} | ` : "";
              doc.text(`${driverStr}Bus: ${bus.name}${plateStr}`, margin + 2, y + 3);
              y += 6;
            });
          }

          // Stop schedule table
          if (route.stopSequence && route.stopSequence.length > 0) {
            addPageIfNeeded(10);
            y += 2;

            // Table header
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.text("Stop", margin + 2, y + 4);
            doc.text("Scheduled", margin + contentW * 0.6, y + 4);
            doc.text("Notes", margin + contentW * 0.8, y + 4);
            y += 6;
            doc.setDrawColor(200);
            doc.line(margin, y, pageW - margin, y);
            y += 2;

            doc.setFont("helvetica", "normal");
            route.stopSequence.forEach((entry: any) => {
              addPageIfNeeded(7);
              const stopName = stops.get(entry.stop_id)?.name ?? "Unknown Stop";
              const time = entry.depart_time ?? "—";
              doc.text(stopName, margin + 2, y + 4);
              doc.text(time, margin + contentW * 0.6, y + 4);

              // Check if there's a time_shift exception for a bus on this route
              const routeExceptions = todayExceptions.filter(
                (ex) => ex.type === "time_shift" && ex.timeOffsetMins
              );
              if (routeExceptions.length > 0) {
                doc.setTextColor(200, 100, 0);
                doc.text(`+${routeExceptions[0].timeOffsetMins}min`, margin + contentW * 0.8, y + 4);
                doc.setTextColor(0);
              }
              y += 6;
            });
          }

          y += 6;
          doc.setDrawColor(220);
          doc.line(margin, y, pageW - margin, y);
          y += 6;
        });
      }

      // --- FOOTER ---
      const footerY = 285;
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(120);
      const now = format(new Date(), "dd MMM yyyy hh:mm a");
      doc.text(`Generated by UniRoute on ${now}`, pageW / 2, footerY, { align: "center" });
      doc.text(options.footerNote, pageW / 2, footerY + 4, { align: "center" });
      doc.setTextColor(0);

      return doc;
    },
    [routes, stops, buses, exceptions]
  );

  const downloadPdf = useCallback(
    (options: PdfOptions) => {
      const doc = generatePdf(options);
      const filename = `UniRoute-Schedule-${format(options.date, "dd-MMM-yyyy")}.pdf`;
      doc.save(filename);
    },
    [generatePdf]
  );

  const getPreviewDataUrl = useCallback(
    (options: PdfOptions): string => {
      const doc = generatePdf(options);
      return doc.output("datauristring");
    },
    [generatePdf]
  );

  return {
    routes,
    stops,
    buses,
    exceptions,
    loading,
    fetchData,
    downloadPdf,
    getPreviewDataUrl,
  };
}
