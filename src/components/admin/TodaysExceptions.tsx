import { useState } from "react";
import { ClipboardList, CheckCircle2, Circle, Bell } from "lucide-react";
import type { AdminException } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

function exceptionStyle(type: string) {
  switch (type) {
    case "cancellation": return "border-l-4 border-l-destructive bg-destructive/5";
    case "time_shift": return "border-l-4 border-l-warning bg-warning/5";
    case "route_change": return "border-l-4 border-l-secondary bg-secondary/5";
    default: return "border-l-4 border-l-muted bg-muted/5";
  }
}

function ExceptionIcon({ type }: { type: string }) {
  switch (type) {
    case "cancellation": return <Circle className="h-3 w-3 fill-destructive text-destructive" />;
    case "time_shift": return <Circle className="h-3 w-3 fill-warning text-warning" />;
    case "route_change": return <Circle className="h-3 w-3 fill-info text-info" />;
    default: return <Circle className="h-3 w-3 fill-muted-foreground text-muted-foreground" />;
  }
}

function formatType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TodaysExceptions({ exceptions }: { exceptions: AdminException[] }) {
  const [notifying, setNotifying] = useState<string | null>(null);

  const handleNotify = async (exception: AdminException) => {
    setNotifying(exception.id);
    try {
      const { error } = await supabase.functions.invoke("send-push-notifications", {
        body: {
          type: "exception",
          exceptionId: exception.id,
          busName: exception.busName,
          exceptionType: exception.type,
          notes: exception.notes,
        },
      });
      if (error) throw error;

      await supabase.from("exceptions").update({ notified: true }).eq("id", exception.id);
      toast({ title: "Notifications sent", description: `Students on this route have been notified.` });
    } catch (err: any) {
      toast({ title: "Failed to notify", description: err.message, variant: "destructive" });
    } finally {
      setNotifying(null);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" /> Today's Service Changes
        </h3>
      </div>
      <div className="p-4 space-y-2">
        {exceptions.length === 0 ? (
          <div className="text-center py-6">
            <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground mt-2">No service changes today</p>
            <p className="text-xs text-muted-foreground mt-0.5">All routes running as scheduled</p>
          </div>
        ) : (
          exceptions.map((ex) => (
            <div key={ex.id} className={`rounded-xl p-3.5 ${exceptionStyle(ex.type)}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <ExceptionIcon type={ex.type} /> {ex.busName} — {formatType(ex.type)}
                  </p>
                  {ex.notes && <p className="text-sm text-muted-foreground">{ex.notes}</p>}
                  <p className="text-xs text-muted-foreground">
                    Created by {ex.createdByName ?? "Unknown"} at{" "}
                    {new Date(ex.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={ex.notified ? "outline" : "default"}
                  disabled={notifying === ex.id}
                  onClick={() => handleNotify(ex)}
                  className="rounded-lg shrink-0 gap-1.5"
                >
                  <Bell className="h-3.5 w-3.5" />
                  {ex.notified ? "Re-notify" : "Notify"}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
