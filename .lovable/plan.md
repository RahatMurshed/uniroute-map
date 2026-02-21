

# Fix: Add Missing RLS Policies for Route Deletion

## Root Cause

The `live_locations` and `students_on_bus` tables are missing RLS DELETE policies for admins. When the delete function runs:

1. `supabase.from("live_locations").delete().eq("trip_id", tripId)` silently deletes **zero rows** (RLS blocks it)
2. The call returns status 204 with no error (this is how Supabase RLS works -- it filters, not errors)
3. When `trips` deletion runs, the `live_locations` rows still exist, causing the FK constraint error

## Solution

### Step 1: Database Migration

Add RLS DELETE policies so admins can clean up dependent records:

```sql
-- Allow admins to delete live_locations
CREATE POLICY "Admins can delete live_locations"
  ON public.live_locations
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to select students_on_bus (needed for .in() filter)
CREATE POLICY "Admins can read students_on_bus"
  ON public.students_on_bus
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete students_on_bus
CREATE POLICY "Admins can delete students_on_bus"
  ON public.students_on_bus
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
```

### Step 2: No code changes needed

The deletion logic in `src/hooks/useRouteManager.ts` is already correct. Once the RLS policies allow the admin to actually delete rows, the existing code will work as intended.

## Why This Fixes It

| Table | Current RLS DELETE | After Fix |
|-------|-------------------|-----------|
| `live_locations` | No policy (blocked) | Admins can delete |
| `students_on_bus` | No policy (blocked) | Admins can delete |
| `trips` | Admin ALL policy (allowed) | No change needed |
| `routes` | Admin DELETE policy (allowed) | No change needed |

## Files Changed

| Change | Type |
|--------|------|
| New migration: add admin DELETE policies on `live_locations` and `students_on_bus` | Database |

No application code changes required.
