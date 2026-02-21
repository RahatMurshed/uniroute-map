import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BusOption, RouteOption, OverrideRecord } from "@/hooks/useOverrides";

const overrideTypes = [
  { value: "time_shift", emoji: "🕐", label: "Time Shift", desc: "Bus running late/early" },
  { value: "cancellation", emoji: "❌", label: "Cancellation", desc: "Bus not running today" },
  { value: "route_change", emoji: "🔄", label: "Route Change", desc: "Bus on different route" },
  { value: "extra_trip", emoji: "➕", label: "Extra Trip", desc: "Additional bus added" },
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
  const [timeOffset, setTimeOffset] = useState<string>("20");
  const [overrideRouteId, setOverrideRouteId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [notifyNow, setNotifyNow] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setBusId(editing.busId);
      setDate(new Date(editing.exceptionDate + "T00:00:00"));
      setType(editing.type);
      setTimeOffset(String(editing.timeOffsetMins ?? 0));
      setOverrideRouteId(editing.overrideRouteId ?? "");
      setNotes(editing.notes ?? "");
      setNotifyNow(false);
    }
  }, [editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busId || !notes.trim()) return;

    setSaving(true);
    const success = await onSave({
      busId,
      exceptionDate: format(date, "yyyy-MM-dd"),
      type,
      timeOffsetMins: type === "time_shift" ? parseInt(timeOffset) || 0 : null,
      overrideRouteId: type === "route_change" && overrideRouteId ? overrideRouteId : null,
      notes: notes.trim(),
      notifyNow,
    });
    setSaving(false);
    if (success) onCancel();
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <h3 className="text-lg font-semibold text-foreground">
        {editing ? "Edit Override" : "New Override"}
      </h3>

      {/* Bus Selection */}
      <div className="space-y-2">
        <Label>Select Bus</Label>
        <Select value={busId} onValueChange={setBusId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a bus..." />
          </SelectTrigger>
          <SelectContent>
            {buses.map((bus) => (
              <SelectItem key={bus.id} value={bus.id}>
                {bus.name}
                {bus.licensePlate ? ` — ${bus.licensePlate}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date Picker */}
      <div className="space-y-2">
        <Label>Override Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !date && "text-muted-foreground"
              )}
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
              disabled={(d) => {
                const check = new Date(d);
                check.setHours(0, 0, 0, 0);
                return check < today;
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Override Type */}
      <div className="space-y-2">
        <Label>Override Type</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {overrideTypes.map((ot) => (
            <button
              key={ot.value}
              type="button"
              onClick={() => setType(ot.value)}
              className={cn(
                "flex items-start gap-2 p-3 rounded-lg border text-left transition-colors",
                type === ot.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <span className="text-lg">{ot.emoji}</span>
              <div>
                <p className="text-sm font-medium text-foreground">{ot.label}</p>
                <p className="text-xs text-muted-foreground">{ot.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conditional: Time Shift */}
      {type === "time_shift" && (
        <div className="space-y-2">
          <Label>Minutes delayed (+ for late, - for early)</Label>
          <Input
            type="number"
            value={timeOffset}
            onChange={(e) => setTimeOffset(e.target.value)}
            placeholder="e.g. +20 or -10"
          />
        </div>
      )}

      {/* Conditional: Route Change */}
      {type === "route_change" && (
        <div className="space-y-2">
          <Label>New Route</Label>
          <Select value={overrideRouteId} onValueChange={setOverrideRouteId}>
            <SelectTrigger>
              <SelectValue placeholder="Select new route..." />
            </SelectTrigger>
            <SelectContent>
              {routes.map((route) => (
                <SelectItem key={route.id} value={route.id}>
                  {route.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-2">
        <Label>
          Notes <span className="text-destructive">*</span>
        </Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Explain the change to students e.g. Due to road construction on Main St"
          rows={3}
          required
        />
      </div>

      {/* Notify Toggle */}
      {!editing && (
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Notify Students Immediately</p>
            <p className="text-xs text-muted-foreground">
              Send push notification on save
            </p>
          </div>
          <Switch checked={notifyNow} onCheckedChange={setNotifyNow} />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving || !busId || !notes.trim()}>
          {saving ? "Saving..." : editing ? "Update Override" : "Save Override"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
