

# Fix: "Not Yet Notified" persists after driver delay report

## Root Cause

The `.update({ notified: true })` call after sending the notification keeps failing silently despite correct-looking RLS policies. The driver's UPDATE is being blocked at the database level, and the error is swallowed because the result is not checked.

## Solution: Notify First, Then Insert Once

Instead of INSERT (notified=false) -> notify -> UPDATE (notified=true), restructure to:

1. Resolve route_id from the active trip
2. Call the `send-push-notifications` Edge Function
3. INSERT the exception with `notified: true` if the notification succeeded, or `notified: false` if it failed

This eliminates the UPDATE call entirely -- only a single INSERT is needed, which drivers already have RLS permission for.

## File: `src/pages/DriverPage.tsx`

Replace the current `handleReportSubmit` logic (lines 179-227) with:

```
try {
  // 1. Resolve route
  const { data: tripData } = await supabase
    .from("trips")
    .select("route_id")
    .eq("id", activeTripId)
    .single();
  const routeId = tripData?.route_id;

  // 2. Attempt notification BEFORE inserting
  let notified = false;
  if (routeId) {
    try {
      const { error: pushError } = await supabase.functions.invoke(
        "send-push-notifications",
        {
          body: {
            type: "exception",
            bus_id: activeTrip.busId,
            bus_name: activeTrip.busName,
            exception_type: isCancellation ? "cancellation" : "time_shift",
            time_offset_mins: null,
            route_id: routeId,
            notes: combinedNotes,
          },
        }
      );
      if (!pushError) notified = true;
    } catch (pushErr) {
      console.error("Push notification failed:", pushErr);
    }
  }

  // 3. Single INSERT with correct notified value
  const { error: excError } = await supabase
    .from("exceptions")
    .insert({
      bus_id: activeTrip.busId,
      exception_date: new Date().toISOString().split("T")[0],
      type: isCancellation ? "cancellation" : "time_shift",
      notes: combinedNotes,
      notified,          // <-- true if push succeeded
      created_by: user.id,
    });
  if (excError) throw excError;

  // ... rest of flow (cancel trip, toast, etc.)
}
```

## Why this works

- Drivers have INSERT permission on `exceptions` (RLS policy: "Drivers can insert exceptions for their own bus")
- No UPDATE call is needed -- the `notified` value is correct from the start
- The Realtime subscription in `useOverrides.ts` already listens for `event: "*"` (including INSERT), so the admin UI updates automatically

## Files changed

| File | Change |
|------|--------|
| `src/pages/DriverPage.tsx` | Restructure: notify first, then single INSERT with correct `notified` value |

