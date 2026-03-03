import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Download, Eye, Zap, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePdfExport, type PdfOptions } from "@/hooks/usePdfExport";
import { toast } from "sonner";

export default function PdfExportView() {
  const { routes, loading, fetchData, downloadPdf, getPreviewDataUrl } = usePdfExport();

  const [date, setDate] = useState<Date>(new Date());
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([]);
  const [includeSchedules, setIncludeSchedules] = useState(true);
  const [includeOverrides, setIncludeOverrides] = useState(true);
  const [includeDriverInfo, setIncludeDriverInfo] = useState(true);
  const [includeGpsStats, setIncludeGpsStats] = useState(false);
  const [universityName, setUniversityName] = useState("UniRoute");
  const [footerNote, setFooterNote] = useState("UniRoute Transport Services");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (routes.length > 0 && selectedRouteIds.length === 0) {
      setSelectedRouteIds(routes.map((r) => r.id));
    }
  }, [routes]);

  useEffect(() => {
    fetchData(date);
  }, [date, fetchData]);

  const options: PdfOptions = useMemo(
    () => ({
      date,
      selectedRouteIds,
      includeSchedules,
      includeOverrides,
      includeDriverInfo,
      includeGpsStats,
      universityName,
      footerNote,
    }),
    [date, selectedRouteIds, includeSchedules, includeOverrides, includeDriverInfo, includeGpsStats, universityName, footerNote]
  );

  const dayLabel = format(date, "EEEE, dd MMMM yyyy");

  const toggleRoute = (id: string) => {
    setSelectedRouteIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedRouteIds(routes.map((r) => r.id));
  const deselectAll = () => setSelectedRouteIds([]);

  const handlePreview = () => {
    if (selectedRouteIds.length === 0) {
      toast.error("Select at least one route");
      return;
    }
    const url = getPreviewDataUrl(options);
    setPreviewUrl(url);
  };

  const handleDownload = () => {
    if (selectedRouteIds.length === 0) {
      toast.error("Select at least one route");
      return;
    }
    downloadPdf(options);
    toast.success("PDF downloaded successfully");
  };

  const handleQuickExport = () => {
    const quickOptions: PdfOptions = {
      date: new Date(),
      selectedRouteIds: routes.map((r) => r.id),
      includeSchedules: true,
      includeOverrides: true,
      includeDriverInfo: true,
      includeGpsStats: false,
      universityName: "Metropolitan University",
      footerNote: "Metropolitan University Transport Services",
    };
    downloadPdf(quickOptions);
    toast.success("Quick export downloaded");
  };

  if (loading && routes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading export data…</p>
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl border border-border bg-muted/30">
        <p className="text-lg text-muted-foreground">No routes configured to export</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileDown className="h-6 w-6 text-muted-foreground" /> PDF Schedule Export
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate printable bus schedules for notice boards and handouts
          </p>
        </div>
        <Button onClick={handleQuickExport} variant="outline" className="gap-2 shrink-0">
          <Zap className="h-4 w-4" />
          Quick Export Today
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 1 — OPTIONS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Export Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Select Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dayLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Select Routes to Include</Label>
              <div className="flex gap-2 mb-2">
                <Button size="sm" variant="outline" onClick={selectAll}>Select All</Button>
                <Button size="sm" variant="outline" onClick={deselectAll}>Deselect All</Button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {routes.map((route) => (
                  <label key={route.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={selectedRouteIds.includes(route.id)} onCheckedChange={() => toggleRoute(route.id)} />
                    <span className="flex items-center gap-2 text-sm">
                      {route.colorHex && (
                        <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: route.colorHex }} />
                      )}
                      {route.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Include Sections</Label>
              <div className="space-y-2">
                {[
                  { label: "Route schedules and stop times", checked: includeSchedules, set: setIncludeSchedules },
                  { label: "Today's service changes/overrides", checked: includeOverrides, set: setIncludeOverrides },
                  { label: "Driver and bus information", checked: includeDriverInfo, set: setIncludeDriverInfo },
                  { label: "GPS performance stats (optional)", checked: includeGpsStats, set: setIncludeGpsStats },
                ].map((item) => (
                  <label key={item.label} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={item.checked} onCheckedChange={(v) => item.set(!!v)} />
                    <span className="text-sm">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>University Name</Label>
              <Input value={universityName} onChange={(e) => setUniversityName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Footer Note</Label>
              <Input value={footerNote} onChange={(e) => setFooterNote(e.target.value)} />
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handlePreview} variant="outline" className="flex-1 gap-2">
                <Eye className="h-4 w-4" /> Preview PDF
              </Button>
              <Button onClick={handleDownload} className="flex-1 gap-2">
                <Download className="h-4 w-4" /> Download PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 2 — PREVIEW */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">PDF Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {previewUrl ? (
              <iframe src={previewUrl} className="w-full rounded-lg border border-border" style={{ height: "600px" }} title="PDF Preview" />
            ) : (
              <div className="flex items-center justify-center h-[600px] rounded-lg border border-dashed border-border bg-muted/20">
                <p className="text-muted-foreground text-sm text-center px-4">
                  Click "Preview PDF" to see a live preview of your schedule
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
