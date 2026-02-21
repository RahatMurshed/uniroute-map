import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Send a single web push notification
async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth_key: string },
  payload: Record<string, unknown>,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
): Promise<boolean> {
  try {
    // Use web-push compatible approach via fetch with VAPID
    // For Deno edge functions, we use a simplified JWT-based VAPID approach
    const body = JSON.stringify(payload);

    // Import web-push-compatible crypto
    const { default: webpush } = await import("npm:web-push@3.6.7");
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth_key,
        },
      },
      body,
    );
    return true;
  } catch (err) {
    console.error("Push send failed:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return new Response(JSON.stringify({ error: "VAPID not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { type, ...data } = await req.json();

    if (type === "proximity") {
      // Called after GPS ping: check if bus is near subscribed stops
      const { trip_id, bus_id, lat, lng } = data;

      // Get trip info
      const { data: trip } = await supabase
        .from("trips")
        .select("route_id, buses(name)")
        .eq("id", trip_id)
        .single();

      if (!trip) {
        return new Response(JSON.stringify({ sent: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const busName = (trip.buses as any)?.name ?? "Bus";

      // Get subscriptions for this route
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth_key, stop_id")
        .eq("route_id", trip.route_id);

      if (!subs || subs.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get stop positions
      const stopIds = [...new Set(subs.map((s) => s.stop_id))];
      const { data: stopsData } = await supabase
        .from("stops")
        .select("id, name, lat, lng")
        .in("id", stopIds);

      const stopMap = new Map((stopsData ?? []).map((s) => [s.id, s]));

      let sent = 0;
      for (const sub of subs) {
        const stop = stopMap.get(sub.stop_id);
        if (!stop) continue;

        const dist = haversine(lat, lng, Number(stop.lat), Number(stop.lng));
        if (dist > 0.5) continue; // Only notify within 500m

        const ok = await sendPush(
          sub,
          {
            title: "Bus arriving soon! 🚌",
            body: `${busName} is ~5 min from ${stop.name}`,
            tag: `proximity-${bus_id}-${sub.stop_id}`,
            url: "/map",
          },
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject,
        );
        if (ok) sent++;
      }

      return new Response(JSON.stringify({ sent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "exception") {
      // Called when exception is created
      const { bus_id, bus_name, exception_type, time_offset_mins, route_id } = data;

      // Find subscriptions for this route
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth_key")
        .eq("route_id", route_id);

      if (!subs || subs.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let title = "Service Update";
      let body = `${bus_name} has a service change`;

      if (exception_type === "cancellation") {
        title = "Bus Cancelled ❌";
        body = `${bus_name} is cancelled today`;
      } else if (exception_type === "delay") {
        title = "Bus Running Late ⚠️";
        body = `${bus_name} delayed by ${time_offset_mins ?? "?"} minutes`;
      } else if (exception_type === "route_change") {
        title = "Route Changed 🔄";
        body = `${bus_name} is on a different route today`;
      }

      let sent = 0;
      for (const sub of subs) {
        const ok = await sendPush(
          sub,
          { title, body, tag: `exception-${bus_id}`, url: "/map" },
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject,
        );
        if (ok) sent++;
      }

      return new Response(JSON.stringify({ sent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
