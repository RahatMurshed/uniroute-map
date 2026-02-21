import { useState, useCallback } from "react";
import { ArrowLeft, Plus, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import StopSelector from "./StopSelector";
import type { RouteRecord, RouteStop, StopInfo } from "@/hooks/useRouteManager";

const PRESET_COLORS = [
  { label: "Red", hex: "#E8440A" },
  { label: "Blue", hex: "#1A3A5C" },
  { label: "Green", hex: "#1A7A4A" },
  { label: "Orange", hex: "#C45C00" },
  { label: "Purple", hex: "#6B21A8" },
  { label: "Gray", hex: "#374151" },
];

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

interface RouteFormProps {
  stops: StopInfo[];
  initialData?: RouteRecord;
  onSave: (data: { name: string; color_hex: string; active_days: number[]; stop_sequence: RouteStop[] }) => Promise<void>;
  onCancel: () => void;
  onCreateStop: (stop: { name: string; landmark: string | null; lat: number; lng: number }) => Promise<StopInfo | null>;
}

export default function RouteForm({ stops, initialData, onSave, onCancel, onCreateStop }: RouteFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [colorHex, setColorHex] = useState(initialData?.color_hex ?? PRESET_COLORS[0].hex);
  const [activeDays, setActiveDays] = useState<number[]>(initialData?.active_days ?? [1, 2, 3, 4, 5]);
  const [selectedStops, setSelectedStops] = useState<(RouteStop & { name: string })[]>(
    initialData?.stop_sequence.map((ss) => ({
      ...ss,
      name: stops.find((s) => s.id === ss.stop_id)?.name ?? "Unknown",
    })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // New stop mini form
  const [showNewStop, setShowNewStop] = useState(false);
  const [newStopName, setNewStopName] = useState("");
  const [newStopLandmark, setNewStopLandmark] = useState("");
  const [newStopLat, setNewStopLat] = useState("");
  const [newStopLng, setNewStopLng] = useState("");
  const [creatingStop, setCreatingStop] = useState(false);

  const toggleDay = (day: number) => {
    setActiveDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const setQuickDays = (preset: "weekdays" | "everyday" | "weekend") => {
    if (preset === "weekdays") setActiveDays([1, 2, 3, 4, 5]);
    else if (preset === "everyday") setActiveDays([0, 1, 2, 3, 4, 5, 6]);
    else setActiveDays([0, 6]);
  };

  const addStop = (stop: StopInfo) => {
    if (selectedStops.some((s) => s.stop_id === stop.id)) return;
    setSelectedStops((prev) => [...prev, { stop_id: stop.id, scheduled_time: "", name: stop.name }]);
  };

  const removeStop = (idx: number) => {
    setSelectedStops((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateStopTime = (idx: number, time: string) => {
    setSelectedStops((prev) => prev.map((s, i) => (i === idx ? { ...s, scheduled_time: time } : s)));
  };

  const moveStop = (from: number, to: number) => {
    if (to < 0 || to >= selectedStops.length) return;
    setSelectedStops((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleCreateStop = async () => {
    if (!newStopName.trim()) return;
    const lat = parseFloat(newStopLat);
    const lng = parseFloat(newStopLng);
    if (isNaN(lat) || isNaN(lng)) return;

    setCreatingStop(true);
    const created = await onCreateStop({
      name: newStopName.trim(),
      landmark: newStopLandmark.trim() || null,
      lat,
      lng,
    });
    setCreatingStop(false);

    if (created) {
      addStop(created);
      setNewStopName("");
      setNewStopLandmark("");
      setNewStopLat("");
      setNewStopLng("");
      setShowNewStop(false);
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Route name is required";
    if (name.trim().length > 100) e.name = "Name must be under 100 characters";
    if (selectedStops.length === 0) e.stops = "At least 1 stop is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      name: name.trim(),
      color_hex: colorHex,
      active_days: activeDays,
      stop_sequence: selectedStops.map(({ stop_id, scheduled_time }) => ({ stop_id, scheduled_time })),
    });
    setSaving(false);
  };

  const isEdit = !!initialData;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h2 className="text-xl font-bold text-foreground">{isEdit ? "Edit Route" : "New Route"}</h2>
      </div>

      {/* Route Name */}
      <div className="space-y-1.5">
        <Label htmlFor="route-name">Route Name *</Label>
        <Input
          id="route-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main Campus Loop"
          maxLength={100}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>

      {/* Color Picker */}
      <div className="space-y-1.5">
        <Label>Route Color *</Label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => setColorHex(c.hex)}
              className={`h-9 w-9 rounded-full border-2 transition-all ${
                colorHex === c.hex ? "border-foreground scale-110" : "border-transparent"
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.label}
            />
          ))}
        </div>
      </div>

      {/* Active Days */}
      <div className="space-y-1.5">
        <Label>Active Days</Label>
        <div className="flex flex-wrap gap-3">
          {DAYS.map((d) => (
            <label key={d.value} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={activeDays.includes(d.value)}
                onCheckedChange={() => toggleDay(d.value)}
              />
              {d.label}
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setQuickDays("weekdays")}>
            Weekdays
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setQuickDays("everyday")}>
            Every Day
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setQuickDays("weekend")}>
            Weekend
          </Button>
        </div>
      </div>

      {/* Stops */}
      <div className="space-y-2">
        <Label>Stops *</Label>
        {errors.stops && <p className="text-sm text-destructive">{errors.stops}</p>}

        {selectedStops.length > 0 && (
          <Card className="divide-y divide-border">
            {selectedStops.map((ss, idx) => (
              <div key={ss.stop_id + idx} className="flex items-center gap-2 px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={idx === 0}
                    onClick={() => moveStop(idx, idx - 1)}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-sm text-muted-foreground w-14 shrink-0">Stop {idx + 1}:</span>
                <span className="text-sm font-medium text-card-foreground flex-1 truncate">{ss.name}</span>
                <Input
                  type="time"
                  value={ss.scheduled_time}
                  onChange={(e) => updateStopTime(idx, e.target.value)}
                  className="w-28 shrink-0"
                />
                <Button type="button" size="icon" variant="ghost" onClick={() => removeStop(idx)} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </Card>
        )}

        <StopSelector
          stops={stops}
          excludeIds={selectedStops.map((s) => s.stop_id)}
          onSelect={addStop}
        />

        {/* Create New Stop */}
        <Collapsible open={showNewStop} onOpenChange={setShowNewStop}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
              <Plus className="h-4 w-4 mr-1" /> Create new stop
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="p-4 mt-2 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="new-stop-name">Stop Name *</Label>
                  <Input id="new-stop-name" value={newStopName} onChange={(e) => setNewStopName(e.target.value)} placeholder="e.g. Main Gate" maxLength={100} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-stop-landmark">Landmark</Label>
                  <Input id="new-stop-landmark" value={newStopLandmark} onChange={(e) => setNewStopLandmark(e.target.value)} placeholder="Optional" maxLength={200} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-stop-lat">Latitude *</Label>
                  <Input id="new-stop-lat" type="number" step="any" value={newStopLat} onChange={(e) => setNewStopLat(e.target.value)} placeholder="e.g. 6.5244" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-stop-lng">Longitude *</Label>
                  <Input id="new-stop-lng" type="number" step="any" value={newStopLng} onChange={(e) => setNewStopLng(e.target.value)} placeholder="e.g. 3.3792" />
                </div>
              </div>
              <Button type="button" size="sm" disabled={creatingStop || !newStopName.trim() || !newStopLat || !newStopLng} onClick={handleCreateStop}>
                {creatingStop ? "Saving…" : "Save Stop"}
              </Button>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Submit */}
      <div className="flex gap-3 pt-2">
        <Button onClick={handleSubmit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? "Saving…" : isEdit ? "Update Route" : "Save Route"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
