import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  CalendarIcon, Clock, XCircle, ArrowLeftRight, Plus, Bus, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import type { BusOption, RouteOption, OverrideRecord } from "@/hooks/useOverrides";

const overrideTypes = [
  { value: "time_shift", icon: Clock, label: "Time Shift", desc: "Bus running late/early" },
  { value: "cancellation", icon: XCircle, label: "Cancellation", desc: "Bus not running" },
  { value: "route_change", icon: ArrowLeftRight, label: "Route Change", desc: "Different route today" },
  { value: "extra_trip", icon: Plus, label: "Extra Trip", desc: "Additional bus added" },
];

interface Props {
  buses: BusOption[];
  routes: RouteOption[];
  editing: OverrideRecord | null;
  onSave: (data: {
    busId: string;
    exceptionDate: string;
    type: string;
    timeOffsetMins: number | null;
    overrideRouteId: string | null;
    notes: string;
    notifyNow: boolean;
  }) => Promise<boolean>;
  onCancel: () => void;
}

export default function OverrideForm({ buses, routes, editing, onSave, onCancel }: Props) {
  const [busId, setBusId] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [type, setType] = useState("time_shift");
  const [timeOffset, setTimeOffset] = useState(20);
  const [overrideRouteId, setOverrideRouteId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [notifyNow, setNotifyNow] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setBusId(editing.busId);
      setDate(new Date(editing.exceptionDate + "T00:00:00"));
      setType(editing.type);
      setTimeOffset(editing.timeOffsetMins ?? 0);
      setOverrideRouteId(editing.overrideRouteId ?? "");
      setNotes(editing.notes ?? "");
      setNotifyNow(false);
    }
  }, [editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busId) return;

    setSaving(true);
    await onSave({
      busId,
      exceptionDate: format(date, "yyyy-MM-dd"),
      type,
      timeOffsetMins: type === "time_shift" ? timeOffset : null,
      overrideRouteId: type === "route_change" && overrideRouteId ? overrideRouteId : null,
      notes: notes.trim(),
      notifyNow,
    });
    setSaving(false);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedBus = buses.find((b) => b.id === busId);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 mt-4">
      {/* Section 1: Which bus? */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Which bus?</p>
        <div className="space-y-2">
          {buses.map((bus) => (
            <button
              key={bus.id}
              type="button"
              onClick={() => setBusId(bus.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all",
                busId === bus.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                busId === bus.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                <Bus className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{bus.name}</p>
                <p className="text-xs text-muted-foreground">
                  {bus.licensePlate ?? "No plate"} · {bus.defaultRouteId ? "Assigned" : "Unassigned"}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Section 2: What type? */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">What type of change?</p>
        <div className="grid grid-cols-2 gap-2">
          {overrideTypes.map((ot) => {
            const Icon = ot.icon;
            return (
              <button
                key={ot.value}
                type="button"
                onClick={() => setType(ot.value)}
                className={cn(
                  "flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all",
                  type === ot.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <Icon className={cn("h-5 w-5", type === ot.value ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className="text-sm font-semibold text-foreground">{ot.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">{ot.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: When? */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">When?</p>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-full justify-start text-left font-normal rounded-xl h-11", !date && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(date, "PPP")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              disabled={(d) => { const check = new Date(d); check.setHours(0, 0, 0, 0); return check < today; }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Section 4: Conditional fields */}
      {type === "time_shift" && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Minutes offset</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTimeOffset((v) => v - 5)}
              className="w-11 h-11 rounded-xl border border-border bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="flex-1 text-center">
              <p className="text-2xl font-bold text-foreground">{timeOffset > 0 ? `+${timeOffset}` : timeOffset}</p>
              <p className="text-xs text-muted-foreground">minutes</p>
            </div>
            <button
              type="button"
              onClick={() => setTimeOffset((v) => v + 5)}
              className="w-11 h-11 rounded-xl border border-border bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {timeOffset > 0 ? `Bus will be +${timeOffset} min late` : timeOffset < 0 ? `Bus will be ${Math.abs(timeOffset)} min early` : "No offset"}
          </p>
        </div>
      )}

      {type === "route_change" && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Select new route</p>
          <Select value={overrideRouteId} onValueChange={setOverrideRouteId}>
            <SelectTrigger className="rounded-xl h-11">
              <SelectValue placeholder="Select new route..." />
            </SelectTrigger>
            <SelectContent>
              {routes.map((route) => (
                <SelectItem key={route.id} value={route.id}>{route.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Section 5: Details */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Details</p>
          <span className="text-[10px] text-muted-foreground">{notes.length}/200</span>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 200))}
          placeholder="Describe the change for students..."
          rows={3}
          className="rounded-xl resize-none"
        />
      </div>

      {/* Section 6: Notify toggle */}
      {!editing && (
        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Send push notification immediately</p>
            <p className="text-xs text-muted-foreground mt-0.5">Students subscribed to this route</p>
          </div>
          <Switch checked={notifyNow} onCheckedChange={setNotifyNow} />
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-col gap-2 pt-2">
        <Button
          type="submit"
          disabled={saving || !busId}
          className="w-full bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-primary-foreground rounded-xl h-11 font-semibold"
        >
          {saving ? "Saving..." : editing ? "Update Override" : "Create Override"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="w-full rounded-xl h-11">
          Cancel
        </Button>
      </div>
    </form>
  );
}
