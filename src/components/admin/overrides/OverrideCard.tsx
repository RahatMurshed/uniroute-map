import { useState } from "react";
import { format } from "date-fns";
import {
  Trash2, Pencil, Bell, CheckCircle2, BellOff,
  Clock, XCircle, ArrowLeftRight, Plus, Calendar, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { OverrideRecord } from "@/hooks/useOverrides";

const typeConfig: Record<string, {
  icon: React.ReactNode;
  label: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}> = {
  time_shift: {
    icon: <Clock className="h-3.5 w-3.5" />,
    label: "Time Shift",
    accentColor: "hsl(38, 92%, 50%)",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-800",
    badgeBorder: "border-amber-200",
  },
  cancellation: {
    icon: <XCircle className="h-3.5 w-3.5" />,
    label: "Cancelled",
    accentColor: "hsl(0, 72%, 51%)",
    badgeBg: "bg-red-100",
    badgeText: "text-red-800",
    badgeBorder: "border-red-200",
  },
  route_change: {
    icon: <ArrowLeftRight className="h-3.5 w-3.5" />,
    label: "Route Change",
    accentColor: "hsl(217, 91%, 60%)",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-800",
    badgeBorder: "border-blue-200",
  },
  extra_trip: {
    icon: <Plus className="h-3.5 w-3.5" />,
    label: "Extra Trip",
    accentColor: "hsl(142, 71%, 45%)",
    badgeBg: "bg-green-100",
    badgeText: "text-green-800",
    badgeBorder: "border-green-200",
  },
};

function getDescription(override: OverrideRecord): string {
  switch (override.type) {
    case "time_shift":
      if (override.timeOffsetMins && override.timeOffsetMins > 0) return `+${override.timeOffsetMins} minutes delay`;
      if (override.timeOffsetMins && override.timeOffsetMins < 0) return `${override.timeOffsetMins} minutes early`;
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
    icon: <Clock className="h-3.5 w-3.5" />,
    label: override.type.replace(/_/g, " "),
    accentColor: "hsl(var(--muted-foreground))",
    badgeBg: "bg-muted",
    badgeText: "text-muted-foreground",
    badgeBorder: "border-border",
  };

  const isPast = override.exceptionDate < new Date().toISOString().split("T")[0];

  const handleNotify = async () => { setNotifying(true); await onNotify(override.id); setNotifying(false); };
  const handleDelete = async () => { setDeleting(true); await onDelete(override.id); setDeleting(false); };

  const dateObj = new Date(override.exceptionDate + "T00:00:00");
  const createdDate = new Date(override.createdAt);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden flex">
      {/* Left accent bar */}
      <div className="w-1 shrink-0" style={{ background: config.accentColor }} />

      <div className="flex-1 min-w-0 px-5 py-5">
        {/* Top row: badge + bus name + actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {/* Type badge */}
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}>
              {config.icon} {config.label}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{override.busName}</p>
              {override.busLicensePlate && (
                <span className="inline-block text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded mt-0.5">
                  {override.busLicensePlate}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {!isPast && (
              <button
                onClick={() => onEdit(override)}
                className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this override?</AlertDialogTitle>
                  <AlertDialogDescription>Students will not be notified of the removal. This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete"}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Description/notes */}
        <div className="mt-3">
          <p className="text-sm text-foreground">{getDescription(override)}</p>
          {override.notes && (
            <p className="text-sm text-muted-foreground italic mt-1">"{override.notes}"</p>
          )}
        </div>

        {/* Detail row - 3 columns */}
        <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{format(dateObj, "d MMM yyyy")}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {override.createdByName ?? "Unknown"}
              {override.isDriverCreated && <span className="text-muted-foreground/60 ml-0.5">· Driver</span>}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{format(createdDate, "hh:mm a")}</span>
          </div>
        </div>

        {/* Notification status row */}
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs">
            {override.notified ? (
              <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Students notified
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <BellOff className="h-3.5 w-3.5" /> Not yet notified
              </span>
            )}
          </div>

          {!override.notified ? (
            <Button
              size="sm"
              onClick={handleNotify}
              disabled={notifying}
              className="bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-primary-foreground rounded-lg px-4 h-8 text-xs font-semibold gap-1.5"
            >
              <Bell className="h-3.5 w-3.5" /> {notifying ? "Sending..." : "Notify Students"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleNotify}
              disabled={notifying}
              className="text-muted-foreground rounded-lg px-4 h-8 text-xs gap-1.5"
            >
              <Bell className="h-3.5 w-3.5" /> {notifying ? "Sending..." : "Re-notify"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
