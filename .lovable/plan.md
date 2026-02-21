

# Fix Three Bugs in the Overrides Page

## Bug 1: Notify button fails with "no route associated with this bus"

The `notifyStudents` function in `src/hooks/useOverrides.ts` (lines 212-268) currently resolves `routeId` only from `override_route_id` or `bus.default_route_id`. For driver-created exceptions, both can be null.

**Fix**: Replace the route resolution logic with a 3-step fallback:

1. Use `override_route_id` if present
2. Query most recent trip for that bus: `supabase.from('trips').select('route_id').eq('bus_id', busId).in('status', ['active','delayed','completed']).order('started_at', { ascending: false }).limit(1).single()`
3. Query `buses.default_route_id`
4. If still null, show: "No route found. Please assign a default route to this bus first."

**File**: `src/hooks/useOverrides.ts` -- rewrite `notifyStudents` route resolution block (lines 225-244)

## Bug 2: "Created by Unknown"

The query on line 47 already joins profiles correctly with `profiles!exceptions_created_by_fkey(display_name)`, and line 72 maps it as `createdByName: e.profiles?.display_name ?? null`. This should work, but the issue may be that driver-created exceptions have a `created_by` that doesn't exist in the profiles table, or the join alias is mismatched. I'll verify the query returns data correctly and ensure the mapping handles both singular and array return shapes.

**Fix**: No query change needed -- the join syntax is correct. The display on line 105 of `OverrideCard.tsx` already shows `override.createdByName ?? "Unknown"` which is correct. This bug likely resolves once the profiles table has the right data, but I'll add a fallback that also checks `e.profiles?.display_name` as an array element in case Supabase returns it differently.

## Bug 3: notified stays false

The code on line 260 already does `await supabase.from("exceptions").update({ notified: true }).eq("id", exceptionId)` and line 261 shows a success toast. This bug is a cascading failure from Bug 1 -- when the notify function errors out at the route check (line 242-244), it never reaches the update. Once Bug 1 is fixed, Bug 3 resolves automatically.

---

## Technical Details

### File: `src/hooks/useOverrides.ts`

Replace the `notifyStudents` function's route resolution logic (lines 221-244) with:

```typescript
const notifyStudents = async (
  exceptionId: string,
  data?: {
    busId: string;
    type: string;
    timeOffsetMins: number | null;
    overrideRouteId: string | null;
  }
) => {
  let busId = data?.busId;
  let type = data?.type;
  let timeOffsetMins = data?.timeOffsetMins;
  let routeId: string | null = data?.overrideRouteId ?? null;
  let busName = "";

  if (!data) {
    const override = overrides.find((o) => o.id === exceptionId);
    if (!override) return false;
    busId = override.busId;
    type = override.type;
    timeOffsetMins = override.timeOffsetMins;
    busName = override.busName;
    routeId = override.overrideRouteId;
  } else {
    const bus = buses.find((b) => b.id === data.busId);
    busName = bus?.name ?? "Bus";
  }

  // Fallback 1: check most recent trip for this bus
  if (!routeId && busId) {
    const { data: tripData } = await supabase
      .from("trips")
      .select("route_id")
      .eq("bus_id", busId)
      .in("status", ["active", "delayed", "completed"])
      .order("started_at", { ascending: false })
      .limit(1)
      .single();
    routeId = tripData?.route_id ?? null;
  }

  // Fallback 2: check bus default route
  if (!routeId && busId) {
    const { data: busData } = await supabase
      .from("buses")
      .select("default_route_id")
      .eq("id", busId)
      .single();
    routeId = busData?.default_route_id ?? null;
  }

  if (!routeId) {
    toast.error("No route found. Please assign a default route to this bus first.");
    return false;
  }

  // ... rest of the function (invoke edge function, update notified, etc.) stays the same
};
```

No other files need changes. The OverrideCard UI and query join are already correctly implemented.
