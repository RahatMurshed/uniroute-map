

# Fix: Driver delay reports show "Not Yet Notified"

## Root Cause

Two issues prevent `notified` from being set to `true`:

1. The exception is inserted with `notified: false` on line 186
2. The subsequent `UPDATE exceptions SET notified = true` on lines 220-223 **silently fails** because the RLS policy on the `exceptions` table only allows **admins** to update -- drivers have no UPDATE permission

## Solution

**Change the insert flow so notifications fire first, then insert with the correct `notified` value.** This avoids needing an UPDATE at all.

### File: `src/pages/DriverPage.tsx`

Restructure `handleReportSubmit` (lines 180-228):

1. Before inserting the exception, resolve `route_id` and attempt the push notification call
2. If notification succeeds, insert the exception with `notified: true`
3. If notification fails (or no route found), insert with `notified: false`
4. Remove the separate UPDATE call entirely (lines 220-223) since it can never succeed under driver RLS

```
// Pseudocode of new flow:
const routeId = (await getRouteFromTrip())?.route_id;
let notified = false;

if (routeId) {
  try {
    await supabase.functions.invoke("send-push-notifications", { ... });
    notified = true;
  } catch { /* log error */ }
}

// Insert with correct notified value
await supabase.from("exceptions").insert({
  ...payload,
  notified,   // true if push succeeded
});
```

### No database/RLS changes needed

This approach avoids granting drivers UPDATE on exceptions, which would be a broader permission change. By setting the correct value at INSERT time, we work within the existing security model.

## Result

- Exception row is created with `notified = true` in the database
- Admin Overrides page immediately shows "Notified" badge
- No silent RLS failures
- No admin action required
