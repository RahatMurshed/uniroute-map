

# Fix Admin Fleet Overview — Driver Name and Active Trips Counter

## FIX 1: Driver Name Not Showing

### Root Cause
The `profiles` table has an RLS policy that only lets users see their own profile:
```
Using Expression: (auth.uid() = id)
```

When the admin queries `trips` joined with `profiles`, the join silently returns `null` for every driver who isn't the admin themselves. This is why `driverName` always shows "—".

### Solution
Two changes are needed:

**A. Add an RLS policy so admins can read all profiles**

A new database migration will add:
```sql
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
```

This lets admin users see any profile's `display_name` through the join.

**B. Update the trip mapping in `useAdminData.ts`**

Use an aliased join for clarity and add a fallback that queries profiles separately if the join returns null:

```ts
.select(`id, bus_id, route_id, status, driver_id, routes(name), driver:profiles!trips_driver_id_fkey(display_name)`)
```

Then access as `(t.driver as any)?.display_name`. If the join still fails for any reason, do a separate profiles lookup using the collected `driver_id` values as a fallback.

---

## FIX 2: Active Trips Counter Wrong

### Root Cause
In `fetchStats()`, the "Active Trips" counter only counts `status = 'active'`, but delayed buses are still physically running and should be included.

### Solution

**File: `src/hooks/useAdminData.ts` — `fetchStats` function**

- Change the "Active Trips" query to count trips where status is `active` OR `delayed`:
  ```ts
  supabase.from("trips").select("id", { count: "exact", head: true }).in("status", ["active", "delayed"])
  ```

- The "Delayed Today" query stays unchanged (only `status = 'delayed'`).

- Also update the students query to include delayed trips:
  ```ts
  supabase.from("trips").select("id").in("status", ["active", "delayed"])
  ```

---

## Summary of File Changes

### Database Migration (new)
- Add RLS policy: `Admins can view all profiles` on `profiles` table for SELECT

### `src/hooks/useAdminData.ts`
- Line 56: Use aliased join `driver:profiles!trips_driver_id_fkey(display_name)`
- Line 67: Access driver name via `(t.driver as any)?.display_name`
- Line 98: Keep existing fallback chain
- Lines 139-146: Change active trips count to include both `active` and `delayed` statuses
- Line 146: Change student count query to include both `active` and `delayed` trips

No changes needed to `FleetStatusTable.tsx` or `StatsRow.tsx` — they already render correctly from the data they receive.
