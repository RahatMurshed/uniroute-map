import { useState } from "react";
import { Pencil, UserX, UserCheck, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { DriverRecord } from "@/hooks/useDriverManager";
import DriverTripHistory from "./DriverTripHistory";

interface DriverCardProps {
  driver: DriverRecord;
  onEdit: (driver: DriverRecord) => void;
  onDeactivate: (userId: string) => Promise<any>;
  onReactivate: (userId: string) => Promise<any>;
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
      toast({ title: `✅ ${driver.displayName} deactivated` });
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
      toast({ title: `✅ ${driver.displayName} reactivated` });
    } catch (err: any) {
      toast({ title: "Failed to reactivate", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const formatLastActive = (iso: string | null) => {
    if (!iso) return "Never";
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return isToday ? `Today at ${time}` : `${d.toLocaleDateString()} at ${time}`;
  };

  return (
    <Card className={`transition-colors ${isInactive ? "opacity-60 border-muted" : ""}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-semibold text-foreground">👤 {driver.displayName}</span>
              {isInactive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
            </div>
            <p className="text-sm text-muted-foreground truncate">{driver.email}</p>
            {driver.phone && (
              <p className="text-sm text-muted-foreground">📱 {driver.phone}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(driver)}>
              <Pencil className="h-4 w-4" />
            </Button>
            {isInactive ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-primary hover:text-primary/80"
                onClick={handleReactivate}
                disabled={actionLoading}
              >
                <UserCheck className="h-4 w-4 mr-1" />
                Reactivate
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                    <UserX className="h-4 w-4" />
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
                    <AlertDialogAction
                      onClick={handleDeactivate}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Deactivate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Assigned Bus</span>
            <span className="font-medium text-foreground">{driver.assignedBus?.name ?? "None"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Trips</span>
            <span className="font-medium text-foreground">{driver.totalTrips}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">GPS Uptime</span>
            <span className="font-medium text-foreground">{driver.gpsUptime}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Active</span>
            <span className="font-medium text-foreground text-right">{formatLastActive(driver.lastActive)}</span>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {isInactive ? (
              <span className="text-muted-foreground">⚫ Inactive</span>
            ) : driver.hasActiveTrip ? (
              <span className="text-primary font-medium">🟢 Active Trip</span>
            ) : (
              <span className="text-muted-foreground">⚫ No Active Trip</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
            Trip History
          </Button>
        </div>

        {/* Expanded trip history */}
        {expanded && <DriverTripHistory driverId={driver.id} />}
      </CardContent>
    </Card>
  );
}
