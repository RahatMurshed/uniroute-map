import { useState } from "react";
import { Plus, ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { RouteRecord, StopInfo } from "@/hooks/useRouteManager";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function activeDaysText(days: number[] | null): string {
  if (!days || days.length === 0) return "No active days";
  const sorted = [...days].sort();
  if (sorted.length === 7) return "Every day";
  if (JSON.stringify(sorted) === JSON.stringify([1, 2, 3, 4, 5])) return "Monday – Friday";
  if (JSON.stringify(sorted) === JSON.stringify([0, 6])) return "Weekends";
  return sorted.map((d) => DAY_LABELS[d]).join(", ");
}

function formatTime(t: string): string {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  const ampm = hr >= 12 ? "PM" : "AM";
  const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${hr12}:${m} ${ampm}`;
}

interface RouteListProps {
  routes: RouteRecord[];
  stops: StopInfo[];
  loading: boolean;
  onNewRoute: () => void;
  onEdit: (route: RouteRecord) => void;
  onDelete: (id: string) => Promise<boolean>;
}

export default function RouteList({ routes, stops, loading, onNewRoute, onEdit, onDelete }: RouteListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<RouteRecord | null>(null);

  const stopMap = new Map(stops.map((s) => [s.id, s]));

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">Route Manager</h2>
        </div>
        <div className="flex items-center justify-center h-48 text-muted-foreground">Loading routes…</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Route Manager</h2>
        <Button onClick={onNewRoute} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> New Route
        </Button>
      </div>

      {routes.length === 0 ? (
        <Card className="flex flex-col items-center justify-center h-48 text-center">
          <p className="text-lg text-muted-foreground">🗺️ No routes created yet</p>
          <p className="text-sm text-muted-foreground mt-1">Click "+ New Route" to create your first route.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {routes.map((route) => {
            const isOpen = expanded.has(route.id);
            const stopCount = route.stop_sequence.length;
            const updated = new Date(route.created_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
            return (
              <Card key={route.id} className="overflow-hidden">
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer select-none"
                  onClick={() => toggle(route.id)}
                >
                  <span
                    className="mt-1 h-3.5 w-3.5 rounded-full shrink-0 border border-border"
                    style={{ backgroundColor: route.color_hex ?? "#374151" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-card-foreground truncate">{route.name}</span>
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {activeDaysText(route.active_days)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stopCount} stop{stopCount !== 1 ? "s" : ""} · Last updated: {updated}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => onEdit(route)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(route)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isOpen && route.stop_sequence.length > 0 && (
                  <div className="border-t border-border px-4 py-3 space-y-1.5 bg-muted/30">
                    {route.stop_sequence.map((ss, idx) => {
                      const stop = stopMap.get(ss.stop_id);
                      return (
                        <div key={ss.stop_id + idx} className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground w-16 shrink-0">Stop {idx + 1}:</span>
                          <span className="font-medium text-card-foreground truncate flex-1">
                            {stop?.name ?? "Unknown Stop"}
                          </span>
                          <span className="text-muted-foreground text-xs shrink-0">
                            {formatTime(ss.scheduled_time)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Route</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteTarget) {
                  await onDelete(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
