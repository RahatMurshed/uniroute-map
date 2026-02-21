import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error("Unauthorized");

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { action, ...payload } = await req.json();

    if (action === "create") {
      const { email, password, display_name, phone, bus_id } = payload;

      // 1. Create auth user
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (authErr) throw authErr;
      const userId = authData.user.id;

      // 2. Update profile (auto-created by trigger)
      await supabase.from("profiles").update({
        display_name,
        phone: phone || null,
      }).eq("id", userId);

      // 3. Insert role
      const { error: roleErr } = await supabase.from("user_roles").insert({
        user_id: userId,
        role: "driver",
      });
      if (roleErr) throw roleErr;

      // 4. Assign bus if selected
      if (bus_id) {
        await supabase.from("buses").update({ driver_id: userId }).eq("id", bus_id);
      }

      return new Response(JSON.stringify({ success: true, user_id: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { user_id, display_name, phone, bus_id, old_bus_id } = payload;

      await supabase.from("profiles").update({
        display_name,
        phone: phone || null,
      }).eq("id", user_id);

      // Unassign old bus
      if (old_bus_id && old_bus_id !== bus_id) {
        await supabase.from("buses").update({ driver_id: null }).eq("id", old_bus_id);
      }
      // Assign new bus
      if (bus_id) {
        await supabase.from("buses").update({ driver_id: user_id }).eq("id", bus_id);
      } else if (old_bus_id) {
        // Unassign completely
        await supabase.from("buses").update({ driver_id: null }).eq("id", old_bus_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "deactivate") {
      const { user_id } = payload;

      // Update role to inactive_driver
      await supabase.from("user_roles").update({ role: "inactive_driver" }).eq("user_id", user_id).eq("role", "driver");

      // Unassign all buses
      await supabase.from("buses").update({ driver_id: null }).eq("driver_id", user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reactivate") {
      const { user_id } = payload;

      await supabase.from("user_roles").update({ role: "driver" }).eq("user_id", user_id).eq("role", "inactive_driver");

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
