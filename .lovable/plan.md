

# Fix: Exceptions Table INSERT Failing for Drivers

## Problem
The delay report form fails because the RLS policies on the `exceptions` table are all **restrictive** (not permissive). In PostgreSQL, when multiple restrictive policies exist, **all** of them must pass. Since a driver is not an admin, the "Admins can insert exceptions" restrictive policy always fails for drivers, blocking their insert -- even though the "Drivers can insert exceptions for their own bus" policy passes.

## Solution

### 1. Database Migration: Fix RLS Policies
Drop the existing restrictive INSERT policies on `exceptions` and recreate them as **permissive** policies. This way, if **any** policy passes (admin OR driver), the insert is allowed.

Policies to recreate as permissive:
- "Admins can insert exceptions" (permissive, `WITH CHECK: has_role(auth.uid(), 'admin')`)
- "Drivers can insert exceptions for their own bus" (permissive, `WITH CHECK: created_by = auth.uid()`)

### 2. Code Change: Add console.log Before INSERT
In `src/pages/DriverPage.tsx`, add a `console.log` of the full payload object right before the `supabase.from("exceptions").insert(...)` call in the `handleReportSubmit` function (around line 181). This logs `bus_id`, `exception_date`, `type`, `notes`, `notified`, and `created_by` for debugging verification.

---

### Technical Details

**Migration SQL:**
```text
DROP POLICY "Admins can insert exceptions" ON public.exceptions;
DROP POLICY "Drivers can insert exceptions for their own bus" ON public.exceptions;

CREATE POLICY "Admins can insert exceptions"
  ON public.exceptions FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Drivers can insert exceptions for their own bus"
  ON public.exceptions FOR INSERT
  WITH CHECK (created_by = auth.uid());
```

**Code change in DriverPage.tsx (~line 180):**
- Build a `payload` object with all fields
- `console.log("Exception payload:", payload)`
- Pass `payload` to the `.insert()` call

