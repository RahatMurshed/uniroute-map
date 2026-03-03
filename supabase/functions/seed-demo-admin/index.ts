import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 1. Create demo admin user ──
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u: any) => u.email === "demo@uniroute.app");

    let userId: string;
    if (existing) {
      userId = existing.id;
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: "demo@uniroute.app",
        password: "demo123456",
        email_confirm: true,
      });
      if (error) throw error;
      userId = data.user.id;
    }

    const { data: roleExists } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleExists) {
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "admin" });
    }

    const { data: profileExists } = await supabaseAdmin
      .from("profiles").select("id").eq("id", userId).maybeSingle();
    if (!profileExists) {
      await supabaseAdmin.from("profiles").insert({ id: userId, email: "demo@uniroute.app", display_name: "Demo Admin" });
    } else {
      await supabaseAdmin.from("profiles").update({ display_name: "Demo Admin" }).eq("id", userId);
    }

    // ── 2. Create demo drivers ──
    async function ensureUser(email: string, displayName: string, role: string) {
      const ex = existingUsers?.users?.find((u: any) => u.email === email);
      let uid: string;
      if (ex) { uid = ex.id; }
      else {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password: "demo123456", email_confirm: true });
        if (error) throw error;
        uid = data.user.id;
      }
      const { data: re } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", uid).eq("role", role).maybeSingle();
      if (!re) await supabaseAdmin.from("user_roles").insert({ user_id: uid, role });
      const { data: pe } = await supabaseAdmin.from("profiles").select("id").eq("id", uid).maybeSingle();
      if (!pe) await supabaseAdmin.from("profiles").insert({ id: uid, email, display_name: displayName });
      else await supabaseAdmin.from("profiles").update({ display_name: displayName }).eq("id", uid);
      return uid;
    }

    const driverId = await ensureUser("driver@uniroute.app", "Rafiq Ahmed", "driver");
    const driver2Id = await ensureUser("driver2@uniroute.app", "Kamal Hossain", "driver");

    // ── 3. Seed stops ──
    const stopSeeds = [
      { name: "Main Gate", lat: 23.7285, lng: 90.3975, landmark: "University Main Entrance" },
      { name: "Science Faculty", lat: 23.7295, lng: 90.3990, landmark: "Near Chemistry Building" },
      { name: "Library", lat: 23.7310, lng: 90.4005, landmark: "Central Library" },
      { name: "TSC", lat: 23.7335, lng: 90.3965, landmark: "Teacher-Student Centre" },
      { name: "Shahbagh", lat: 23.7380, lng: 90.3960, landmark: "Shahbagh Intersection" },
      { name: "Nilkhet", lat: 23.7330, lng: 90.3910, landmark: "Nilkhet Book Market" },
      { name: "Curzon Hall", lat: 23.7280, lng: 90.4020, landmark: "Historic Curzon Hall" },
      { name: "Engineering Faculty", lat: 23.7265, lng: 90.3955, landmark: "BUET Adjacent" },
      { name: "Dhanmondi 27", lat: 23.7470, lng: 90.3755, landmark: "Dhanmondi Residential" },
      { name: "Mirpur 10", lat: 23.8067, lng: 90.3686, landmark: "Mirpur Stadium Area" },
    ];

    const { data: existingStops } = await supabaseAdmin.from("stops").select("id, name");
    const existingStopNames = new Set((existingStops ?? []).map((s: any) => s.name));
    const stopsToInsert = stopSeeds.filter((s) => !existingStopNames.has(s.name));
    if (stopsToInsert.length > 0) await supabaseAdmin.from("stops").insert(stopsToInsert);

    const { data: allStops } = await supabaseAdmin.from("stops").select("id, name");
    const stopIdMap = new Map((allStops ?? []).map((s: any) => [s.name, s.id]));

    // ── 4. Seed routes ──
    const routeSeeds = [
      { name: "Red Line - Campus Loop", color_hex: "#CC1B1B", active_days: [0,1,2,3,4,5,6],
        stopNames: ["Main Gate", "Science Faculty", "Library", "TSC", "Shahbagh", "Main Gate"] },
      { name: "Blue Line - City Connect", color_hex: "#2563EB", active_days: [1,2,3,4,5],
        stopNames: ["Main Gate", "Nilkhet", "Dhanmondi 27", "Mirpur 10"] },
      { name: "Green Line - East Campus", color_hex: "#16A34A", active_days: [0,1,2,3,4,5],
        stopNames: ["Curzon Hall", "Science Faculty", "Library", "Engineering Faculty", "Curzon Hall"] },
    ];

    const { data: existingRoutes } = await supabaseAdmin.from("routes").select("id, name");
    const existingRouteNames = new Set((existingRoutes ?? []).map((r: any) => r.name));

    for (const route of routeSeeds) {
      if (existingRouteNames.has(route.name)) continue;
      const stopSequence = route.stopNames
        .map((name: string) => ({ stop_id: stopIdMap.get(name), scheduled_time: null }))
        .filter((s: any) => s.stop_id);
      await supabaseAdmin.from("routes").insert({
        name: route.name, color_hex: route.color_hex, active_days: route.active_days, stop_sequence: stopSequence,
      });
    }

    const { data: allRoutes } = await supabaseAdmin.from("routes").select("id, name");
    const routeIdMap = new Map((allRoutes ?? []).map((r: any) => [r.name, r.id]));

    // ── 5. Seed buses ──
    const busSeeds = [
      { name: "MU-01", license_plate: "DHAKA-1234", status: "active", routeName: "Red Line - Campus Loop", did: driverId },
      { name: "MU-02", license_plate: "DHAKA-5678", status: "active", routeName: "Blue Line - City Connect", did: driver2Id },
      { name: "MU-03", license_plate: "DHAKA-9012", status: "active", routeName: "Green Line - East Campus", did: null },
      { name: "MU-04", license_plate: "DHAKA-3456", status: "inactive", routeName: "Red Line - Campus Loop", did: null },
    ];

    const { data: existingBuses } = await supabaseAdmin.from("buses").select("id, name");
    const existingBusNames = new Set((existingBuses ?? []).map((b: any) => b.name));

    for (const bus of busSeeds) {
      if (existingBusNames.has(bus.name)) continue;
      await supabaseAdmin.from("buses").insert({
        name: bus.name, license_plate: bus.license_plate, status: bus.status,
        default_route_id: routeIdMap.get(bus.routeName) ?? null, driver_id: bus.did, capacity: 40,
      });
    }

    const { data: allBuses } = await supabaseAdmin.from("buses").select("id, name, default_route_id, driver_id");
    const busMap = new Map((allBuses ?? []).map((b: any) => [b.name, b]));

    // ── 6. Seed trips ──
    const { data: existingTrips } = await supabaseAdmin.from("trips").select("id").in("status", ["active", "delayed"]);

    if (!existingTrips || existingTrips.length === 0) {
      const b1 = busMap.get("MU-01");
      const b2 = busMap.get("MU-02");
      const tripsToCreate: any[] = [];

      if (b1?.default_route_id && b1?.driver_id) {
        tripsToCreate.push({ bus_id: b1.id, route_id: b1.default_route_id, driver_id: b1.driver_id, status: "active", started_at: new Date(Date.now() - 25 * 60000).toISOString() });
      }
      if (b2?.default_route_id && b2?.driver_id) {
        tripsToCreate.push({ bus_id: b2.id, route_id: b2.default_route_id, driver_id: b2.driver_id, status: "delayed", started_at: new Date(Date.now() - 40 * 60000).toISOString() });
      }

      if (tripsToCreate.length > 0) {
        const { data: newTrips } = await supabaseAdmin.from("trips").insert(tripsToCreate).select("id, bus_id");

        if (newTrips) {
          const locs: any[] = [];
          for (const trip of newTrips) {
            const bus = allBuses?.find((b: any) => b.id === trip.bus_id);
            const baseLat = bus?.name === "MU-01" ? 23.7305 : 23.7400;
            const baseLng = bus?.name === "MU-01" ? 90.3990 : 90.3880;
            for (let i = 5; i >= 0; i--) {
              locs.push({
                bus_id: trip.bus_id, trip_id: trip.id,
                lat: baseLat + (Math.random() - 0.5) * 0.002, lng: baseLng + (Math.random() - 0.5) * 0.002,
                speed_kmh: 15 + Math.random() * 25, heading: Math.random() * 360,
                accuracy_m: 5 + Math.floor(Math.random() * 15),
                timestamp: new Date(Date.now() - i * 30000).toISOString(),
              });
            }
          }
          await supabaseAdmin.from("live_locations").insert(locs);

          const boardings: any[] = [];
          for (const trip of newTrips) {
            const count = 8 + Math.floor(Math.random() * 15);
            for (let i = 0; i < count; i++) {
              boardings.push({ trip_id: trip.id, anonymous_id: `anon-${trip.id.slice(0, 4)}-${i}` });
            }
          }
          await supabaseAdmin.from("students_on_bus").insert(boardings);
        }
      }

      // Completed trips for reports
      const completedTrips: any[] = [];
      const cb1 = busMap.get("MU-01");
      const cb2 = busMap.get("MU-02");
      for (let d = 1; d <= 5; d++) {
        const dayStart = new Date(Date.now() - d * 86400000);
        if (cb1?.default_route_id && cb1?.driver_id) {
          completedTrips.push({ bus_id: cb1.id, route_id: cb1.default_route_id, driver_id: cb1.driver_id, status: "completed", started_at: new Date(dayStart.getTime() + 7 * 3600000).toISOString(), ended_at: new Date(dayStart.getTime() + 8.5 * 3600000).toISOString() });
        }
        if (cb2?.default_route_id && cb2?.driver_id) {
          completedTrips.push({ bus_id: cb2.id, route_id: cb2.default_route_id, driver_id: cb2.driver_id, status: "completed", started_at: new Date(dayStart.getTime() + 8 * 3600000).toISOString(), ended_at: new Date(dayStart.getTime() + 9.2 * 3600000).toISOString() });
        }
      }
      if (completedTrips.length > 0) await supabaseAdmin.from("trips").insert(completedTrips);
    }

    // ── 7. Seed today's exception ──
    const today = new Date().toISOString().split("T")[0];
    const { data: existingExceptions } = await supabaseAdmin.from("exceptions").select("id").eq("exception_date", today);

    if (!existingExceptions || existingExceptions.length === 0) {
      const bus2 = busMap.get("MU-02");
      if (bus2) {
        await supabaseAdmin.from("exceptions").insert({
          bus_id: bus2.id, type: "delay",
          notes: "Traffic congestion on Mirpur Road. Expected 15 min delay.",
          created_by: userId, exception_date: today, time_offset_mins: 15, notified: true,
        });
      }
    }

    return new Response(JSON.stringify({ success: true, userId, driverId, driver2Id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
