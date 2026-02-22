import { format } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, User, Route } from "lucide-react";
import type { DriverSummary, RouteSummary } from "@/hooks/useReportsData";

interface Props {
  driverSummaries: DriverSummary[];
  routeSummaries: RouteSummary[];
}

export default function PerformanceSummaries({ driverSummaries, routeSummaries }: Props) {
  return (
    <div className="space-y-4">
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-semibold text-foreground py-2 hover:underline">
          <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
          <User className="h-4 w-4 text-muted-foreground" /> Driver Performance Summary
        </CollapsibleTrigger>
        <CollapsibleContent>
          {driverSummaries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No driver data for this period.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto mt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Total Trips</TableHead>
                    <TableHead>On Time %</TableHead>
                    <TableHead>Avg GPS %</TableHead>
                    <TableHead>Last Trip</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {driverSummaries.map((d) => (
                    <TableRow key={d.driver_id}>
                      <TableCell className="font-medium">{d.driver_name}</TableCell>
                      <TableCell>{d.total_trips}</TableCell>
                      <TableCell>{d.on_time_pct}%</TableCell>
                      <TableCell>{d.avg_gps_pct}%</TableCell>
                      <TableCell>{d.last_trip ? format(new Date(d.last_trip), "dd MMM yyyy") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-semibold text-foreground py-2 hover:underline">
          <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
          <Route className="h-4 w-4 text-muted-foreground" /> Route Performance Summary
        </CollapsibleTrigger>
        <CollapsibleContent>
          {routeSummaries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No route data for this period.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto mt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route</TableHead>
                    <TableHead>Total Trips</TableHead>
                    <TableHead>On Time %</TableHead>
                    <TableHead>Avg Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routeSummaries.map((r) => (
                    <TableRow key={r.route_id}>
                      <TableCell className="font-medium">{r.route_name}</TableCell>
                      <TableCell>{r.total_trips}</TableCell>
                      <TableCell>{r.on_time_pct}%</TableCell>
                      <TableCell>{r.avg_duration_mins} mins</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
