

# Fix: Driver Delay Notifications Reach Students with Correct Message

## Problem

Two mismatches prevent the correct notification message from being shown:

1. **Type mismatch**: The driver sends `exception_type: "time_shift"` but the edge function only handles `"delay"` -- so it falls through to a generic "has a service change" message instead of the expected "Bus Running Late" message.
2. **Missing reason**: The driver's notes (e.g., "Road Blockage") are never sent to the edge function, so students see no explanation.

The auto-notification flow itself is already wired up correctly from the previous change. These are message formatting fixes only.

## Changes

### 1. Edge Function: `supabase/functions/send-push-notifications/index.ts`

- Add `"time_shift"` as an alias for `"delay"` in the message formatting logic
- Accept an optional `notes` field in the request body
- Include notes in the notification body when present

Current (line 171):
```
} else if (exception_type === "delay") {
```

Updated:
```
} else if (exception_type === "delay" || exception_type === "time_shift") {
```

Current body message (line 173):
```
body = `${bus_name} delayed by ${time_offset_mins ?? "?"} minutes`;
```

Updated to include notes when available:
```
if (notes) {
  body = `${bus_name} is delayed -- ${notes}`;
} else if (time_offset_mins) {
  body = `${bus_name} delayed by ${time_offset_mins} minutes`;
} else {
  body = `${bus_name} is running late`;
}
```

This produces: **"⚠️ Bus Running Late" / "Bus A is delayed -- Road Blockage"**

### 2. Driver Page: `src/pages/DriverPage.tsx`

Pass the driver's notes to the edge function call so students see the reason.

Current (line 209-217):
```typescript
body: {
  type: "exception",
  bus_id: activeTrip.busId,
  bus_name: activeTrip.busName,
  exception_type: isCancellation ? "cancellation" : "time_shift",
  time_offset_mins: null,
  route_id: routeId,
},
```

Updated -- add `notes` field:
```typescript
body: {
  type: "exception",
  bus_id: activeTrip.busId,
  bus_name: activeTrip.busName,
  exception_type: isCancellation ? "cancellation" : "time_shift",
  time_offset_mins: null,
  route_id: routeId,
  notes: combinedNotes,
},
```

## Result

- Student receives: **"⚠️ Bus Running Late"** / **"Bus A is delayed -- Road Blockage"**
- Admin override card shows **"Notified"** immediately (already working)
- No admin action required

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/send-push-notifications/index.ts` | Handle `time_shift` type, include notes in message |
| `src/pages/DriverPage.tsx` | Pass `notes` (combinedNotes) to edge function |

