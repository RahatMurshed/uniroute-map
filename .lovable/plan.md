

# Fix: Scheduled times showing "—" in PDF Export

## Root Cause

The PDF export hook (`src/hooks/usePdfExport.ts`) reads `entry.depart_time` from the stop sequence, but the actual JSONB field stored in the database is `scheduled_time`. Since `depart_time` is always `undefined`, every stop falls back to "—".

## Changes

### File: `src/hooks/usePdfExport.ts`

**1. Fix the type definition (line 11)**

Change:
```typescript
stopSequence: { stop_id: string; depart_time: string }[] | null;
```
To:
```typescript
stopSequence: { stop_id: string; scheduled_time: string }[] | null;
```

**2. Fix the time field access (line 245)**

Change:
```typescript
const time = entry.depart_time ?? "—";
```
To:
```typescript
const rawTime = entry.scheduled_time ?? "";
const time = rawTime ? formatTime12(rawTime) : "—";
```

**3. Add a 12-hour time formatter**

Add a small helper function near the top of the file:
```typescript
function formatTime12(t: string): string {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  const ampm = hr >= 12 ? "PM" : "AM";
  const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${hr12}:${m} ${ampm}`;
}
```

This will produce the expected output like "8:00 AM", "8:10 AM" instead of "—".

## Result

| Before | After |
|--------|-------|
| Main Gate — | Main Gate 8:00 AM |
| Hostel Block A — | Hostel Block A 8:10 AM |

Only one file is modified: `src/hooks/usePdfExport.ts`.
