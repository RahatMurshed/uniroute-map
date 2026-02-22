import { useState } from "react";
import {
  Pencil, UserMinus, UserCheck, ChevronDown, Circle,
  Bus, MapPin, Activity, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import type { DriverRecord } from "@/hooks/useDriverManager";
import DriverTripHistory from "./DriverTripHistory";

interface DriverCardProps {
  driver: DriverRecord;
  onEdit: (driver: DriverRecord) => void;
  onDeactivate: (userId: string) => Promise<any>;
  onReactivate: (userId: string) => Promise<any>;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatLastActive(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  if (diffDays <= 7) return `${diffDays} days ago`;
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function GpsUptimeValue({ value }: { value: number }) {
  const color =
    value > 80 ? "text-green-600" : value >= 50 ? "text-amber-600" : "text-red-600";
  return <span className={`text-sm font-semibold ${color}`}>{value}%</span>;
}

export default function DriverCard({ driver, onEdit, onDeactivate, onReactivate }: DriverCardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const isInactive = driver.role === "inactive_driver";

  const handleDeactivate = async () => {
    setActionLoading(true);
    try {
      await onDeactivate(driver.id);
      toast({ title: `${driver.displayName} deactivated` });
    } catch (err: any) {
      toast({ title: "Failed to deactivate", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      await onReactivate(driver.id);
      toast({ title: `${driver.displayName} reactivated` });
    } catch (err: any) {
      toast({ title: "Failed to reactivate", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const statusBadge = isInactive ? (
    <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs gap-1 font-medium">
      <Circle className="h-2 w-2 fill-current" /> Inactive
    </Badge>
  ) : driver.hasActiveTrip ? (
    <Badge className="bg-green-100 text-green-700 text-xs gap-1 font-medium border-0">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      Active
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs gap-1 font-medium">
      <Circle className="h-2 w-2 fill-current" /> No Active Trip
    </Badge>
  );

  return (
    <div
      className={`bg-card rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow duration-200 ${
        isInactive ? "opacity-60" : ""
      }`}
    >
      {/* Header */}
      <div className="p-6 pb-0">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="h-12 w-12 shrink-0 rounded-full bg-primary flex items-center justify-center">
            <span className="text-lg font-bold text-primary-foreground leading-none">
              {getInitials(driver.displayName)}
            </span>
          </div>

          {/* Name / Contact */}
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-foreground truncate">{driver.displayName}</p>
            <p className="text-sm text-muted-foreground truncate">{driver.email}</p>
            {driver.phone && (
              <p className="text-sm text-muted-foreground">{driver.phone}</p>
            )}
          </div>

          {/* Status + Actions */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {statusBadge}
            <div className="flex gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-muted" onClick={() => onEdit(driver)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit driver</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {isInactive ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/5 rounded-lg"
                  onClick={handleReactivate}
                  disabled={actionLoading}
                >
                  <UserCheck className="h-4 w-4 mr-1" /> Reactivate
                </Button>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-destructive/10 text-destructive">
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Deactivate {driver.displayName}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              They will lose access to the driver app immediately. Trip history will be preserved.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeactivate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Deactivate
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TooltipTrigger>
                    <TooltipContent>Deactivate driver</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="px-6 mt-4 pt-4 border-t border-border">
        <div className="grid grid-cols-4 divide-x divide-border">
          {/* Assigned Bus */}
          <div className="pr-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 flex items-center gap-1">
              <Bus className="h-3 w-3" /> Assigned Bus
            </p>
            {driver.assignedBus ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-sm font-semibold text-foreground truncate">{driver.assignedBus.name}</p>
                  </TooltipTrigger>
                  <TooltipContent>{driver.assignedBus.name}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <p className="text-sm font-medium text-amber-600">Unassigned</p>
            )}
          </div>

          {/* Total Trips */}
          <div className="px-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Total Trips
            </p>
            <p className="text-sm font-semibold text-foreground">{driver.totalTrips}</p>
          </div>

          {/* GPS Uptime */}
          <div className="px-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 flex items-center gap-1">
              <Activity className="h-3 w-3" /> GPS Uptime
            </p>
            <GpsUptimeValue value={driver.gpsUptime} />
          </div>

          {/* Last Active */}
          <div className="pl-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Last Active
            </p>
            <p className={`text-sm font-semibold ${driver.lastActive ? "text-foreground" : "text-muted-foreground"}`}>
              {formatLastActive(driver.lastActive)}
            </p>
          </div>
        </div>
      </div>

      {/* Trip History Toggle */}
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="px-6 mt-4 pt-4 border-t border-border pb-4">
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full text-sm text-muted-foreground hover:text-foreground transition-colors group">
              <span className="font-medium">Trip History</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <DriverTripHistory driverId={driver.id} />
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
