
# Fix: Driver Name From Active Trip Instead of Bus Assignment

## Problem

The `fetchBuses` function in `useAdminData.ts` gets the driver name from `buses.driver_id -> profiles.display_name` (line 49, 97). This shows the **assigned** driver, not the driver **currently driving**. When a trip is active, the actual driver is recorded on `trips.driver_id`, which may differ.

## Solution

Update the trips query (line 54-57) to also fetch the driver's profile, then use that name instead.

### File: `src/hooks/useAdminData.ts`

**1. Update the trips query (line 54-57)** to include the driver profile:

```ts
const { data: trips } = await supabase
  .from("trips")
  .select("id, bus_id, route_id, status, driver_id, routes(name), profiles!trips_driver_id_fkey(display_name)")
  .in("status", ["active", "delayed"]);
```

**2. Update the tripByBus map (lines 59-69)** to store the driver name:

```ts
const tripByBus = new Map<string, {
  id: string; routeId: string; routeName: string; status: string; driverName: string | null;
}>();
if (trips) {
  for (const t of trips) {
    tripByBus.set(t.bus_id, {
      id: t.id,
      routeId: t.route_id,
      routeName: (t.routes as any)?.name ?? "Unknown",
      status: t.status,
      driverName: (t.profiles as any)?.display_name ?? null,
    });
  }
}
```

**3. Update the mapping (line 97)** to prefer the trip's driver over the bus's assigned driver:

```ts
driverName: trip?.driverName ?? (b.profiles as any)?.display_name ?? null,
```

This way, if there is an active/delayed trip, the driver shown is whoever started that trip. If no active trip exists, it falls back to the bus's assigned driver.
