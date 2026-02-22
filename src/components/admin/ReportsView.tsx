import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useReportsData, type DatePreset, type TripDetailData } from "@/hooks/useReportsData";
import ReportsSummary from "./reports/ReportsSummary";
import TripsTable from "./reports/TripsTable";
import TripDetailModal from "./reports/TripDetailModal";
import PerformanceSummaries from "./reports/PerformanceSummaries";

const presets: { id: DatePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "custom", label: "Custom" },
];

export default function ReportsView() {
  const {
    preset, setPreset,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    trips, stats, loading,
    driverSummaries, routeSummaries,
    fetchTripDetail, exportCsv, computeGpsPct,
  } = useReportsData();

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<TripDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleViewDetail = async (tripId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    const data = await fetchTripDetail(tripId);
    setDetailData(data);
    setDetailLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">📊 Trip Reports</h2>
        <Button onClick={exportCsv} variant="outline" size="sm" disabled={trips.length === 0} className="rounded-xl gap-1.5">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Button
            key={p.id}
            variant={preset === p.id ? "default" : "outline"}
            size="sm"
            onClick={() => setPreset(p.id)}
            className="rounded-xl font-semibold"
          >
            {p.label}
          </Button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("rounded-xl", !customFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {customFrom ? format(customFrom, "dd MMM yyyy") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground">→</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("rounded-xl", !customTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {customTo ? format(customTo, "dd MMM yyyy") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground">Loading reports…</p>
        </div>
      ) : (
        <>
          <ReportsSummary stats={stats} />
          <TripsTable trips={trips} computeGpsPct={computeGpsPct} onViewDetail={handleViewDetail} />
          <PerformanceSummaries driverSummaries={driverSummaries} routeSummaries={routeSummaries} />
        </>
      )}

      <TripDetailModal open={detailOpen} onOpenChange={setDetailOpen} data={detailData} loading={detailLoading} />
    </div>
  );
}
