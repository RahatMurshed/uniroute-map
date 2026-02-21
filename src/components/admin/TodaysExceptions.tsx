import { useState } from "react";
import type { AdminException } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

function exceptionStyle(type: string) {
  switch (type) {
    case "cancellation": return "border-l-4 border-l-destructive bg-destructive/5";
    case "time_shift": return "border-l-4 border-l-yellow-500 bg-yellow-500/5";
    case "route_change": return "border-l-4 border-l-blue-500 bg-blue-500/5";
    default: return "border-l-4 border-l-muted bg-muted/5";
  }
}

function exceptionEmoji(type: string) {
  switch (type) {
    case "cancellation": return "🔴";
    case "time_shift": return "🟡";
    case "route_change": return "🔵";
    default: return "ℹ️";
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">📋 Today's Service Changes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {exceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">✅ No service changes today</p>
        ) : (
          exceptions.map((ex) => (
            <div key={ex.id} className={`rounded-lg p-3 ${exceptionStyle(ex.type)}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {exceptionEmoji(ex.type)} {ex.busName} — {formatType(ex.type)}
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
                >
                  {ex.notified ? "Re-notify 🔔" : "Notify Students 🔔"}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
