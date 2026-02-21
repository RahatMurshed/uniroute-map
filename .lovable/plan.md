
# Fix: Delete Route Still Failing on Foreign Key Constraint

## Root Cause

The `live_locations` delete uses Supabase's `.in('trip_id', tripIds)` which has a default row limit of 1000. If a trip has accumulated many GPS pings, the delete may not remove all `live_locations` rows in a single call, leaving behind rows that block the trip deletion.

Additionally, the `students_on_bus` table also has a `trip_id` column which could be another foreign key constraint blocker that isn't being handled.

## Solution

Update `deleteRoute` in `src/hooks/useRouteManager.ts` to:

1. Delete `live_locations` in batches or one trip at a time to avoid the 1000-row limit
2. Also delete `students_on_bus` records for those trips before deleting the trips
3. Process each trip individually to ensure complete cleanup

### Updated deletion order:

```
Step 1: Check for active/delayed trips (unchanged)
Step 2: Get completed/cancelled trip IDs (unchanged)
Step 3: For each trip ID, delete live_locations one trip at a time
Step 4: Delete students_on_bus for those trip IDs
Step 5: Delete exceptions for linked buses (unchanged)
Step 6: Delete the trips
Step 7: Delete the route
```

### File: `src/hooks/useRouteManager.ts` (lines 131-162)

Replace the batch `.in()` delete for `live_locations` with a loop that deletes per-trip:

```ts
for (const tripId of tripIds) {
  const { error: locErr } = await supabase
    .from("live_locations")
    .delete()
    .eq("trip_id", tripId);
  if (locErr) {
    toast.error("Failed to remove location history: " + locErr.message);
    return false;
  }
}
```

Add a new step to delete `students_on_bus` records:

```ts
if (tripIds.length > 0) {
  await supabase
    .from("students_on_bus")
    .delete()
    .in("trip_id", tripIds);
}
```

This ensures all dependent records are fully removed before attempting to delete trips, respecting all foreign key constraints regardless of data volume.
