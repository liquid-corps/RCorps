// Edge Function: reset-password
// Recibe { codigo, nuevaClave }, valida el código y cambia la clave con
// la Admin API de Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { codigo, nuevaClave } = await req.json();
    if (!codigo || !nuevaClave) return json({ error: "Faltan datos." }, 400);
    if (nuevaClave.length < 6 || nuevaClave.length > 8) {
      return json({ error: "La clave debe tener entre 6 y 8 caracteres." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: solicitud, error } = await supabase
      .from("reset_requests")
      .select("*")
      .eq("code", codigo)
      .maybeSingle();

    if (error) throw error;
    if (!solicitud || solicitud.used || new Date(solicitud.expires_at) < new Date()) {
      return json({ error: "Clave incorrecta" }, 404);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      solicitud.user_id,
      { password: nuevaClave }
    );
    if (updateError) throw updateError;

    await supabase.from("reset_requests").update({ used: true }).eq("code", codigo);

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Error del servidor." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
