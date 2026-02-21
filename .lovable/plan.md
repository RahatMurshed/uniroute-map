

# Fix: "This stop is not served today" showing incorrectly

## Root Cause

The `calculateETAsForStop()` function in `src/lib/eta.ts` returns an empty array (triggering "This stop is not served today") when either:

1. **Route stop_sequence matching fails** -- the route's `stopSequence` is `null` (no sequence configured), so `includes()` never matches.
2. **No buses in the array** -- even if routes match, if the `buses` array is empty at that moment, it returns `[]`.

The fix needs to be more resilient: if a bus is actively running on a route, show its ETA to any stop, even if stop_sequence is missing or doesn't list every stop.

## Changes

### 1. `src/lib/eta.ts` -- Make route-to-stop matching resilient

Update `calculateETAsForStop()`:
- If a route has a `stopSequence` that includes the stop, match as today.
- If a route has NO `stopSequence` (null), fall back to showing ETA for all active buses (distance-based) rather than hiding them.
- Add `console.log` for debugging: log serving routes, relevant buses, and final ETAs.

### 2. `src/pages/MapPage.tsx` -- Better empty-state messages

Change the `etas.length === 0` message from a single "not served today" to a contextual message:
- If `buses.length === 0`: "No buses currently active"
- Otherwise: "No active buses heading to this stop"

This avoids the misleading "not served today" when buses exist but just don't serve that specific stop.

### 3. `src/pages/MapPage.tsx` -- Add debug log on stop tap

Log the selected stop, available buses, and routes to console when a stop is tapped, making future debugging easier.

---

## Technical Details

**In `calculateETAsForStop` (eta.ts lines 93-143):**
- Change route filtering logic:
  - Current: `routes.filter(r => r.stopSequence && r.stopSequence.includes(stop.id))`
  - New: `routes.filter(r => !r.stopSequence || r.stopSequence.includes(stop.id))`
  - This treats routes with no stop_sequence as "serving all stops" (fallback)
- Add console.log before return for debugging

**In MapPage.tsx (line 250):**
- Replace `"This stop is not served today"` with conditional check on `buses.length`

