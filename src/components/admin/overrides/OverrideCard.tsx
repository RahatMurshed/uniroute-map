import { useState } from "react";
import { Trash2, Pencil, Bell, CheckCircle2, XCircle, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { OverrideRecord } from "@/hooks/useOverrides";

const typeConfig: Record<string, { icon: React.ReactNode; label: string; borderClass: string }> = {
  time_shift: { icon: <Circle className="h-3 w-3 fill-warning text-warning" />, label: "TIME SHIFT", borderClass: "border-l-yellow-500" },
  cancellation: { icon: <Circle className="h-3 w-3 fill-destructive text-destructive" />, label: "CANCELLATION", borderClass: "border-l-destructive" },
  route_change: { icon: <Circle className="h-3 w-3 fill-info text-info" />, label: "ROUTE CHANGE", borderClass: "border-l-blue-500" },
  extra_trip: { icon: <Circle className="h-3 w-3 fill-success text-success" />, label: "EXTRA TRIP", borderClass: "border-l-green-500" },
};

function getDescription(override: OverrideRecord): string {
  switch (override.type) {
    case "time_shift":
      if (override.timeOffsetMins && override.timeOffsetMins > 0) return `Running ${override.timeOffsetMins} minutes late`;
      if (override.timeOffsetMins && override.timeOffsetMins < 0) return `Running ${Math.abs(override.timeOffsetMins)} minutes early`;
      return "Time shift reported";
    case "cancellation": return "Bus cancelled for this date";
    case "route_change": return override.overrideRouteName ? `Rerouted to ${override.overrideRouteName}` : "Route changed";
    case "extra_trip": return "Additional trip added";
    default: return override.type.replace(/_/g, " ");
  }
}

interface Props {
  override: OverrideRecord;
  onEdit: (override: OverrideRecord) => void;
  onDelete: (id: string) => Promise<boolean>;
  onNotify: (id: string) => Promise<boolean>;
}

export default function OverrideCard({ override, onEdit, onDelete, onNotify }: Props) {
  const [notifying, setNotifying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const config = typeConfig[override.type] ?? {
    icon: <Circle className="h-3 w-3 fill-muted-foreground text-muted-foreground" />,
    label: override.type.toUpperCase(),
    borderClass: "border-l-muted-foreground",
  };

  const isPast = override.exceptionDate < new Date().toISOString().split("T")[0];

  const handleNotify = async () => { setNotifying(true); await onNotify(override.id); setNotifying(false); };
  const handleDelete = async () => { setDeleting(true); await onDelete(override.id); setDeleting(false); };

  return (
    <div className={`rounded-lg border-l-4 ${config.borderClass} bg-card p-4 shadow-sm border border-border`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold tracking-wide text-muted-foreground flex items-center gap-1.5">
              {config.icon} {config.label}
            </span>
            {override.exceptionDate !== new Date().toISOString().split("T")[0] && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                {new Date(override.exceptionDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground">
            {override.busName}{override.busLicensePlate ? ` (${override.busLicensePlate})` : ""}
          </p>
          <p className="text-sm text-muted-foreground">{getDescription(override)}</p>
          {override.notes && <p className="text-sm text-muted-foreground italic">"{override.notes}"</p>}
          <p className="text-xs text-muted-foreground">
            Created by {override.createdByName ?? "Unknown"} at {new Date(override.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-xs flex items-center gap-1">
            {override.notified ? (
              <span className="text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Notified</span>
            ) : (
              <span className="text-warning flex items-center gap-1"><XCircle className="h-3 w-3" /> Not yet notified</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!override.notified && !override.isDriverCreated && (
            <Button size="sm" variant="outline" onClick={handleNotify} disabled={notifying} className="text-xs gap-1">
              <Bell className="h-3.5 w-3.5" /> {notifying ? "..." : "Notify"}
            </Button>
          )}
          {!isPast && (
            <Button size="sm" variant="ghost" onClick={() => onEdit(override)} className="text-xs">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-destructive text-xs"><Trash2 className="h-3.5 w-3.5" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this override?</AlertDialogTitle>
                <AlertDialogDescription>Students will not be notified of the cancellation. This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
