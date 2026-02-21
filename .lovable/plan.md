

# Fix Route Manager Delete and Map ETA Labels

## FIX 1 -- Cannot Delete Route (Foreign Key Error)

### Root Cause
The `trips.route_id` column is `NOT NULL`, so the user's suggested approach of setting `route_id = null` for completed trips will fail with a database constraint error.

### Solution
Update `deleteRoute` in `src/hooks/useRouteManager.ts` to:

1. Query all trips referencing this route
2. If any **active or delayed** trips exist, show an error: "Cannot delete this route -- a bus is currently running on it. End the active trip first, then try again." and abort.
3. If only **completed/cancelled** trips exist, delete those trip records first (since they are historical and the route is being removed), then delete the route.
4. If no trips reference the route, delete it directly.

```text
deleteRoute(id)
  |
  +-- Query trips where route_id = id
  |
  +-- Has active/delayed trips? --> Error toast, abort
  |
  +-- Has completed/cancelled trips? --> Delete those trips first
  |
  +-- Delete the route
  |
  +-- Success toast
```

### File: `src/hooks/useRouteManager.ts` (lines 108-117)

Replace the `deleteRoute` function with logic that:
- Fetches `trips` with `.select('id, status').eq('route_id', id)`
- Checks for active/delayed trips and blocks deletion
- Deletes completed/cancelled trips referencing the route
- Then deletes the route itself

---

## FIX 2 -- ETA Label for Passed Stops

### Root Cause
In `src/lib/eta.ts`, the `formatETA` function (line 85) shows "Next bus not yet departed" when `passed` is true. This message is confusing and unhelpful.

### Solution
Update the `formatETA` function to return contextual messages:

| Condition | New Message |
|-----------|-------------|
| `stale` (GPS > 2 min old) | "Bus location unavailable" (unchanged) |
| `passed` | "Bus has passed this stop" |
| `etaMinutes < 1` | "Arriving now! (green circle)" |
| `etaMinutes <= 2` | "Arriving in ~1-2 min (yellow circle)" |
| `etaMinutes > 60` | "No bus nearby" (unchanged) |
| otherwise | "Arriving in ~X min (bus icon)" |

### File: `src/lib/eta.ts` (line 85)

Change:
```
if (passed) return "Next bus not yet departed";
```
To:
```
if (passed) return "🚌 Bus has passed this stop";
```

---

## Star Button on Stop Popup

The star/favourite button already works correctly in the bottom info card for all stops (lines 409-415 in MapPage.tsx). The stop markers are rebuilt whenever `stops` changes (line 251-265), so newly added stops from Route Manager will appear after the next page load. No changes needed here -- the existing implementation handles this correctly.

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/hooks/useRouteManager.ts` | Rewrite `deleteRoute` to check for linked trips before deleting |
| `src/lib/eta.ts` | Change "Next bus not yet departed" to "Bus has passed this stop" |

No database migrations needed. No other files require changes.

